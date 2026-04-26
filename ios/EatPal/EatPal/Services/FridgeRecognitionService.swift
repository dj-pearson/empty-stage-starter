import Foundation
import UIKit

/// US-238: Fridge-photo → ingredient list. Sends a base64-encoded photo
/// to the `recognize-fridge-contents` Supabase edge function (vision-capable
/// LLM) and decodes a list of detected ingredients with confidence scores.
///
/// Kept tiny — the edge function does the heavy lifting. We just shrink
/// the image to a sensible size first so we don't blow the function's
/// payload limit on 12-megapixel originals.
enum FridgeRecognitionService {

    enum FridgeError: Error, LocalizedError {
        case compressionFailed
        case empty
        case network(String)
        case decode(String)

        var errorDescription: String? {
            switch self {
            case .compressionFailed:  return "Couldn't process that photo."
            case .empty:              return "Couldn't spot any food in that photo. Try a closer shot or better lighting."
            case .network(let s):     return "Network problem: \(s)"
            case .decode(let s):      return "We got a response but couldn't read it: \(s)"
            }
        }
    }

    /// One detected item. `confidence` is 0-1 from the edge function and
    /// drives the UI's "low confidence — confirm?" treatment.
    struct DetectedItem: Identifiable, Codable, Equatable {
        let id: String
        let name: String
        let category: String?
        let confidence: Double

        init(id: String = UUID().uuidString, name: String, category: String? = nil, confidence: Double) {
            self.id = id
            self.name = name
            self.category = category
            self.confidence = confidence
        }

        enum CodingKeys: String, CodingKey {
            case id, name, category, confidence
        }
    }

    /// Long edge of the JPEG sent to the edge function. 768px keeps the
    /// payload well under 1MB after base64 expansion while still giving
    /// the vision model enough detail to read labels.
    private static let maxDimension: CGFloat = 768
    private static let jpegQuality: CGFloat = 0.7

    private struct RequestBody: Encodable {
        let imageBase64: String
    }

    private struct ResponseBody: Decodable {
        let items: [DetectedItem]
    }

    /// Recognises fridge contents from a UIImage. Throws `.empty` when the
    /// vision model returned zero items (so the UI can show a "couldn't
    /// see anything" message instead of a blank confirmation sheet).
    static func recognize(_ image: UIImage) async throws -> [DetectedItem] {
        let resized = ImageUploadService.resize(image, maxDimension: maxDimension)
        guard let jpeg = resized.jpegData(compressionQuality: jpegQuality) else {
            throw FridgeError.compressionFailed
        }
        let base64 = jpeg.base64EncodedString()

        let client = SupabaseManager.client

        do {
            let response: ResponseBody = try await client.functions.invoke(
                "recognize-fridge-contents",
                options: .init(body: RequestBody(imageBase64: base64))
            )
            guard !response.items.isEmpty else { throw FridgeError.empty }
            return response.items
        } catch let error as FridgeError {
            throw error
        } catch {
            // Decode failures look like "could not decode" in supabase-swift.
            let msg = error.localizedDescription
            if msg.lowercased().contains("decod") {
                throw FridgeError.decode(msg)
            }
            throw FridgeError.network(msg)
        }
    }
}
