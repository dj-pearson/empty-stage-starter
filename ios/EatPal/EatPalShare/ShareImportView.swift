import SwiftUI

/// US-143 / US-295: SwiftUI surface of the share extension.
///
/// Routing:
///   * URL shares → existing recipe path (calls `parse-recipe`, enqueues a
///     `PendingRecipeImport`). A chooser still lets the user route the URL
///     to grocery if they prefer.
///   * Text shares (Notes / Reminders) → grocery path: parse with
///     `GroceryTextParser`, review items, enqueue a `PendingGroceryImport`.
///     "Save as recipe" is shown but disabled — `parse-recipe` requires a URL.
///   * Mixed (URL embedded in text) → both options live; the recipe option
///     uses the URL, the grocery option parses the surrounding text.
struct ShareImportView: View {
    let content: ShareViewController.SharedContent
    let onDone: () -> Void
    let onCancel: () -> Void

    private enum Stage: Equatable {
        case chooser
        case recipe
        case grocery
    }

    @State private var stage: Stage

    init(
        content: ShareViewController.SharedContent,
        onDone: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.content = content
        self.onDone = onDone
        self.onCancel = onCancel
        // URL-only shares skip the chooser and go straight to the recipe
        // flow — preserves the pre-chooser muscle memory for Safari users.
        switch content {
        case .url:
            _stage = State(initialValue: .recipe)
        case .text, .urlInText, .none:
            _stage = State(initialValue: .chooser)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                switch stage {
                case .chooser:
                    chooser
                case .recipe:
                    RecipeImportBranch(
                        sharedURL: recipeURL,
                        onDone: onDone,
                        onCancel: onCancel
                    )
                case .grocery:
                    GroceryImportBranch(
                        text: groceryText ?? "",
                        sourceLabel: groceryLabel,
                        onDone: onDone,
                        onCancel: onCancel
                    )
                }
            }
            .toolbar {
                if stage == .chooser {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { onCancel() }
                    }
                }
            }
        }
    }

    // MARK: - Chooser

    private var chooser: some View {
        VStack(spacing: 24) {
            VStack(spacing: 8) {
                Image(systemName: "tray.and.arrow.down.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(.green)
                Text("Save to EatPal")
                    .font(.title2)
                    .fontWeight(.semibold)
                Text(promptSubtitle)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .padding(.top, 32)

            VStack(spacing: 12) {
                chooserButton(
                    icon: "cart.fill",
                    title: "Add to Grocery List",
                    subtitle: groceryButtonSubtitle,
                    enabled: groceryText != nil,
                    isPrimary: true
                ) {
                    stage = .grocery
                }

                chooserButton(
                    icon: "book.fill",
                    title: "Save as Recipe",
                    subtitle: recipeButtonSubtitle,
                    enabled: recipeURL != nil,
                    isPrimary: false
                ) {
                    stage = .recipe
                }
            }
            .padding(.horizontal)

            Spacer()
        }
        .navigationTitle("Save to EatPal")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func chooserButton(
        icon: String,
        title: String,
        subtitle: String,
        enabled: Bool,
        isPrimary: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title3)
                    .frame(width: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isPrimary ? Color.green.opacity(0.12) : Color.secondary.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isPrimary ? Color.green.opacity(0.4) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1.0 : 0.4)
    }

    // MARK: - Derived content

    private var recipeURL: URL? {
        switch content {
        case .url(let url): return url
        case .urlInText(let url, _): return url
        case .text, .none: return nil
        }
    }

    private var groceryText: String? {
        switch content {
        case .text(let text): return text
        case .urlInText(_, let text): return text
        case .url, .none: return nil
        }
    }

    private var groceryLabel: String {
        switch content {
        case .text: return "share:text"
        case .urlInText: return "share:mixed"
        case .url, .none: return "share"
        }
    }

    private var promptSubtitle: String {
        switch content {
        case .url: return "We grabbed a URL from the share sheet."
        case .text: return "We grabbed text from the share sheet."
        case .urlInText: return "We grabbed text with a link from the share sheet."
        case .none: return "Nothing usable was shared."
        }
    }

    private var recipeButtonSubtitle: String {
        if recipeURL != nil {
            return "Imports the recipe at this link."
        }
        return "Share a URL to import as a recipe."
    }

    private var groceryButtonSubtitle: String {
        guard let text = groceryText else {
            return "Share text to import as groceries."
        }
        let lineCount = text
            .split(whereSeparator: { $0.isNewline })
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .count
        if lineCount > 1 {
            return "Parse \(lineCount) lines into grocery items."
        }
        return "Parse this text into grocery items."
    }
}

// MARK: - Recipe Branch (existing behaviour)

private struct RecipeImportBranch: View {
    let sharedURL: URL?
    let onDone: () -> Void
    let onCancel: () -> Void

    @State private var isLoading = false
    @State private var error: String?
    @State private var parsed: ParsedRecipe?

    var body: some View {
        Group {
            if let parsed {
                previewFor(parsed)
            } else if isLoading {
                loading
            } else if let error {
                errorView(error)
            } else if sharedURL == nil {
                errorView("No recipe URL was shared.")
            } else {
                loading
            }
        }
        .navigationTitle("Save to EatPal")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { onCancel() }
            }
            if parsed != nil {
                ToolbarItem(placement: .primaryAction) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                }
            }
        }
        .task {
            guard let url = sharedURL else { return }
            await fetchParsedRecipe(from: url)
        }
    }

    private var loading: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.4)
            Text("Reading recipe…")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Couldn't import", systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
        } description: {
            Text(message)
        } actions: {
            Button("Close") { onCancel() }
                .buttonStyle(.borderedProminent)
        }
    }

    private func previewFor(_ recipe: ParsedRecipe) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let imageUrl = recipe.imageUrl, let url = URL(string: imageUrl) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        default:
                            Color.secondary.opacity(0.1)
                        }
                    }
                    .frame(height: 160)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(recipe.name)
                        .font(.title3)
                        .fontWeight(.semibold)

                    if let description = recipe.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                metadataRow(recipe)

                if !recipe.ingredients.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Ingredients")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        ForEach(recipe.ingredients, id: \.self) { ingredient in
                            Text("• \(ingredient)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if let instructions = recipe.instructions, !instructions.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Instructions")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        Text(instructions)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
        }
    }

    private func metadataRow(_ recipe: ParsedRecipe) -> some View {
        HStack(spacing: 12) {
            if let prep = recipe.prepTime { metaChip("Prep", prep, icon: "timer") }
            if let cook = recipe.cookTime { metaChip("Cook", cook, icon: "flame.fill") }
            if let servings = recipe.servings { metaChip("Serves", servings, icon: "person.2.fill") }
        }
    }

    private func metaChip(_ label: String, _ value: String, icon: String) -> some View {
        Label("\(label): \(value)", systemImage: icon)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.secondary.opacity(0.12), in: Capsule())
    }

    private func fetchParsedRecipe(from url: URL) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await ShareExtensionAPI.parseRecipe(url: url)
            self.parsed = result
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() {
        guard let parsed, let sharedURL else { return }

        let pending = PendingRecipeImport(
            sourceUrl: sharedURL.absoluteString,
            name: parsed.name,
            description: parsed.description,
            imageUrl: parsed.imageUrl,
            instructions: parsed.instructions,
            prepTime: parsed.prepTime,
            cookTime: parsed.cookTime,
            servings: parsed.servings,
            additionalIngredients: parsed.ingredients.isEmpty
                ? nil
                : parsed.ingredients.joined(separator: "\n")
        )

        PendingRecipeImportQueue.enqueue(pending)
        onDone()
    }
}

// MARK: - Grocery Branch (US-295)

private struct GroceryImportBranch: View {
    let text: String
    let sourceLabel: String
    let onDone: () -> Void
    let onCancel: () -> Void

    @State private var transcript: String
    @State private var parsed: [ParsedGroceryItem] = []
    @State private var excluded: Set<UUID> = []

    init(
        text: String,
        sourceLabel: String,
        onDone: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.text = text
        self.sourceLabel = sourceLabel
        self.onDone = onDone
        self.onCancel = onCancel
        _transcript = State(initialValue: text)
    }

    private var selectedItems: [ParsedGroceryItem] {
        parsed.filter { !excluded.contains($0.id) }
    }

    var body: some View {
        VStack(spacing: 0) {
            transcriptEditor
            Divider()
            if parsed.isEmpty {
                ContentUnavailableView(
                    "Nothing to import",
                    systemImage: "text.viewfinder",
                    description: Text("We didn't find grocery items in that text. Edit above and we'll re-parse.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                previewList
            }
            footer
        }
        .navigationTitle("Add to Grocery")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { onCancel() }
            }
        }
        .onAppear { reparse(transcript) }
        .onChange(of: transcript) { _, newValue in
            reparse(newValue)
        }
    }

    private var transcriptEditor: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Shared text")
                .font(.caption.bold())
                .foregroundStyle(.secondary)
            TextEditor(text: $transcript)
                .font(.callout)
                .frame(minHeight: 80, maxHeight: 140)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.secondary.opacity(0.2))
                )
        }
        .padding()
    }

    private var previewList: some View {
        List {
            Section("Items (\(selectedItems.count) of \(parsed.count))") {
                ForEach(parsed) { item in
                    HStack {
                        Image(systemName: excluded.contains(item.id) ? "circle" : "checkmark.circle.fill")
                            .foregroundStyle(excluded.contains(item.id) ? .secondary : .green)
                            .onTapGesture { toggle(item) }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .font(.subheadline)
                                .strikethrough(excluded.contains(item.id))
                            Text(metaLine(item))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if item.confidence < 0.75 {
                            Image(systemName: "questionmark.circle")
                                .foregroundStyle(.orange)
                                .help("Low-confidence parse — double-check before saving.")
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { toggle(item) }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var footer: some View {
        HStack {
            Spacer()
            Button {
                save()
            } label: {
                Text(selectedItems.isEmpty
                     ? "Select items to save"
                     : "Save \(selectedItems.count) item\(selectedItems.count == 1 ? "" : "s")")
                    .font(.headline)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            .disabled(selectedItems.isEmpty)
            Spacer()
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    private func metaLine(_ item: ParsedGroceryItem) -> String {
        let qty = formatted(item.quantity)
        let unit = item.unit.isEmpty ? "" : " \(item.unit)"
        return "\(qty)\(unit) · \(item.category)"
    }

    private func formatted(_ value: Double) -> String {
        if value == value.rounded() { return String(Int(value)) }
        return String(format: "%.2g", value)
    }

    private func toggle(_ item: ParsedGroceryItem) {
        if excluded.contains(item.id) {
            excluded.remove(item.id)
        } else {
            excluded.insert(item.id)
        }
    }

    private func reparse(_ text: String) {
        parsed = GroceryTextParser.parse(text)
        // Keep exclusions only for items that still exist after re-parse.
        let ids = Set(parsed.map { $0.id })
        excluded = excluded.intersection(ids)
    }

    private func save() {
        let toSave = selectedItems
        guard !toSave.isEmpty else { return }

        let pending = PendingGroceryImport(
            items: toSave.map {
                PendingGroceryImport.ParsedLine(
                    name: $0.name,
                    quantity: $0.quantity,
                    unit: $0.unit,
                    category: $0.category
                )
            },
            sourceLabel: sourceLabel
        )
        PendingGroceryImportQueue.enqueue(pending)
        onDone()
    }
}
