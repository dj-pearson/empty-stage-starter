import XCTest
@testable import EatPal

/// US-644: the URL parser that decides whether a child's photo actually gets
/// deleted.
///
/// Every failure mode here is silent. The parser returns nil or a path that
/// matches nothing, `remove()` succeeds having removed nothing, and the object
/// stays at a public URL after the parent deleted the child. Nothing throws
/// and nothing is shown.
///
/// The cases mirror `src/lib/storagePaths.test.ts`, which is the spec: the web
/// has done this correctly since US-628, and iOS is where the production kid
/// photos come from.
final class StorageObjectURLTests: XCTestCase {

    private let host = "https://abc.supabase.co"

    // MARK: - The two URL shapes

    func testParsesAPublicURL() {
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/public/images/kids/abc-123.jpg"
        )

        XCTAssertEqual(ref, StorageObjectRef(bucket: "images", path: "kids/abc-123.jpg"))
    }

    func testParsesASignedURL() {
        // US-634 moves profile pictures to a private bucket with signed URLs.
        // The old parser matched the public marker only, so every one of those
        // would have been ignored and never deleted.
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/sign/profile-pictures/user-1/kid.jpg?token=abc.def"
        )

        XCTAssertEqual(
            ref,
            StorageObjectRef(bucket: "profile-pictures", path: "user-1/kid.jpg")
        )
    }

    func testReadsTheBucketFromTheUrlRatherThanAssumingOne() {
        // The old parser hardcoded `images`. Web writes kid photos to
        // profile-pictures, so a photo uploaded there and deleted from the
        // phone was silently skipped.
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/public/profile-pictures/user-1/kid.jpg"
        )

        XCTAssertEqual(ref?.bucket, "profile-pictures")
        XCTAssertEqual(ref?.path, "user-1/kid.jpg")
    }

    func testKeepsNestedPathSegments() {
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/public/images/kids/2026/09/abc.jpg"
        )

        XCTAssertEqual(ref?.path, "kids/2026/09/abc.jpg")
    }

    // MARK: - What is not part of the path

    func testDropsACacheBustingQuery() {
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/public/images/kids/abc.jpg?v=1758240000"
        )

        XCTAssertEqual(ref?.path, "kids/abc.jpg")
    }

    func testDropsAFragment() {
        // The documented web bug, which iOS still had: remove() called with
        // "kids/abc.jpg#top" matches nothing, so the cleanup quietly failed
        // and left the object behind.
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/public/images/kids/abc.jpg#top"
        )

        XCTAssertEqual(ref?.path, "kids/abc.jpg")
    }

    func testDropsAFragmentThatComesBeforeAQuery() {
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/public/images/kids/abc.jpg#a?b=c"
        )

        XCTAssertEqual(ref?.path, "kids/abc.jpg")
    }

    func testDecodesPercentEscapes() {
        // Sent encoded, it matches nothing.
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/public/images/kids/my%20photo.jpg"
        )

        XCTAssertEqual(ref?.path, "kids/my photo.jpg")
    }

    func testAMalformedEscapeIsPassedThroughRatherThanSkipped() {
        // The web hit this as an unhandled rejection: a stray % threw out of
        // decodeURIComponent during the kid save flow. A path that will not
        // decode is still a path; let storage answer for it.
        let ref = StorageObjectURL.parse(
            "\(host)/storage/v1/object/public/images/kids/a%zz.jpg"
        )

        XCTAssertEqual(ref?.path, "kids/a%zz.jpg")
    }

    // MARK: - What must never become a delete

    func testRefusesTraversal() {
        // A stored URL is user-controlled input by the time it comes back out
        // of the database.
        XCTAssertNil(
            StorageObjectURL.parse(
                "\(host)/storage/v1/object/public/images/../profile-pictures/user-1/kid.jpg"
            )
        )
    }

    func testIgnoresAnExternallyHostedImage() {
        // Recipes imported from other sites carry someone else's URL. Never a
        // delete attempt.
        XCTAssertNil(StorageObjectURL.parse("https://seriouseats.com/photos/tacos.jpg"))
        XCTAssertNil(StorageObjectURL.parse("data:image/png;base64,iVBORw0KGgo="))
    }

    func testIgnoresEmptyAndNil() {
        XCTAssertNil(StorageObjectURL.parse(nil))
        XCTAssertNil(StorageObjectURL.parse(""))
    }

    func testIgnoresAUrlWithABucketButNoObject() {
        // "delete everything in this bucket" is not a thing this should be
        // able to express.
        XCTAssertNil(StorageObjectURL.parse("\(host)/storage/v1/object/public/images/"))
        XCTAssertNil(StorageObjectURL.parse("\(host)/storage/v1/object/public/images"))
    }

    func testIgnoresAUrlWithNoBucket() {
        XCTAssertNil(StorageObjectURL.parse("\(host)/storage/v1/object/public//kids/abc.jpg"))
    }
}
