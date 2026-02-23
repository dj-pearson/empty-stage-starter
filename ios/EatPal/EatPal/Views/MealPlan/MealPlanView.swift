import SwiftUI

struct MealPlanView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedDate = Date()
    @State private var showingAddEntry = false
    @State private var selectedSlot: MealSlot?
    @State private var showingAIMealPlan = false
    @State private var showingCopyWeek = false
    @State private var showingClearWeekAlert = false
    @State private var showingSaveTemplate = false
    @State private var templateName = ""
    @State private var copyTargetDate = Date()

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
                                entries: entriesForSelectedDate.filter { $0.mealSlot == slot.rawValue },
                                onAdd: {
                                    selectedSlot = slot
                                    showingAddEntry = true
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

                    Menu {
                        Button {
                            showingCopyWeek = true
                        } label: {
                            Label("Copy This Week", systemImage: "doc.on.doc")
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

                    Button {
                        selectedDate = Date()
                    } label: {
                        Text("Today")
                            .font(.subheadline)
                    }
                }
            }
        }
        .sheet(isPresented: $showingAddEntry) {
            if let slot = selectedSlot {
                AddPlanEntryView(date: selectedDate, mealSlot: slot)
            }
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
    let entries: [PlanEntry]
    let onAdd: () -> Void

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
                    Text("No foods planned")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.vertical, 8)
            } else {
                ForEach(entries) { entry in
                    PlanEntryRow(entry: entry)
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct PlanEntryRow: View {
    @EnvironmentObject var appState: AppState
    let entry: PlanEntry
    @State private var showingResultPicker = false

    private var food: Food? {
        appState.foods.first { $0.id == entry.foodId }
    }

    private var recipe: Recipe? {
        guard let recipeId = entry.recipeId else { return nil }
        return appState.recipes.first { $0.id == recipeId }
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
                        if filteredFoods.isEmpty {
                            Text("No foods available")
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
                        if filteredRecipes.isEmpty {
                            Text("No recipes available")
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
        guard let kidId = appState.activeKidId else { return }

        let foodId = selectedFoodId ?? ""
        let entry = PlanEntry(
            id: UUID().uuidString,
            userId: "",
            kidId: kidId,
            date: DateFormatter.isoDate.string(from: date),
            mealSlot: mealSlot.rawValue,
            foodId: foodId,
            recipeId: selectedRecipeId
        )

        try? await appState.addPlanEntry(entry)
        dismiss()
    }
}

#Preview {
    NavigationStack {
        MealPlanView()
    }
    .environmentObject(AppState())
}
