import Foundation
import UIKit
import Vision

/// Runs Vision's text recognition on a set of images and returns the merged
/// recognised lines. Used by the photo/screenshot → grocery path (US-141).
///
/// Kept as a namespace (no state) so it can be called from any context. The
/// heavy work runs on the caller's executor — for large images you should
/// invoke this from a detached task.
enum ImageTextRecognizer {
    struct RecognitionResult {
        /// Raw recognised lines in reading order.
        let lines: [String]
        /// Per-line confidence values (0..1) aligned 1:1 with `lines`.
        let confidences: [Float]
        /// Concatenated text suitable for feeding into `GroceryTextParser.parse`.
        let mergedText: String
    }

    enum RecognitionError: Error, LocalizedError {
        case invalidImage
        case visionFailure(String)

        var errorDescription: String? {
            switch self {
            case .invalidImage:
                return "Could not read that image."
            case .visionFailure(let detail):
                return "Text recognition failed: \(detail)"
            }
        }
    }

    /// Recognise text in a single `UIImage`.
    static func recognize(in image: UIImage) async throws -> RecognitionResult {
        try await withCheckedThrowingContinuation { continuation in
            guard let cgImage = image.cgImage else {
                continuation.resume(throwing: RecognitionError.invalidImage)
                return
            }

            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    continuation.resume(throwing: RecognitionError.visionFailure(error.localizedDescription))
                    return
                }

                guard let observations = request.results as? [VNRecognizedTextObservation] else {
                    continuation.resume(returning: RecognitionResult(lines: [], confidences: [], mergedText: ""))
                    return
                }

                var lines: [String] = []
                var confidences: [Float] = []
                for observation in observations {
                    guard let candidate = observation.topCandidates(1).first else { continue }
                    let trimmed = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { continue }
                    lines.append(trimmed)
                    confidences.append(candidate.confidence)
                }

                let merged = lines.joined(separator: "\n")
                continuation.resume(returning: RecognitionResult(
                    lines: lines,
                    confidences: confidences,
                    mergedText: merged
                ))
            }

            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["en-US"]

            let orientation = cgOrientation(from: image.imageOrientation)
            let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])

            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: RecognitionError.visionFailure(error.localizedDescription))
            }
        }
    }

    /// Recognise text across multiple images and return the combined result.
    static func recognize(in images: [UIImage]) async -> [RecognitionResult] {
        var results: [RecognitionResult] = []
        for image in images {
            if let result = try? await recognize(in: image) {
                results.append(result)
            }
        }
        return results
    }

    /// Minimum per-line confidence considered "trustworthy" for an OCR parse.
    static let trustworthyConfidence: Float = 0.5

    // MARK: - Helpers

    private static func cgOrientation(from uiOrientation: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch uiOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
