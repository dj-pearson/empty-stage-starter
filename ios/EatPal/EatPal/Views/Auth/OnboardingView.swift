import SwiftUI

/// US-704: first-run setup, asking the one question that decides what gets
/// created.
///
/// This used to be five marketing slides ending in a Get Started button, which
/// left a parent on an empty home screen with no child and nothing to log. The
/// slides are deleted rather than reordered: a person who has just signed up
/// has already decided to try the app, and the screen after that should set it
/// up rather than sell it again.
///
/// Mirrors the shipped web route `src/pages/Onboarding.tsx` -- same question,
/// same three choices, same copy, same step counts -- so the answer means the
/// same thing on both clients.
///
/// Presented by `RootView` in place of `MainTabView` (AC9), not as a sheet, so
/// it cannot be swiped away into a half-set-up app.
struct OnboardingView: View {
    @EnvironmentObject var appState: AppState

    @State private var planningFor: PlanningFor?
    @State private var childName = ""
    @State private var step = 1
    @State private var isSaving = false

    @FocusState private var nameFieldFocused: Bool

    private var totalSteps: Int { OnboardingFlow.totalSteps(for: planningFor) }

    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            header

            if step == 1 {
                planningForStep
            } else {
                childStep
            }

            Spacer(minLength: 0)

            // AC6: a skip is an answer. It creates nothing and still finishes
            // setup, because re-asking on every launch is how a first-run flow
            // becomes something people learn to dismiss.
            Button("Skip for now") {
                Task { await finish(skipped: true) }
            }
            .font(.callout)
            .foregroundStyle(AppTheme.Colors.textTertiary)
            .disabled(isSaving)
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
        .padding(.vertical, AppTheme.Spacing.huge)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppTheme.Colors.background.ignoresSafeArea())
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            ProgressView(value: Double(step), total: Double(totalSteps))
                .tint(AppTheme.Colors.primary)

            Text("Step \(step) of \(totalSteps)")
                .font(.footnote)
                .foregroundStyle(AppTheme.Colors.textTertiary)
                .accessibilityLabel("Step \(step) of \(totalSteps)")
        }
    }

    // MARK: - Step 1

    private var planningForStep: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text("Who are you planning for?")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("This decides what we set up. You can change it later.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.Colors.textSecondary)
            }

            ForEach(PlanningFor.allCases) { choice in
                Button {
                    choose(choice)
                } label: {
                    HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
                        Image(systemName: choice.systemImage)
                            .foregroundStyle(AppTheme.Colors.primary)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(choice.title)
                                .fontWeight(.medium)
                            Text(choice.subtitle)
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.Colors.textSecondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(AppTheme.Spacing.md)
                }
                .buttonStyle(.bordered)
                .disabled(isSaving)
                .accessibilityLabel("\(choice.title). \(choice.subtitle)")
            }
        }
    }

    // MARK: - Step 2

    private var childStep: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text("Who are you cooking for?")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("A first name is enough. You can add more children later.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.Colors.textSecondary)
            }

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text("Child's first name")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Colors.textSecondary)
                TextField("e.g. Sam", text: $childName)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.givenName)
                    .autocorrectionDisabled()
                    .focused($nameFieldFocused)
                    .disabled(isSaving)
                    .accessibilityLabel("Child's first name")
            }

            Button {
                Task { await finish(skipped: false) }
            } label: {
                if isSaving {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Continue")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.Colors.primary)
            // AC3: a first name is the only required field, matching the web
            // route and AddKidView's own name-only gate.
            .disabled(isSaving || childName.trimmingCharacters(in: .whitespaces).isEmpty)

            Button {
                step = 1
                planningFor = nil
            } label: {
                Label("Back", systemImage: "arrow.left")
                    .font(.callout)
            }
            .buttonStyle(.plain)
            .foregroundStyle(AppTheme.Colors.textSecondary)
            .disabled(isSaving)
        }
        .onAppear { nameFieldFocused = true }
    }

    // MARK: - Actions

    private func choose(_ choice: PlanningFor) {
        planningFor = choice
        // US-810: the same event name and property key the web route sends, so
        // the two funnels aggregate rather than sitting in separate buckets.
        AnalyticsService.track(.onboardingPlanningForSelected(planningFor: choice.rawValue))
        if choice.needsChild {
            step = 2
        } else {
            // AC4: the adult branches finish here and create nothing. `choice`
            // is passed through rather than read back from state, which on the
            // web was reporting "unanswered" for every Just me -- the state
            // update has not landed in this closure.
            Task { await finish(skipped: false, answer: choice) }
        }
    }

    private func finish(skipped: Bool, answer: PlanningFor? = nil) async {
        isSaving = true
        defer { isSaving = false }

        let resolved = answer ?? planningFor
        var addedChild = false

        if let name = OnboardingFlow.childNameToCreate(
            answer: resolved,
            skipped: skipped,
            childName: childName
        ) {
            // AC5: the same path the Kids screen uses, so the offline queue and
            // realtime behaviour are whatever they already are. userId is left
            // empty here exactly as AddKidView leaves it -- the real id is
            // stamped on the way to the server.
            let kid = Kid(id: UUID().uuidString, userId: "", name: name)
            do {
                try await appState.addKid(kid)
                addedChild = true
            } catch {
                // Setup still finishes. The child can be added from the Kids
                // screen, and trapping someone in first-run because one insert
                // failed is worse than letting them in without it.
                ToastManager.shared.error(
                    "Couldn't add your child",
                    message: "You can add them from the Kids tab."
                )
            }
        }

        // US-810: "unanswered" is web's own placeholder for a skip taken before
        // any choice was made, so a skip from step one lands in the same bucket
        // on both platforms rather than as an empty string on one of them.
        //
        // addedChild reports what actually happened: a failed insert above
        // toasts and carries on, and reporting true there would overstate
        // activation in the one case worth knowing about.
        //
        // kidAdded is NOT emitted here -- appState.addKid already fires it, and
        // a second one would double-count every child created in setup (AC3).
        let answerForAnalytics = resolved?.rawValue ?? "unanswered"
        AnalyticsService.track(
            skipped
                ? .onboardingSkipped(planningFor: answerForAnalytics, addedChild: addedChild)
                : .onboardingCompleted(planningFor: answerForAnalytics, addedChild: addedChild)
        )

        // US-704 AC8: planning_for is NOT persisted. household-planner US-740
        // owns storing it as household_eaters rows, and inventing a column here
        // is how the eater model diverges before it is built.
        await OnboardingService.shared.markCompleted()
    }
}

#Preview {
    OnboardingView()
        .environmentObject(AppState())
}
