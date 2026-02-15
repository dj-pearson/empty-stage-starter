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

    var body: some View {
        NavigationStack {
            ZStack {
                if cameraPermission == .authorized {
                    CameraPreview(
                        scannedCode: $scannedCode,
                        torchOn: $torchOn
                    )
                    .ignoresSafeArea()

                    // Overlay with scanning frame
                    scannerOverlay
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
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
            .onAppear {
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

    var body: some View {
        Rectangle()
            .fill(Color.green.opacity(0.8))
            .offset(y: offset)
            .onAppear {
                withAnimation(
                    .easeInOut(duration: 1.5)
                    .repeatForever(autoreverses: true)
                ) {
                    offset = 60
                }
            }
    }
}

// MARK: - Camera Preview (AVFoundation)

struct CameraPreview: UIViewRepresentable {
    @Binding var scannedCode: String?
    @Binding var torchOn: Bool

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.delegate = context.coordinator
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {
        uiView.setTorch(torchOn)
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

    private let captureSession = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?

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
            captureSession.stopRunning()
        }
    }

    func setTorch(_ on: Bool) {
        guard let device = AVCaptureDevice.default(for: .video),
              device.hasTorch else { return }
        try? device.lockForConfiguration()
        device.torchMode = on ? .on : .off
        device.unlockForConfiguration()
    }

    private func setupCamera() {
        guard !captureSession.isRunning else { return }

        captureSession.beginConfiguration()

        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let videoInput = try? AVCaptureDeviceInput(device: videoDevice),
              captureSession.canAddInput(videoInput) else {
            captureSession.commitConfiguration()
            return
        }

        captureSession.addInput(videoInput)

        let metadataOutput = AVCaptureMetadataOutput()
        guard captureSession.canAddOutput(metadataOutput) else {
            captureSession.commitConfiguration()
            return
        }

        captureSession.addOutput(metadataOutput)
        metadataOutput.setMetadataObjectsDelegate(delegate, queue: .main)
        metadataOutput.metadataObjectTypes = Self.supportedBarcodeTypes

        captureSession.commitConfiguration()

        let preview = AVCaptureVideoPreviewLayer(session: captureSession)
        preview.videoGravity = .resizeAspectFill
        preview.frame = bounds
        layer.addSublayer(preview)
        previewLayer = preview

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession.startRunning()
        }
    }
}

#Preview {
    BarcodeScannerView { code in
        print("Scanned: \(code)")
    }
}
