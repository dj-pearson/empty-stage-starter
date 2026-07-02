import SwiftUI
import VisionKit
import AVFoundation

/// Unified scanner (US-139). Supports:
///  - **Barcode** mode — single tap/scan hands the payload back to the caller
///    so existing OpenFoodFacts flows keep working.
///  - **Grocery List** mode — live text recognition builds a deduplicated
///    transcript; tapping Done emits the aggregated lines.
///
/// Falls back to the legacy `BarcodeScannerView` when the device can't run
/// `DataScannerViewController` (older hardware or camera missing).
struct UnifiedScannerView: View {
    enum Mode: String, CaseIterable, Identifiable {
        case barcode
        case groceryList

        var id: String { rawValue }

        var title: String {
            switch self {
            case .barcode: return "Barcode"
            case .groceryList: return "List"
            }
        }

        var icon: String {
            switch self {
            case .barcode: return "barcode.viewfinder"
            case .groceryList: return "text.viewfinder"
            }
        }

        var guidance: String {
            switch self {
            case .barcode: return "Point at a barcode"
            case .groceryList: return "Point at a written or printed grocery list"
            }
        }
    }

    enum Result {
        case barcode(String)
        case text([String])
    }

    /// Starting mode (caller can lock the scanner to one mode by hiding the picker).
    let initialMode: Mode
    let allowModeSwitching: Bool
    let onComplete: (Result) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode
    @State private var collectedText: [String] = []
    @State private var lastError: String?
    // US-395: guard against discarding recognized grocery lines on Cancel.
    @State private var showingDiscardConfirm = false
    // US-392: torch toggle for dark aisles on the modern scanner path.
    @State private var torchOn = false
    // US-420: camera authorization gate (nil = still checking). The modern
    // DataScanner path assumed access was granted and showed a black screen
    // when it wasn't.
    @State private var cameraAuthorized: Bool?
    // US-420: guard against onComplete firing twice before dismiss propagates.
    @State private var hasCompleted = false

    init(
        initialMode: Mode = .barcode,
        allowModeSwitching: Bool = true,
        onComplete: @escaping (Result) -> Void
    ) {
        self.initialMode = initialMode
        self.allowModeSwitching = allowModeSwitching
        self.onComplete = onComplete
        _mode = State(initialValue: initialMode)
    }

    var body: some View {
        if #available(iOS 17.0, *), DataScannerViewController.isSupported {
            // US-420: gate the modern path on camera authorization so a denied
            // user gets a clear prompt instead of a black scanner.
            Group {
                switch cameraAuthorized {
                case .some(true):
                    modernScanner
                case .some(false):
                    cameraDeniedView
                case .none:
                    ProgressView()
                        .controlSize(.large)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(.black)
                }
            }
            .task { await resolveCameraPermission() }
        } else {
            // Fall back to the legacy AVFoundation barcode scanner so the
            // feature still works on older devices. Text-mode isn't available
            // on the fallback path — we force Barcode mode.
            BarcodeScannerView { barcode in
                complete(.barcode(barcode))
            }
        }
    }

    // MARK: - Camera permission (US-420)

    private func resolveCameraPermission() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            cameraAuthorized = true
        case .notDetermined:
            cameraAuthorized = await AVCaptureDevice.requestAccess(for: .video)
        case .denied, .restricted:
            cameraAuthorized = false
        @unknown default:
            cameraAuthorized = false
        }
    }

    private var cameraDeniedView: some View {
        NavigationStack {
            VStack(spacing: AppTheme.Spacing.lg) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(.secondary)
                Text("Camera access needed")
                    .font(.headline)
                Text("Enable camera access in Settings to scan barcodes and lists.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(AppTheme.Spacing.xl)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    /// US-420: single-shot completion so a fast double-recognition can't emit
    /// two results / present two sheets before `dismiss()` lands.
    private func complete(_ result: Result) {
        guard !hasCompleted else { return }
        hasCompleted = true
        onComplete(result)
        dismiss()
    }

    // MARK: - Modern scanner (iOS 17 / DataScannerViewController)

    @available(iOS 17.0, *)
    @ViewBuilder
    private var modernScanner: some View {
        NavigationStack {
            ZStack {
                DataScannerRepresentable(
                    configuration: scannerConfiguration,
                    onRecognizedItem: handleRecognizedItem(_:),
                    onTextSnapshot: handleTextSnapshot(_:),
                    onError: { error in
                        lastError = error.localizedDescription
                    }
                )
                .id(mode) // recreate when mode changes so the scanner reconfigures
                .ignoresSafeArea()

                overlay
            }
            .navigationTitle(mode == .barcode ? "Scan Barcode" : "Scan List")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        // US-395: in grocery-list mode, confirm before
                        // discarding recognized lines. Barcode mode and an
                        // empty list dismiss without a prompt.
                        if mode == .groceryList, !collectedText.isEmpty {
                            showingDiscardConfirm = true
                        } else {
                            dismiss()
                        }
                    }
                    .foregroundStyle(.white)
                }
                // US-392: torch toggle, hidden when the device has no torch.
                if Self.deviceHasTorch {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            torchOn.toggle()
                            Self.setTorch(torchOn)
                        } label: {
                            Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                        }
                        .foregroundStyle(.white)
                        .accessibilityLabel(torchOn ? "Turn off flashlight" : "Turn on flashlight")
                    }
                }
                if mode == .groceryList {
                    ToolbarItem(placement: .primaryAction) {
                        Button("Done") {
                            complete(.text(collectedText))
                        }
                        .foregroundStyle(.white)
                        .disabled(collectedText.isEmpty)
                    }
                }
            }
            // US-392: ensure the torch is off when the scanner goes away.
            .onDisappear {
                if torchOn { Self.setTorch(false) }
            }
            .toolbarBackground(.black.opacity(0.4), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .confirmationDialog(
                "Discard \(collectedText.count) recognized line\(collectedText.count == 1 ? "" : "s")?",
                isPresented: $showingDiscardConfirm,
                titleVisibility: .visible
            ) {
                Button("Discard", role: .destructive) { dismiss() }
                Button("Keep scanning", role: .cancel) {}
            }
        }
    }

    @available(iOS 17.0, *)
    private var scannerConfiguration: DataScannerRepresentable.Configuration {
        switch mode {
        case .barcode:
            return .init(
                recognizesBarcodes: true,
                recognizesText: false,
                recognizesMultipleItems: false,
                qualityLevel: .balanced,
                isHighlightingEnabled: true,
                isGuidanceEnabled: true
            )
        case .groceryList:
            return .init(
                recognizesBarcodes: false,
                recognizesText: true,
                recognizesMultipleItems: true,
                qualityLevel: .accurate,
                isHighlightingEnabled: true,
                isGuidanceEnabled: true
            )
        }
    }

    // MARK: - Torch (US-392)

    private static var deviceHasTorch: Bool {
        AVCaptureDevice.default(for: .video)?.hasTorch ?? false
    }

    private static func setTorch(_ on: Bool) {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            device.torchMode = on ? .on : .off
            device.unlockForConfiguration()
        } catch {
            // Torch unavailable (in use / restricted) — non-fatal.
        }
    }

    // MARK: - Overlay

    @ViewBuilder
    private var overlay: some View {
        VStack {
            Spacer()

            VStack(spacing: 12) {
                Text(mode.guidance)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.55), in: Capsule())

                if mode == .groceryList {
                    Text("\(collectedText.count) line\(collectedText.count == 1 ? "" : "s") recognised")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.85))
                }

                if let error = lastError {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
                }

                if allowModeSwitching {
                    Picker("Mode", selection: $mode) {
                        ForEach(Mode.allCases) { option in
                            Label(option.title, systemImage: option.icon).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 20)
                    .onChange(of: mode) { _, _ in
                        collectedText = []
                        lastError = nil
                        HapticManager.selection()
                    }
                }
            }
            .padding(.bottom, 32)
        }
    }

    // MARK: - DataScanner event handlers

    @available(iOS 17.0, *)
    private func handleRecognizedItem(_ item: RecognizedItem) {
        switch item {
        case .barcode(let barcode):
            guard mode == .barcode,
                  let payload = barcode.payloadStringValue,
                  !payload.isEmpty else { return }
            HapticManager.success()
            complete(.barcode(payload))
        case .text(let text):
            // In list mode, tapping a line force-adds it (helps with low-confidence).
            guard mode == .groceryList else { return }
            let line = text.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty else { return }
            if !collectedText.contains(where: { $0.lowercased() == line.lowercased() }) {
                collectedText.append(line)
                HapticManager.selection()
            }
        @unknown default:
            break
        }
    }

    private func handleTextSnapshot(_ lines: [String]) {
        guard mode == .groceryList else { return }
        collectedText = lines
    }
}
