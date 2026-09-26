import SwiftUI

/// Comprehensive kid profile editor that exposes all Kid model fields.
struct KidProfileEditorView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    let kid: Kid

    // Basic Info
    @State private var name: String = ""
    // nil is "not set"; a default here used to save a made-up age.
    @State private var age: Int?
    @State private var gender: String = ""
    @State private var pickinessLevel: String = "not_picky"

    // Measurements
    @State private var heightCm: String = ""
    @State private var weightKg: String = ""

    // Allergens & Diet
    @State private var allergens: String = ""
    @State private var dietaryRestrictions: String = ""
    // Keyed by AllergenMatcher.canonical so "Peanuts" and "peanut" share one.
    @State private var severity: [String: String] = [:]
    @State private var crossContact = false

    // Food Preferences
    @State private var favoriteFoods: String = ""
    @State private var dislikedFoods: String = ""
    @State private var alwaysEatsFoods: String = ""

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
    // US-413: unsaved-changes guard. Snapshot taken once the kid is loaded;
    // the form is "dirty" when the current values diverge from it.
    @State private var loadedSnapshot: String?
    @State private var showDiscardConfirm = false

    // US-228's "Import from Health" was removed from this screen: Health on
    // the phone holds the phone owner's height, weight and birth date, so it
    // wrote the parent's numbers into the child's profile.

    // US-240: PickyEaterQuiz sheet
    @State private var showingQuiz = false

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
                    Stepper(value: Binding(
                        get: { age ?? 0 },
                        set: { age = $0 }
                    ), in: 0...18) {
                        HStack {
                            Text("Age")
                            Spacer()
                            Text(ageLabel)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if age != nil {
                        Button("Clear age") { age = nil }
                    }
                    Picker("Gender", selection: $gender) {
                        Text("Not Specified").tag("")
                        Text("Male").tag("male")
                        Text("Female").tag("female")
                        Text("Other").tag("other")
                    }
                    Picker("Eating style", selection: $pickinessLevel) {
                        Text("Eats a wide range").tag("not_picky")
                        Text("Selective eater").tag("somewhat_picky")
                        Text("Needs extra support").tag("very_picky")
                    }
                }

                // Measurements
                Section {
                    HStack {
                        Text("Height")
                        Spacer()
                        TextField("cm", text: $heightCm)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                        Text("cm")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Weight")
                        Spacer()
                        TextField("kg", text: $weightKg)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                        Text("kg")
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Measurements")
                } footer: {
                    Text("Enter your child's own measurements. Leave blank if you don't track them.")
                }

                // Allergens & Diet
                Section {
                    TextField("Allergens (comma separated)", text: $allergens)
                        .textInputAutocapitalization(.never)
                    // M22: severity per allergen, so a sitter can tell a
                    // mild intolerance from an EpiPen allergy.
                    ForEach(allergenList, id: \.self) { allergen in
                        Picker(allergen, selection: severityBinding(for: allergen)) {
                            Text("Not recorded").tag("")
                            Text("Mild").tag("mild")
                            Text("Moderate").tag("moderate")
                            Text("Severe").tag("severe")
                        }
                    }
                    if !allergenList.isEmpty {
                        Toggle("Reacts to cross-contact", isOn: $crossContact)
                    }
                    TextField("Dietary restrictions (comma separated)", text: $dietaryRestrictions)
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Allergens & Dietary Restrictions")
                } footer: {
                    if !allergenList.isEmpty {
                        Text("Cross-contact means even traces from shared pans, boards or fryers matter.")
                    }
                }

                // Food Preferences
                Section("Food Preferences") {
                    TextField("Favorite foods (comma separated)", text: $favoriteFoods)
                    TextField("Disliked foods (comma separated)", text: $dislikedFoods)
                    TextField("Always eats (comma separated)", text: $alwaysEatsFoods)
                }

                // Texture & Flavor
                Section("Texture & Flavor Preferences") {
                    TextField("Texture likes (comma separated)", text: $texturePreferences)
                    TextField("Texture dislikes (comma separated)", text: $textureDislikes)
                    TextField("Flavor preferences (comma separated)", text: $flavorPreferences)
                }

                // US-240: Eating personality / picky-eater quiz entry point.
                // Persists results to pickinessLevel + helpfulStrategies so the
                // rest of the form reflects the quiz outcome immediately.
                Section {
                    Button {
                        showingQuiz = true
                    } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                Circle()
                                    .fill(Color.pink.opacity(0.15))
                                    .frame(width: 40, height: 40)
                                Image(systemName: "questionmark.circle.fill")
                                    .foregroundStyle(.pink)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(hasTakenQuiz ? "Retake the eating style quiz" : "Discover \(kid.name)'s eating style")
                                    .font(.body)
                                    .foregroundStyle(.primary)
                                Text(hasTakenQuiz
                                     ? "Refresh recommended strategies"
                                     : "8 quick questions • saves eating style + tailored strategies")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .buttonStyle(.plain)
                } header: {
                    Text("Eating Personality")
                }

                // Behavioral Notes
                Section("Behavioral Notes") {
                    TextEditor(text: $behavioralNotes)
                        .frame(minHeight: 80)
                        .accessibilityLabel("Behavioral notes")
                        .overlay(alignment: .topLeading) {
                            if behavioralNotes.isEmpty {
                                Text("Mealtime behavior, sensory needs...")
                                    .foregroundStyle(.tertiary)
                                    .padding(.top, 8)
                                    .padding(.leading, 4)
                                    .allowsHitTesting(false)
                            }
                        }
                    TextEditor(text: $notes)
                        .frame(minHeight: 80)
                        .accessibilityLabel("General notes")
                        .overlay(alignment: .topLeading) {
                            if notes.isEmpty {
                                Text("General notes...")
                                    .foregroundStyle(.tertiary)
                                    .padding(.top, 8)
                                    .padding(.leading, 4)
                                    .allowsHitTesting(false)
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
                    Button("Cancel") {
                        // US-413: confirm before discarding unsaved edits.
                        if isDirty { showDiscardConfirm = true } else { dismiss() }
                    }
                }
            }
            // US-413: block accidental swipe-to-dismiss while there are edits.
            .interactiveDismissDisabled(isDirty)
            .confirmationDialog(
                "Discard changes?",
                isPresented: $showDiscardConfirm,
                titleVisibility: .visible
            ) {
                Button("Discard", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
            .onAppear { loadKid() }
            // The quiz writes pickinessLevel and helpfulStrategies straight to
            // the kid. Pull them into the form, or Save would write the old
            // (possibly empty, so now cleared) values back over the result.
            .sheet(isPresented: $showingQuiz, onDismiss: syncQuizResult) {
                // Pull the freshest copy of the kid from AppState so the result
                // reflects any in-flight edits and the post-save toast updates
                // the same record the form is bound to.
                PickyEaterQuizView(
                    kid: appState.kids.first { $0.id == kid.id } ?? kid
                )
            }
        }
    }

    /// True once the quiz has saved strategies. pickinessLevel is not a
    /// signal: Add Child always sets one, so every kid read as "taken".
    private var hasTakenQuiz: Bool {
        if let strategies = kid.helpfulStrategies, !strategies.isEmpty { return true }
        return false
    }

    private func syncQuizResult() {
        guard let latest = appState.kids.first(where: { $0.id == kid.id }) else { return }
        if let level = latest.pickinessLevel { pickinessLevel = level }
        if let strategies = latest.helpfulStrategies, !strategies.isEmpty {
            helpfulStrategies = strategies.joined(separator: ", ")
        }
    }

    private var ageLabel: String {
        guard let age else { return "Not set" }
        return age == 1 ? "1 year" : "\(age) years"
    }

    /// The allergens typed so far, de-duplicated so ForEach ids stay unique.
    private var allergenList: [String] {
        var seen: Set<String> = []
        var out: [String] = []
        for item in parseList(allergens) ?? [] {
            let key = AllergenMatcher.canonical(item)
            if key.isEmpty || seen.contains(key) { continue }
            seen.insert(key)
            out.append(item)
        }
        return out
    }

    private func severityBinding(for allergen: String) -> Binding<String> {
        let key = AllergenMatcher.canonical(allergen)
        return Binding(
            get: { severity[key] ?? "" },
            set: { newValue in severity[key] = newValue.isEmpty ? nil : newValue }
        )
    }

    // MARK: - Load

    private func loadKid() {
        name = kid.name
        age = kid.age
        gender = kid.gender ?? ""
        pickinessLevel = kid.pickinessLevel ?? "not_picky"
        heightCm = kid.heightCm.map { String(format: "%.1f", $0) } ?? ""
        weightKg = kid.weightKg.map { String(format: "%.1f", $0) } ?? ""
        allergens = (kid.allergens ?? []).joined(separator: ", ")
        dietaryRestrictions = (kid.dietaryRestrictions ?? []).joined(separator: ", ")
        var loadedSeverity: [String: String] = [:]
        for allergen in kid.allergens ?? [] {
            if let level = AllergenMatcher.recordedSeverity(for: kid, key: allergen) {
                loadedSeverity[AllergenMatcher.canonical(allergen)] = level
            }
        }
        severity = loadedSeverity
        crossContact = kid.crossContaminationSensitive ?? false
        favoriteFoods = (kid.favoriteFoods ?? []).joined(separator: ", ")
        dislikedFoods = (kid.dislikedFoods ?? []).joined(separator: ", ")
        alwaysEatsFoods = (kid.alwaysEatsFoods ?? []).joined(separator: ", ")
        texturePreferences = (kid.texturePreferences ?? []).joined(separator: ", ")
        textureDislikes = (kid.textureDislikes ?? []).joined(separator: ", ")
        flavorPreferences = (kid.flavorPreferences ?? []).joined(separator: ", ")
        behavioralNotes = kid.behavioralNotes ?? ""
        notes = kid.notes ?? ""
        healthGoals = (kid.healthGoals ?? []).joined(separator: ", ")
        nutritionConcerns = (kid.nutritionConcerns ?? []).joined(separator: ", ")
        helpfulStrategies = (kid.helpfulStrategies ?? []).joined(separator: ", ")
        // US-413: capture the baseline for the unsaved-changes guard.
        loadedSnapshot = currentSnapshot
    }

    /// US-413: serialized form state for dirty-tracking (separator avoids
    /// false matches across field boundaries).
    private var currentSnapshot: String {
        let ageText: String = age.map { String($0) } ?? ""
        let crossText: String = crossContact ? "1" : "0"
        let photoText: String = profileImage == nil ? "0" : "1"
        let parts: [String] = [
            name, ageText, gender, pickinessLevel, heightCm, weightKg,
            allergens, severitySnapshot, crossText,
            dietaryRestrictions, favoriteFoods, dislikedFoods, alwaysEatsFoods,
            texturePreferences, textureDislikes, flavorPreferences,
            behavioralNotes, notes, healthGoals, nutritionConcerns,
            helpfulStrategies, photoText,
        ]
        return parts.joined(separator: "\u{1}")
    }

    private var severitySnapshot: String {
        let pairs: [String] = severity.keys.sorted().map { (key: String) -> String in
            let level: String = severity[key] ?? ""
            return key + "=" + level
        }
        return pairs.joined(separator: ",")
    }

    private var isDirty: Bool {
        guard let loadedSnapshot else { return false }
        return loadedSnapshot != currentSnapshot
    }

    // MARK: - Save

    private func save() async {
        // Reject a typo before anything is written, rather than saving a
        // 1500 cm child or silently dropping "12,5".
        let height = Self.parseMeasurement(heightCm)
        let weight = Self.parseMeasurement(weightKg)
        if !heightCm.trimmingCharacters(in: .whitespaces).isEmpty
            && (height == nil || !Self.plausibleHeightCm.contains(height ?? 0)) {
            ToastManager.shared.warning("Check the height", message: "Enter it in centimeters, for example 110.")
            return
        }
        if !weightKg.trimmingCharacters(in: .whitespaces).isEmpty
            && (weight == nil || !Self.plausibleWeightKg.contains(weight ?? 0)) {
            ToastManager.shared.warning("Check the weight", message: "Enter it in kilograms, for example 18.5.")
            return
        }

        isSubmitting = true
        // US-413: always reset the submitting flag on every exit path.
        defer { isSubmitting = false }

        // Upload photo if changed
        let previousPhotoURL = kid.profilePictureUrl
        var photoURL = kid.profilePictureUrl
        if let image = profileImage {
            // US-413: warn on upload failure instead of silently keeping the
            // stale photo, so the user knows their new avatar wasn't saved.
            do {
                photoURL = try await ImageUploadService.upload(
                    image: image,
                    folder: .kids,
                    id: kid.id
                )
            } catch {
                ToastManager.shared.warning(
                    "Couldn't upload photo",
                    message: "Saved your other changes with the previous photo."
                )
            }
        }

        let allergenValues = parseList(allergens)
        var severityMap: [String: String] = [:]
        for allergen in allergenList {
            if let level = severity[AllergenMatcher.canonical(allergen)] {
                severityMap[allergen] = level
            }
        }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBehavioral = behavioralNotes.trimmingCharacters(in: .whitespacesAndNewlines)

        var updates = KidUpdate(
            name: name,
            age: age,
            gender: gender.isEmpty ? nil : gender,
            allergens: allergenValues,
            allergenSeverity: severityMap.isEmpty ? nil : severityMap,
            crossContaminationSensitive: allergenValues == nil ? false : crossContact,
            dietaryRestrictions: parseList(dietaryRestrictions),
            pickinessLevel: pickinessLevel,
            notes: trimmedNotes.isEmpty ? nil : notes,
            heightCm: height,
            weightKg: weight,
            profilePictureUrl: photoURL,
            texturePreferences: parseList(texturePreferences),
            textureDislikes: parseList(textureDislikes),
            flavorPreferences: parseList(flavorPreferences),
            favoriteFoods: parseList(favoriteFoods),
            dislikedFoods: parseList(dislikedFoods),
            alwaysEatsFoods: parseList(alwaysEatsFoods),
            behavioralNotes: trimmedBehavioral.isEmpty ? nil : behavioralNotes,
            healthGoals: parseList(healthGoals),
            nutritionConcerns: parseList(nutritionConcerns),
            helpfulStrategies: parseList(helpfulStrategies)
        )
        // A field left empty here means "remove it", so send an explicit
        // null; a nil on its own would leave the old value in place.
        updates.clear(.age, when: updates.age == nil)
        updates.clear(.gender, when: updates.gender == nil)
        updates.clear(.allergens, when: updates.allergens == nil)
        updates.clear(.allergenSeverity, when: updates.allergenSeverity == nil)
        updates.clear(.dietaryRestrictions, when: updates.dietaryRestrictions == nil)
        updates.clear(.notes, when: updates.notes == nil)
        updates.clear(.heightCm, when: updates.heightCm == nil)
        updates.clear(.weightKg, when: updates.weightKg == nil)
        updates.clear(.texturePreferences, when: updates.texturePreferences == nil)
        updates.clear(.textureDislikes, when: updates.textureDislikes == nil)
        updates.clear(.flavorPreferences, when: updates.flavorPreferences == nil)
        updates.clear(.favoriteFoods, when: updates.favoriteFoods == nil)
        updates.clear(.dislikedFoods, when: updates.dislikedFoods == nil)
        updates.clear(.alwaysEatsFoods, when: updates.alwaysEatsFoods == nil)
        updates.clear(.behavioralNotes, when: updates.behavioralNotes == nil)
        updates.clear(.healthGoals, when: updates.healthGoals == nil)
        updates.clear(.nutritionConcerns, when: updates.nutritionConcerns == nil)
        updates.clear(.helpfulStrategies, when: updates.helpfulStrategies == nil)

        // US-413: only dismiss on confirmed success; on failure surface a toast
        // and keep the sheet open so the user doesn't lose their profile edits.
        do {
            try await appState.updateKid(kid.id, updates: updates)
            // US-635 follow-up: the row now points at the new image, so the
            // old object can go. The bucket is public-read by URL, and
            // nothing else was ever going to remove a replaced child photo.
            if let previousPhotoURL, previousPhotoURL != photoURL {
                await ImageUploadService.deletePublicURL(previousPhotoURL)
            }
            HapticManager.success()
            dismiss()
        } catch {
            HapticManager.error()
            ToastManager.shared.error(
                "Couldn't save profile",
                message: "Please try again."
            )
        }
    }

    private func parseList(_ text: String) -> [String]? {
        let items = text.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return items.isEmpty ? nil : items
    }

    static let plausibleHeightCm: ClosedRange<Double> = 30...220
    static let plausibleWeightKg: ClosedRange<Double> = 1...200

    /// Accepts "12,5" as well as "12.5"; the decimal pad types a comma in
    /// many locales and Double("12,5") is nil.
    static func parseMeasurement(_ text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        return Double(trimmed.replacingOccurrences(of: ",", with: "."))
    }
}

#Preview {
    KidProfileEditorView(kid: Kid(
        id: "1", userId: "u1", name: "Sam", age: 5
    ))
    .environmentObject(AppState())
}
