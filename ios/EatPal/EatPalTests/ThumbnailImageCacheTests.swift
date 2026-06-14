import XCTest
import UIKit
@testable import EatPal

/// US-387: the thumbnail cache must serve a re-appearing image from memory
/// without issuing another network request.
@MainActor
final class ThumbnailImageCacheTests: XCTestCase {

    func testMemoryCacheHitDoesNotRefetch() async {
        let cache = ThumbnailImageCache()
        let url = URL(string: "https://example.com/recipe-thumb.jpg")!
        let image = UIImage(systemName: "star.fill")!

        cache.store(image, for: url)
        let before = cache.networkFetchCount

        // A cached URL resolves from memory — no network fetch.
        let resolved = await cache.image(for: url)
        XCTAssertNotNil(resolved)
        XCTAssertEqual(cache.networkFetchCount, before, "A cache hit must not issue a network fetch")
    }

    func testCachedImageLookupReturnsStored() {
        let cache = ThumbnailImageCache()
        let url = URL(string: "https://example.com/a.jpg")!
        XCTAssertNil(cache.cachedImage(for: url))
        let image = UIImage(systemName: "circle")!
        cache.store(image, for: url)
        XCTAssertNotNil(cache.cachedImage(for: url))
    }
}
