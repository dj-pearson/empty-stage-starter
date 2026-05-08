import Foundation
import UIKit

/// US-294: Receipt scan + parse service. Pairs the `parse-receipt-image`
/// edge function with the iOS image pipeline so PantryView can hand a
/// `UIImage` in and get a structured list of `LineItem`s back.
enum ReceiptScanService {

    enum ServiceError: Error, LocalizedError {
        case compressionFailed
        case network(String)
        case decoding(String)
        case lowConfidence
        case empty

        var errorDescription: String? {
            switch self {
            case .compressionFailed: return "Couldn't process that photo."
            case .network(let s):    return "Network problem: \(s)"
            case .decoding(let s):   return "Got a response we couldn't read: \(s)"
            case .lowConfidence:     return "Couldn't read this clearly. Try better light or use bulk paste."
            case .empty:             return "No items found on this receipt."
            }
        }
    }

    struct LineItem: Codable, Equatable, Hashable, Identifiable {
        var rawText: String
        var parsedName: String
        var qty: Double
        var unit: String
        var unitPrice: Double
        var lineTotal: Double
        var category: String
        var confidence: Double

        var id: String { "\(parsedName)-\(rawText)-\(unitPrice)-\(qty)" }
    }

    struct Receipt: Codable, Equatable {
        let merchant: String?
        let purchasedAt: String?
        let currency: String
        let lineItems: [LineItem]
    }

    private struct RequestBody: Encodable {
        let imageBase64: String
    }

    private static let maxDimension: CGFloat = 1500
    private static let jpegQuality: CGFloat = 0.8

    static func parse(_ image: UIImage) async throws -> Receipt {
        let resized = ImageUploadService.resize(image, maxDimension: maxDimension)
        guard let jpeg = resized.jpegData(compressionQuality: jpegQuality) else {
            throw ServiceError.compressionFailed
        }
        do {
            let response: Receipt = try await EdgeFunctions.invoke(
                "parse-receipt-image",
                body: RequestBody(imageBase64: jpeg.base64EncodedString()),
                as: Receipt.self
            )
            if response.lineItems.isEmpty {
                throw ServiceError.empty
            }
            let avgConfidence =
                response.lineItems.reduce(0.0) { $0 + $1.confidence } /
                Double(response.lineItems.count)
            if avgConfidence < 0.4 {
                throw ServiceError.lowConfidence
            }
            return response
        } catch let error as ServiceError {
            throw error
        } catch {
            let msg = error.localizedDescription
            if msg.lowercased().contains("decod") {
                throw ServiceError.decoding(msg)
            }
            throw ServiceError.network(msg)
        }
    }

    /// Best-effort fuzzy match into the existing pantry foods so the review
    /// screen can suggest "you already have Bananas" instead of inserting a
    /// duplicate. Returns the matched food id when a confident hit exists.
    static func matchExistingFood(name: String, foods: [Food]) -> String? {
        let target = name.trimmingCharacters(in: .whitespaces).lowercased()
        guard !target.isEmpty else { return nil }
        if let exact = foods.first(where: { $0.name.lowercased() == target }) {
            return exact.id
        }
        if let prefix = foods.first(where: { $0.name.lowercased().hasPrefix(target) }) {
            return prefix.id
        }
        return foods.first { $0.name.lowercased().contains(target) }?.id
    }
}
