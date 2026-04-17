import SwiftUI

/// Lightweight "review the recognised text and save" sheet used after the
/// unified scanner returns a text transcript (US-139 grocery-list mode) or
/// any other caller that wants to reuse the parsed-items preview pattern.
///
/// Structurally identical to `PhotoImportGrocerySheet`'s preview — just
/// skips the picker/OCR step because the text arrives pre-recognised.
struct TextImportGrocerySheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    /// Recognised lines from the scanner or any other text source.
    let recognisedLines: [String]
    /// Label describing the origin, stored as addedVia on each saved item.
    let sourceTag: String
    /// Title used at the navigation bar.
    let title: String

    @State private var parsedItems: [ParsedGroceryItem] = []
    @State private var excludedIds: Set<UUID> = []
    @State private var editableTranscript: String
    @State private var isSaving = false

    init(
        recognisedLines: [String],
        sourceTag: String = "scan",
        title: String = "Review Items"
    ) {
        self.recognisedLines = recognisedLines
        self.sourceTag = sourceTag
        self.title = title
        _editableTranscript = State(initialValue: recognisedLines.joined(separator: "\n"))
    }

    private var selectedItems: [ParsedGroceryItem] {
        parsedItems.filter { !excludedIds.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                transcriptEditor

                if !parsedItems.isEmpty {
                    Divider()
                    previewList
                } else {
                    Spacer()
                    ContentUnavailableView(
                        "Nothing to import",
                        systemImage: "text.viewfinder",
                        description: Text("We didn't find grocery items in that text. Edit above to adjust and we'll re-parse.")
                    )
                    Spacer()
                }

                footer
                    .padding()
                    .background(.ultraThinMaterial)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .onAppear { reparse(from: editableTranscript) }
            .onChange(of: editableTranscript) { _, newValue in
                reparse(from: newValue)
            }
        }
    }

    // MARK: - Sections

    private var transcriptEditor: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Recognised text")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(parsedItems.count) item\(parsedItems.count == 1 ? "" : "s") parsed")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal)
            .padding(.top, 12)

            TextEditor(text: $editableTranscript)
                .font(.subheadline)
                .frame(minHeight: 100, maxHeight: 160)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal)
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
                            .foregroundStyle(excludedIds.contains(item.id) ? .secondary : .green)

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
        .disabled(isSaving || selectedItems.isEmpty)
    }

    // MARK: - Logic

    private func reparse(from text: String) {
        parsedItems = GroceryTextParser.parse(text)
        excludedIds = []
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
                addedVia: sourceTag
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
                message: sourceTagDescription
            )
            dismiss()
        } else {
            ToastManager.shared.error(
                "Couldn't save items",
                message: "Try again or add manually."
            )
        }
    }

    private var sourceTagDescription: String {
        switch sourceTag {
        case "scan": return "Imported from scan"
        case "photo": return "Imported from photo"
        case "voice": return "Imported by voice"
        default: return "Imported"
        }
    }

    private func formatted(_ value: Double) -> String {
        if value == value.rounded() { return String(Int(value)) }
        return String(format: "%.2g", value)
    }
}
