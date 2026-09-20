import Foundation
import UIKit
import Supabase

/// Handles image uploads to Supabase Storage.
enum ImageUploadService {
    private static let client = SupabaseManager.client
    private static let bucketName = "images"
    /// US-498: hard ceiling on an uploaded JPEG so a pathological input can't
    /// stream an unbounded blob to Storage even after the resize below.
    private static let maxUploadBytes = 8 * 1024 * 1024

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
        // US-498: bound the image here rather than trusting every caller to
        // pre-resize. Downscale to a max dimension, then enforce a byte cap.
        let bounded = resize(image, maxDimension: 1024)
        guard let data = bounded.jpegData(compressionQuality: 0.8) else {
            throw ImageUploadError.compressionFailed
        }
        guard data.count <= maxUploadBytes else {
            throw ImageUploadError.tooLarge
        }

        // US-635: a random object name instead of "{id}-{unixSeconds}".
        // The old shape was brute-forceable: given a kid id, an attacker only
        // had to try the ~86400 seconds in a day to find the photo, and the
        // bucket is public-read by URL for shipped builds. `id` is kept in the
        // signature for the call sites but deliberately no longer appears in
        // the path. Matches the US-627 web fix, which switched profile-pictures
        // to a random object name for the same reason.
        let path = "\(folder.rawValue)/\(UUID().uuidString).jpg"

        try await client.storage
            .from(bucketName)
            .upload(
                path,
                data: data,
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

    /// Deletes the object a previously-returned public URL points at.
    ///
    /// Replacing a photo uploads a new random object name (US-635) and used to
    /// leave the old one in place, because `delete` had no callers at all. The
    /// bucket is public-read by URL, so a child's previous profile picture
    /// stayed fetchable by anyone holding that link even after the parent
    /// replaced it -- and nothing was ever going to remove it.
    ///
    /// Best effort by design: this runs after the row already points at the
    /// new image, so a failure here leaves an orphan rather than breaking a
    /// save that has succeeded. Returns whether an object was removed.
    ///
    /// Anything that is not one of our public URLs is ignored, which covers
    /// recipe images imported from other sites.
    @discardableResult
    static func deletePublicURL(_ urlString: String) async -> Bool {
        guard let ref = StorageObjectURL.parse(urlString) else { return false }
        do {
            // US-644: the bucket comes from the URL rather than being assumed.
            // Web writes kid photos to profile-pictures and iOS writes to
            // images, so assuming one meant the other platform's photo was
            // silently never deleted.
            let removed = try await client.storage
                .from(ref.bucket)
                .remove(paths: [ref.path])

            // An RLS-blocked removal is NOT an error. remove() answers with the
            // objects it actually removed, and a row the policy hides simply is
            // not among them -- so treating a non-throwing call as success
            // reports a deletion that did not happen. The web learned this on
            // profile-pictures, where SELECT matched folder-or-owner and DELETE
            // matched folder only, leaving objects readable by their owner and
            // undeletable by them.
            if removed.isEmpty {
                SentryService.capture(
                    ImageUploadError.uploadFailed("storage removed nothing"),
                    extras: [
                        "context": "image_delete_orphan",
                        "reason": "no matching object, or RLS denied it",
                        "bucket": ref.bucket,
                        "path": ref.path
                    ]
                )
                return false
            }
            return true
        } catch {
            SentryService.capture(error, extras: [
                "context": "image_delete_previous",
                "bucket": ref.bucket,
                "path": ref.path
            ])
            return false
        }
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
    case tooLarge

    var errorDescription: String? {
        switch self {
        case .compressionFailed:
            return "Failed to compress image."
        case .uploadFailed(let reason):
            return "Upload failed: \(reason)"
        case .tooLarge:
            return "That image is too large. Please choose a smaller one."
        }
    }
}
