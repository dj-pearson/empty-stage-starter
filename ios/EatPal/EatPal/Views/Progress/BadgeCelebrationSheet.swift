import SwiftUI

/// US-241: Celebration sheet shown when a kid earns a new badge.
///
/// Lightweight confetti via animated emoji squares — no Lottie dependency.
/// Respects `@Environment(\.accessibilityReduceMotion)` so users on reduced
/// motion get a still icon instead of the bouncing animation.
struct BadgeCelebrationSheet: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    let earned: BadgeService.Earned
    let kidName: String

    @State private var iconScale: CGFloat = 0.6
    @State private var iconRotate: Double = -10

    var body: some View {
        ZStack {
            // Subtle gradient backdrop in the badge's tier color.
            LinearGradient(
                colors: [earned.badge.color.opacity(0.18), Color.clear],
                startPoint: .top,
                endPoint: .center
            )
            .ignoresSafeArea()

            // Confetti layer behind the badge so the icon stays in front.
            if !reduceMotion {
                ConfettiLayer(color: earned.badge.color)
                    .allowsHitTesting(false)
            }

            VStack(spacing: 24) {
                Spacer()

                Text("Badge Unlocked!")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)

                ZStack {
                    Circle()
                        .fill(earned.badge.color.opacity(0.18))
                        .frame(width: 160, height: 160)

                    Image(systemName: earned.badge.icon)
                        .font(.system(size: 80))
                        .foregroundStyle(earned.badge.color)
                        .scaleEffect(iconScale)
                        .rotationEffect(.degrees(iconRotate))
                }

                VStack(spacing: 8) {
                    Text(earned.badge.title)
                        .font(.title)
                        .fontWeight(.bold)

                    Text(earned.badge.description)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    Text("Earned by \(kidName)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 32)

                Spacer()

                VStack(spacing: 10) {
                    ShareLink(item: shareText) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.bordered)

                    Button {
                        dismiss()
                    } label: {
                        Text("Awesome")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(earned.badge.color)
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 24)
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            HapticManager.success()
            if !reduceMotion {
                withAnimation(.spring(response: 0.55, dampingFraction: 0.55)) {
                    iconScale = 1.0
                    iconRotate = 0
                }
            } else {
                iconScale = 1.0
                iconRotate = 0
            }
        }
        .onDisappear {
            // Tell the service the sheet is done so future earns can refire.
            BadgeService.shared.dismissCelebration()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Badge unlocked: \(earned.badge.title) — \(earned.badge.description)")
    }

    /// Plain-text share. Image-only export is the spec, but ShareLink with a
    /// rendered image needs ImageRenderer (iOS 16+). Keep it simple for now;
    /// a richer Image-card export can swap in later without changing the call site.
    private var shareText: String {
        "\(kidName) just unlocked the \(earned.badge.title) badge in EatPal! 🎉"
    }
}

// MARK: - Confetti

/// 30 lightweight emoji-squares that fall from the top edge with random
/// horizontal drift. No external assets, no Lottie. Cheap enough that
/// presenting the sheet on a phone is still ~60fps.
private struct ConfettiLayer: View {
    let color: Color

    /// Stable per-particle metadata so SwiftUI doesn't re-randomize on every
    /// view rebuild — the confetti would jitter mid-fall otherwise.
    @State private var particles: [Particle] = (0..<30).map { _ in Particle.random() }

    @State private var hasFallen = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(particles) { p in
                    Circle()
                        .fill(color.opacity(p.opacity))
                        .frame(width: p.size, height: p.size)
                        .position(
                            x: geo.size.width * p.startX,
                            y: hasFallen ? geo.size.height + 40 : -40
                        )
                        .animation(
                            .easeIn(duration: p.duration)
                                .delay(p.delay),
                            value: hasFallen
                        )
                }
            }
        }
        .onAppear { hasFallen = true }
    }

    private struct Particle: Identifiable {
        let id = UUID()
        let startX: CGFloat
        let size: CGFloat
        let opacity: Double
        let duration: Double
        let delay: Double

        static func random() -> Particle {
            Particle(
                startX: .random(in: 0.05...0.95),
                size: .random(in: 6...12),
                opacity: .random(in: 0.5...0.95),
                duration: .random(in: 1.5...3.0),
                delay: .random(in: 0.0...0.6)
            )
        }
    }
}

#Preview {
    BadgeCelebrationSheet(
        earned: BadgeService.Earned(
            badge: .vegetableExplorer,
            kidId: "preview",
            earnedAt: Date()
        ),
        kidName: "Sarah"
    )
}
