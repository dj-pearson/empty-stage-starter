import SwiftUI

/// Comprehensive kid profile editor that exposes all Kid model fields.
struct KidProfileEditorView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    let kid: Kid

    // Basic Info
    @State private var name: String = ""
    @State private var age: Int = 5
    @State private var gender: String = ""
    @State private var pickinessLevel: String = "not_picky"

    // Measurements
    @State private var heightCm: String = ""
    @State private var weightKg: String = ""

    // Allergens & Diet
    @State private var allergens: String = ""
    @State private var dietaryRestrictions: String = ""

    // Food Preferences
    @State private var favoriteFoods: String = ""
    @State private var dislikedFoods: String = ""

    // Texture & Flavor
    @State private var texturePreferences: String = ""
    @State private var textureDislikes: String = ""
    @State private var flavorPreferences: String = ""

    // Behavioral
    @State private var behavioralNotes: String = ""
    @State private var notes: String = ""

    // Health
    @State private var healthGoals: String = ""
    @State private var nutritionConcerns: String = ""
    @State private var helpfulStrategies: String = ""

    // Photo
    @State private var profileImage: UIImage?
    @State private var isSubmitting = false

    // US-228: HealthKit import state
    @State private var isImportingFromHealth = false
    @State private var healthImportError: String?
    @State private var healthSyncedAt: Date?
    @State private var healthSourcedFields: Set<HealthSourcedField> = []

    enum HealthSourcedField: String { case age, height, weight }

    var body: some View {
        NavigationStack {
            Form {
                // Profile Photo
                Section {
                    HStack {
                        Spacer()
                        AvatarImagePicker(
                            selectedImage: $profileImage,
                            currentURL: kid.profilePictureUrl,
                            initials: String(kid.name.prefix(1)).uppercased(),
                            size: 100
                        )
                        Spacer()
                    }
                }
                .listRowBackground(Color.clear)

                // Basic Info
                Section("Basic Information") {
                    TextField("Name", text: $name)
                    HStack {
                        Stepper("Age: \(age)", value: $age, in: 0...18)
                            .onChange(of: age) { _, _ in
                                healthSourcedFields.remove(.age)
                            }
                        if healthSourcedFields.contains(.age) {
                            HealthSourcePill()
                        }
                    }
                    Picker("Gender", selection: $gender) {
                        Text("Not Specified").tag("")
                        Text("Male").tag("male")
                        Text("Female").tag("female")
                        Text("Other").tag("other")
                    }
                    Picker("Pickiness Level", selection: $pickinessLevel) {
                        Text("Not Picky").tag("not_picky")
                        Text("Somewhat Picky").tag("somewhat_picky")
                        Text("Very Picky").tag("very_picky")
                    }
                }

                // Measurements
                Section {
                    HStack {
                        Text("Height")
                        if healthSourcedFields.contains(.height) {
                            HealthSourcePill()
                        }
                        Spacer()
                        TextField("cm", text: $heightCm)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                            .onChange(of: heightCm) { _, _ in
                                healthSourcedFields.remove(.height)
                            }
                        Text("cm")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Weight")
                        if healthSourcedFields.contains(.weight) {
                            HealthSourcePill()
                        }
                        Spacer()
                        TextField("kg", text: $weightKg)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                            .onChange(of: weightKg) { _, _ in
                                healthSourcedFields.remove(.weight)
                            }
                        Text("kg")
                            .foregroundStyle(.secondary)
                    }

                    if HealthKitService.shared.isAvailable {
                        Button {
                            Task { await importFromHealth() }
                        } label: {
                            HStack(spacing: 8) {
                                if isImportingFromHealth {
                                    ProgressView().controlSize(.small)
                                }
                                Image(systemName: "heart.text.square.fill")
                                    .foregroundStyle(.pink)
                                Text(isImportingFromHealth ? "Importing…" : "Import from Health")
                                Spacer()
                            }
                        }
                        .disabled(isImportingFromHealth)
                    }

                    if let healthImportError {
                        Text(healthImportError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    } else if let healthSyncedAt {
                        Text("Last synced from Health \(healthSyncedAt, style: .relative)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Measurements")
                }

                // Allergens & Diet
                Section("Allergens & Dietary Restrictions") {
                    TextField("Allergens (comma separated)", text: $allergens)
                        .textInputAutocapitalization(.never)
                    TextField("Dietary restrictions (comma separated)", text: $dietaryRestrictions)
                        .textInputAutocapitalization(.never)
                }

                // Food Preferences
                Section("Food Preferences") {
                    TextField("Favorite foods (comma separated)", text: $favoriteFoods)
                    TextField("Disliked foods (comma separated)", text: $dislikedFoods)
                }

                // Texture & Flavor
                Section("Texture & Flavor Preferences") {
                    TextField("Texture likes (comma separated)", text: $texturePreferences)
                    TextField("Texture dislikes (comma separated)", text: $textureDislikes)
                    TextField("Flavor preferences (comma separated)", text: $flavorPreferences)
                }

                // Behavioral Notes
                Section("Behavioral Notes") {
                    TextEditor(text: $behavioralNotes)
                        .frame(minHeight: 80)
                    TextEditor(text: $notes)
                        .frame(minHeight: 80)
                        .overlay(alignment: .topLeading) {
                            if notes.isEmpty {
                                Text("General notes...")
                                    .foregroundStyle(.tertiary)
                                    .padding(.top, 8)
                                    .padding(.leading, 4)
                            }
                        }
                }

                // Health & Nutrition
                Section("Health & Nutrition") {
                    TextField("Health goals (comma separated)", text: $healthGoals)
                    TextField("Nutrition concerns (comma separated)", text: $nutritionConcerns)
                    TextField("Helpful strategies (comma separated)", text: $helpfulStrategies)
                }

                // Save Button
                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            Spacer()
                            if isSubmitting {
                                ProgressView()
                                    .tint(.white)
                            }
                            Text("Save Profile")
                                .fontWeight(.semibold)
                            Spacer()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(name.isEmpty || isSubmitting)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear { loadKid() }
        }
    }

    // MARK: - Load

    private func loadKid() {
        name = kid.name
        age = kid.age ?? 5
        gender = kid.gender ?? ""
        pickinessLevel = kid.pickinessLevel ?? "not_picky"
        heightCm = kid.heightCm.map { String(format: "%.1f", $0) } ?? ""
        weightKg = kid.weightKg.map { String(format: "%.1f", $0) } ?? ""
        allergens = (kid.allergens ?? []).joined(separator: ", ")
        dietaryRestrictions = (kid.dietaryRestrictions ?? []).joined(separator: ", ")
        favoriteFoods = (kid.favoriteFoods ?? []).joined(separator: ", ")
        dislikedFoods = (kid.dislikedFoods ?? []).joined(separator: ", ")
        texturePreferences = (kid.texturePreferences ?? []).joined(separator: ", ")
        textureDislikes = (kid.textureDislikes ?? []).joined(separator: ", ")
        flavorPreferences = (kid.flavorPreferences ?? []).joined(separator: ", ")
        behavioralNotes = kid.behavioralNotes ?? ""
        notes = kid.notes ?? ""
        healthGoals = (kid.healthGoals ?? []).joined(separator: ", ")
        nutritionConcerns = (kid.nutritionConcerns ?? []).joined(separator: ", ")
        helpfulStrategies = (kid.helpfulStrategies ?? []).joined(separator: ", ")
    }

    // MARK: - Save

    private func save() async {
        isSubmitting = true

        // Upload photo if changed
        var photoURL = kid.profilePictureUrl
        if let image = profileImage {
            if let url = try? await ImageUploadService.upload(
                image: image,
                folder: .kids,
                id: kid.id
            ) {
                photoURL = url
            }
        }

        let updates = KidUpdate(
            name: name,
            age: age,
            gender: gender.isEmpty ? nil : gender,
            allergens: parseList(allergens),
            dietaryRestrictions: parseList(dietaryRestrictions),
            pickinessLevel: pickinessLevel,
            notes: notes.isEmpty ? nil : notes,
            heightCm: Double(heightCm),
            weightKg: Double(weightKg),
            profilePictureUrl: photoURL,
            texturePreferences: parseList(texturePreferences),
            textureDislikes: parseList(textureDislikes),
            flavorPreferences: parseList(flavorPreferences),
            favoriteFoods: parseList(favoriteFoods),
            dislikedFoods: parseList(dislikedFoods),
            behavioralNotes: behavioralNotes.isEmpty ? nil : behavioralNotes,
            healthGoals: parseList(healthGoals),
            nutritionConcerns: parseList(nutritionConcerns),
            helpfulStrategies: parseList(helpfulStrategies)
        )

        try? await appState.updateKid(kid.id, updates: updates)
        isSubmitting = false
        dismiss()
    }

    private func parseList(_ text: String) -> [String]? {
        let items = text.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return items.isEmpty ? nil : items
    }

    // MARK: - HealthKit import (US-228)

    private func importFromHealth() async {
        let service = HealthKitService.shared
        isImportingFromHealth = true
        healthImportError = nil
        defer { isImportingFromHealth = false }

        do {
            _ = try await service.requestReadAuthorization()
        } catch {
            healthImportError = "Couldn't ask Health for permission: \(error.localizedDescription)"
            HapticManager.error()
            return
        }

        let snapshot = await service.readKidGrowthSnapshot()

        var anyImported = false

        if let derivedAge = snapshot.derivedAge, derivedAge >= 0, derivedAge <= 18 {
            age = derivedAge
            healthSourcedFields.insert(.age)
            anyImported = true
        }
        if let h = snapshot.heightCm, h > 0 {
            heightCm = String(format: "%.1f", h)
            healthSourcedFields.insert(.height)
            anyImported = true
        }
        if let w = snapshot.weightKg, w > 0 {
            weightKg = String(format: "%.1f", w)
            healthSourcedFields.insert(.weight)
            anyImported = true
        }

        if anyImported {
            healthSyncedAt = snapshot.lastSyncedAt
            HapticManager.success()
            ToastManager.shared.success(
                "Imported from Health",
                message: "\(healthSourcedFields.count) field\(healthSourcedFields.count == 1 ? "" : "s") updated"
            )
        } else {
            healthImportError = "No height, weight, or date of birth found in Health (or permission denied)."
            HapticManager.warning()
        }
    }
}

// MARK: - Health source pill (US-228)

private struct HealthSourcePill: View {
    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: "heart.fill")
                .font(.caption2)
            Text("Health")
                .font(.caption2)
                .fontWeight(.medium)
        }
        .foregroundStyle(.pink)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color.pink.opacity(0.12), in: Capsule())
        .accessibilityLabel("Imported from Health")
    }
}

#Preview {
    KidProfileEditorView(kid: Kid(
        id: "1", userId: "u1", name: "Sam", age: 5
    ))
    .environmentObject(AppState())
}
