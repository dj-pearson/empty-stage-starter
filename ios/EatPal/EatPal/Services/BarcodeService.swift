import Foundation

/// Looks up food product information from a barcode using Open Food Facts API.
enum BarcodeService {
    private static let baseURL = "https://world.openfoodfacts.org/api/v2/product"

    struct ProductResult {
        let name: String
        let category: String
        let barcode: String
        let allergens: [String]
        let nutritionInfo: NutritionLookup?
    }

    struct NutritionLookup {
        let calories: Double?
        let fat: Double?
        let carbs: Double?
        let protein: Double?
        let fiber: Double?
        let sugar: Double?
        let sodium: Double?
    }

    /// Looks up a barcode and returns product information if found.
    static func lookup(barcode: String) async throws -> ProductResult? {
        let url = URL(string: "\(baseURL)/\(barcode).json")!
        var request = URLRequest(url: url)
        request.setValue("EatPal iOS App - https://tryeatpal.com", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return nil
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let status = json["status"] as? Int, status == 1,
              let product = json["product"] as? [String: Any] else {
            return nil
        }

        let name = product["product_name"] as? String
            ?? product["product_name_en"] as? String
            ?? "Unknown Product"

        let rawCategory = product["categories_tags"] as? [String]
        let category = mapCategory(rawCategory)

        let allergenTags = product["allergens_tags"] as? [String] ?? []
        let allergens = allergenTags.compactMap { tag -> String? in
            // Tags come as "en:milk", extract just the name
            let parts = tag.split(separator: ":")
            return parts.last.map { String($0).capitalized }
        }

        var nutrition: NutritionLookup?
        if let nutriments = product["nutriments"] as? [String: Any] {
            nutrition = NutritionLookup(
                calories: nutriments["energy-kcal_100g"] as? Double,
                fat: nutriments["fat_100g"] as? Double,
                carbs: nutriments["carbohydrates_100g"] as? Double,
                protein: nutriments["proteins_100g"] as? Double,
                fiber: nutriments["fiber_100g"] as? Double,
                sugar: nutriments["sugars_100g"] as? Double,
                sodium: nutriments["sodium_100g"] as? Double
            )
        }

        return ProductResult(
            name: name,
            category: category,
            barcode: barcode,
            allergens: allergens,
            nutritionInfo: nutrition
        )
    }

    /// Maps Open Food Facts category tags to our FoodCategory enum.
    private static func mapCategory(_ tags: [String]?) -> String {
        guard let tags else { return FoodCategory.snack.rawValue }

        let joined = tags.joined(separator: " ").lowercased()

        if joined.contains("meat") || joined.contains("fish") || joined.contains("poultry")
            || joined.contains("egg") || joined.contains("seafood") {
            return FoodCategory.protein.rawValue
        }
        if joined.contains("dairy") || joined.contains("milk") || joined.contains("cheese")
            || joined.contains("yogurt") {
            return FoodCategory.dairy.rawValue
        }
        if joined.contains("fruit") || joined.contains("juice") {
            return FoodCategory.fruit.rawValue
        }
        if joined.contains("vegetable") || joined.contains("salad") || joined.contains("legume") {
            return FoodCategory.vegetable.rawValue
        }
        if joined.contains("bread") || joined.contains("cereal") || joined.contains("pasta")
            || joined.contains("rice") || joined.contains("grain") {
            return FoodCategory.carb.rawValue
        }

        return FoodCategory.snack.rawValue
    }
}
