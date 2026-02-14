import SwiftUI

/// Reusable async image loader with placeholder and error fallback.
/// Use for profile pictures, recipe images, and food photos.
struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    let size: CGSize
    @ViewBuilder let placeholder: () -> Placeholder

    var body: some View {
        if let url {
            AsyncImage(url: url) { phase in
                switch phase {
                case .empty:
                    placeholder()
                        .overlay {
                            ProgressView()
                                .tint(AppTheme.Colors.textTertiary)
                        }
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: size.width, height: size.height)
                        .clipped()
                case .failure:
                    placeholder()
                @unknown default:
                    placeholder()
                }
            }
            .frame(width: size.width, height: size.height)
        } else {
            placeholder()
                .frame(width: size.width, height: size.height)
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
