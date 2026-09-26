import SwiftUI
import UIKit

/// Every logged meal for the active child, a day at a time, with the notes
/// and amounts caregivers wrote. Plan entries and feedback are both readable
/// by the whole household, so a note the nanny logs is here for the parent.
///
/// The web page is src/pages/FoodJournal.tsx; the grouping both use is
/// `FoodJournal.build` (and `buildFoodJournal` on the web).
struct FoodJournalView: View {
    @EnvironmentObject var appState: AppState

    enum JournalRange: Int, CaseIterable, Identifiable {
        case week = 7
        case twoWeeks = 14
        case month = 30
        case quarter = 90

        var id: Int { rawValue }

        var label: String {
            switch self {
            case .week: return "7 days"
            case .twoWeeks: return "14 days"
            case .month: return "30 days"
            case .quarter: return "90 days"
            }
        }
    }

    private static let emptyText =
        "Log a meal from the Meal Plan and add a note or how much was eaten. "
        + "It shows up here for everyone in your household."
    private static let emptyNotesText =
        "No notes in this range. Turn off the filter to see every logged meal."

    @State private var range: JournalRange = .week
    @State private var onlyWithNotes = false
    @State private var editing: FoodJournalItem?

    private var fromDate: String {
        let start = Calendar.current.date(byAdding: .day, value: -(range.rawValue - 1), to: Date()) ?? Date()
        return DateFormatter.isoDate.string(from: start)
    }

    private var days: [FoodJournalDay] {
        FoodJournal.build(
            entries: appState.planEntries,
            foods: appState.foods,
            recipes: appState.recipes,
            feedback: appState.planEntryFeedback,
            kidId: appState.activeKidId,
            from: fromDate,
            to: DateFormatter.isoDate.string(from: Date()),
            onlyWithNotes: onlyWithNotes
        )
    }

    var body: some View {
        let journalDays = days
        List {
            if appState.kids.count > 1 {
                Section {
                    KidSelectorView()
                }
            }

            Section {
                Picker("Range", selection: $range) {
                    ForEach(JournalRange.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                Toggle("Only meals with notes", isOn: $onlyWithNotes)
            }

            if journalDays.isEmpty {
                Section {
                    ContentUnavailableView(
                        "Nothing logged yet",
                        systemImage: "book.closed",
                        description: Text(onlyWithNotes ? Self.emptyNotesText : Self.emptyText)
                    )
                }
            } else {
                Section("Summary") {
                    summary(for: journalDays)
                }

                ForEach(journalDays) { day in
                    Section {
                        ForEach(day.items) { item in
                            Button {
                                editing = item
                            } label: {
                                row(for: item)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Edit the note and amount")
                        }
                    } header: {
                        HStack {
                            Text(heading(for: day.date))
                            Spacer()
                            Button {
                                UIPasteboard.general.string = FoodJournal.plainText(
                                    for: day,
                                    heading: heading(for: day.date)
                                )
                                HapticManager.success()
                                ToastManager.shared.success(
                                    "Copied",
                                    message: "Paste it into a message or a note for your care team."
                                )
                            } label: {
                                Label("Copy", systemImage: "doc.on.doc")
                                    .labelStyle(.iconOnly)
                            }
                            .accessibilityLabel("Copy \(heading(for: day.date)) as text")
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Food Journal")
        .toolbar {
            // M16: the whole range as text, for a feeding therapist or the
            // pediatrician. The per-day Copy buttons stay for one day.
            if !journalDays.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    ShareLink(
                        item: exportText(for: journalDays),
                        subject: Text("Food journal")
                    ) {
                        Label("Share journal", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
        .refreshable {
            await appState.loadPlanEntryFeedback()
        }
        .task {
            // Picks up notes the other caregiver wrote since the app opened.
            await appState.loadPlanEntryFeedback()
        }
        .sheet(item: $editing) { item in
            FoodJournalEditSheet(item: item)
        }
    }

    // MARK: - Export

    private func exportText(for days: [FoodJournalDay]) -> String {
        let name = appState.activeKid?.name ?? "My child"
        let items = days.flatMap(\.items)
        let ate = days.map(\.ateCount).reduce(0, +)
        let tasted = days.map(\.tastedCount).reduce(0, +)
        let notToday = days.map(\.refusedCount).reduce(0, +)
        var lines: [String] = []
        lines.append("Food journal: " + name + ", last " + range.label)
        lines.append("\(items.count) logged meals. Ate \(ate), tasted \(tasted), not today \(notToday).")
        if onlyWithNotes {
            lines.append("Only meals with notes are included.")
        }
        var text = lines.joined(separator: "\n")
        for day in days {
            text += "\n\n" + FoodJournal.plainText(for: day, heading: heading(for: day.date))
        }
        return text
    }

    // MARK: - Rows

    private func summary(for days: [FoodJournalDay]) -> some View {
        let items = days.flatMap(\.items)
        let amounts = AmountEaten.allCases.map { amount in
            (amount, items.filter { $0.amountEaten == amount }.count)
        }
        let ate = days.map(\.ateCount).reduce(0, +)
        let tasted = days.map(\.tastedCount).reduce(0, +)
        let refused = days.map(\.refusedCount).reduce(0, +)
        return VStack(alignment: .leading, spacing: 6) {
            Text("\(items.count) logged meals")
                .font(.subheadline.weight(.semibold))
            Text("Ate \(ate) · Tasted \(tasted) · Not today \(refused)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(amounts.map { "\($0.0.displayName) \($0.1)" }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func row(for item: FoodJournalItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(slotLabel(for: item))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(item.name)
                        .font(.body.weight(.medium))
                }
                Spacer()
                HStack(spacing: 6) {
                    if let result = item.result {
                        chip(result.displayName, color: color(for: result))
                    }
                    if let amount = item.amountEaten {
                        chip(amount.displayName, color: .secondary)
                    }
                }
            }
            ForEach(item.notes) { note in
                Text(note.text)
                    .font(.subheadline)
                    .foregroundStyle(Color.primary.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func chip(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }

    private func color(for result: MealResult) -> Color {
        result.tint
    }

    private func slotLabel(for item: FoodJournalItem) -> String {
        let slot = MealSlot(rawValue: item.mealSlot)?.displayName ?? item.mealSlot
        guard appState.activeKidId == nil,
              let kid = appState.kids.first(where: { $0.id == item.kidId }) else { return slot }
        return "\(slot) - \(kid.name)"
    }

    private func heading(for date: String) -> String {
        guard let parsed = DateFormatter.isoDate.date(from: date) else { return date }
        return parsed.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
    }
}

/// Edit the amount and the plan entry's own note. Feedback notes are shown for
/// context only: RLS lets just their author change them.
private struct FoodJournalEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState

    let item: FoodJournalItem

    @State private var note: String = ""
    @State private var amount: AmountEaten?
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                if item.result != .refused {
                    Section("How much did they eat?") {
                        Picker("Amount", selection: $amount) {
                            // Offered only while nothing is recorded: the update
                            // cannot send NULL, so picking it later would not
                            // clear anything.
                            if item.amountEaten == nil {
                                Text("Not recorded").tag(AmountEaten?.none)
                            }
                            ForEach(AmountEaten.allCases) { option in
                                Text(option.displayName).tag(Optional(option))
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                }

                Section("Note") {
                    TextField("What happened? Texture, mood, what helped...", text: $note, axis: .vertical)
                        .lineLimit(3...8)
                        .textInputAutocapitalization(.sentences)
                }

                let others = item.notes.filter(\.isFeedback)
                if !others.isEmpty {
                    Section("Also noted on this meal") {
                        ForEach(others) { other in
                            Text(other.text)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle(item.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(isSaving)
                }
            }
            .onAppear {
                note = item.entryNote ?? ""
                amount = item.amountEaten
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let update = PlanEntryUpdate(
            notes: note.trimmingCharacters(in: .whitespacesAndNewlines),
            amountEaten: item.result == .refused ? nil : amount?.rawValue
        )
        do {
            try await appState.updatePlanEntry(item.entryId, updates: update)
            HapticManager.success()
            dismiss()
        } catch {
            // updatePlanEntry has already rolled back and shown the error.
        }
    }
}

#Preview {
    NavigationStack {
        FoodJournalView()
            .environmentObject(AppState())
    }
}
