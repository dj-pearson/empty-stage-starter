import PhotosUI
import SwiftUI

/// US-272: Quick Add — the single-screen, optimized-for-speed grocery add
/// flow. The whole point is "type or scan, hit Add, repeat" without
/// drilling into pickers.
///
/// Smart pre-fill behavior:
///  - As the user types, a debounced lookup walks the tiered chain
///    (user preference → catalog → barcode → keyword) and pre-fills
///    aisle, category, unit, quantity, and brand.
///  - Tapping "Scan" opens UnifiedScannerView in barcode mode; the
///    scanned payload triggers the same resolver and pre-fills name +
///    everything else.
///  - The aisle pill is always visible and tappable so the user can
///    override before saving — a single tap, full picker only for the
///    long tail.
///  - After save, the form clears (name field stays focused) and the
///    sheet stays open so the user can keep adding items at speed. A
///    "Done" button dismisses.
struct QuickAddGrocerySheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var quantity: Double = 1
    @State private var unit: String = "count"
    @State private var aisle: GroceryAisle = .other
    @State private var category: FoodCategory = .snack
    @State private var brand: String = ""
    @State private var notes: String = ""
    @State private var barcode: String?

    /// Source of the current pre-fill, drives the "Auto-detected" hint
    /// and the badge color on the aisle pill.
    @State private var lastResolveSource: ResolvedProduct.Source?

    /// Cancellation token for in-flight resolves so a fast typer doesn't
    /// race a stale lookup over a fresh one.
    @State private var resolveTask: Task<Void, Never>?

    @State private var showingScanner = false
    @State private var showingPhotoImport = false
    // US-273: Single-product vision identification — different from
    // the list-OCR flow. Photo button uses a Menu so the user can
    // choose "identify one product" vs "scan a list".
    @State private var photoIdentifyPickerItem: PhotosPickerItem?
    @State private var photoIdentifyError: String?
    @State private var isIdentifying = false
    @State private var showingFullAislePicker = false
    @State private var isSaving = false
    @State private var addedThisSession = 0

    @FocusState private var nameFocused: Bool

    /// US-278: live dictation for the name field. Hold-to-talk on the
    /// inline mic button starts the recognizer and streams partial
    /// transcripts into the form.
    @StateObject private var voice = VoiceInputService()
    /// Set when the user starts dictating so we can flip the mic button
    /// state and the cancel handler. Separate from `voice.state` so we
    /// can debounce the button without flickering during preparing.
    @State private var isDictating = false

    private let units = ["count", "oz", "lb", "g", "kg", "cups", "tbsp", "tsp", "ml", "l", "pack", "box", "bag", "bottle", "can", "jar"]

    private var suggestions: [GrocerySuggestion] {
        GrocerySuggestionEngine.suggestions(
            for: name,
            history: appState.groceryItems,
            pantry: appState.foods,
            limit: 5
        )
    }

    /// Top 6 aisles by store walk order — the common-case picker. The
    /// "More…" sheet exposes the full 32-value list for the long tail.
    private var quickAisles: [GroceryAisle] {
        [.produce, .meatDeli, .dairy, .bread, .pasta, .snacks]
    }

    var body: some View {
        NavigationStack {
            Form {
                nameSection
                if !suggestions.isEmpty {
                    suggestionsSection
                }
                detailsSection
                if !brand.isEmpty || lastResolveSource == .userPreference {
                    brandSection
                }
                if !notes.isEmpty {
                    notesSection
                }
                addedThisSessionSection
            }
            .navigationTitle("Quick Add")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("Add").bold()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .sheet(isPresented: $showingFullAislePicker) {
                fullAislePickerSheet
            }
            .sheet(isPresented: $showingPhotoImport) {
                PhotoImportGrocerySheet()
            }
            .fullScreenCover(isPresented: $showingScanner) {
                UnifiedScannerView(initialMode: .barcode, allowModeSwitching: false) { result in
                    if case .barcode(let payload) = result {
                        handleScanned(barcode: payload)
                    }
                }
            }
            // US-273: Single-product photo identify. The PhotosPicker
            // lives inside the Photo menu; this onChange catches the
            // selection, loads the data, and runs it through
            // ProductPhotoIdentifier before resetting the picker item.
            .onChange(of: photoIdentifyPickerItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        await identifyAndApply(image: image)
                    }
                    photoIdentifyPickerItem = nil
                }
            }
            .alert(
                "Couldn't identify product",
                isPresented: Binding(
                    get: { photoIdentifyError != nil },
                    set: { if !$0 { photoIdentifyError = nil } }
                ),
                presenting: photoIdentifyError
            ) { _ in
                Button("OK", role: .cancel) {}
            } message: { msg in
                Text(msg)
            }
            .onAppear { nameFocused = true }
            .onChange(of: name) { _, newValue in
                // Debounce: cancel any in-flight resolve and start a new one.
                resolveTask?.cancel()
                let snapshot = newValue
                resolveTask = Task { [snapshot] in
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    if Task.isCancelled { return }
                    await resolveAndApply(name: snapshot, barcode: barcode)
                }
            }
            // US-278: stream live transcripts into the form. We parse via
            // GroceryTextParser so "two pounds of chicken" updates name,
            // quantity, AND unit — not just the raw name.
            .onChange(of: voice.liveTranscript) { _, transcript in
                applyDictatedTranscript(transcript)
            }
            .onChange(of: voice.finalTranscript) { _, transcript in
                applyDictatedTranscript(transcript)
                // Final transcript means the recognizer finished; flip
                // the button state back so the mic isn't stuck red.
                isDictating = false
            }
        }
    }

    // MARK: - Sections

    private var nameSection: some View {
        Section {
            HStack(spacing: 8) {
                Image(systemName: "cart.fill")
                    .foregroundStyle(.tint)
                TextField("What are you adding?", text: $name)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    .focused($nameFocused)
                    .onSubmit {
                        Task { await save() }
                    }
                // US-278: tap-to-dictate. Streams partial transcripts
                // into the name field; the resolver `.onChange(of: name)`
                // already debounces and pre-fills aisle/unit/qty so
                // dictation lights up the whole form.
                Button {
                    Task { await toggleDictation() }
                } label: {
                    Image(systemName: isDictating ? "mic.fill" : "mic")
                        .foregroundStyle(isDictating ? Color.red : Color.accentColor)
                        .symbolEffect(.pulse, options: .repeating, isActive: isDictating)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isDictating ? "Stop dictation" : "Dictate item")
                .accessibilityHint("Speak the item, quantity, and unit")
            }

            HStack(spacing: 12) {
                Button {
                    showingScanner = true
                } label: {
                    Label("Scan", systemImage: "barcode.viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.regular)

                Menu {
                    // US-273: photo picker triggers a single-product
                    // identify flow. Wrapping the PhotosPicker in the
                    // Menu would block the picker from presenting, so we
                    // expose it as a separate PhotosPicker control below
                    // the menu and route the menu's "Identify" button to
                    // a sentinel state that pops the picker.
                    PhotosPicker(selection: $photoIdentifyPickerItem, matching: .images) {
                        Label("Identify one product", systemImage: "viewfinder.circle")
                    }
                    Button {
                        showingPhotoImport = true
                    } label: {
                        Label("Scan a list", systemImage: "list.bullet.rectangle.portrait")
                    }
                } label: {
                    Label(isIdentifying ? "Identifying…" : "Photo", systemImage: "photo.on.rectangle.angled")
                        .frame(maxWidth: .infinity)
                }
                .menuStyle(.borderlessButton)
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .disabled(isIdentifying)
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        } header: {
            HStack {
                Text("Item")
                Spacer()
                if let source = lastResolveSource {
                    sourceBadge(for: source)
                }
            }
        } footer: {
            sourceFooter
        }
    }

    private var suggestionsSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(suggestions) { suggestion in
                        Button {
                            HapticManager.selection()
                            name = suggestion.name
                            // The resolver will fire from .onChange and
                            // pre-fill aisle/unit from the user prefs row.
                        } label: {
                            HStack(spacing: 4) {
                                Text(FoodCategory(rawValue: suggestion.category)?.icon ?? "🛒")
                                Text(suggestion.name)
                                    .lineLimit(1)
                            }
                            .font(.callout)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.green.opacity(0.12), in: Capsule())
                            .foregroundStyle(.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 2)
            }
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
        } header: {
            Text("Recent")
        }
    }

    private var detailsSection: some View {
        Section {
            // Aisle pill row — primary aisles inline, "More…" opens full picker.
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Aisle")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        showingFullAislePicker = true
                    } label: {
                        Label(aisle.displayName, systemImage: aisle.icon)
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Tap to choose a different aisle")
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(quickAisles, id: \.self) { quick in
                            Button {
                                HapticManager.selection()
                                aisle = quick
                                category = quick.derivedFoodCategory
                            } label: {
                                Label(quick.displayName, systemImage: quick.icon)
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(
                                        aisle == quick ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.08),
                                        in: Capsule()
                                    )
                                    .foregroundStyle(aisle == quick ? Color.accentColor : Color.primary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.vertical, 4)

            // Quantity stepper + unit picker on one row.
            HStack(spacing: 12) {
                Button {
                    quantity = max(0.5, quantity - 1)
                    HapticManager.selection()
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)

                TextField("Qty", value: $quantity, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 60)
                    .monospacedDigit()

                Button {
                    quantity += 1
                    HapticManager.selection()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                Picker("Unit", selection: $unit) {
                    ForEach(units, id: \.self) { u in
                        Text(u).tag(u)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
        }
    }

    private var brandSection: some View {
        Section("Brand") {
            TextField("Preferred brand (optional)", text: $brand)
                .textInputAutocapitalization(.words)
        }
    }

    private var notesSection: some View {
        Section("Notes") {
            TextField("Notes", text: $notes, axis: .vertical)
                .lineLimit(2)
        }
    }

    @ViewBuilder
    private var addedThisSessionSection: some View {
        if addedThisSession > 0 {
            Section {
                Label(
                    "Added \(addedThisSession) item\(addedThisSession == 1 ? "" : "s") this session",
                    systemImage: "checkmark.circle.fill"
                )
                .foregroundStyle(.green)
                .font(.subheadline)
            }
        }
    }

    @ViewBuilder
    private func sourceBadge(for source: ResolvedProduct.Source) -> some View {
        switch source {
        case .userPreference:
            Label("Your defaults", systemImage: "person.circle.fill")
                .font(.caption2)
                .foregroundStyle(.green)
        case .catalog:
            Label("Community defaults", systemImage: "globe")
                .font(.caption2)
                .foregroundStyle(.blue)
        case .barcodeFresh:
            Label("Scanned", systemImage: "barcode")
                .font(.caption2)
                .foregroundStyle(.orange)
        case .unitInference:
            // US-279: classifier picked the aisle but the unit/qty
            // came from the embedded inference table.
            Label("Smart default", systemImage: "ruler")
                .font(.caption2)
                .foregroundStyle(.purple)
        case .keywordFallback:
            Label("Auto-detected", systemImage: "wand.and.sparkles")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var sourceFooter: some View {
        if lastResolveSource == .keywordFallback
            || lastResolveSource == .barcodeFresh
            || lastResolveSource == .unitInference {
            Text("First time adding this — tap the aisle to confirm it's right. We'll remember next time.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        } else if lastResolveSource == .userPreference {
            Text("Pre-filled from your last add.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }

    private var fullAislePickerSheet: some View {
        NavigationStack {
            List {
                ForEach(GroceryAisle.allCases.sorted(), id: \.self) { value in
                    Button {
                        HapticManager.selection()
                        aisle = value
                        category = value.derivedFoodCategory
                        showingFullAislePicker = false
                    } label: {
                        HStack {
                            Label(value.displayName, systemImage: value.icon)
                            Spacer()
                            if value == aisle {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle("Choose Aisle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showingFullAislePicker = false }
                }
            }
        }
    }

    // MARK: - Pipeline

    private func handleScanned(barcode payload: String) {
        barcode = payload
        showingScanner = false
        Task { await resolveAndApply(name: nil, barcode: payload) }
    }

    /// US-278: toggle the dictation mic. Tapping while idle starts the
    /// recognizer; tapping while listening stops + commits the final
    /// transcript through `voice.finalTranscript`.
    private func toggleDictation() async {
        if isDictating {
            voice.stop()
            isDictating = false
            return
        }
        do {
            try await voice.start()
            isDictating = true
            AnalyticsService.track(.quickAddVoiceUsed)
            HapticManager.lightImpact()
        } catch {
            // VoiceInputService surfaces its own .error state; reflect
            // that into the button so we don't appear stuck.
            isDictating = false
        }
    }

    /// US-278: pipe a transcript through `GroceryTextParser` and patch
    /// the form fields. The parser already handles "two pounds of",
    /// "a dozen", "half a" via its number-words + unit map, so live
    /// transcripts populate name/quantity/unit in one shot.
    private func applyDictatedTranscript(_ transcript: String) {
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let parsed = GroceryTextParser.parse(trimmed).first else { return }
        name = parsed.name
        if parsed.quantity > 0 {
            quantity = parsed.quantity
        }
        let unitOut = parsed.unit.isEmpty ? "count" : parsed.unit
        if units.contains(unitOut) {
            unit = unitOut
        }
    }

    /// US-273: pipe a single photo through the vision identifier, layer
    /// the result onto SmartProductService.resolve so any user-pref
    /// memory wins, then pre-fill the form. Stays open so the user can
    /// confirm low-confidence guesses before tapping Add.
    private func identifyAndApply(image: UIImage) async {
        isIdentifying = true
        defer { isIdentifying = false }
        do {
            let identified = try await ProductPhotoIdentifier.identify(image)
            // Run the recognized name through the resolver so any prior
            // user-prefs win over the vision defaults — same flow as
            // typing the name yourself.
            let resolved = await SmartProductService.shared.resolve(
                name: identified.name,
                barcode: nil
            )
            // Vision result is fresher than keyword classifier — use it
            // when the user has no prior preference. Confidence chip
            // surfaces when we fall back to the vision result.
            let useVision = resolved.source == .keywordFallback
            self.name = identified.name
            self.aisle = useVision
                ? (GroceryAisle(rawValue: identified.aisleSection) ?? resolved.aisleSection)
                : resolved.aisleSection
            self.category = useVision
                ? (FoodCategory(rawValue: identified.category) ?? resolved.category)
                : resolved.category
            self.unit = useVision ? (identified.packageUnit ?? "count") : resolved.unit
            self.quantity = useVision ? (identified.packageSize ?? 1) : resolved.quantity
            self.brand = identified.brand ?? resolved.brand ?? ""
            self.notes = resolved.notes ?? ""
            self.lastResolveSource = useVision ? .barcodeFresh : resolved.source
            AnalyticsService.track(.productPhotoIdentified(confidence: identified.confidence))
            HapticManager.success()
        } catch let error as ProductPhotoIdentifier.IdentifyError {
            photoIdentifyError = error.errorDescription
            HapticManager.error()
        } catch {
            photoIdentifyError = error.localizedDescription
            HapticManager.error()
        }
    }

    private func resolveAndApply(name: String?, barcode: String?) async {
        let resolved = await SmartProductService.shared.resolve(
            name: name?.isEmpty == false ? name : nil,
            barcode: barcode
        )
        // Avoid stomping the user's in-progress edits: only overwrite the
        // name field when we resolved from a barcode (the user wasn't
        // typing the name) or it's currently empty.
        if barcode != nil && !resolved.name.isEmpty {
            self.name = resolved.name
        }
        self.aisle = resolved.aisleSection
        self.category = resolved.category
        self.unit = resolved.unit
        // Only adopt the resolved quantity on a barcode scan (when the
        // user almost certainly wants the package quantity) — typing
        // shouldn't reset whatever stepper count they've already touched.
        if barcode != nil {
            self.quantity = resolved.quantity
        }
        self.brand = resolved.brand ?? ""
        self.notes = resolved.notes ?? ""
        self.lastResolveSource = resolved.source
        AnalyticsService.track(.quickAddResolveSource(source: resolved.source.rawValue))
    }

    private func save() async {
        guard !isSaving else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }

        let item = GroceryItem(
            id: UUID().uuidString,
            userId: "",
            name: trimmed,
            category: category.rawValue,
            quantity: quantity,
            unit: unit,
            checked: false,
            notes: notes.isEmpty ? nil : notes,
            barcode: barcode,
            brandPreference: brand.isEmpty ? nil : brand,
            priority: "medium",
            addedVia: "quick_add",
            aisleSection: aisle.rawValue
        )

        do {
            try await appState.addGroceryItem(item)
            addedThisSession += 1
            HapticManager.success()
            // Fire-and-forget: don't block the user; learn in background.
            Task.detached { await SmartProductService.shared.recordAdd(item: item) }
            resetFormForNextItem()
        } catch {
            // AppState already surfaces a toast; nothing to do here.
        }
    }

    private func resetFormForNextItem() {
        name = ""
        quantity = 1
        unit = "count"
        aisle = .other
        category = .snack
        brand = ""
        notes = ""
        barcode = nil
        lastResolveSource = nil
        nameFocused = true
    }
}

#Preview {
    QuickAddGrocerySheet()
        .environmentObject(AppState())
}
