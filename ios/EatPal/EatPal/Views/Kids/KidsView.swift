import SwiftUI

struct KidsView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingAddKid = false
    @State private var selectedKid: Kid?
    // US-417: confirm destructive child deletion before it runs.
    @State private var kidPendingDeletion: Kid?

    var body: some View {
        List {
            if appState.isLoading && appState.kids.isEmpty {
                // US-368: skeleton while loading; the empty state only shows
                // once loading completes with no kids.
                Section {
                    ForEach(0..<3, id: \.self) { _ in
                        SkeletonView(shape: .foodRow)
                    }
                }
            } else if appState.kids.isEmpty {
                Section {
                    ContentUnavailableView(
                        "No Children",
                        systemImage: "person.crop.circle.badge.plus",
                        description: Text("Add your children to start planning their meals.")
                    )
                }
            } else {
                ForEach(appState.kids) { kid in
                    // A Button rather than onTapGesture so VoiceOver reads the
                    // row as actionable.
                    Button {
                        selectedKid = kid
                    } label: {
                        KidRowView(kid: kid)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            // US-417: confirm before deleting — this cascades
                            // streaks, plan entries and other child data.
                            kidPendingDeletion = kid
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Children")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingAddKid = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add child")
            }
        }
        .sheet(isPresented: $showingAddKid) {
            AddKidView()
        }
        .sheet(item: $selectedKid) { kid in
            KidDetailView(kid: kid)
        }
        .refreshable {
            await appState.loadAllData()
        }
        // US-417: confirmation + error surfacing for child deletion.
        .confirmationDialog(
            "Delete \(kidPendingDeletion?.name ?? "this child")?",
            isPresented: Binding(
                get: { kidPendingDeletion != nil },
                set: { if !$0 { kidPendingDeletion = nil } }
            ),
            titleVisibility: .visible,
            presenting: kidPendingDeletion
        ) { kid in
            Button("Delete", role: .destructive) {
                deleteKid(kid)
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("This also removes their meal plans, streaks and progress. This can't be undone.")
        }
    }

    /// US-417: delete with failure surfaced (and retryable) instead of a
    /// silent `try?` that let a failed delete silently reappear on next load.
    private func deleteKid(_ kid: Kid) {
        Task {
            do {
                try await appState.deleteKid(kid.id)
                HapticManager.success()
            } catch {
                HapticManager.error()
                ToastManager.shared.error(
                    "Couldn't delete \(kid.name)",
                    message: "Please try again.",
                    retry: { deleteKid(kid) }
                )
            }
        }
    }
}

// MARK: - Kid Row

struct KidRowView: View {
    let kid: Kid

    var body: some View {
        HStack(spacing: 14) {
            // Avatar
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.2))
                    .frame(width: 48, height: 48)

                Text(String(kid.name.prefix(1)).uppercased())
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundStyle(.green)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(kid.name)
                    .font(.body)
                    .fontWeight(.semibold)

                HStack(spacing: 8) {
                    if let age = kid.age {
                        Label("\(age) years", systemImage: "birthday.cake")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let level = kid.pickinessLevel {
                        Text(pickinessDisplay(level))
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(pickinessColor(level).opacity(0.15), in: Capsule())
                            .foregroundStyle(pickinessColor(level))
                    }
                }

                if let allergens = kid.allergens, !allergens.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundStyle(.red)
                        // Wraps instead of truncating: a cut-off list hides
                        // the very allergen a sitter needs to see.
                        Text(KidAllergySummary.line(for: kid))
                            .font(.caption2)
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private func pickinessDisplay(_ level: String) -> String {
        switch level {
        case "not_picky": return "Eats a wide range"
        case "somewhat_picky": return "Selective eater"
        case "very_picky": return "Needs extra support"
        default: return level.capitalized
        }
    }

    private func pickinessColor(_ level: String) -> Color {
        switch level {
        case "not_picky": return .green
        case "somewhat_picky": return .orange
        case "very_picky": return .red
        default: return .secondary
        }
    }
}

// MARK: - Add Kid View

struct AddKidView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var age: Int?
    @State private var gender = ""
    @State private var pickinessLevel = "not_picky"
    @State private var allergens = ""
    @State private var notes = ""
    @State private var isSubmitting = false

    private let pickinessOptions = [
        ("not_picky", "Eats a wide range"),
        ("somewhat_picky", "Selective eater"),
        ("very_picky", "Needs extra support"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("Basic Info") {
                    TextField("Name", text: $name)

                    Stepper(value: Binding(
                        get: { age ?? 0 },
                        set: { age = $0 }
                    ), in: 0...18) {
                        HStack {
                            Text("Age")
                            Spacer()
                            Text(age.map { "\($0) years" } ?? "Not set")
                                .foregroundStyle(.secondary)
                        }
                    }

                    Picker("Gender", selection: $gender) {
                        Text("Not specified").tag("")
                        Text("Male").tag("male")
                        Text("Female").tag("female")
                        Text("Other").tag("other")
                    }
                }

                Section("Eating Profile") {
                    Picker("Eating style", selection: $pickinessLevel) {
                        ForEach(pickinessOptions, id: \.0) { value, label in
                            Text(label).tag(value)
                        }
                    }
                }

                Section("Allergens") {
                    TextField("Allergens (comma separated)", text: $allergens)
                        .textInputAutocapitalization(.never)
                }

                Section("Notes") {
                    TextField("Additional notes", text: $notes, axis: .vertical)
                        .lineLimit(4)
                }
            }
            .navigationTitle("Add Child")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task { await addKid() }
                    }
                    .disabled(name.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func addKid() async {
        isSubmitting = true
        // US-409: reset the submitting flag on every exit path.
        defer { isSubmitting = false }

        let allergenList = allergens.isEmpty ? nil :
            allergens.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        let kid = Kid(
            id: UUID().uuidString,
            userId: "",
            name: name,
            age: age,
            gender: gender.isEmpty ? nil : gender,
            allergens: allergenList,
            notes: notes.isEmpty ? nil : notes,
            pickinessLevel: pickinessLevel
        )

        // US-409: only dismiss on confirmed success; surface failures and keep
        // the sheet open so the user can retry instead of silently losing input.
        do {
            try await appState.addKid(kid)
            dismiss()
        } catch {
            ToastManager.shared.error(
                "Couldn't add child",
                message: "Please try again."
            )
        }
    }
}

// MARK: - Kid Detail View

/// M7: opens on a read-only "About" summary, the page a co-parent or sitter
/// needs, with editing behind Edit. Pushed from the More tab (deep link) it
/// must not wrap itself in a second NavigationStack.
struct KidDetailView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let kid: Kid
    /// True when presented as a sheet; false when pushed onto an existing
    /// NavigationStack.
    var embedInNavigationStack: Bool = true

    @State private var showingEditor = false
    // US-240: Picky-eater quiz sheet
    @State private var showingQuiz = false

    /// Live record, so edits made in the editor or the quiz show on return.
    private var current: Kid {
        appState.kids.first { $0.id == kid.id } ?? kid
    }

    var body: some View {
        if embedInNavigationStack {
            NavigationStack {
                content
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { dismiss() }
                        }
                    }
            }
        } else {
            content
        }
    }

    private var content: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(current.name)
                        .font(.title2)
                        .fontWeight(.bold)
                    if !headerSubtitle.isEmpty {
                        Text(headerSubtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Allergies") {
                let allergens = current.allergens ?? []
                if allergens.isEmpty {
                    Text("No allergies recorded")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(allergens, id: \.self) { allergen in
                        HStack {
                            Label(allergen, systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                            Spacer()
                            Text(severityText(for: allergen))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    if current.crossContaminationSensitive == true {
                        Label("Reacts to cross-contact. Keep pans, boards and fryers separate.", systemImage: "hand.raised.fill")
                            .font(.subheadline)
                            .foregroundStyle(.red)
                    }
                }
            }

            listSection("Always eats", items: current.alwaysEatsFoods)
            listSection("Favorites", items: current.favoriteFoods)
            listSection("Not a fan of", items: current.dislikedFoods)
            listSection("What helps", items: current.helpfulStrategies)

            if let behavioral = current.behavioralNotes, !behavioral.isEmpty {
                Section("Mealtime notes") {
                    Text(behavioral)
                }
            }
            if let notes = current.notes, !notes.isEmpty {
                Section("Notes") {
                    Text(notes)
                }
            }

            Section("Today") {
                LabeledContent("Safe foods") {
                    Text("\(safeFoodCount)")
                }
                LabeledContent("Meals planned") {
                    Text("\(appState.planEntriesForDate(Date(), kidId: kid.id).count)")
                }
            }

            Section {
                // US-240: quiz entry point; writes pickinessLevel and
                // helpfulStrategies on the kid record.
                Button {
                    showingQuiz = true
                } label: {
                    Label(
                        hasTakenQuiz ? "Retake eating style quiz" : "Take eating style quiz",
                        systemImage: "questionmark.circle.fill"
                    )
                }
                Button {
                    showingEditor = true
                } label: {
                    Label("Edit full profile", systemImage: "pencil")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("About \(current.name)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit") { showingEditor = true }
            }
        }
        .sheet(isPresented: $showingEditor) {
            KidProfileEditorView(kid: current)
        }
        .sheet(isPresented: $showingQuiz) {
            // Always pull the latest kid record so the quiz applies its
            // result on top of in-flight edits, not the stale snapshot.
            PickyEaterQuizView(kid: current)
        }
    }

    @ViewBuilder
    private func listSection(_ title: String, items: [String]?) -> some View {
        if let items, !items.isEmpty {
            Section(title) {
                ForEach(items, id: \.self) { item in
                    Text(item)
                }
            }
        }
    }

    private var headerSubtitle: String {
        var parts: [String] = []
        if let age = current.age {
            parts.append(age == 1 ? "1 year old" : "\(age) years old")
        }
        if let level = current.pickinessLevel {
            switch level {
            case "not_picky": parts.append("Eats a wide range")
            case "somewhat_picky": parts.append("Selective eater")
            case "very_picky": parts.append("Needs extra support")
            default: break
            }
        }
        return parts.joined(separator: " - ")
    }

    private func severityText(for allergen: String) -> String {
        guard let level = AllergenMatcher.recordedSeverity(for: current, key: allergen) else {
            return "Severity not recorded"
        }
        return level.capitalized
    }

    /// US-410: safe foods scoped to this child. Uses AllergenMatcher so
    /// "Peanuts" vs "peanut" or "almonds" vs a tree-nut allergy are caught,
    /// which the old exact-string compare missed.
    private var safeFoodCount: Int {
        let child = current
        return appState.foods.filter { food in
            food.isSafe && AllergenMatcher.hit(for: child, food: food) == nil
        }.count
    }

    /// US-240: the quiz is what writes helpfulStrategies. pickinessLevel is
    /// not a signal; Add Child always sets one.
    private var hasTakenQuiz: Bool {
        if let strategies = current.helpfulStrategies, !strategies.isEmpty { return true }
        return false
    }
}

/// One-line allergy summary with severity, for rows and banners.
enum KidAllergySummary {
    static func line(for kid: Kid) -> String {
        let parts: [String] = (kid.allergens ?? []).map { (allergen: String) -> String in
            if let level = AllergenMatcher.recordedSeverity(for: kid, key: allergen) {
                return "\(allergen) (\(level))"
            }
            return allergen
        }
        var text = parts.joined(separator: ", ")
        if kid.crossContaminationSensitive == true {
            text += ", cross-contact"
        }
        return text
    }
}

#Preview {
    NavigationStack {
        KidsView()
    }
    .environmentObject(AppState())
}
