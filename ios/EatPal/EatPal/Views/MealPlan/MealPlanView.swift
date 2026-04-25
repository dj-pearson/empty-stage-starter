import SwiftUI

/// Context object for the AddPlanEntryView sheet. Using `.sheet(item:)`
/// with an identifiable payload forces SwiftUI to present only once the
/// target slot + date are atomically set, avoiding the first-tap race
/// where the sheet could open before `selectedSlot` propagated.
private struct AddEntryContext: Identifiable, Equatable {
    let id = UUID()
    let date: Date
    let slot: MealSlot
}

struct MealPlanView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedDate = Date()
    @State private var addEntryContext: AddEntryContext?
    @State private var showingAIMealPlan = false
    @State private var showingCopyWeek = false
    @State private var showingClearWeekAlert = false
    @State private var showingSaveTemplate = false
    @State private var showingCopyToKid = false
    @State private var templateName = ""
    @State private var copyTargetDate = Date()
    @State private var copyToKidId: String?

    private var weekDates: [Date] {
        selectedDate.weekDates
    }

    private var weekStart: Date {
        weekDates.first ?? selectedDate
    }

    private var entriesForSelectedDate: [PlanEntry] {
        guard let kidId = appState.activeKidId else { return [] }
        return appState.planEntriesForDate(selectedDate, kidId: kidId)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Kid Selector
                if appState.kids.count > 1 {
                    KidSelectorView()
                        .padding(.horizontal)
                }

                // Week Navigation
                WeekNavigationView(
                    selectedDate: $selectedDate,
                    weekDates: weekDates
                )

                // Meal Slots
                if appState.isLoading && appState.planEntries.isEmpty {
                    VStack(spacing: 12) {
                        ForEach(0..<3, id: \.self) { _ in
                            SkeletonView(shape: .mealSlotCard)
                        }
                    }
                    .padding(.horizontal)
                } else if appState.activeKidId != nil {
                    VStack(spacing: 12) {
                        ForEach(MealSlot.allCases, id: \.self) { slot in
                            MealSlotCard(
                                slot: slot,
                                date: selectedDate,
                                entries: entriesForSelectedDate.filter { $0.mealSlot == slot.rawValue },
                                onAdd: {
                                    addEntryContext = AddEntryContext(date: selectedDate, slot: slot)
                                }
                            )
                        }
                    }
                    .padding(.horizontal)
                } else {
                    ContentUnavailableView(
                        "No Child Selected",
                        systemImage: "person.crop.circle.badge.plus",
                        description: Text("Add a child profile to start planning meals.")
                    )
                    .padding(.top, 40)
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("Meal Plan")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 12) {
                    Button {
                        showingAIMealPlan = true
                    } label: {
                        Image(systemName: "wand.and.stars")
                    }
                    .accessibilityLabel("Generate AI meal plan")
                    .disabled(appState.activeKidId == nil)

                    Menu {
                        Button {
                            showingCopyWeek = true
                        } label: {
                            Label("Copy This Week", systemImage: "doc.on.doc")
                        }

                        // US-229: cross-kid copy
                        if appState.kids.count > 1 {
                            Button {
                                copyToKidId = appState.kids.first { $0.id != appState.activeKidId }?.id
                                showingCopyToKid = true
                            } label: {
                                Label("Copy to another child", systemImage: "person.2.crop.square.stack")
                            }
                        }

                        Button(role: .destructive) {
                            showingClearWeekAlert = true
                        } label: {
                            Label("Clear This Week", systemImage: "trash")
                        }

                        Divider()

                        Button {
                            showingSaveTemplate = true
                        } label: {
                            Label("Save as Template", systemImage: "square.and.arrow.down")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("More meal plan actions")

                    Button {
                        selectedDate = Date()
                    } label: {
                        Text("Today")
                            .font(.subheadline)
                    }
                }
            }
        }
        .sheet(item: $addEntryContext) { ctx in
            AddPlanEntryView(date: ctx.date, mealSlot: ctx.slot)
        }
        .sheet(isPresented: $showingAIMealPlan) {
            AIMealPlanView(date: selectedDate)
        }
        .sheet(isPresented: $showingCopyWeek) {
            NavigationStack {
                Form {
                    Section("Copy meals to another week") {
                        DatePicker("Target Week", selection: $copyTargetDate, displayedComponents: .date)
                    }
                }
                .navigationTitle("Copy Week")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingCopyWeek = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Copy") {
                            Task {
                                guard let kidId = appState.activeKidId else { return }
                                let targetStart = copyTargetDate.weekDates.first ?? copyTargetDate
                                try? await MealPlanTemplateService.shared.copyWeekPlan(
                                    from: weekStart,
                                    to: targetStart,
                                    kidId: kidId,
                                    appState: appState
                                )
                                showingCopyWeek = false
                            }
                        }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showingCopyToKid) {
            CopyWeekToKidSheet(
                weekStart: weekStart,
                sourceKidId: appState.activeKidId,
                targetKidId: $copyToKidId,
                onDismiss: { showingCopyToKid = false }
            )
            .environmentObject(appState)
        }
        .alert("Clear This Week?", isPresented: $showingClearWeekAlert) {
            Button("Clear", role: .destructive) {
                Task {
                    guard let kidId = appState.activeKidId else { return }
                    try? await MealPlanTemplateService.shared.deleteWeekPlan(
                        weekStart: weekStart,
                        kidId: kidId,
                        appState: appState
                    )
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will remove all meals planned for this week.")
        }
        .alert("Save as Template", isPresented: $showingSaveTemplate) {
            TextField("Template name", text: $templateName)
            Button("Save") {
                Task {
                    guard let kidId = appState.activeKidId, !templateName.isEmpty else { return }
                    try? await MealPlanTemplateService.shared.saveAsTemplate(
                        name: templateName,
                        weekStart: weekStart,
                        kidId: kidId,
                        appState: appState
                    )
                    templateName = ""
                }
            }
            Button("Cancel", role: .cancel) {
                templateName = ""
            }
        } message: {
            Text("Save this week's meals as a reusable template.")
        }
        .refreshable {
            await appState.loadAllData()
        }
    }
}

// MARK: - Week Navigation

struct WeekNavigationView: View {
    @Binding var selectedDate: Date
    let weekDates: [Date]

    var body: some View {
        VStack(spacing: 12) {
            // Month / Year & Navigation
            HStack {
                Button {
                    selectedDate = selectedDate.addingDays(-7)
                } label: {
                    Image(systemName: "chevron.left")
                }

                Spacer()

                Text(DateFormatter.fullDisplay.string(from: selectedDate))
                    .font(.headline)

                Spacer()

                Button {
                    selectedDate = selectedDate.addingDays(7)
                } label: {
                    Image(systemName: "chevron.right")
                }
            }
            .padding(.horizontal)

            // Day Chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(weekDates, id: \.self) { date in
                        DayChip(
                            date: date,
                            isSelected: Calendar.current.isDate(date, inSameDayAs: selectedDate),
                            isToday: Calendar.current.isDateInToday(date)
                        ) {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                selectedDate = date
                            }
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

struct DayChip: View {
    let date: Date
    let isSelected: Bool
    let isToday: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text(DateFormatter.shortDayOfWeek.string(from: date))
                    .font(.caption2)
                    .fontWeight(.medium)

                Text("\(Calendar.current.component(.day, from: date))")
                    .font(.title3)
                    .fontWeight(isSelected ? .bold : .regular)
            }
            .frame(width: 44, height: 56)
            .background(
                isSelected ? Color.green :
                    isToday ? Color.green.opacity(0.15) :
                    Color(.systemGray6),
                in: RoundedRectangle(cornerRadius: 10)
            )
            .foregroundStyle(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Meal Slot Card

struct MealSlotCard: View {
    @EnvironmentObject var appState: AppState
    let slot: MealSlot
    let date: Date
    let entries: [PlanEntry]
    let onAdd: () -> Void

    @State private var isTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Image(systemName: slot.icon)
                    .foregroundStyle(.green)

                Text(slot.displayName)
                    .font(.headline)

                Spacer()

                Button(action: onAdd) {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            // Entries
            if entries.isEmpty {
                HStack {
                    Spacer()
                    Text(isTargeted ? "Release to add to \(slot.displayName.lowercased())" : "No foods planned")
                        .font(.subheadline)
                        .foregroundStyle(isTargeted ? .green : .secondary)
                    Spacer()
                }
                .padding(.vertical, 8)
            } else {
                ForEach(entries) { entry in
                    PlanEntryRow(entry: entry, slot: slot, date: date)
                }
            }
        }
        .padding()
        .background(
            Color(.secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 12)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(isTargeted ? Color.green : Color.clear, lineWidth: 2)
        )
        .dropDestination(for: FoodTransferable.self) { droppedFoods, _ in
            guard let kidId = appState.activeKidId else {
                ToastManager.shared.error("Select a child profile first")
                return false
            }
            guard !droppedFoods.isEmpty else { return false }

            Task {
                var addedCount = 0
                for dropped in droppedFoods {
                    let entry = PlanEntry(
                        id: UUID().uuidString,
                        userId: "",
                        kidId: kidId,
                        date: DateFormatter.isoDate.string(from: date),
                        mealSlot: slot.rawValue,
                        foodId: dropped.id
                    )
                    do {
                        try await appState.addPlanEntry(entry)
                        addedCount += 1
                    } catch {
                        continue
                    }
                }
                HapticManager.success()
                await TipEvents.didDragFood.donate()
                if addedCount > 0 {
                    ToastManager.shared.success(
                        "Added to plan",
                        message: "\(addedCount) item\(addedCount == 1 ? "" : "s") for \(slot.displayName.lowercased())"
                    )
                }
            }
            return true
        } isTargeted: { targeted in
            isTargeted = targeted
            if targeted {
                HapticManager.selection()
            }
        }
    }
}

struct PlanEntryRow: View {
    @EnvironmentObject var appState: AppState
    let entry: PlanEntry
    let slot: MealSlot
    let date: Date
    @State private var showingResultPicker = false
    @State private var showingDatePicker = false
    @State private var pickedDate: Date = Date()

    private var food: Food? {
        appState.foods.first { $0.id == entry.foodId }
    }

    private var recipe: Recipe? {
        guard let recipeId = entry.recipeId else { return nil }
        return appState.recipes.first { $0.id == recipeId }
    }

    private var entryName: String {
        recipe?.name ?? food?.name ?? "this meal"
    }

    var body: some View {
        HStack(spacing: 10) {
            if let recipe = recipe {
                Image(systemName: "book.fill")
                    .foregroundStyle(.green)
                Text(recipe.name)
                    .font(.subheadline)
            } else {
                let cat = FoodCategory(rawValue: food?.category ?? "")
                Text(cat?.icon ?? "🍽")
                Text(food?.name ?? "Unknown Food")
                    .font(.subheadline)
            }

            Spacer()

            // Result Badge
            if let result = entry.result, let mealResult = MealResult(rawValue: result) {
                Label(mealResult.displayName, systemImage: mealResult.icon)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(resultColor(mealResult).opacity(0.15), in: Capsule())
                    .foregroundStyle(resultColor(mealResult))
            } else {
                Button("Log") {
                    showingResultPicker = true
                }
                .font(.caption)
                .buttonStyle(.bordered)
                .tint(.green)
            }
        }
        .confirmationDialog("How did it go?", isPresented: $showingResultPicker) {
            ForEach(MealResult.allCases, id: \.self) { result in
                Button(result.displayName) {
                    Task {
                        try? await appState.updatePlanEntry(
                            entry.id,
                            updates: PlanEntryUpdate(result: result.rawValue)
                        )
                    }
                }
            }
        }
        .contextMenu {
            ForEach(MealResult.allCases, id: \.self) { result in
                Button {
                    switch result {
                    case .ate: HapticManager.success()
                    case .tasted: HapticManager.lightImpact()
                    case .refused: HapticManager.warning()
                    }
                    Task {
                        try? await appState.updatePlanEntry(
                            entry.id,
                            updates: PlanEntryUpdate(result: result.rawValue)
                        )
                    }
                } label: {
                    Label("Log \(result.displayName)", systemImage: result.icon)
                }
            }

            Divider()

            // US-227: Duplicate submenu
            Menu {
                Button {
                    Task { await duplicate(toOffsets: [1]) }
                } label: {
                    Label("Tomorrow", systemImage: "arrow.right.to.line")
                }
                Button {
                    Task { await duplicate(toOffsets: Array(1...3)) }
                } label: {
                    Label("Next 3 days", systemImage: "calendar")
                }
                Button {
                    Task { await duplicate(toOffsets: Array(1...7)) }
                } label: {
                    Label("Next 7 days", systemImage: "calendar.badge.plus")
                }
                Button {
                    Task { await duplicateAcrossWeek() }
                } label: {
                    Label("Apply to whole week (\(slot.displayName))", systemImage: "square.fill.on.square.fill")
                }
                Divider()
                Button {
                    pickedDate = date.addingDays(1)
                    showingDatePicker = true
                } label: {
                    Label("Pick date…", systemImage: "calendar.badge.clock")
                }
            } label: {
                Label("Duplicate", systemImage: "doc.on.doc")
            }

            Divider()

            Button(role: .destructive) {
                HapticManager.error()
                Task { try? await appState.deletePlanEntry(entry.id) }
            } label: {
                Label("Remove from plan", systemImage: "trash")
            }
        }
        .sheet(isPresented: $showingDatePicker) {
            NavigationStack {
                Form {
                    Section {
                        DatePicker(
                            "Target date",
                            selection: $pickedDate,
                            displayedComponents: .date
                        )
                        .datePickerStyle(.graphical)
                    } header: {
                        Text("Duplicate \(entryName) to")
                    }
                }
                .navigationTitle("Pick date")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingDatePicker = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Duplicate") {
                            let target = pickedDate
                            showingDatePicker = false
                            Task { await duplicate(toDates: [target]) }
                        }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Duplicate helpers (US-227)

    private func duplicate(toOffsets offsets: [Int]) async {
        let dates = offsets.map { date.addingDays($0) }
        await duplicate(toDates: dates)
    }

    private func duplicateAcrossWeek() async {
        let week = date.weekDates
        // Skip the source date itself; duplicate to every other day of the week.
        let targets = week.filter { !Calendar.current.isDate($0, inSameDayAs: date) }
        await duplicate(toDates: targets)
    }

    private func duplicate(toDates dates: [Date]) async {
        guard !dates.isEmpty else { return }

        var added = 0
        var failed = 0
        for target in dates {
            let copy = PlanEntry(
                id: UUID().uuidString,
                userId: entry.userId,
                kidId: entry.kidId,
                date: DateFormatter.isoDate.string(from: target),
                mealSlot: entry.mealSlot,
                foodId: entry.foodId,
                recipeId: entry.recipeId
            )
            do {
                try await appState.addPlanEntry(copy)
                added += 1
            } catch {
                failed += 1
            }
        }

        HapticManager.success()
        if added > 0 {
            let suffix = failed > 0 ? " (\(failed) failed)" : ""
            ToastManager.shared.success(
                "Duplicated \(slot.displayName.lowercased())",
                message: "\(entryName) → \(added) day\(added == 1 ? "" : "s")\(suffix)"
            )
        } else if failed > 0 {
            ToastManager.shared.error("Couldn't duplicate \(entryName)")
        }
    }

    private func resultColor(_ result: MealResult) -> Color {
        switch result {
        case .ate: return .green
        case .tasted: return .orange
        case .refused: return .red
        }
    }
}

// MARK: - Add Plan Entry View

struct AddPlanEntryView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    let date: Date
    let mealSlot: MealSlot

    @State private var entryType = 0 // 0 = Food, 1 = Recipe
    @State private var selectedFoodId: String?
    @State private var selectedRecipeId: String?
    @State private var searchText = ""

    private var filteredFoods: [Food] {
        if searchText.isEmpty {
            return appState.foods
        }
        return appState.foods.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var filteredRecipes: [Recipe] {
        if searchText.isEmpty {
            return appState.recipes
        }
        return appState.recipes.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Image(systemName: mealSlot.icon)
                            .foregroundStyle(.green)
                        Text(mealSlot.displayName)
                            .font(.headline)
                        Spacer()
                        Text(DateFormatter.shortDisplay.string(from: date))
                            .foregroundStyle(.secondary)
                    }

                    Picker("Type", selection: $entryType) {
                        Text("Food").tag(0)
                        Text("Recipe").tag(1)
                    }
                    .pickerStyle(.segmented)
                }

                if entryType == 0 {
                    Section("Select a Food") {
                        if appState.foods.isEmpty && appState.isLoading {
                            HStack(spacing: 12) {
                                ProgressView()
                                Text("Loading foods…")
                                    .foregroundStyle(.secondary)
                            }
                        } else if filteredFoods.isEmpty {
                            Text(searchText.isEmpty
                                ? "No foods yet. Add some in Pantry first."
                                : "No foods match \"\(searchText)\".")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(filteredFoods) { food in
                                Button {
                                    selectedFoodId = food.id
                                    selectedRecipeId = nil
                                } label: {
                                    HStack {
                                        let cat = FoodCategory(rawValue: food.category)
                                        Text(cat?.icon ?? "🍽")
                                        Text(food.name)
                                            .foregroundStyle(.primary)
                                        Spacer()
                                        if selectedFoodId == food.id {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundStyle(.green)
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    Section("Select a Recipe") {
                        if appState.recipes.isEmpty && appState.isLoading {
                            HStack(spacing: 12) {
                                ProgressView()
                                Text("Loading recipes…")
                                    .foregroundStyle(.secondary)
                            }
                        } else if filteredRecipes.isEmpty {
                            Text(searchText.isEmpty
                                ? "No recipes yet. Create one in Recipes first."
                                : "No recipes match \"\(searchText)\".")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(filteredRecipes) { recipe in
                                Button {
                                    selectedRecipeId = recipe.id
                                    selectedFoodId = recipe.foodIds.first
                                } label: {
                                    HStack {
                                        Image(systemName: "book.fill")
                                            .foregroundStyle(.green)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(recipe.name)
                                                .foregroundStyle(.primary)
                                            if let difficulty = recipe.difficultyLevel {
                                                Text(difficulty.capitalized)
                                                    .font(.caption2)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                        Spacer()
                                        if selectedRecipeId == recipe.id {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundStyle(.green)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Add to Plan")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: entryType == 0 ? "Search foods..." : "Search recipes...")
            .task {
                // If the user opened the planner faster than the initial
                // data fetch could complete, kick off a load so the list
                // isn't perpetually empty. No-ops once data is present.
                if appState.foods.isEmpty && appState.recipes.isEmpty && !appState.isLoading {
                    await appState.loadAllData()
                }
            }
            .refreshable {
                await appState.loadAllData()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task { await addEntry() }
                    }
                    .disabled(selectedFoodId == nil && selectedRecipeId == nil)
                }
            }
        }
    }

    private func addEntry() async {
        guard let kidId = appState.activeKidId else {
            ToastManager.shared.error("Select a child profile first")
            return
        }

        // plan_entries.food_id is NOT NULL, so always resolve a concrete
        // food UUID. When the user picks a recipe we default to its first
        // linked ingredient (matching the web planner's behaviour).
        let resolvedFoodId: String? = {
            if let id = selectedFoodId, !id.isEmpty { return id }
            if let recipeId = selectedRecipeId,
               let recipe = appState.recipes.first(where: { $0.id == recipeId }),
               let firstFoodId = recipe.foodIds.first {
                return firstFoodId
            }
            return nil
        }()

        guard let foodId = resolvedFoodId else {
            ToastManager.shared.error(
                "Pick a food or a recipe with ingredients before adding."
            )
            return
        }

        let entry = PlanEntry(
            id: UUID().uuidString,
            userId: "",
            kidId: kidId,
            date: DateFormatter.isoDate.string(from: date),
            mealSlot: mealSlot.rawValue,
            foodId: foodId,
            recipeId: selectedRecipeId
        )

        do {
            try await appState.addPlanEntry(entry)
            dismiss()
        } catch {
            // AppState already surfaces a toast; stay on the sheet so the
            // user can correct the input.
        }
    }
}

// MARK: - Cross-Kid Copy Sheet (US-229)

struct CopyWeekToKidSheet: View {
    @EnvironmentObject var appState: AppState
    let weekStart: Date
    let sourceKidId: String?
    @Binding var targetKidId: String?
    let onDismiss: () -> Void

    @State private var isCopying = false

    private var sourceKid: Kid? {
        guard let id = sourceKidId else { return nil }
        return appState.kids.first { $0.id == id }
    }

    private var targetKid: Kid? {
        guard let id = targetKidId else { return nil }
        return appState.kids.first { $0.id == id }
    }

    private var availableTargets: [Kid] {
        appState.kids.filter { $0.id != sourceKidId }
    }

    private var sourceEntries: [PlanEntry] {
        guard let id = sourceKidId else { return [] }
        let calendar = Calendar.current
        return (0..<7).flatMap { offset in
            let date = calendar.date(byAdding: .day, value: offset, to: weekStart) ?? weekStart
            return appState.planEntriesForDate(date, kidId: id)
        }
    }

    private var slotCounts: [(slot: MealSlot, count: Int)] {
        MealSlot.allCases.map { slot in
            let n = sourceEntries.filter { $0.mealSlot == slot.rawValue }.count
            return (slot, n)
        }.filter { $0.count > 0 }
    }

    /// Foods in the source week whose allergens conflict with the target kid.
    private var conflictingFoods: [(food: Food, allergens: [String])] {
        guard let target = targetKid else { return [] }
        let targetAllergens = Set((target.allergens ?? []).map { $0.lowercased() })
        guard !targetAllergens.isEmpty else { return [] }

        var seen: Set<String> = []
        var result: [(Food, [String])] = []
        for entry in sourceEntries {
            guard !seen.contains(entry.foodId),
                  let food = appState.foods.first(where: { $0.id == entry.foodId }) else { continue }
            let foodAllergens = Set((food.allergens ?? []).map { $0.lowercased() })
            let conflict = foodAllergens.intersection(targetAllergens)
            if !conflict.isEmpty {
                seen.insert(entry.foodId)
                result.append((food, Array(conflict).sorted()))
            }
        }
        return result
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let sourceKid {
                        LabeledContent("From") { Text(sourceKid.name) }
                    }
                    if availableTargets.isEmpty {
                        Text("Add a second child profile to use this.")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("To child", selection: $targetKidId) {
                            ForEach(availableTargets) { kid in
                                Text(kid.name).tag(Optional(kid.id))
                            }
                        }
                    }
                    LabeledContent("Week of") {
                        Text(DateFormatter.shortDisplay.string(from: weekStart))
                    }
                } header: {
                    Text("Copy this week's meals")
                }

                Section("Preview") {
                    if sourceEntries.isEmpty {
                        Text("No meals planned this week.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(slotCounts, id: \.slot) { row in
                            HStack {
                                Image(systemName: row.slot.icon)
                                    .foregroundStyle(.green)
                                Text(row.slot.displayName)
                                Spacer()
                                Text("\(row.count)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        HStack {
                            Text("Total")
                                .fontWeight(.semibold)
                            Spacer()
                            Text("\(sourceEntries.count) meals")
                                .fontWeight(.semibold)
                        }
                    }
                }

                if !conflictingFoods.isEmpty {
                    Section {
                        ForEach(conflictingFoods, id: \.food.id) { row in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.food.name)
                                    .font(.subheadline)
                                Text("Allergen: \(row.allergens.joined(separator: ", "))")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    } header: {
                        Label(
                            "\(conflictingFoods.count) meal\(conflictingFoods.count == 1 ? "" : "s") will be skipped",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                    } footer: {
                        Text("These foods conflict with \(targetKid?.name ?? "the target child")'s allergens.")
                            .font(.caption2)
                    }
                }
            }
            .navigationTitle("Copy to child")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onDismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isCopying ? "Copying…" : "Copy") {
                        Task { await performCopy() }
                    }
                    .disabled(targetKidId == nil || sourceEntries.isEmpty || isCopying)
                }
            }
        }
        .presentationDetents([.large])
    }

    private func performCopy() async {
        guard let sourceId = sourceKidId,
              let targetId = targetKidId else { return }

        isCopying = true
        defer { isCopying = false }

        do {
            let result = try await MealPlanTemplateService.shared.copyWeekToOtherKid(
                weekStart: weekStart,
                sourceKidId: sourceId,
                targetKidId: targetId,
                appState: appState
            )

            HapticManager.success()
            let targetName = targetKid?.name ?? "child"
            if result.copied > 0 {
                let allergenNote = result.skippedAllergens.isEmpty
                    ? ""
                    : " — \(result.skippedCount) skipped (\(result.skippedAllergens.joined(separator: ", ")))"
                ToastManager.shared.success(
                    "Copied to \(targetName)",
                    message: "\(result.copied) meal\(result.copied == 1 ? "" : "s")\(allergenNote)"
                )
            } else if result.skippedCount > 0 {
                ToastManager.shared.warning(
                    "Nothing copied to \(targetName)",
                    message: "All meals conflict with their allergens."
                )
            }

            onDismiss()
        } catch {
            HapticManager.error()
            ToastManager.shared.error("Copy failed", message: error.localizedDescription)
        }
    }
}

#Preview {
    NavigationStack {
        MealPlanView()
    }
    .environmentObject(AppState())
}
