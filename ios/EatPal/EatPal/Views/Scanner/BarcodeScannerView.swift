import SwiftUI
import AVFoundation

/// A full-screen barcode scanner that uses the device camera.
/// Scans EAN-13, EAN-8, UPC-A, UPC-E, Code-128, and Code-39 barcodes.
struct BarcodeScannerView: View {
    @Environment(\.dismiss) var dismiss
    let onBarcodeScanned: (String) -> Void

    @State private var scannedCode: String?
    @State private var cameraPermission: AVAuthorizationStatus = .notDetermined
    @State private var torchOn = false
    // US-420: surface hardware/input acquisition failure instead of a frozen
    // black screen.
    @State private var cameraUnavailable = false

    var body: some View {
        NavigationStack {
            ZStack {
                if cameraPermission == .authorized {
                    if cameraUnavailable {
                        cameraUnavailableView
                    } else {
                        CameraPreview(
                            scannedCode: $scannedCode,
                            torchOn: $torchOn,
                            onSetupFailed: { cameraUnavailable = true }
                        )
                        .ignoresSafeArea()

                        // Overlay with scanning frame
                        scannerOverlay
                    }
                } else if cameraPermission == .denied || cameraPermission == .restricted {
                    cameraPermissionDeniedView
                } else {
                    ProgressView("Requesting camera access...")
                }
            }
            .navigationTitle("Scan Barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.white)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        torchOn.toggle()
                    } label: {
                        Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                            .foregroundStyle(.white)
                    }
                    // US-423: label the icon-only torch toggle for VoiceOver.
                    .accessibilityLabel(torchOn ? "Turn off flashlight" : "Turn on flashlight")
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
            .onAppear {
                checkCameraPermission()
            }
            .onDisappear {
                // US-420: make sure the torch can't stay lit after the scanner
                // closes (teardown also kills the session via dismantleUIView).
                torchOn = false
            }
            // US-420: returning from Settings (where the user may have just
            // granted access) should refresh the denied screen, not leave it stuck.
            .onReceive(
                NotificationCenter.default.publisher(
                    for: UIApplication.willEnterForegroundNotification
                )
            ) { _ in
                checkCameraPermission()
            }
            .onChange(of: scannedCode) { _, newValue in
                if let code = newValue {
                    HapticManager.success()
                    onBarcodeScanned(code)
                    dismiss()
                }
            }
        }
    }

    // MARK: - Camera Unavailable

    private var cameraUnavailableView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("Camera Unavailable")
                .font(.headline)

            Text("We couldn't start the camera. Close and try again, or restart your device.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button("Close") { dismiss() }
                .buttonStyle(.borderedProminent)
                .tint(.green)
        }
    }

    // MARK: - Scanner Overlay

    private var scannerOverlay: some View {
        VStack {
            Spacer()

            // Scanning frame
            ZStack {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.green, lineWidth: 3)
                    .frame(width: 280, height: 160)

                // Animated scan line
                ScanLineView()
                    .frame(width: 260, height: 2)
            }

            Spacer()

            // Instructions
            VStack(spacing: 8) {
                Text("Point camera at a barcode")
                    .font(.headline)
                    .foregroundStyle(.white)

                Text("EAN-13, UPC-A, EAN-8, UPC-E, Code-128, Code-39")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
            }
            .padding(.bottom, 60)
        }
    }

    // MARK: - Permission Denied

    private var cameraPermissionDeniedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("Camera Access Required")
                .font(.headline)

            Text("EatPal needs camera access to scan food barcodes. Please enable it in Settings.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
        }
    }

    // MARK: - Permissions

    private func checkCameraPermission() {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        cameraPermission = status

        if status == .notDetermined {
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    cameraPermission = granted ? .authorized : .denied
                }
            }
        }
    }
}

// MARK: - Scan Line Animation

struct ScanLineView: View {
    @State private var offset: CGFloat = -60
    // US-246: respect Reduce Motion. A repeatForever sweep is one of the
    // worst offenders for vestibular sensitivity — we render a static
    // mid-aligned line instead when the system preference is on.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Rectangle()
            .fill(Color.green.opacity(0.8))
            .offset(y: reduceMotion ? 0 : offset)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(
                    .easeInOut(duration: 1.5)
                    .repeatForever(autoreverses: true)
                ) {
                    offset = 60
                }
            }
            .accessibilityHidden(true)  // decorative; the camera preview narrates the actual scan state
    }
}

// MARK: - Camera Preview (AVFoundation)

struct CameraPreview: UIViewRepresentable {
    @Binding var scannedCode: String?
    @Binding var torchOn: Bool
    var onSetupFailed: (() -> Void)?

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.delegate = context.coordinator
        view.onSetupFailed = onSetupFailed
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {
        uiView.setTorch(torchOn)
    }

    // US-420: tear the capture session down (stop running + torch off) when the
    // representable is removed, so the camera/torch don't keep running after the
    // scanner is dismissed.
    static func dismantleUIView(_ uiView: CameraPreviewUIView, coordinator: Coordinator) {
        uiView.teardown()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(scannedCode: $scannedCode)
    }

    class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        @Binding var scannedCode: String?
        private var hasScanned = false

        init(scannedCode: Binding<String?>) {
            _scannedCode = scannedCode
        }

        func metadataOutput(
            _ output: AVCaptureMetadataOutput,
            didOutput metadataObjects: [AVMetadataObject],
            from connection: AVCaptureConnection
        ) {
            guard !hasScanned,
                  let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
                  let value = object.stringValue else {
                return
            }

            hasScanned = true
            DispatchQueue.main.async {
                self.scannedCode = value
            }
        }
    }
}

// MARK: - Camera UIView

class CameraPreviewUIView: UIView {
    weak var delegate: AVCaptureMetadataOutputObjectsDelegate?
    // US-420: surfaced to SwiftUI so device/input acquisition failure shows a
    // 'Camera unavailable' state instead of a frozen black screen.
    var onSetupFailed: (() -> Void)?

    private let captureSession = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    // US-420: keep the session's own device so the torch is driven through the
    // exact input we configured (not AVCaptureDevice.default, which can resolve
    // to a different device).
    private var videoDevice: AVCaptureDevice?
    private var isConfigured = false
    // US-420: do capture configuration off the main thread.
    private let sessionQueue = DispatchQueue(label: "com.eatpal.barcode.session")

    private static let supportedBarcodeTypes: [AVMetadataObject.ObjectType] = [
        .ean13, .ean8, .upce, .code128, .code39
    ]

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            setupCamera()
        } else {
            sessionQueue.async { [weak self] in self?.captureSession.stopRunning() }
        }
    }

    /// US-420: stop the session and kill the torch when the view is dismantled.
    func teardown() {
        setTorch(false)
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.captureSession.isRunning { self.captureSession.stopRunning() }
        }
    }

    func setTorch(_ on: Bool) {
        guard let device = videoDevice ?? AVCaptureDevice.default(for: .video),
              device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            device.torchMode = on ? .on : .off
            device.unlockForConfiguration()
        } catch {
            // Torch is non-critical; don't crash if it can't be locked.
            SentryService.leaveBreadcrumb(
                category: "scanner",
                message: "Torch toggle failed: \(error.localizedDescription)",
                level: .warning
            )
        }
    }

    private func setupCamera() {
        guard !isConfigured else { return }
        isConfigured = true

        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.captureSession.beginConfiguration()

            guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                  let videoInput = try? AVCaptureDeviceInput(device: videoDevice),
                  self.captureSession.canAddInput(videoInput) else {
                self.captureSession.commitConfiguration()
                self.isConfigured = false
                DispatchQueue.main.async { self.onSetupFailed?() }
                return
            }
            self.videoDevice = videoDevice
            self.captureSession.addInput(videoInput)

            let metadataOutput = AVCaptureMetadataOutput()
            guard self.captureSession.canAddOutput(metadataOutput) else {
                self.captureSession.commitConfiguration()
                self.isConfigured = false
                DispatchQueue.main.async { self.onSetupFailed?() }
                return
            }

            self.captureSession.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self.delegate, queue: .main)
            metadataOutput.metadataObjectTypes = Self.supportedBarcodeTypes

            self.captureSession.commitConfiguration()

            DispatchQueue.main.async {
                let preview = AVCaptureVideoPreviewLayer(session: self.captureSession)
                preview.videoGravity = .resizeAspectFill
                preview.frame = self.bounds
                self.layer.addSublayer(preview)
                self.previewLayer = preview
            }

            self.captureSession.startRunning()
        }
    }
}

#Preview {
    BarcodeScannerView { code in
        print("Scanned: \(code)")
    }
}
