import SwiftUI
import TipKit

struct GroceryView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var showingAddItem = false
    @State private var showingVoiceAdd = false
    @State private var showingClearAlert = false
    @State private var isGenerating = false
    @State private var editingItem: GroceryItem?

    private var swipeTip = SwipeGroceryTip()
    private var contextMenuTip = ContextMenuTip()

    private var uncheckedItems: [GroceryItem] {
        appState.groceryItems.filter { !$0.checked && matchesSearch($0) }
    }

    private var checkedItems: [GroceryItem] {
        appState.groceryItems.filter { $0.checked && matchesSearch($0) }
    }

    private var groupedUncheckedItems: [(String, [GroceryItem])] {
        Dictionary(grouping: uncheckedItems, by: { $0.category })
            .sorted { $0.key < $1.key }
    }

    private func matchesSearch(_ item: GroceryItem) -> Bool {
        searchText.isEmpty || item.name.localizedCaseInsensitiveContains(searchText)
    }

    var body: some View {
        List {
            // Summary Header
            Section {
                HStack {
                    VStack(alignment: .leading) {
                        Text("\(uncheckedItems.count) items remaining")
                            .font(.headline)
                        if !checkedItems.isEmpty {
                            Text("\(checkedItems.count) completed")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    if !checkedItems.isEmpty {
                        Button("Clear Done") {
                            showingClearAlert = true
                        }
                        .font(.subheadline)
                        .foregroundStyle(.red)
                    }
                }
                .popoverTip(swipeTip)
            }

            // Unchecked Items by Category
            if appState.isLoading && appState.groceryItems.isEmpty {
                Section {
                    ForEach(0..<5, id: \.self) { _ in
                        SkeletonView(shape: .groceryRow)
                    }
                }
            } else if groupedUncheckedItems.isEmpty && checkedItems.isEmpty {
                Section {
                    ContentUnavailableView(
                        "No Grocery Items",
                        systemImage: "cart.fill",
                        description: Text("Add items to your grocery list to get started.")
                    )
                }
            } else {
                ForEach(groupedUncheckedItems, id: \.0) { category, items in
                    Section {
                        ForEach(items) { item in
                            GroceryItemRow(item: item)
                                .contentShape(Rectangle())
                                .onTapGesture { editingItem = item }
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                    Button {
                                        HapticManager.success()
                                        Task {
                                            try? await appState.toggleGroceryItem(item.id)
                                            await TipEvents.didSwipeGrocery.donate()
                                        }
                                    } label: {
                                        Label("Check", systemImage: "checkmark.circle.fill")
                                    }
                                    .tint(.green)
                                    .accessibilityLabel("Mark \(item.name) as bought")
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        HapticManager.error()
                                        Task {
                                            try? await appState.deleteGroceryItem(item.id)
                                            await TipEvents.didSwipeGrocery.donate()
                                        }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                    Button {
                                        HapticManager.lightImpact()
                                        editingItem = item
                                        Task { await TipEvents.didSwipeGrocery.donate() }
                                    } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    .tint(.blue)
                                }
                                .contextMenu {
                                    Button {
                                        HapticManager.success()
                                        Task { try? await appState.toggleGroceryItem(item.id) }
                                    } label: {
                                        Label(item.checked ? "Uncheck" : "Mark Bought",
                                              systemImage: item.checked ? "arrow.uturn.backward.circle" : "checkmark.circle.fill")
                                    }

                                    Button {
                                        HapticManager.lightImpact()
                                        editingItem = item
                                    } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }

                                    Button {
                                        HapticManager.success()
                                        Task {
                                            let duplicate = GroceryItem(
                                                id: UUID().uuidString,
                                                userId: "",
                                                name: item.name,
                                                category: item.category,
                                                quantity: item.quantity,
                                                unit: item.unit,
                                                checked: false,
                                                notes: item.notes,
                                                priority: item.priority,
                                                addedVia: "manual"
                                            )
                                            try? await appState.addGroceryItem(duplicate)
                                            ToastManager.shared.success("Duplicated", message: item.name)
                                        }
                                    } label: {
                                        Label("Duplicate", systemImage: "plus.square.on.square")
                                    }

                                    Divider()

                                    Button(role: .destructive) {
                                        HapticManager.error()
                                        Task { try? await appState.deleteGroceryItem(item.id) }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    } header: {
                        let cat = FoodCategory(rawValue: category)
                        Text("\(cat?.icon ?? "🛒") \(cat?.displayName ?? category)")
                    }
                }

                // Checked Items
                if !checkedItems.isEmpty {
                    Section {
                        ForEach(checkedItems) { item in
                            GroceryItemRow(item: item)
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                    Button {
                                        HapticManager.lightImpact()
                                        Task { try? await appState.toggleGroceryItem(item.id) }
                                    } label: {
                                        Label("Uncheck", systemImage: "arrow.uturn.backward.circle")
                                    }
                                    .tint(.orange)
                                    .accessibilityLabel("Uncheck \(item.name)")
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        HapticManager.error()
                                        Task { try? await appState.deleteGroceryItem(item.id) }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    } header: {
                        Text("Completed")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Grocery List")
        .searchable(text: $searchText, prompt: "Search items...")
        .dropDestination(for: FoodTransferable.self) { droppedFoods, _ in
            guard !droppedFoods.isEmpty else { return false }
            Task {
                var addedCount = 0
                for dropped in droppedFoods {
                    let item = GroceryItem(
                        id: UUID().uuidString,
                        userId: "",
                        name: dropped.name,
                        category: dropped.category,
                        quantity: 1,
                        unit: dropped.unit ?? "count",
                        checked: false,
                        addedVia: "drag"
                    )
                    do {
                        try await appState.addGroceryItem(item)
                        addedCount += 1
                    } catch {
                        continue
                    }
                }
                HapticManager.success()
                await TipEvents.didDragFood.donate()
                if addedCount > 0 {
                    ToastManager.shared.success(
                        "Added to grocery",
                        message: addedCount == 1
                            ? droppedFoods.first!.name
                            : "\(addedCount) items"
                    )
                }
            }
            return true
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 12) {
                    Button {
                        showingVoiceAdd = true
                    } label: {
                        Image(systemName: "mic.fill")
                    }
                    .accessibilityLabel("Add by voice")

                    Menu {
                        Button {
                            Task { await generateFromWeekPlan() }
                        } label: {
                            Label("Generate from This Week's Plan", systemImage: "calendar.badge.plus")
                        }
                        .disabled(isGenerating)
                    } label: {
                        Image(systemName: "wand.and.stars")
                    }
                    .accessibilityLabel("Generate options")

                    Button {
                        showingAddItem = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add grocery item")
                }
            }
        }
        .sheet(isPresented: $showingAddItem) {
            AddGroceryItemView()
        }
        .sheet(isPresented: $showingVoiceAdd) {
            VoiceAddGrocerySheet()
        }
        .sheet(item: $editingItem) { item in
            EditGroceryItemView(item: item)
        }
        .alert("Clear Completed Items?", isPresented: $showingClearAlert) {
            Button("Clear", role: .destructive) {
                Task { try? await appState.clearCheckedGroceryItems() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will remove all checked items from your list.")
        }
        .refreshable {
            await appState.loadAllData()
        }
    }

    private func generateFromWeekPlan() async {
        isGenerating = true
        let weekStart = Date().weekDates.first ?? Date()
        let kidIds = appState.activeKidId.map { [$0] } ?? appState.kids.map(\.id)

        do {
            let items = try await GroceryGeneratorService.generateFromMealPlan(
                weekStart: weekStart,
                kidIds: kidIds,
                appState: appState
            )
            if !items.isEmpty {
                try await GroceryGeneratorService.addGeneratedItems(items, appState: appState)
            } else {
                let toast = ToastManager.shared
                toast.info("No new items", message: "All ingredients are already on your list.")
            }
        } catch {
            let toast = ToastManager.shared
            toast.error("Generation failed", message: error.localizedDescription)
        }
        isGenerating = false
    }
}

// MARK: - Grocery Item Row

struct GroceryItemRow: View {
    @EnvironmentObject var appState: AppState
    let item: GroceryItem

    var body: some View {
        HStack(spacing: 12) {
            Button {
                Task { try? await appState.toggleGroceryItem(item.id) }
            } label: {
                Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(item.checked ? .green : .secondary)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.body)
                    .strikethrough(item.checked)
                    .foregroundStyle(item.checked ? .secondary : .primary)

                HStack(spacing: 8) {
                    Text("\(item.quantity.formatted()) \(item.unit)")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let priority = item.priority, priority == "high" {
                        Label("High", systemImage: "exclamationmark.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }

                    if let aisle = item.aisle {
                        Text("Aisle: \(aisle)")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()

            if let notes = item.notes, !notes.isEmpty {
                Image(systemName: "note.text")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}

// MARK: - Add Grocery Item View

struct AddGroceryItemView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var category: FoodCategory = .protein
    @State private var quantity: Double = 1
    @State private var unit = "count"
    @State private var notes = ""
    @State private var priority = "medium"

    private let units = ["count", "oz", "lb", "g", "kg", "cups", "tbsp", "tsp", "ml", "l"]
    private let priorities = ["low", "medium", "high"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Item Details") {
                    TextField("Item name", text: $name)

                    Picker("Category", selection: $category) {
                        ForEach(FoodCategory.allCases, id: \.self) { cat in
                            Text("\(cat.icon) \(cat.displayName)").tag(cat)
                        }
                    }
                }

                Section("Quantity") {
                    HStack {
                        TextField("Qty", value: $quantity, format: .number)
                            .keyboardType(.decimalPad)
                            .frame(width: 80)

                        Picker("Unit", selection: $unit) {
                            ForEach(units, id: \.self) { u in
                                Text(u).tag(u)
                            }
                        }
                    }
                }

                Section("Priority") {
                    Picker("Priority", selection: $priority) {
                        ForEach(priorities, id: \.self) { p in
                            Text(p.capitalized).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Notes") {
                    TextField("Optional notes", text: $notes, axis: .vertical)
                        .lineLimit(3)
                }
            }
            .navigationTitle("Add Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task { await addItem() }
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }

    private func addItem() async {
        let item = GroceryItem(
            id: UUID().uuidString,
            userId: "",
            name: name,
            category: category.rawValue,
            quantity: quantity,
            unit: unit,
            checked: false,
            notes: notes.isEmpty ? nil : notes,
            priority: priority,
            addedVia: "manual"
        )

        try? await appState.addGroceryItem(item)
        dismiss()
    }
}

// MARK: - Edit Grocery Item View

struct EditGroceryItemView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let item: GroceryItem

    @State private var name: String = ""
    @State private var category: FoodCategory = .protein
    @State private var quantity: Double = 1
    @State private var unit: String = "count"
    @State private var notes: String = ""
    @State private var priority: String = "medium"

    private let units = ["count", "oz", "lb", "g", "kg", "cups", "tbsp", "tsp", "ml", "l"]
    private let priorities = ["low", "medium", "high"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Item Details") {
                    TextField("Item name", text: $name)

                    Picker("Category", selection: $category) {
                        ForEach(FoodCategory.allCases, id: \.self) { cat in
                            Text("\(cat.icon) \(cat.displayName)").tag(cat)
                        }
                    }
                }

                Section("Quantity") {
                    HStack {
                        Button {
                            quantity = max(0, quantity - 1)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)

                        TextField("Qty", value: $quantity, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)

                        Button {
                            quantity += 1
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)

                        Picker("Unit", selection: $unit) {
                            ForEach(units, id: \.self) { u in
                                Text(u).tag(u)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                    }
                }

                Section("Priority") {
                    Picker("Priority", selection: $priority) {
                        ForEach(priorities, id: \.self) { p in
                            Text(p.capitalized).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Notes") {
                    TextField("Optional notes", text: $notes, axis: .vertical)
                        .lineLimit(3)
                }

                Section {
                    Button("Save Changes") {
                        Task { await save() }
                    }
                    .frame(maxWidth: .infinity)
                    .disabled(name.isEmpty)
                }
            }
            .navigationTitle("Edit Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                name = item.name
                category = FoodCategory(rawValue: item.category) ?? .protein
                quantity = item.quantity
                unit = item.unit
                notes = item.notes ?? ""
                priority = item.priority ?? "medium"
            }
        }
    }

    private func save() async {
        try? await appState.updateGroceryItem(
            item.id,
            updates: GroceryItemUpdate(
                name: name,
                category: category.rawValue,
                quantity: quantity,
                unit: unit,
                notes: notes.isEmpty ? nil : notes,
                priority: priority
            )
        )
        dismiss()
    }
}

#Preview {
    NavigationStack {
        GroceryView()
    }
    .environmentObject(AppState())
}
