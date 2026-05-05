import SwiftUI
import UIKit
import VisionKit

/// US-277: SwiftUI bridge that exposes the **live, tracked** set of
/// barcodes currently visible in the camera frame, with their bounds in
/// the camera view's coordinate space. Lets `ARShelfFinderView` overlay
/// SwiftUI chips on top of every recognized barcode and update them as
/// the user pans across a shelf.
///
/// Different from `DataScannerRepresentable` (which fires once on tap +
/// emits text snapshots) — here we want the full set on every change so
/// the overlay tracks barcode movement.
@available(iOS 17.0, *)
struct ARShelfScannerRepresentable: UIViewControllerRepresentable {
    /// One tracked barcode + its current bounds. The four corners are
    /// kept separate (rather than a CGRect) so a perspective-warped
    /// barcode renders an exactly-sized chip even when the user holds
    /// the phone at an angle.
    struct TrackedBarcode: Identifiable, Equatable {
        let id: UUID
        let payload: String
        let topLeft: CGPoint
        let topRight: CGPoint
        let bottomLeft: CGPoint
        let bottomRight: CGPoint

        /// Axis-aligned bounding box that spans all four corners. Good
        /// enough for chip placement; perspective-perfect alignment
        /// isn't worth the layout cost.
        var boundingRect: CGRect {
            let minX = min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x)
            let maxX = max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x)
            let minY = min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y)
            let maxY = max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y)
            return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
        }
    }

    /// Streams the full set of currently-visible barcodes on every
    /// add/update/remove tick. Identity is the DataScanner item id so
    /// SwiftUI only animates moved chips, not all of them.
    let onBarcodes: ([TrackedBarcode]) -> Void
    let onError: (Error) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onBarcodes: onBarcodes, onError: onError)
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            recognizesMultipleItems: true,
            // High frame-rate tracking is what lets the chip follow the
            // barcode without a noticeable lag — well worth the battery.
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: false,
            // Built-in highlighting would compete with our SwiftUI
            // overlay; we draw the only chip ourselves.
            isGuidanceEnabled: false,
            isHighlightingEnabled: false
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
        // Static configuration — nothing to update.
    }

    static func dismantleUIViewController(_ uiViewController: DataScannerViewController, coordinator: Coordinator) {
        uiViewController.stopScanning()
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onBarcodes: ([TrackedBarcode]) -> Void
        private let onError: (Error) -> Void

        init(onBarcodes: @escaping ([TrackedBarcode]) -> Void, onError: @escaping (Error) -> Void) {
            self.onBarcodes = onBarcodes
            self.onError = onError
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            publish(allItems)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didUpdate updatedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            publish(allItems)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didRemove removedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            publish(allItems)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable
        ) {
            onError(error)
        }

        // MARK: helpers

        private func publish(_ items: [RecognizedItem]) {
            let tracked: [TrackedBarcode] = items.compactMap { item in
                guard case let .barcode(barcode) = item,
                      let payload = barcode.payloadStringValue,
                      !payload.isEmpty else { return nil }
                return TrackedBarcode(
                    id: barcode.id,
                    payload: payload,
                    topLeft: item.bounds.topLeft,
                    topRight: item.bounds.topRight,
                    bottomLeft: item.bounds.bottomLeft,
                    bottomRight: item.bounds.bottomRight
                )
            }
            onBarcodes(tracked)
        }
    }
}
