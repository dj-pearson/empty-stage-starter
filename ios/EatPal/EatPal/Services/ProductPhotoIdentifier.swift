import Foundation
import UIKit

/// US-273: Single-product vision identification.
///
/// Different from `FridgeRecognitionService` (whole-fridge scan) and
/// `parse-grocery-image` (OCR a written list). The user points the
/// camera at one item and we get back name + brand + package size +
/// category + aisle in one shot, then drop those into Quick Add.
///
/// Errors are surfaced as `IdentifyError` so the UI can show a precise
/// message ("could not identify" vs network) rather than a generic
/// failure toast.
enum ProductPhotoIdentifier {

    enum IdentifyError: Error, LocalizedError {
        case compressionFailed
        case unidentifiable
        case network(String)
        case decode(String)

        var errorDescription: String? {
            switch self {
            case .compressionFailed: return "Couldn't process that photo."
            case .unidentifiable:    return "Couldn't identify the product. Try a clearer shot of the label."
            case .network(let s):    return "Network problem: \(s)"
            case .decode(let s):     return "Got a response we couldn't read: \(s)"
            }
        }
    }

    /// Server response shape. Mirrors `functions/identify-product/index.ts`.
    /// All fields are pre-validated server-side; the client trusts the
    /// shape and only re-validates the enum case mappings on top.
    struct IdentifiedProduct: Codable, Equatable {
        let name: String
        let brand: String?
        let packageSize: Double?
        let packageUnit: String?
        let category: String
        let aisleSection: String
        let confidence: Double
    }

    /// Single-product photos benefit from more pixels than fridge view —
    /// labels often have small print. 1024px keeps payload < 1MB after
    /// base64 + JPEG compression while preserving readability.
    private static let maxDimension: CGFloat = 1024
    private static let jpegQuality: CGFloat = 0.8

    private struct RequestBody: Encodable {
        let imageBase64: String
    }

    /// Identifies a single grocery product from a UIImage.
    ///
    /// - Returns: The structured product attributes plus a confidence
    ///   score (0-1). The caller should treat anything below 0.7 as
    ///   "needs user confirmation" — wire it to the Quick Add badge.
    /// - Throws: `IdentifyError` cases for image, network, decode, and
    ///   unidentifiable failures.
    static func identify(_ image: UIImage) async throws -> IdentifiedProduct {
        let resized = ImageUploadService.resize(image, maxDimension: maxDimension)
        guard let jpeg = resized.jpegData(compressionQuality: jpegQuality) else {
            throw IdentifyError.compressionFailed
        }

        do {
            let response: IdentifiedProduct = try await EdgeFunctions.invoke(
                "identify-product",
                body: RequestBody(imageBase64: jpeg.base64EncodedString()),
                as: IdentifiedProduct.self
            )
            // Server returns 422 with an error body when name is empty,
            // so a successful decode here implies a real result. Defense
            // in depth — guard anyway.
            if response.name.trimmingCharacters(in: .whitespaces).isEmpty {
                throw IdentifyError.unidentifiable
            }
            return response
        } catch let error as IdentifyError {
            throw error
        } catch {
            let msg = error.localizedDescription
            if msg.lowercased().contains("decod") {
                throw IdentifyError.decode(msg)
            }
            // 422 from the edge fn surfaces as a CallError.status with a
            // body message — surface it as unidentifiable so the UI can
            // show the right copy.
            if msg.lowercased().contains("could not identify") || msg.contains("422") {
                throw IdentifyError.unidentifiable
            }
            throw IdentifyError.network(msg)
        }
    }

    // MARK: - Mapping helpers

    /// Convert an IdentifiedProduct into the same ResolvedProduct shape
    /// that SmartProductService.resolve emits, so the Quick Add UI can
    /// run a vision result through the same pre-fill code path.
    /// `source` is .barcodeFresh (treated as "first time anywhere")
    /// because this *is* the first time we've seen the product on this
    /// device — the next add will write user prefs and bump the source
    /// to .userPreference.
    static func toResolved(_ product: IdentifiedProduct) -> ResolvedProduct {
        let aisle = GroceryAisle(rawValue: product.aisleSection) ?? .other
        let category = FoodCategory(rawValue: product.category) ?? aisle.derivedFoodCategory
        return ResolvedProduct(
            name: product.name,
            aisleSection: aisle,
            category: category,
            unit: product.packageUnit ?? "count",
            quantity: product.packageSize ?? 1,
            brand: product.brand,
            barcode: nil,
            notes: nil,
            source: .barcodeFresh
        )
    }
}
