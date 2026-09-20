import Foundation

/// US-644: turning a stored Supabase Storage URL back into the (bucket, path)
/// pair needed to delete the object.
///
/// Swift mirror of `src/lib/storagePaths.ts`, which the web app has used since
/// US-628. Photos are persisted as full URLs (`kids.profile_picture_url`), so
/// parsing one back down is the only way to remove it later.
///
/// The iOS version this replaces matched a single hardcoded marker,
/// `/object/public/images/`, which made it wrong in four ways that all fail
/// the same way -- silently, leaving the object behind:
///
///   * It could only ever delete from `images`. Web writes kid photos to
///     `profile-pictures`, so a photo uploaded on the web and deleted on the
///     phone was ignored.
///   * It did not handle `/object/sign/`. US-634 moves profile pictures to a
///     private bucket with signed URLs, and every one of those would have been
///     ignored too.
///   * It split on `?` but not `#`. That is the exact bug the web already hit:
///     `remove()` called with `user-1/photo.jpg#top` matches nothing.
///   * It never decoded percent-escapes, so a path with a space in it was sent
///     as `%20` and matched nothing.
///
/// Pure, so all four are testable without a storage client.
struct StorageObjectRef: Equatable {
    let bucket: String
    let path: String
}

enum StorageObjectURL {
    private static let publicMarker = "/storage/v1/object/public/"
    private static let signedMarker = "/storage/v1/object/sign/"

    /// Parse a storage URL into its bucket and object path.
    ///
    /// Returns nil for anything that is not one of ours -- an externally
    /// hosted recipe image, an empty field -- so a caller skips it rather than
    /// guessing at a delete.
    static func parse(_ urlString: String?) -> StorageObjectRef? {
        guard let urlString, !urlString.isEmpty else { return nil }

        let marker: String
        if urlString.contains(publicMarker) {
            marker = publicMarker
        } else if urlString.contains(signedMarker) {
            marker = signedMarker
        } else {
            return nil
        }

        guard let range = urlString.range(of: marker) else { return nil }
        let afterMarker = String(urlString[range.upperBound...])

        // A signed URL carries ?token=, a public one can pick up a
        // cache-buster, and a stored value can carry a #fragment. None of them
        // is part of the object path.
        let withoutQuery = afterMarker.prefix { $0 != "?" && $0 != "#" }
        guard let separator = withoutQuery.firstIndex(of: "/") else { return nil }

        let bucket = String(withoutQuery[withoutQuery.startIndex..<separator])
        let path = String(withoutQuery[withoutQuery.index(after: separator)...])
        guard !bucket.isEmpty, !path.isEmpty else { return nil }

        // A stored URL is user-controlled input by the time it comes back out
        // of the database. Refuse traversal rather than handing it to remove().
        guard !path.contains("..") else { return nil }

        return StorageObjectRef(bucket: bucket, path: decodeSafely(path))
    }

    /// `removingPercentEncoding` returns nil on a malformed escape ("a%zz.jpg").
    /// A path that will not decode is still a path -- hand back what is there
    /// and let storage answer for it, rather than turning a stray `%` into a
    /// skipped cleanup.
    private static func decodeSafely(_ path: String) -> String {
        path.removingPercentEncoding ?? path
    }
}
