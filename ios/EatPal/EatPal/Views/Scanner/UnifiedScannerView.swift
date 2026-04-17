import SwiftUI
import VisionKit

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
            modernScanner
        } else {
            // Fall back to the legacy AVFoundation barcode scanner so the
            // feature still works on older devices. Text-mode isn't available
            // on the fallback path — we force Barcode mode.
            BarcodeScannerView { barcode in
                onComplete(.barcode(barcode))
                dismiss()
            }
        }
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
                        dismiss()
                    }
                    .foregroundStyle(.white)
                }
                if mode == .groceryList {
                    ToolbarItem(placement: .primaryAction) {
                        Button("Done") {
                            onComplete(.text(collectedText))
                            dismiss()
                        }
                        .foregroundStyle(.white)
                        .disabled(collectedText.isEmpty)
                    }
                }
            }
            .toolbarBackground(.black.opacity(0.4), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
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
            onComplete(.barcode(payload))
            dismiss()
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
