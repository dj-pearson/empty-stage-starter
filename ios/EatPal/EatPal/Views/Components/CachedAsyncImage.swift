import SwiftUI
import UIKit

/// US-387: a real thumbnail cache. `AsyncImage` (which this used to wrap)
/// does NOT cache, so every scroll re-issued network requests. This is an
/// in-memory `NSCache` in front of a `URLSession` whose `URLCache` has a
/// bounded memory + disk capacity, so a re-appearing row hits cache instead
/// of the network and the cache can't grow without bound.
@MainActor
final class ThumbnailImageCache {
    static let shared = ThumbnailImageCache()

    private let memory = NSCache<NSURL, UIImage>()
    private let session: URLSession

    /// US-387 AC3 test hook: how many actual network fetches were issued.
    /// A cache hit must not increment this.
    private(set) var networkFetchCount = 0

    init(
        memoryCountLimit: Int = 200,
        memoryCapacityBytes: Int = 25 * 1024 * 1024,
        diskCapacityBytes: Int = 150 * 1024 * 1024
    ) {
        memory.countLimit = memoryCountLimit
        let urlCache = URLCache(
            memoryCapacity: memoryCapacityBytes,
            diskCapacity: diskCapacityBytes,
            diskPath: "eatpal_thumbnails"
        )
        let config = URLSessionConfiguration.default
        config.urlCache = urlCache
        config.requestCachePolicy = .returnCacheDataElseLoad
        session = URLSession(configuration: config)
    }

    func cachedImage(for url: URL) -> UIImage? {
        memory.object(forKey: url as NSURL)
    }

    func store(_ image: UIImage, for url: URL) {
        memory.setObject(image, forKey: url as NSURL)
    }

    /// Returns the image for `url`, serving from the in-memory cache when
    /// possible (no network). Misses go through the URLCache-backed session.
    func image(for url: URL) async -> UIImage? {
        if let cached = cachedImage(for: url) { return cached }
        networkFetchCount += 1
        guard let (data, _) = try? await session.data(from: url),
              let image = UIImage(data: data) else { return nil }
        store(image, for: url)
        return image
    }
}

@MainActor
final class ThumbnailImageLoader: ObservableObject {
    @Published var image: UIImage?

    func load(_ url: URL?) async {
        guard let url else {
            image = nil
            return
        }
        if let cached = ThumbnailImageCache.shared.cachedImage(for: url) {
            image = cached
            return
        }
        image = await ThumbnailImageCache.shared.image(for: url)
    }
}

/// Reusable async image loader with placeholder and error fallback.
/// Use for profile pictures, recipe images, and food photos.
struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    let size: CGSize
    @ViewBuilder let placeholder: () -> Placeholder

    @StateObject private var loader = ThumbnailImageLoader()

    var body: some View {
        Group {
            if let uiImage = loader.image {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size.width, height: size.height)
                    .clipped()
            } else if url != nil {
                placeholder()
                    .overlay {
                        ProgressView()
                            .tint(AppTheme.Colors.textTertiary)
                    }
                    .frame(width: size.width, height: size.height)
            } else {
                placeholder()
                    .frame(width: size.width, height: size.height)
            }
        }
        // US-387: reload only when the URL changes; a re-appearing row with the
        // same URL is served from cache without a new network request.
        .task(id: url) {
            await loader.load(url)
        }
    }
}

/// Avatar view that displays an image URL or falls back to initials.
struct AvatarView: View {
    let name: String
    let imageUrl: String?
    let size: CGFloat
    var backgroundColor: Color = AppTheme.Colors.primaryLight

    private var initialsUrl: URL? {
        guard let urlString = imageUrl, !urlString.isEmpty else { return nil }
        return URL(string: urlString)
    }

    var body: some View {
        CachedAsyncImage(
            url: initialsUrl,
            size: CGSize(width: size, height: size)
        ) {
            initialsView
        }
        .clipShape(Circle())
        .accessibilityLabel("\(name) avatar")
    }

    private var initialsView: some View {
        ZStack {
            Circle()
                .fill(backgroundColor)

            Text(String(name.prefix(1)).uppercased())
                .font(size > 40 ? .title2 : .subheadline)
                .fontWeight(.bold)
                .foregroundStyle(AppTheme.Colors.primary)
        }
    }
}

/// Recipe thumbnail that shows an image or a category icon fallback.
struct RecipeThumbnail: View {
    let imageUrl: String?
    let size: CGFloat

    private var url: URL? {
        guard let urlString = imageUrl, !urlString.isEmpty else { return nil }
        return URL(string: urlString)
    }

    var body: some View {
        CachedAsyncImage(url: url, size: CGSize(width: size, height: size)) {
            ZStack {
                RoundedRectangle(cornerRadius: AppTheme.Radius.sm)
                    .fill(AppTheme.Colors.surface)

                Image(systemName: "book.fill")
                    .font(.title3)
                    .foregroundStyle(AppTheme.Colors.textTertiary)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.sm))
    }
}

// MARK: - Shimmer Loading Effect

struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    gradient: Gradient(colors: [
                        .clear,
                        Color.white.opacity(0.3),
                        .clear,
                    ]),
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .offset(x: phase)
                .animation(
                    .linear(duration: 1.5).repeatForever(autoreverses: false),
                    value: phase
                )
            )
            .clipped()
            .onAppear {
                phase = 400
            }
    }
}

extension View {
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

/// Skeleton placeholder row for loading states.
struct SkeletonRow: View {
    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            RoundedRectangle(cornerRadius: AppTheme.Radius.sm)
                .fill(Color(.systemGray5))
                .frame(width: 40, height: 40)
                .shimmer()

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(.systemGray5))
                    .frame(width: 140, height: 14)
                    .shimmer()

                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(.systemGray6))
                    .frame(width: 80, height: 10)
                    .shimmer()
            }

            Spacer()
        }
        .padding(.vertical, AppTheme.Spacing.xs)
    }
}

/// Skeleton list for initial loading states.
struct SkeletonList: View {
    let rowCount: Int

    var body: some View {
        ForEach(0..<rowCount, id: \.self) { _ in
            SkeletonRow()
        }
    }
}

#Preview {
    VStack(spacing: 20) {
        AvatarView(name: "Kevin", imageUrl: nil, size: 48)
        AvatarView(name: "Sarah", imageUrl: nil, size: 64, backgroundColor: .blue.opacity(0.2))
        RecipeThumbnail(imageUrl: nil, size: 60)
        SkeletonList(rowCount: 3)
    }
    .padding()
}
