import SwiftUI

/// US-705: the one control every zero-kid surface offers.
///
/// Four screens asked for a child and none of them could add one. The dashboard
/// hid its kid selector and showed zeroed stats beside three actions, none of
/// which was "add a child"; the meal planner, the AI planner and the progress
/// dashboard each rendered a `ContentUnavailableView` with no action at all.
/// AI Meal Plan went further and said "Add a child profile from the Dashboard",
/// which was false -- the Dashboard had no such control either.
///
/// An empty state that cannot perform the action it is asking for is the bug.
/// This is one view at four call sites rather than four buttons, so the copy
/// and the sheet cannot drift apart again.
///
/// It presents `AddKidView`, the same sheet the Kids tab uses, so a child added
/// here goes through `appState.addKid` and behaves identically offline.
struct AddFirstChildCard: View {
    /// How much chrome to draw.
    ///
    /// Three of the four call sites sit inside a `ContentUnavailableView`,
    /// which already supplies an icon and a description -- repeating them would
    /// show the same symbol twice. Those pass `.action` and get the button
    /// alone; the dashboard, which has no such wrapper, gets the full card.
    enum Style {
        case card
        case action
    }

    var style: Style = .card

    /// Shown above the button in `.card` style. Each surface says why IT needs
    /// a child, because "Streaks and badges are tracked per child" is a better
    /// reason on the progress screen than a generic line would be. Ignored in
    /// `.action` style, where the wrapper has already said it.
    var message: String = ""

    /// The button's title. Defaults to the phrasing the Kids tab uses.
    var actionTitle = "Add a child"

    @State private var showingAddKid = false

    var body: some View {
        Group {
            if style == .card {
                VStack(spacing: AppTheme.Spacing.md) {
                    Image(systemName: "person.crop.circle.badge.plus")
                        .font(.system(size: 44))
                        .foregroundStyle(AppTheme.Colors.primary)
                        .accessibilityHidden(true)

                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Colors.textSecondary)
                        .multilineTextAlignment(.center)

                    addButton
                }
                .frame(maxWidth: .infinity)
                .padding(AppTheme.Spacing.xl)
            } else {
                addButton
            }
        }
        // AC6: no dismissal flag anywhere. The state is derived from
        // appState.kids, so it disappears the moment one exists and comes back
        // if the last child is deleted.
        .sheet(isPresented: $showingAddKid) {
            AddKidView()
        }
    }

    private var addButton: some View {
        Button {
            showingAddKid = true
        } label: {
            Label(actionTitle, systemImage: "plus")
                .fontWeight(.semibold)
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.sm)
        }
        .buttonStyle(.borderedProminent)
        .tint(AppTheme.Colors.primary)
    }
}

#Preview {
    AddFirstChildCard(message: "Add a child to start planning meals.")
        .environmentObject(AppState())
}
