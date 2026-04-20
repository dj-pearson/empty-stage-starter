import SwiftUI
import UIKit
import VisionKit

/// SwiftUI bridge around `DataScannerViewController` (iOS 16+). The hosting
/// SwiftUI view drives the configuration through `Configuration` and receives
/// events through the `onRecognizedItem` / `onError` callbacks.
///
/// Used by `UnifiedScannerView` (US-139) for barcode + text recognition.
/// Falls through to `BarcodeScannerView` when `DataScannerViewController.isSupported`
/// returns false on the current hardware.
@available(iOS 17.0, *)
struct DataScannerRepresentable: UIViewControllerRepresentable {
    struct Configuration {
        var recognizesBarcodes: Bool
        var recognizesText: Bool
        var recognizesMultipleItems: Bool
        var qualityLevel: DataScannerViewController.QualityLevel
        var isHighlightingEnabled: Bool
        var isGuidanceEnabled: Bool
    }

    let configuration: Configuration
    /// Called for every tap on a highlighted item.
    let onRecognizedItem: (RecognizedItem) -> Void
    /// Streams the full, deduplicated set of recognised text each time the
    /// scanner's observation list changes. Only fires when `recognizesText` is true.
    let onTextSnapshot: ([String]) -> Void
    let onError: (Error) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onRecognizedItem: onRecognizedItem,
            onTextSnapshot: onTextSnapshot,
            onError: onError
        )
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        var recognizedTypes: [DataScannerViewController.RecognizedDataType] = []
        if configuration.recognizesBarcodes {
            recognizedTypes.append(.barcode())
        }
        if configuration.recognizesText {
            recognizedTypes.append(.text())
        }

        let scanner = DataScannerViewController(
            recognizedDataTypes: Set(recognizedTypes),
            qualityLevel: configuration.qualityLevel,
            recognizesMultipleItems: configuration.recognizesMultipleItems,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: configuration.isGuidanceEnabled,
            isHighlightingEnabled: configuration.isHighlightingEnabled
        )
        scanner.delegate = context.coordinator

        do {
            try scanner.startScanning()
        } catch {
            onError(error)
        }

        return scanner
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
        // The scanner is configured once at make time; mode changes recreate
        // the representable via SwiftUI identity (see UnifiedScannerView).
    }

    static func dismantleUIViewController(_ uiViewController: DataScannerViewController, coordinator: Coordinator) {
        uiViewController.stopScanning()
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onRecognizedItem: (RecognizedItem) -> Void
        private let onTextSnapshot: ([String]) -> Void
        private let onError: (Error) -> Void

        init(
            onRecognizedItem: @escaping (RecognizedItem) -> Void,
            onTextSnapshot: @escaping ([String]) -> Void,
            onError: @escaping (Error) -> Void
        ) {
            self.onRecognizedItem = onRecognizedItem
            self.onTextSnapshot = onTextSnapshot
            self.onError = onError
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didTapOn item: RecognizedItem
        ) {
            onRecognizedItem(item)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            publishTextSnapshot(allItems)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didRemove removedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            publishTextSnapshot(allItems)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable
        ) {
            onError(error)
        }

        // MARK: helpers

        private func publishTextSnapshot(_ items: [RecognizedItem]) {
            var seen: Set<String> = []
            var ordered: [String] = []
            for item in items {
                if case .text(let text) = item {
                    let candidate = text.transcript
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !candidate.isEmpty else { continue }
                    let key = candidate.lowercased()
                    if !seen.contains(key) {
                        seen.insert(key)
                        ordered.append(candidate)
                    }
                }
            }
            onTextSnapshot(ordered)
        }
    }
}
