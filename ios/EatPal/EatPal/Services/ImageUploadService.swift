import Foundation
import UIKit
import Supabase

/// Handles image uploads to Supabase Storage.
enum ImageUploadService {
    private static let client = SupabaseManager.client
    private static let bucketName = "images"

    enum ImageFolder: String {
        case foods
        case recipes
        case kids
    }

    /// Uploads an image and returns the public URL.
    /// - Parameters:
    ///   - image: The UIImage to upload
    ///   - folder: The storage folder (foods, recipes, kids)
    ///   - id: The entity ID for the filename
    /// - Returns: The public URL string of the uploaded image
    static func upload(
        image: UIImage,
        folder: ImageFolder,
        id: String
    ) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.8) else {
            throw ImageUploadError.compressionFailed
        }

        let path = "\(folder.rawValue)/\(id)-\(Int(Date().timeIntervalSince1970)).jpg"

        try await client.storage
            .from(bucketName)
            .upload(
                path: path,
                file: data,
                options: FileOptions(contentType: "image/jpeg", upsert: true)
            )

        let publicURL = try client.storage
            .from(bucketName)
            .getPublicURL(path: path)

        return publicURL.absoluteString
    }

    /// Deletes an image from storage.
    static func delete(path: String) async throws {
        try await client.storage
            .from(bucketName)
            .remove(paths: [path])
    }

    /// Resizes an image to a maximum dimension while maintaining aspect ratio.
    static func resize(_ image: UIImage, maxDimension: CGFloat = 1024) -> UIImage {
        let size = image.size
        let ratio = min(maxDimension / size.width, maxDimension / size.height)

        if ratio >= 1 { return image }

        let newSize = CGSize(width: size.width * ratio, height: size.height * ratio)
        let renderer = UIGraphicsImageRenderer(size: newSize)

        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}

enum ImageUploadError: LocalizedError {
    case compressionFailed
    case uploadFailed(String)

    var errorDescription: String? {
        switch self {
        case .compressionFailed:
            return "Failed to compress image."
        case .uploadFailed(let reason):
            return "Upload failed: \(reason)"
        }
    }
}
