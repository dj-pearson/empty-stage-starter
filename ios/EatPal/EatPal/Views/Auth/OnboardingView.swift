import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var currentPage = 0

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "fork.knife.circle.fill",
            title: "Welcome to EatPal",
            description: "Smart meal planning for families with picky eaters. Track foods, plan meals, and celebrate every bite.",
            color: .green
        ),
        OnboardingPage(
            icon: "person.2.fill",
            title: "Add Your Children",
            description: "Create profiles for each child with their allergens, preferences, and eating behavior to get personalized plans.",
            color: .blue
        ),
        OnboardingPage(
            icon: "refrigerator.fill",
            title: "Build Your Pantry",
            description: "Add foods your family eats. Mark safe foods and try-bite items to track progress over time.",
            color: .orange
        ),
        OnboardingPage(
            icon: "calendar",
            title: "Plan Weekly Meals",
            description: "Drag foods into meal slots for each child. Log results as ate, tasted, or refused to track progress.",
            color: .purple
        ),
        OnboardingPage(
            icon: "cart.fill",
            title: "Grocery Lists Made Easy",
            description: "Generate shopping lists from your meal plans. Check items off as you shop, organized by category.",
            color: .pink
        ),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Page Content
            TabView(selection: $currentPage) {
                ForEach(pages.indices, id: \.self) { index in
                    OnboardingPageView(page: pages[index])
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(AppTheme.Animation.standard, value: currentPage)

            // Bottom Controls
            VStack(spacing: AppTheme.Spacing.xl) {
                // Page Dots
                HStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(pages.indices, id: \.self) { index in
                        Circle()
                            .fill(index == currentPage ? AppTheme.Colors.primary : Color(.systemGray4))
                            .frame(width: index == currentPage ? 10 : 7, height: index == currentPage ? 10 : 7)
                            .animation(AppTheme.Animation.quick, value: currentPage)
                    }
                }

                // Buttons
                HStack {
                    if currentPage > 0 {
                        Button("Back") {
                            HapticManager.selection()
                            withAnimation { currentPage -= 1 }
                        }
                        .foregroundStyle(AppTheme.Colors.textSecondary)
                    }

                    Spacer()

                    if currentPage < pages.count - 1 {
                        Button {
                            HapticManager.selection()
                            withAnimation { currentPage += 1 }
                        } label: {
                            HStack {
                                Text("Next")
                                Image(systemName: "arrow.right")
                            }
                            .fontWeight(.semibold)
                            .padding(.horizontal, AppTheme.Spacing.xxl)
                            .padding(.vertical, AppTheme.Spacing.md)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.Colors.primary)
                    } else {
                        Button {
                            HapticManager.success()
                            hasCompletedOnboarding = true
                        } label: {
                            HStack {
                                Text("Get Started")
                                Image(systemName: "checkmark")
                            }
                            .fontWeight(.semibold)
                            .padding(.horizontal, AppTheme.Spacing.xxl)
                            .padding(.vertical, AppTheme.Spacing.md)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.Colors.primary)
                    }
                }

                // Skip
                if currentPage < pages.count - 1 {
                    Button("Skip") {
                        hasCompletedOnboarding = true
                    }
                    .font(.callout)
                    .foregroundStyle(AppTheme.Colors.textTertiary)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xxl)
            .padding(.bottom, AppTheme.Spacing.huge)
        }
    }
}

// MARK: - Onboarding Page Model

struct OnboardingPage {
    let icon: String
    let title: String
    let description: String
    let color: Color
}

// MARK: - Onboarding Page View

struct OnboardingPageView: View {
    let page: OnboardingPage

    var body: some View {
        VStack(spacing: AppTheme.Spacing.xxl) {
            Spacer()

            // Icon
            ZStack {
                Circle()
                    .fill(page.color.opacity(0.12))
                    .frame(width: 120, height: 120)

                Image(systemName: page.icon)
                    .font(.system(size: 52))
                    .foregroundStyle(page.color)
            }
            .accessibilityHidden(true)

            // Text
            VStack(spacing: AppTheme.Spacing.md) {
                Text(page.title)
                    .font(.title)
                    .fontWeight(.bold)
                    .multilineTextAlignment(.center)

                Text(page.description)
                    .font(.body)
                    .foregroundStyle(AppTheme.Colors.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, AppTheme.Spacing.lg)
            }

            Spacer()
            Spacer()
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(page.title). \(page.description)")
    }
}

#Preview {
    OnboardingView()
        .environmentObject(AppState())
}
