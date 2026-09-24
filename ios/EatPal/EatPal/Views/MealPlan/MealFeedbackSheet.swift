import SwiftUI

/// US-231: Optional follow-up to a meal-result tap. Captures a 1-5 emoji
/// rating, how much was eaten (a lot / some / nibbles) and an optional note.
/// Skippable; auto-dismisses after 8s of no input so the parent never gets
/// blocked on the modal mid-cook. Everything saved here shows up in the Food
/// Journal for the whole household.
struct MealFeedbackSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState

    let planEntryId: String
    let entryName: String
    let result: MealResult

    @State private var selectedRating: Int? = nil
    @State private var selectedAmount: AmountEaten? = nil
    @State private var note: String = ""
    @State private var isSubmitting = false
    @State private var autoDismissTask: Task<Void, Never>?

    /// 8-second silent dismiss — long enough to read + tap a star, short
    /// enough that distracted parents aren't held up by an empty modal.
    private static let autoDismissSeconds: UInt64 = 8

    private let scale: [(rating: Int, emoji: String, label: String)] = [
        (1, "😖", "Hated it"),
        (2, "🙁", "Meh"),
        (3, "🙂", "OK"),
        (4, "😋", "Loved it"),
        (5, "🤩", "Adored it"),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                header

                ratingScale

                if result != .refused {
                    amountPicker
                }

                noteField

                Spacer()

                actions
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 20)
            .navigationTitle("How was it?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Skip") { dismiss() }
                        .foregroundStyle(.secondary)
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .interactiveDismissDisabled(false)
        .onAppear {
            scheduleAutoDismiss()
        }
        .onDisappear {
            autoDismissTask?.cancel()
        }
        // Cancel auto-dismiss the moment the user shows any intent to engage
        // — typing, tapping a rating, etc. Don't snatch the sheet out from
        // under them just because they took 9 seconds to think.
        .onChange(of: selectedRating) { _, _ in autoDismissTask?.cancel() }
        .onChange(of: selectedAmount) { _, _ in autoDismissTask?.cancel() }
        .onChange(of: note) { _, _ in autoDismissTask?.cancel() }
    }

    // MARK: - Subviews

    private var header: some View {
        VStack(spacing: 8) {
            Text(entryName)
                .font(.headline)
                .multilineTextAlignment(.center)

            Text("Logged as \(result.displayName.lowercased()) — what stood out?")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private var ratingScale: some View {
        HStack(spacing: 12) {
            ForEach(scale, id: \.rating) { item in
                Button {
                    HapticManager.selection()
                    selectedRating = item.rating
                } label: {
                    VStack(spacing: 4) {
                        Text(item.emoji)
                            .font(.system(size: selectedRating == item.rating ? 38 : 32))
                            .scaleEffect(selectedRating == item.rating ? 1.1 : 1.0)
                            .animation(.spring(response: 0.3), value: selectedRating)
                        if selectedRating == item.rating {
                            Text(item.label)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .transition(.opacity)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 72)
                    .background(
                        selectedRating == item.rating
                            ? Color.green.opacity(0.15)
                            : Color(.secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 12)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(
                                selectedRating == item.rating ? Color.green : .clear,
                                lineWidth: 2
                            )
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(item.label), rating \(item.rating) out of 5")
            }
        }
    }

    private var amountPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("How much did they eat?")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                ForEach(AmountEaten.allCases) { amount in
                    let isSelected = selectedAmount == amount
                    Button {
                        HapticManager.selection()
                        selectedAmount = isSelected ? nil : amount
                    } label: {
                        Text(amount.displayName)
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(
                                isSelected ? Color.green.opacity(0.15) : Color(.secondarySystemBackground),
                                in: RoundedRectangle(cornerRadius: 10)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .strokeBorder(isSelected ? Color.green : .clear, lineWidth: 2)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(amount.displayName)
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
        }
    }

    private var noteField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Add a note (optional)")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("e.g. 'Loved the dipping sauce'", text: $note, axis: .vertical)
                .lineLimit(2...3)
                .padding(10)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                .textInputAutocapitalization(.sentences)
        }
    }

    private var actions: some View {
        HStack(spacing: 12) {
            Button("Skip") { dismiss() }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)

            Button {
                Task { await submit() }
            } label: {
                HStack {
                    if isSubmitting {
                        ProgressView().tint(.white)
                    }
                    Text("Save")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            .disabled(
                selectedRating == nil
                    && selectedAmount == nil
                    && note.trimmingCharacters(in: .whitespaces).isEmpty
            )
        }
    }

    // MARK: - Actions

    private func scheduleAutoDismiss() {
        autoDismissTask?.cancel()
        autoDismissTask = Task {
            try? await Task.sleep(for: .seconds(Double(Self.autoDismissSeconds)))
            guard !Task.isCancelled else { return }
            await MainActor.run { dismiss() }
        }
    }

    private func submit() async {
        // Use 0 ("note-only") when the user didn't pick a face but still
        // typed a note — keeps the schema interpretable downstream.
        let rating = selectedRating ?? 0
        let hasFeedback = rating > 0 || !note.trimmingCharacters(in: .whitespaces).isEmpty
        let amount = result == .refused ? nil : selectedAmount
        guard hasFeedback || amount != nil else {
            dismiss()
            return
        }
        isSubmitting = true
        // The amount belongs to the meal, not to this parent's rating, so it
        // goes on the plan entry where the web log modal writes it too.
        // updatePlanEntry rolls back and toasts a failure itself.
        if let amount {
            try? await appState.updatePlanEntry(
                planEntryId,
                updates: PlanEntryUpdate(amountEaten: amount.rawValue)
            )
        }
        if hasFeedback {
            await appState.addPlanEntryFeedback(
                planEntryId: planEntryId,
                rating: rating,
                note: note
            )
        }
        HapticManager.success()
        dismiss()
    }
}

/// Identifiable wrapper so callers can present this sheet via `.sheet(item:)`.
struct MealFeedbackContext: Identifiable, Equatable {
    let id: String  // == planEntryId
    let entryName: String
    let result: MealResult
}

#Preview {
    Color.gray
        .sheet(isPresented: .constant(true)) {
            MealFeedbackSheet(
                planEntryId: "preview",
                entryName: "Spaghetti Bolognese",
                result: .ate
            )
            .environmentObject(AppState())
        }
}
