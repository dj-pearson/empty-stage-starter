import SwiftUI

/// US-269: Reusable floating action bar for bulk operations.
///
/// Anchored to the bottom of the parent view via `.overlay(alignment: .bottom)`.
/// Pantry / Grocery / Recipes views configure scope-appropriate actions; the
/// bar handles the visual chrome (pill background, blur, animation, reduce-
/// motion fallback) and announces the selection count to VoiceOver.
struct BulkActionBar: View {
    /// One button in the action bar. Destructive actions get a separate
    /// styling track via `isDestructive` so Delete reads as red and gets
    /// a confirmation alert before firing.
    struct Action: Identifiable {
        let id = UUID()
        let title: String
        let systemImage: String
        let isDestructive: Bool
        let needsConfirmation: Bool
        let perform: () -> Void

        init(
            title: String,
            systemImage: String,
            isDestructive: Bool = false,
            needsConfirmation: Bool = false,
            perform: @escaping () -> Void
        ) {
            self.title = title
            self.systemImage = systemImage
            self.isDestructive = isDestructive
            self.needsConfirmation = needsConfirmation
            self.perform = perform
        }
    }

    let selectionCount: Int
    let actions: [Action]
    let onCancel: () -> Void
    let onSelectAll: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pendingConfirmation: Action?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Button(role: .cancel) {
                    HapticManager.lightImpact()
                    onCancel()
                } label: {
                    Image(systemName: "xmark")
                        .font(.body)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Cancel selection")

                Text("\(selectionCount) selected")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .accessibilityLabel("\(selectionCount) item\(selectionCount == 1 ? "" : "s") selected")

                Spacer()

                if let onSelectAll {
                    Button("Select All") {
                        HapticManager.selection()
                        onSelectAll()
                    }
                    .font(.subheadline)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            Divider()

            // Horizontally scrolling action row so 5+ actions fit on
            // smaller screens without forcing a multi-line layout.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(actions) { action in
                        Button {
                            HapticManager.lightImpact()
                            if action.needsConfirmation {
                                pendingConfirmation = action
                            } else {
                                action.perform()
                            }
                        } label: {
                            Label(action.title, systemImage: action.systemImage)
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(.bordered)
                        .tint(action.isDestructive ? .red : .accentColor)
                        .disabled(selectionCount == 0)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
        }
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
        .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 2)
        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
        .alert(
            pendingConfirmation?.title ?? "Confirm",
            isPresented: Binding(
                get: { pendingConfirmation != nil },
                set: { if !$0 { pendingConfirmation = nil } }
            ),
            presenting: pendingConfirmation
        ) { action in
            Button(action.title, role: action.isDestructive ? .destructive : nil) {
                action.perform()
                pendingConfirmation = nil
            }
            Button("Cancel", role: .cancel) {
                pendingConfirmation = nil
            }
        } message: { action in
            Text("\(action.title) \(selectionCount) item\(selectionCount == 1 ? "" : "s")?")
        }
    }
}
