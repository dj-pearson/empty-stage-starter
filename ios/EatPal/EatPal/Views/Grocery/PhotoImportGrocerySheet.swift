import PhotosUI
import SwiftUI
import UIKit

/// US-141: Photo / screenshot → grocery list.
///
/// User picks one or more images, Vision OCR extracts text, `GroceryTextParser`
/// produces `ParsedGroceryItem` previews, and the user toggles which ones to
/// save. Items flow through `AppState.addGroceryItem` with `addedVia: "photo"`.
struct PhotoImportGrocerySheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var selectedPickerItems: [PhotosPickerItem] = []
    @State private var loadedImages: [UIImage] = []
    @State private var recognized: [ImageTextRecognizer.RecognitionResult] = []
    @State private var parsedItems: [ParsedGroceryItem] = []
    @State private var excludedIds: Set<UUID> = []
    @State private var averageConfidence: Float = 0
    @State private var isRecognizing = false
    @State private var isSaving = false
    @State private var lastError: String?

    private var selectedItems: [ParsedGroceryItem] {
        parsedItems.filter { !excludedIds.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                pickerArea
                    .padding(.top)

                if !parsedItems.isEmpty {
                    Divider()
                    previewList
                }

                if parsedItems.isEmpty && !isRecognizing {
                    placeholder
                }

                Spacer(minLength: 0)

                footer
                    .padding()
                    .background(.ultraThinMaterial)
            }
            .navigationTitle("Import from Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .onChange(of: selectedPickerItems) { _, newItems in
                Task { await loadAndRecognize(newItems) }
            }
            .overlay {
                if isRecognizing {
                    ProgressView("Reading text…")
                        .padding(20)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    // MARK: - Sections

    private var pickerArea: some View {
        VStack(spacing: 12) {
            PhotosPicker(
                selection: $selectedPickerItems,
                maxSelectionCount: 5,
                matching: .images,
                photoLibrary: .shared()
            ) {
                HStack(spacing: 8) {
                    Image(systemName: "photo.on.rectangle.angled")
                    Text(selectedPickerItems.isEmpty
                         ? "Choose Photos"
                         : "Change Photos (\(selectedPickerItems.count))")
                        .fontWeight(.medium)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(.tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
            }
            .padding(.horizontal)

            if !loadedImages.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(loadedImages.enumerated()), id: \.offset) { _, image in
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 72, height: 72)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .strokeBorder(Color.secondary.opacity(0.3), lineWidth: 0.5)
                                )
                        }
                    }
                    .padding(.horizontal)
                }
            }

            if let error = lastError {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .font(.footnote)
                    .padding(.horizontal)
            }

            if averageConfidence > 0 && averageConfidence < ImageTextRecognizer.trustworthyConfidence {
                Label("Low-confidence scan — please review items.", systemImage: "eye.trianglebadge.exclamationmark")
                    .foregroundStyle(.orange)
                    .font(.footnote)
                    .padding(.horizontal)
            }
        }
    }

    private var previewList: some View {
        List {
            Section {
                ForEach(parsedItems) { item in
                    HStack {
                        Image(systemName: excludedIds.contains(item.id)
                              ? "circle"
                              : "checkmark.circle.fill")
                            .foregroundStyle(excludedIds.contains(item.id) ? Color.secondary : Color.green)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .font(.body)
                                .fontWeight(.medium)
                            HStack(spacing: 6) {
                                let cat = FoodCategory(rawValue: item.category)
                                Text("\(cat?.icon ?? "") \(cat?.displayName ?? item.category)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text("•")
                                    .foregroundStyle(.tertiary)
                                Text(item.unit.isEmpty
                                     ? formatted(item.quantity)
                                     : "\(formatted(item.quantity)) \(item.unit)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Spacer()

                        if item.confidence < 0.75 {
                            Image(systemName: "questionmark.circle")
                                .foregroundStyle(.orange)
                                .accessibilityLabel("Low confidence — review before saving")
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { toggle(item) }
                }
            } header: {
                Text("\(selectedItems.count) of \(parsedItems.count) selected")
            }
        }
        .listStyle(.insetGrouped)
        .frame(maxHeight: 360)
    }

    private var placeholder: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "doc.text.viewfinder")
                .font(.system(size: 56))
                .foregroundStyle(.secondary)
            Text("Pick a screenshot or photo of a list")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("EatPal will read the text and suggest items you can review before saving.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.tertiary)
                .padding(.horizontal, 40)
            Spacer()
        }
    }

    private var footer: some View {
        Button {
            Task { await saveSelected() }
        } label: {
            Text(isSaving ? "Saving…" : "Add \(selectedItems.count) item\(selectedItems.count == 1 ? "" : "s")")
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isSaving || selectedItems.isEmpty || isRecognizing)
    }

    // MARK: - Pipeline

    private func loadAndRecognize(_ pickerItems: [PhotosPickerItem]) async {
        guard !pickerItems.isEmpty else {
            loadedImages = []
            recognized = []
            parsedItems = []
            excludedIds = []
            averageConfidence = 0
            lastError = nil
            return
        }

        lastError = nil
        isRecognizing = true
        defer { isRecognizing = false }

        var images: [UIImage] = []
        for pickerItem in pickerItems {
            if let data = try? await pickerItem.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                images.append(image)
            }
        }

        guard !images.isEmpty else {
            lastError = "Couldn't load those photos."
            return
        }

        loadedImages = images
        let recognitionResults = await ImageTextRecognizer.recognize(in: images)
        recognized = recognitionResults

        guard !recognitionResults.isEmpty else {
            lastError = "No text was found in those images."
            parsedItems = []
            return
        }

        // Mean confidence across ALL lines from ALL images
        let allConfidences = recognitionResults.flatMap(\.confidences)
        averageConfidence = allConfidences.isEmpty
            ? 0
            : allConfidences.reduce(0, +) / Float(allConfidences.count)

        let combined = recognitionResults.map(\.mergedText).joined(separator: "\n")
        let parsed = GroceryTextParser.parse(combined)

        parsedItems = parsed
        excludedIds = []

        if parsed.isEmpty {
            lastError = "Couldn't find grocery items in that text. Try a clearer photo."
        }

        HapticManager.selection()
    }

    private func toggle(_ item: ParsedGroceryItem) {
        if excludedIds.contains(item.id) {
            excludedIds.remove(item.id)
        } else {
            excludedIds.insert(item.id)
        }
        HapticManager.selection()
    }

    private func saveSelected() async {
        let toSave = selectedItems
        guard !toSave.isEmpty else { return }

        isSaving = true
        defer { isSaving = false }

        var addedCount = 0
        for parsed in toSave {
            let item = GroceryItem(
                id: UUID().uuidString,
                userId: "",
                name: parsed.name,
                category: parsed.category,
                quantity: parsed.quantity,
                unit: parsed.unit.isEmpty ? "count" : parsed.unit,
                checked: false,
                addedVia: "photo"
            )
            do {
                try await appState.addGroceryItem(item)
                addedCount += 1
            } catch {
                continue
            }
        }

        if addedCount > 0 {
            HapticManager.success()
            ToastManager.shared.success(
                "Added \(addedCount) item\(addedCount == 1 ? "" : "s")",
                message: "Imported from photo"
            )
            dismiss()
        } else {
            ToastManager.shared.error(
                "Couldn't save imported items",
                message: "Try again or add manually."
            )
        }
    }

    // MARK: - Formatting

    private func formatted(_ value: Double) -> String {
        if value == value.rounded() { return String(Int(value)) }
        return String(format: "%.2g", value)
    }
}
