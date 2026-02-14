import SwiftUI

struct KidsView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingAddKid = false
    @State private var selectedKid: Kid?

    var body: some View {
        List {
            if appState.kids.isEmpty {
                Section {
                    ContentUnavailableView(
                        "No Children",
                        systemImage: "person.crop.circle.badge.plus",
                        description: Text("Add your children to start planning their meals.")
                    )
                }
            } else {
                ForEach(appState.kids) { kid in
                    KidRowView(kid: kid)
                        .contentShape(Rectangle())
                        .onTapGesture { selectedKid = kid }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                Task { try? await appState.deleteKid(kid.id) }
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
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundStyle(.red)
                        Text(allergens.joined(separator: ", "))
                            .font(.caption2)
                            .foregroundStyle(.red)
                            .lineLimit(1)
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
        case "not_picky": return "Not Picky"
        case "somewhat_picky": return "Somewhat Picky"
        case "very_picky": return "Very Picky"
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
        ("not_picky", "Not Picky"),
        ("somewhat_picky", "Somewhat Picky"),
        ("very_picky", "Very Picky"),
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
                    Picker("Pickiness Level", selection: $pickinessLevel) {
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
        let allergenList = allergens.isEmpty ? nil :
            allergens.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        let kid = Kid(
            id: UUID().uuidString,
            userId: "",
            name: name,
            age: age,
            gender: gender.isEmpty ? nil : gender,
            allergens: allergenList,
            pickinessLevel: pickinessLevel,
            notes: notes.isEmpty ? nil : notes
        )

        try? await appState.addKid(kid)
        dismiss()
    }
}

// MARK: - Kid Detail View

struct KidDetailView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let kid: Kid

    @State private var name: String = ""
    @State private var age: Int = 0
    @State private var pickinessLevel: String = "not_picky"
    @State private var notes: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Basic Info") {
                    TextField("Name", text: $name)

                    Stepper(value: $age, in: 0...18) {
                        HStack {
                            Text("Age")
                            Spacer()
                            Text("\(age) years")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Eating Profile") {
                    Picker("Pickiness Level", selection: $pickinessLevel) {
                        Text("Not Picky").tag("not_picky")
                        Text("Somewhat Picky").tag("somewhat_picky")
                        Text("Very Picky").tag("very_picky")
                    }
                }

                if let allergens = kid.allergens, !allergens.isEmpty {
                    Section("Allergens") {
                        ForEach(allergens, id: \.self) { allergen in
                            Label(allergen, systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                        }
                    }
                }

                // Stats
                Section("Stats") {
                    let safeFoodCount = appState.foods.filter(\.isSafe).count
                    let todayEntries = appState.planEntriesForDate(Date(), kidId: kid.id)

                    LabeledContent("Safe Foods") {
                        Text("\(safeFoodCount)")
                    }
                    LabeledContent("Today's Meals") {
                        Text("\(todayEntries.count)")
                    }
                }

                Section("Notes") {
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(4)
                }

                Section {
                    Button("Save Changes") {
                        Task {
                            try? await appState.updateKid(
                                kid.id,
                                updates: KidUpdate(
                                    name: name,
                                    age: age,
                                    pickinessLevel: pickinessLevel,
                                    notes: notes.isEmpty ? nil : notes
                                )
                            )
                            dismiss()
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle(kid.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                name = kid.name
                age = kid.age ?? 0
                pickinessLevel = kid.pickinessLevel ?? "not_picky"
                notes = kid.notes ?? ""
            }
        }
    }
}

#Preview {
    NavigationStack {
        KidsView()
    }
    .environmentObject(AppState())
}
