import SwiftUI
import PhotosUI

/// US-238: "Plan from fridge" entry flow.
///
/// 1. Pick a photo (camera or library)
/// 2. Show a spinner while the recognition edge function processes it
/// 3. Display detected items with checkboxes — user trims false positives
///    or types missing items, then confirms
/// 4. `onConfirm(names)` fires with the final list; the parent view
///    re-runs the AI planner with `availableIngredients`
struct FridgePhotoSheet: View {
    @Environment(\.dismiss) var dismiss

    var onConfirm: (_ ingredients: [String]) -> Void

    @State private var selectedItem: PhotosPickerItem?
    @State private var pickedImage: UIImage?
    @State private var isRecognizing = false
    @State private var recognitionError: String?
    @State private var detected: [FridgeRecognitionService.DetectedItem] = []
    @State private var keptIds: Set<String> = []
    @State private var manualName: String = ""
    @State private var manualItems: [String] = []

    /// Currently-checked ingredient names (detected + manual) that will be
    /// passed back via `onConfirm`. De-duped, lowercased for the LLM.
    private var confirmedNames: [String] {
        let detectedKept = detected.filter { keptIds.contains($0.id) }.map(\.name)
        let combined = detectedKept + manualItems
        var seen = Set<String>()
        return combined.compactMap { name -> String? in
            let key = name.lowercased()
            if seen.contains(key) { return nil }
            seen.insert(key)
            return name
        }
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Plan from fridge")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    if !detected.isEmpty || !manualItems.isEmpty {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Use \(confirmedNames.count)") {
                                onConfirm(confirmedNames)
                                dismiss()
                            }
                            .disabled(confirmedNames.isEmpty)
                        }
                    }
                }
        }
        .onChange(of: selectedItem) { _, item in
            guard let item else { return }
            Task { await handlePicked(item) }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isRecognizing {
            recognizingState
        } else if !detected.isEmpty || !manualItems.isEmpty {
            confirmList
        } else {
            picker
        }
    }

    // MARK: - States

    private var picker: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "refrigerator.fill")
                .font(.system(size: 64))
                .foregroundStyle(.blue)

            VStack(spacing: 6) {
                Text("Snap your fridge")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("EatPal will spot the ingredients and plan meals around them.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            PhotosPicker(
                selection: $selectedItem,
                matching: .images
            ) {
                Label("Choose Photo", systemImage: "photo.on.rectangle.angled")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            .padding(.horizontal, 24)

            if let recognitionError {
                Text(recognitionError)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            Spacer().frame(height: 16)
        }
    }

    private var recognizingState: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView()
                .scaleEffect(1.4)
            Text("Reading your fridge…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
    }

    private var confirmList: some View {
        Form {
            // Mini preview of the photo so the user remembers what they
            // picked when scanning the list.
            if let pickedImage {
                Section {
                    Image(uiImage: pickedImage)
                        .resizable()
                        .scaledToFill()
                        .frame(height: 140)
                        .clipped()
                        .cornerRadius(10)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }
            }

            if !detected.isEmpty {
                Section {
                    ForEach(detected) { item in
                        DetectedRow(
                            item: item,
                            isKept: keptIds.contains(item.id),
                            onToggle: { toggleKeep(item.id) }
                        )
                    }
                } header: {
                    HStack {
                        Text("Detected")
                        Spacer()
                        Text("\(keptIds.count) of \(detected.count) selected")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Tap to deselect items the model got wrong.")
                        .font(.caption2)
                }
            }

            Section {
                HStack {
                    TextField("Add missing item…", text: $manualName)
                        .textInputAutocapitalization(.never)
                        .onSubmit { addManual() }
                    Button("Add") { addManual() }
                        .disabled(manualName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                ForEach(manualItems, id: \.self) { name in
                    HStack {
                        Image(systemName: "plus.circle.fill")
                            .foregroundStyle(.green)
                        Text(name)
                        Spacer()
                        Button {
                            manualItems.removeAll { $0 == name }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove \(name)")
                    }
                }
            } header: {
                Text("Anything we missed?")
            }
        }
    }

    // MARK: - Actions

    private func handlePicked(_ item: PhotosPickerItem) async {
        recognitionError = nil
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                recognitionError = "Couldn't read that photo. Try another."
                return
            }
            await MainActor.run {
                pickedImage = image
                isRecognizing = true
            }
            let items = try await FridgeRecognitionService.recognize(image)
            await MainActor.run {
                detected = items
                // Pre-check anything the model was at least 60% confident about.
                keptIds = Set(items.filter { $0.confidence >= 0.6 }.map(\.id))
                isRecognizing = false

                AnalyticsService.track(.aiPlanGenerated(promptType: "fridge_photo_recognized"))
            }
        } catch {
            await MainActor.run {
                isRecognizing = false
                recognitionError = (error as? LocalizedError)?.errorDescription
                    ?? error.localizedDescription
            }
        }
    }

    private func toggleKeep(_ id: String) {
        if keptIds.contains(id) {
            keptIds.remove(id)
        } else {
            keptIds.insert(id)
        }
    }

    private func addManual() {
        let trimmed = manualName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if !manualItems.contains(where: { $0.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            manualItems.append(trimmed)
        }
        manualName = ""
    }
}

private struct DetectedRow: View {
    let item: FridgeRecognitionService.DetectedItem
    let isKept: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                Image(systemName: isKept ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isKept ? .green : .secondary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name.capitalized)
                        .font(.body)
                        .foregroundStyle(.primary)
                    HStack(spacing: 6) {
                        if let cat = item.category {
                            Text(FoodCategory(rawValue: cat)?.icon ?? "🍽")
                                .font(.caption2)
                            Text(cat.capitalized)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        // Inline confidence badge — keeps the user honest about
                        // low-confidence matches (e.g., the bag of leaves that
                        // might be spinach OR arugula).
                        Text("\(Int(item.confidence * 100))%")
                            .font(.caption2)
                            .foregroundStyle(item.confidence >= 0.6 ? .secondary : .orange)
                    }
                }

                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(item.name), \(isKept ? "selected" : "not selected")")
    }
}

// MARK: - Chip strip + missing card

/// US-238: horizontal chips showing the user's confirmed fridge ingredients.
/// Used on AIMealPlanView so the user can still tweak the list after the
/// confirmation sheet has dismissed.
struct FridgeIngredientsChips: View {
    let names: [String]
    let onRemove: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "refrigerator.fill")
                    .foregroundStyle(.blue)
                Text("From your fridge (\(names.count))")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(names, id: \.self) { name in
                        HStack(spacing: 4) {
                            Text(name)
                                .font(.caption)
                            Button {
                                onRemove(name)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove \(name) from fridge list")
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.blue.opacity(0.12), in: Capsule())
                    }
                }
            }
        }
    }
}

/// US-238: "You'll also need" — items the plan called for that the
/// fridge didn't have. One tap adds them all to the grocery list.
struct MissingFromFridgeCard: View {
    let missing: [AIMealService.MealSuggestion]
    let onAddToGrocery: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("You'll also need", systemImage: "cart.badge.plus")
                    .font(.headline)
                Spacer()
                Text("\(missing.count) item\(missing.count == 1 ? "" : "s")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ForEach(missing) { suggestion in
                HStack {
                    Image(systemName: "circle")
                        .foregroundStyle(.tertiary)
                    Text(suggestion.foodName)
                        .font(.subheadline)
                    Spacer()
                }
            }

            Button {
                onAddToGrocery()
            } label: {
                Label("Add all to grocery list", systemImage: "plus.circle.fill")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
        }
        .padding()
        .background(Color.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.blue.opacity(0.2), lineWidth: 1)
        )
    }
}

#Preview {
    FridgePhotoSheet { names in
        print("confirmed: \(names)")
    }
}
