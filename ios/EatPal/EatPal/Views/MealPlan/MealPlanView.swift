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

/// US-285: Payload for the missing-ingredient sheet. The shortfall list is
/// computed once on AddPlanEntryView dismissal and frozen here so the sheet
/// renders against a stable snapshot.
private struct ShortfallContext: Identifiable, Equatable {
    let id = UUID()
    let recipe: Recipe
    let shortfalls: [ShortfallCalculator.Shortfall]

    static func == (lhs: ShortfallContext, rhs: ShortfallContext) -> Bool {
        lhs.id == rhs.id
    }
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
    @State private var showingStarterTemplates = false
    @State private var templateName = ""
    @State private var copyTargetDate = Date()
    @State private var copyToKidId: String?
    /// US-285/US-353: recipe IDs queued for a shortfall check. A SET (not a
    /// single slot) so rapid consecutive adds — or a batch copy that adds
    /// several recipes — don't overwrite each other (the US-353 race fix).
    /// Drained + aggregated into one `shortfallContext` on the presenting
    /// sheet's dismiss.
    @State private var pendingShortfallRecipeIds: Set<String> = []
    @State private var shortfallContext: ShortfallContext?

    /// US-235: true when there's an active kid with no meals planned for this week.
    private var weekIsEmpty: Bool {
        guard let kidId = appState.activeKidId else { return false }
        return weekDates.allSatisfy { date in
            appState.planEntriesForDate(date, kidId: kidId).isEmpty
        }
    }

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

    /// The day in the order it happens. MealSlot.allCases put both snacks
    /// after dinner; a predictable routine reads top to bottom.
    static let slotsInDayOrder: [MealSlot] = [.breakfast, .snack1, .lunch, .snack2, .dinner, .tryBite]

    /// Every entry for the active kid this week, for the Clear confirmation.
    private var weekEntries: [PlanEntry] {
        guard let kidId = appState.activeKidId else { return [] }
        return weekDates.flatMap { appState.planEntriesForDate($0, kidId: kidId) }
    }

    /// "Sep 28 - Oct 4", the week the planner is showing.
    private var weekRangeText: String {
        guard let first = weekDates.first, let last = weekDates.last else { return "" }
        return "\(DateFormatter.shortDisplay.string(from: first)) - \(DateFormatter.shortDisplay.string(from: last))"
    }

    private var copyTargetWeekStart: Date {
        copyTargetDate.weekDates.first ?? copyTargetDate
    }

    private var copyTargetIsSourceWeek: Bool {
        Calendar.current.isDate(copyTargetWeekStart, inSameDayAs: weekStart)
    }

    /// Meals already planned in the copy's target week, so copying on top of
    /// them is a visible choice rather than a silent doubling.
    private var copyTargetExistingCount: Int {
        guard let kidId = appState.activeKidId else { return 0 }
        return copyTargetDate.weekDates.reduce(0) { $0 + appState.planEntriesForDate($1, kidId: kidId).count }
    }

    /// What Copy will do, said before it does it.
    private var copyWeekSummary: String {
        if weekEntries.isEmpty {
            return "Nothing is planned this week, so there is nothing to copy."
        }
        if copyTargetIsSourceWeek {
            return "Pick a different week. Copying a week onto itself would double every meal."
        }
        let count = weekEntries.count
        let who = appState.activeKid?.name ?? "this child"
        let target = DateFormatter.shortDisplay.string(from: copyTargetWeekStart)
        var text = "Copies \(count) meal\(count == 1 ? "" : "s") for \(who) to the week of \(target)."
        let existing = copyTargetExistingCount
        if existing > 0 {
            text += " That week already has \(existing) meal\(existing == 1 ? "" : "s"); these are added alongside them."
        }
        return text
    }

    // MARK: - Selected-day persistence (US-463)

    /// Per-kid last-selected planner day (kidId -> ISO yyyy-MM-dd) so a
    /// multi-day planning session survives tab switches and app relaunch
    /// instead of snapping back to today.
    @AppStorage("planner.selectedDateByKid") private var selectedDateByKidRaw = "{}"

    private func selectedDateMap() -> [String: String] {
        guard let data = selectedDateByKidRaw.data(using: .utf8),
              let map = try? JSONDecoder().decode([String: String].self, from: data)
        else { return [:] }
        return map
    }

    /// Restore the stored day for `kidId`, but never land on a past day —
    /// a stale date from a previous session would be more confusing than
    /// today, so anything before today falls back to the current default.
    private func restoreSelectedDate(for kidId: String?) {
        guard let kidId,
              let iso = selectedDateMap()[kidId],
              let stored = DateFormatter.isoDate.date(from: iso) else { return }
        let today = Calendar.current.startOfDay(for: Date())
        if Calendar.current.startOfDay(for: stored) >= today {
            selectedDate = stored
        }
    }

    private func persistSelectedDate() {
        guard let kidId = appState.activeKidId else { return }
        var map = selectedDateMap()
        map[kidId] = selectedDate.isoDateString
        if let data = try? JSONEncoder().encode(map),
           let string = String(data: data, encoding: .utf8) {
            selectedDateByKidRaw = string
        }
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
                    weekDates: weekDates,
                    kidId: appState.activeKidId
                )

                // US-235: empty-week starter prompt
                if appState.activeKidId != nil, weekIsEmpty, !appState.isLoading {
                    Button {
                        showingStarterTemplates = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "square.grid.2x2.fill")
                                .foregroundStyle(.green)
                                .imageScale(.large)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Empty week — start from a template?")
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(.primary)
                                Text("Apply a curated week, then tweak.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.tertiary)
                        }
                        .padding(12)
                        .background(Color.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)
                    .accessibilityLabel("Start from a meal-plan template")
                }

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
                        ForEach(Self.slotsInDayOrder, id: \.self) { slot in
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
                    // US-705: the empty state can now do the thing it asks for.
                    ContentUnavailableView {
                        Label("No child yet", systemImage: "person.crop.circle.badge.plus")
                    } description: {
                        Text("Meal plans are built per child, so there is nobody to plan for yet.")
                    } actions: {
                        AddFirstChildCard(style: .action)
                    }
                    .padding(.top, 40)
                }
            }
            .padding(.vertical)
        }
        // Whose plan this is, even with one child and the selector hidden.
        .navigationTitle(appState.activeKid.map { "\($0.name)'s plan" } ?? "Meal Plan")
        // US-463: restore/persist the selected planner day per active kid.
        .onAppear { restoreSelectedDate(for: appState.activeKidId) }
        .onChange(of: appState.activeKidId) { _, newKidId in
            restoreSelectedDate(for: newKidId)
        }
        .onChange(of: selectedDate) { _, _ in
            persistSelectedDate()
        }
        .toolbar {
            // "Today" sits apart from the actions that write to the plan, so
            // a tap aimed at it can't land on AI or the menu instead.
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    selectedDate = Date()
                } label: {
                    Text("Today")
                        .font(.subheadline)
                }
                .disabled(Calendar.current.isDateInToday(selectedDate))
            }
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 12) {
                    Button {
                        showingAIMealPlan = true
                    } label: {
                        Image(systemName: "wand.and.stars")
                    }
                    // It plans the selected day, not the week.
                    .accessibilityLabel("AI meal ideas for \(DateFormatter.fullDisplay.string(from: selectedDate))")
                    .disabled(appState.activeKidId == nil)

                    Menu {
                        Button {
                            showingStarterTemplates = true
                        } label: {
                            Label("Start from a template", systemImage: "square.grid.2x2")
                        }

                        Button {
                            // Default to next week: today's date would copy
                            // the week onto itself and double every meal.
                            copyTargetDate = weekStart.addingDays(7)
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

                        Button {
                            showingSaveTemplate = true
                        } label: {
                            Label("Save as Template", systemImage: "square.and.arrow.down")
                        }

                        // Destructive last, after a divider, away from the
                        // actions used every week.
                        Divider()

                        Button(role: .destructive) {
                            showingClearWeekAlert = true
                        } label: {
                            Label("Clear This Week", systemImage: "trash")
                        }
                        .disabled(weekEntries.isEmpty)
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("More meal plan actions")
                }
            }
        }
        .sheet(item: $addEntryContext, onDismiss: presentPendingShortfall) { ctx in
            AddPlanEntryView(
                date: ctx.date,
                mealSlot: ctx.slot,
                onRecipeAdded: { recipe in
                    // US-285/US-353: queue the recipe id; the shortfall is
                    // aggregated on dismiss so the user sees one sheet even
                    // after several rapid adds.
                    pendingShortfallRecipeIds.insert(recipe.id)
                }
            )
        }
        .sheet(item: $shortfallContext) { ctx in
            MissingIngredientsSheet(
                recipe: ctx.recipe,
                shortfalls: ctx.shortfalls,
                onFinish: { _ in
                    shortfallContext = nil
                }
            )
            .environmentObject(appState)
        }
        .sheet(isPresented: $showingAIMealPlan) {
            AIMealPlanView(date: selectedDate)
        }
        .sheet(isPresented: $showingCopyWeek) {
            NavigationStack {
                Form {
                    Section {
                        DatePicker("Target week", selection: $copyTargetDate, displayedComponents: .date)
                    } header: {
                        Text("Copy meals to another week")
                    } footer: {
                        Text(copyWeekSummary)
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
                                let targetStart = copyTargetWeekStart
                                // US-415: surface success/failure and only close
                                // the sheet on a confirmed copy.
                                do {
                                    let copied = try await MealPlanTemplateService.shared.copyWeekPlan(
                                        from: weekStart,
                                        to: targetStart,
                                        kidId: kidId,
                                        appState: appState
                                    )
                                    HapticManager.success()
                                    ToastManager.shared.success(
                                        "Week copied",
                                        message: "\(copied) meal\(copied == 1 ? "" : "s") to the week of \(DateFormatter.shortDisplay.string(from: targetStart))"
                                    )
                                    showingCopyWeek = false
                                } catch {
                                    HapticManager.error()
                                    ToastManager.shared.error(
                                        "Couldn't copy week",
                                        message: "Please try again."
                                    )
                                }
                            }
                        }
                        .disabled(weekEntries.isEmpty || copyTargetIsSourceWeek)
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showingCopyToKid, onDismiss: presentPendingShortfall) {
            CopyWeekToKidSheet(
                weekStart: weekStart,
                sourceKidId: appState.activeKidId,
                targetKidId: $copyToKidId,
                // US-353: queue the copied recipe-backed entries so the
                // missing-ingredient prompt fires for the copy-to-kid path too.
                onApplied: { recipeIds in pendingShortfallRecipeIds.formUnion(recipeIds) },
                onDismiss: { showingCopyToKid = false }
            )
            .environmentObject(appState)
        }
        .sheet(isPresented: $showingStarterTemplates) {
            StarterTemplatesSheet(weekStart: weekStart)
                .environmentObject(appState)
        }
        .alert("Clear This Week?", isPresented: $showingClearWeekAlert) {
            Button("Clear", role: .destructive) {
                Task {
                    guard let kidId = appState.activeKidId else { return }
                    // US-415: surface success/failure instead of a silent try?
                    // that left entries to reappear on next load with no notice.
                    // Snapshot the whole week first so this bulk-destructive
                    // action can be undone (parity with Clear Completed grocery
                    // and the remove-from-plan undo above).
                    let snapshot = (0..<7).flatMap { offset -> [PlanEntry] in
                        let date = Calendar.current.date(
                            byAdding: .day, value: offset, to: weekStart
                        ) ?? weekStart
                        return appState.planEntriesForDate(date, kidId: kidId)
                    }
                    do {
                        try await MealPlanTemplateService.shared.deleteWeekPlan(
                            weekStart: weekStart,
                            kidId: kidId,
                            appState: appState
                        )
                        HapticManager.success()
                        if snapshot.isEmpty {
                            ToastManager.shared.success("Week cleared")
                        } else {
                            ToastManager.shared.show(Toast(
                                type: .success,
                                title: "Week cleared",
                                message: "\(snapshot.count) meal\(snapshot.count == 1 ? "" : "s") removed",
                                duration: 6,
                                actionLabel: "Undo",
                                retry: {
                                    do {
                                        for entry in snapshot {
                                            try await appState.addPlanEntry(entry, silent: true)
                                        }
                                        ToastManager.shared.success("Week restored")
                                        HapticManager.success()
                                    } catch {
                                        ToastManager.shared.error(
                                            "Couldn't undo",
                                            message: "Some meals may need to be re-added manually."
                                        )
                                    }
                                }
                            ))
                        }
                    } catch {
                        HapticManager.error()
                        ToastManager.shared.error(
                            "Couldn't clear week",
                            message: "Please try again."
                        )
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(clearWeekMessage)
        }
        .alert("Save as Template", isPresented: $showingSaveTemplate) {
            TextField("Template name", text: $templateName)
            Button("Save") {
                let name = templateName.trimmingCharacters(in: .whitespacesAndNewlines)
                templateName = ""
                Task {
                    guard let kidId = appState.activeKidId else { return }
                    guard !name.isEmpty else {
                        ToastManager.shared.warning("Template not saved", message: "Give it a name first.")
                        return
                    }
                    // The service toasts success; a failure used to vanish
                    // into try?.
                    do {
                        try await MealPlanTemplateService.shared.saveAsTemplate(
                            name: name,
                            weekStart: weekStart,
                            kidId: kidId,
                            appState: appState
                        )
                    } catch {
                        HapticManager.error()
                        ToastManager.shared.show(error, as: { .save(entity: "template", underlying: $0) })
                    }
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

    /// Names the child, the week and the count, and says when logged results
    /// go with it, so "Clear" is never a guess.
    private var clearWeekMessage: String {
        let entries = weekEntries
        let who = appState.activeKid?.name ?? "this child"
        var text = "Removes all \(entries.count) meal\(entries.count == 1 ? "" : "s") planned for \(who), \(weekRangeText)."
        let logged = entries.filter { $0.result != nil }.count
        if logged > 0 {
            text += " \(logged) of them already have a logged result, which will be removed too."
        }
        return text
    }

    /// US-285/US-353: run after any add/copy sheet closes. Aggregates the
    /// shortfall across every queued recipe (legacy `food_ids` recipes
    /// included, via ShortfallChecker) and presents ONE missing-ingredient
    /// sheet. Silent no-op when nothing is short. Drains the queue so the same
    /// recipes don't re-prompt.
    private func presentPendingShortfall() {
        let ids = pendingShortfallRecipeIds
        pendingShortfallRecipeIds = []
        guard !ids.isEmpty else { return }

        let recipes = appState.recipes.filter { ids.contains($0.id) }
        guard !recipes.isEmpty else { return }

        let shortfalls = ShortfallChecker.aggregate(recipes: recipes, pantry: appState.foods)
        guard !shortfalls.isEmpty else { return }

        // Single recipe → show its name; multiple → a synthetic header (its id
        // is unused, the sheet sources each row by its own ingredient.recipeId).
        let header: Recipe = recipes.count == 1
            ? recipes[0]
            : Recipe(id: "", userId: recipes[0].userId, name: "Your plan", foodIds: [])

        shortfallContext = ShortfallContext(recipe: header, shortfalls: shortfalls)
    }
}

// MARK: - Week Navigation

struct WeekNavigationView: View {
    @EnvironmentObject var appState: AppState
    @Binding var selectedDate: Date
    let weekDates: [Date]
    /// The child whose meals the day chips count. Nil hides the counts.
    var kidId: String? = nil

    private func mealCount(on date: Date) -> Int {
        guard let kidId else { return 0 }
        return appState.planEntriesForDate(date, kidId: kidId).count
    }

    /// "Sep 28 - Oct 4": the week is what the arrows move, so it's the title.
    private var rangeText: String {
        guard let first = weekDates.first, let last = weekDates.last else {
            return DateFormatter.fullDisplay.string(from: selectedDate)
        }
        return "\(DateFormatter.shortDisplay.string(from: first)) - \(DateFormatter.shortDisplay.string(from: last))"
    }

    var body: some View {
        VStack(spacing: 12) {
            // Month / Year & Navigation
            HStack {
                Button {
                    selectedDate = selectedDate.addingDays(-7)
                } label: {
                    Image(systemName: "chevron.left")
                }
                .accessibilityLabel("Previous week")

                Spacer()

                Text(rangeText)
                    .font(.headline)
                    .accessibilityLabel("Week of \(rangeText)")

                Spacer()

                Button {
                    selectedDate = selectedDate.addingDays(7)
                } label: {
                    Image(systemName: "chevron.right")
                }
                .accessibilityLabel("Next week")
            }
            .padding(.horizontal)

            // Day Chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(weekDates, id: \.self) { date in
                        DayChip(
                            date: date,
                            isSelected: Calendar.current.isDate(date, inSameDayAs: selectedDate),
                            isToday: Calendar.current.isDateInToday(date),
                            mealCount: mealCount(on: date)
                        ) {
                            // US-246: respect Reduce Motion on the day-switch
                            // animation; users on reduce motion see an instant
                            // selection change instead of the chip slide.
                            accessibleWithAnimation(
                                .easeInOut(duration: 0.2),
                                reduceMotion: UIAccessibility.isReduceMotionEnabled
                            ) {
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
    /// Meals planned that day; a dot marks days with any, so gaps in the
    /// week show without tapping through all seven.
    var mealCount: Int = 0
    let action: () -> Void

    // US-424: scale the chip with Dynamic Type so the day-of-week label and
    // date number don't clip at larger accessibility text sizes (was a fixed
    // 44x56 frame).
    @ScaledMetric(relativeTo: .title3) private var chipWidth: CGFloat = 44
    @ScaledMetric(relativeTo: .title3) private var chipHeight: CGFloat = 56

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text(DateFormatter.shortDayOfWeek.string(from: date))
                    .font(.caption2)
                    .fontWeight(.medium)

                Text("\(Calendar.current.component(.day, from: date))")
                    .font(.title3)
                    .fontWeight(isSelected ? .bold : .regular)

                Circle()
                    .fill(isSelected ? Color.white : Color.green)
                    .frame(width: 5, height: 5)
                    .opacity(mealCount > 0 ? 1 : 0)
            }
            .frame(minWidth: chipWidth, minHeight: chipHeight)
            .background(
                isSelected ? Color.green :
                    isToday ? Color.green.opacity(0.15) :
                    Color(.systemGray6),
                in: RoundedRectangle(cornerRadius: 10)
            )
            .foregroundStyle(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
        // US-372: announce full context instead of just the day number.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private var spokenLabel: String {
        var label = DayChip.accessibilityLabel.string(from: date)
        if isToday { label += ", today" }
        if mealCount == 0 {
            label += ", nothing planned"
        } else {
            label += ", \(mealCount) meal\(mealCount == 1 ? "" : "s")"
        }
        return label
    }

    /// Full "Monday, June 14" style label for VoiceOver.
    private static let accessibilityLabel: DateFormatter = {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        return formatter
    }()
}

// MARK: - Meal Slot Card

struct MealSlotCard: View {
    @EnvironmentObject var appState: AppState
    let slot: MealSlot
    let date: Date
    let entries: [PlanEntry]
    let onAdd: () -> Void

    @State private var isTargeted = false

    /// A main meal with food on it but nothing the child reliably eats: a
    /// food marked safe, or one on their "always eats" list.
    private var needsSafeFood: Bool {
        guard [.breakfast, .lunch, .dinner].contains(slot), !entries.isEmpty,
              let kid = appState.activeKid else { return false }
        let always = Set((kid.alwaysEatsFoods ?? []).map { $0.lowercased() })
        let hasFamiliar = entries.contains { entry in
            var ids = [entry.foodId]
            if let rid = entry.recipeId, let recipe = appState.recipes.first(where: { $0.id == rid }) {
                ids += recipe.foodIds
            }
            return ids.contains { id in
                guard let food = appState.foods.first(where: { $0.id == id }) else { return false }
                return (food.isSafe || always.contains(food.name.lowercased()))
                    && AllergenMatcher.hit(for: kid, food: food) == nil
            }
        }
        return !hasFamiliar
    }

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
                        // US-423: ensure a 44pt hit target for the primary add.
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Add to \(slot.displayName)")
            }

            // Entries
            if entries.isEmpty {
                HStack {
                    Spacer()
                    Text(isTargeted
                         ? "Release to add to \(slot.displayName.lowercased())"
                         : (slot == .tryBite ? "Pick a gentle try bite" : "No foods planned"))
                        .font(.subheadline)
                        .foregroundStyle(isTargeted ? .green : .secondary)
                    Spacer()
                }
                .padding(.vertical, 8)
            } else {
                ForEach(entries) { entry in
                    PlanEntryRow(entry: entry, slot: slot, date: date)
                }
                if needsSafeFood {
                    Label("No safe food in this meal yet", systemImage: "info.circle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                } else if slot == .tryBite {
                    Text("Just on the plate. No bite needed.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
                var blocked: [String] = []
                let kid = appState.kids.first { $0.id == kidId }
                for dropped in droppedFoods {
                    // Same allergen guard as the picker: a drag is still an add.
                    if let kid, let food = appState.foods.first(where: { $0.id == dropped.id }),
                       let hit = AllergenMatcher.hit(for: kid, food: food) {
                        blocked.append("\(food.name) (\(hit))")
                        continue
                    }
                    let entry = PlanEntry(
                        id: UUID().uuidString,
                        userId: "",
                        kidId: kidId,
                        date: DateFormatter.isoDate.string(from: date),
                        mealSlot: slot.rawValue,
                        foodId: dropped.id
                    )
                    do {
                        try await appState.addPlanEntry(entry, silent: true)
                        addedCount += 1
                    } catch {
                        continue
                    }
                }
                if !blocked.isEmpty {
                    HapticManager.error()
                    ToastManager.shared.warning(
                        "Not added for \(kid?.name ?? "this child")",
                        message: "Allergen: \(blocked.joined(separator: ", "))"
                    )
                } else {
                    HapticManager.success()
                }
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
    // US-350: confirm whether to restore pantry when deleting a made meal.
    @State private var showingDeleteRestore = false
    /// US-231: post-result feedback sheet. Wrapper is Identifiable so we
    /// can present it via .sheet(item:) and pass the entry name + result.
    @State private var feedbackContext: MealFeedbackContext?

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

    /// US-348: advisory, read-only pantry coverage for a recipe-backed row.
    /// Recomputes from `appState.foods` so it stays live as the pantry or
    /// plan changes (AC5). nil → no badge (AC4).
    private var coverage: PantryCoverage? {
        guard let recipe = recipe else { return nil }
        return PantryCoverage.compute(recipe: recipe, pantry: appState.foods)
    }

    /// US-348: present the missing-ingredients sheet for an actionable badge.
    @State private var coverageShortfallContext: CoverageShortfall?

    /// The allergen in this meal for the child it's planned for, if any.
    private var allergenHit: String? {
        guard let kid = appState.kids.first(where: { $0.id == entry.kidId }) else { return nil }
        return MealPlanTemplateService.allergenHit(entry: entry, kid: kid, appState: appState)
    }

    /// Results are for meals that have happened (or are happening today).
    private var isFutureDay: Bool {
        Calendar.current.startOfDay(for: date) > Calendar.current.startOfDay(for: Date())
    }

    /// US-608: the ladder row this entry is an exposure for, when there is
    /// one. Only active rows get the one-tap controls — a paused or mastered
    /// food is not something we should be asking about at the table.
    private var ladderRow: KidFoodLadder? {
        guard entry.recipeId == nil,
              let row = appState.ladderRow(kidId: entry.kidId, foodId: entry.foodId),
              row.ladderStatus == .active
        else { return nil }
        return row
    }

    var body: some View {
        HStack(spacing: 10) {
            if let recipe = recipe {
                Image(systemName: "book.fill")
                    .foregroundStyle(.green)
                VStack(alignment: .leading, spacing: 1) {
                    Text(recipe.name)
                        .font(.subheadline)
                    allergenCaption
                }
            } else {
                let cat = FoodCategory(rawValue: food?.category ?? "")
                Text(cat?.icon ?? "🍽")
                VStack(alignment: .leading, spacing: 1) {
                    Text(food?.name ?? "Unknown Food")
                        .font(.subheadline)
                    // US-608: name the step, so the parent knows what is
                    // actually being asked of the child at this meal.
                    if let ladderRow = ladderRow {
                        Text("\(ladderRow.rung.emoji) \(ladderRow.rung.displayName)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    allergenCaption
                }
            }

            // US-348: pantry-coverage badge (advisory; never debits).
            if let coverage = coverage {
                coverageBadge(coverage)
            }

            Spacer()

            // Result Badge. Tappable, so a wrong log is fixed with one tap
            // instead of a hidden long-press.
            if let result = entry.result, let mealResult = MealResult(rawValue: result) {
                Button {
                    showingResultPicker = true
                } label: {
                    Label(mealResult.displayName, systemImage: mealResult.icon)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(resultColor(mealResult).opacity(0.15), in: Capsule())
                        .foregroundStyle(resultColor(mealResult))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Logged \(mealResult.displayName)")
                .accessibilityHint("Change what was logged")
            } else if isFutureDay {
                // Nothing to log yet; keeps a sitter from logging tomorrow.
                EmptyView()
            } else if let ladderRow = ladderRow {
                // US-608: three taps, no modal. The full detail sheet is
                // still reachable from the tracker for parents who want to
                // capture mood, prep and strategies — this is the version
                // that survives an actual dinner.
                LadderQuickLogControls(row: ladderRow, planEntryId: entry.id, mealSlot: slot.rawValue)
            } else {
                Button("Log") {
                    showingResultPicker = true
                }
                .font(.caption)
                .buttonStyle(.bordered)
                .tint(.green)
                .accessibilityLabel("Log how \(entryName) went")
            }
        }
        .confirmationDialog("How did it go?", isPresented: $showingResultPicker) {
            ForEach(MealResult.allCases, id: \.self) { result in
                Button(result.displayName) {
                    Task { await logResult(result) }
                }
            }
        }
        // US-348: tapping an actionable coverage badge opens the existing
        // missing-ingredients sheet for that recipe.
        .sheet(item: $coverageShortfallContext) { ctx in
            MissingIngredientsSheet(
                recipe: ctx.recipe,
                shortfalls: ShortfallCalculator.compute(recipe: ctx.recipe, pantry: appState.foods),
                onFinish: { _ in coverageShortfallContext = nil }
            )
            .environmentObject(appState)
        }
        .contextMenu {
            if !isFutureDay {
                ForEach(MealResult.allCases, id: \.self) { result in
                    Button {
                        // A declined food gets the same light tap as a taste,
                        // not a warning buzz.
                        switch result {
                        case .ate: HapticManager.success()
                        case .tasted, .refused: HapticManager.lightImpact()
                        }
                        Task { await logResult(result) }
                    } label: {
                        Label("Log \(result.displayName)", systemImage: result.icon)
                    }
                }
            }

            // US-262: "Made it" debits pantry foods + auto-checks
            // recipe-sourced grocery items in one server-side
            // transaction. Only meaningful when the entry has a recipe.
            if entry.recipeId != nil {
                Divider()
                Button {
                    HapticManager.success()
                    Task { try? await appState.markPlanEntryMade(entry.id) }
                } label: {
                    Label("Made it", systemImage: "fork.knife.circle.fill")
                }
                // US-349: undo the most recent "Made it" — re-credits the
                // pantry and re-opens any auto-checked grocery items.
                if appState.wasRecentlyMarkedMade(entry.id) {
                    Button {
                        HapticManager.lightImpact()
                        Task { await appState.undoMealMade(entry.id) }
                    } label: {
                        Label("Undo \"Made it\"", systemImage: "arrow.uturn.backward")
                    }
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

            // US-471: weekly recurrence on the source weekday (e.g. every
            // Tuesday) for a bounded number of weeks.
            Menu {
                Button {
                    Task { await repeatWeekly(weeks: 2) }
                } label: {
                    Label("For 2 weeks", systemImage: "repeat")
                }
                Button {
                    Task { await repeatWeekly(weeks: 4) }
                } label: {
                    Label("For 4 weeks", systemImage: "repeat")
                }
                Button {
                    Task { await repeatWeekly(weeks: 8) }
                } label: {
                    Label("For 8 weeks", systemImage: "repeat")
                }
            } label: {
                Label("Repeat every \(DateFormatter.dayOfWeek.string(from: date))", systemImage: "repeat")
            }

            Divider()

            Button(role: .destructive) {
                HapticManager.error()
                // US-350: if this meal was marked made, deleting it would
                // otherwise leave the pantry debited with no recourse — ask
                // whether to restore first.
                if appState.wasRecentlyMarkedMade(entry.id) {
                    showingDeleteRestore = true
                } else {
                    removeEntry(restoreFirst: false, allowUndo: true)
                }
            } label: {
                Label("Remove from plan", systemImage: "trash")
            }
        }
        // US-350: restore-on-delete confirmation for a made meal.
        .confirmationDialog(
            "This meal was marked made",
            isPresented: $showingDeleteRestore,
            titleVisibility: .visible
        ) {
            Button("Restore ingredients & remove") {
                // US-415: surface failures; no undo (pantry was re-credited).
                removeEntry(restoreFirst: true, allowUndo: false)
            }
            Button("Just remove", role: .destructive) {
                removeEntry(restoreFirst: false, allowUndo: true)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Restore its ingredients to your pantry before removing it from the plan?")
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
        // US-231: post-result feedback. Non-blocking — `.sheet(item:)` so
        // the row isn't paused waiting for it; the parent can swipe-down
        // (or hit Skip / let the auto-dismiss timer fire) at any time.
        .sheet(item: $feedbackContext) { context in
            MealFeedbackSheet(
                planEntryId: context.id,
                entryName: context.entryName,
                result: context.result
            )
        }
    }

    // MARK: - Result logging (US-231)

    /// US-415: remove an entry, surfacing failures (was a silent try?) and —
    /// for the plain remove — offering an Undo that re-adds it. `restoreFirst`
    /// covers the made-meal path that restores pantry stock before removing.
    private func removeEntry(restoreFirst: Bool, allowUndo: Bool) {
        let snapshot = entry
        Task {
            if restoreFirst { await appState.undoMealMade(snapshot.id) }
            do {
                try await appState.deletePlanEntry(snapshot.id)
                HapticManager.success()
                if allowUndo {
                    ToastManager.shared.show(Toast(
                        type: .success,
                        title: "Removed from plan",
                        actionLabel: "Undo",
                        retry: {
                            do { try await appState.addPlanEntry(snapshot) }
                            catch {
                                ToastManager.shared.error(
                                    "Couldn't undo",
                                    message: "Please re-add the meal manually."
                                )
                            }
                        }
                    ))
                }
            } catch {
                HapticManager.error()
                ToastManager.shared.error(
                    "Couldn't remove meal",
                    message: "Please try again.",
                    retry: { removeEntry(restoreFirst: restoreFirst, allowUndo: allowUndo) }
                )
            }
        }
    }

    /// Red caption naming the allergen, shown under the meal's name.
    @ViewBuilder
    private var allergenCaption: some View {
        if let hit = allergenHit {
            let who = appState.kids.first(where: { $0.id == entry.kidId })?.name ?? "this child"
            Label("Contains \(hit): \(who) is allergic", systemImage: "exclamationmark.octagon.fill")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.red)
        }
    }

    /// Persists the result, then surfaces the optional 1-5 feedback sheet.
    /// Pulled out so the confirmationDialog and contextMenu paths share
    /// one definition — both used to call updatePlanEntry inline.
    private func logResult(_ result: MealResult) async {
        do {
            try await appState.updatePlanEntry(
                entry.id,
                updates: PlanEntryUpdate(result: result.rawValue)
            )
            // Only prompt for feedback once per (entry, parent) — if there's
            // already a rating on file, skip the modal so re-logging doesn't
            // pester the user. They can still re-rate via a future detail
            // view if we add one.
            // No rating prompt for a declined food: rating a food the child
            // didn't eat turns an exposure into a verdict.
            if result != .refused, !appState.hasOwnFeedback(for: entry.id) {
                feedbackContext = MealFeedbackContext(
                    id: entry.id,
                    entryName: entryName,
                    result: result
                )
            }
        } catch {
            // updatePlanEntry already raised an error toast.
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
                try await appState.addPlanEntry(copy, silent: true)
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

    /// US-471: copy this entry onto the same weekday for the next `weeks`
    /// weeks (bounded 1...8). Same slot/kid as the source, so allergen +
    /// audience rules are inherited. The whole batch is undoable via the
    /// toast action, which deletes the just-inserted rows.
    private func repeatWeekly(weeks: Int) async {
        let n = max(1, min(weeks, 8))
        let targets = (1...n).map { date.addingDays(7 * $0) }

        var insertedIds: [String] = []
        var failed = 0
        for target in targets {
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
                try await appState.addPlanEntry(copy, silent: true)
                insertedIds.append(copy.id)
            } catch {
                failed += 1
            }
        }

        HapticManager.success()
        guard !insertedIds.isEmpty else {
            if failed > 0 { ToastManager.shared.error("Couldn't repeat \(entryName)") }
            return
        }

        let ids = insertedIds
        let weekday = DateFormatter.dayOfWeek.string(from: date)
        let suffix = failed > 0 ? " (\(failed) failed)" : ""
        ToastManager.shared.show(Toast(
            type: .success,
            title: "Repeating \(entryName)",
            message: "\(ids.count) \(weekday)\(ids.count == 1 ? "" : "s")\(suffix)",
            actionLabel: "Undo",
            retry: { @MainActor in
                for id in ids { try? await appState.deletePlanEntry(id) }
            }
        ))
    }

    private func resultColor(_ result: MealResult) -> Color {
        result.tint
    }

    /// US-348: the coverage badge. Fully-stocked is informational; partial/not
    /// is a button that opens the missing-ingredients sheet.
    @ViewBuilder
    private func coverageBadge(_ coverage: PantryCoverage) -> some View {
        let content = Image(systemName: coverage.icon)
            .font(.caption2)
            .foregroundStyle(coverage.color)
            .padding(4)
            .background(coverage.color.opacity(0.15), in: Circle())
            .accessibilityLabel(coverage.accessibilityLabel)

        if coverage.isActionable, let recipe = recipe {
            Button {
                coverageShortfallContext = CoverageShortfall(recipe: recipe)
            } label: {
                content
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens missing ingredients")
        } else {
            content
        }
    }
}

/// US-348: Identifiable wrapper so the coverage badge can drive a
/// `.sheet(item:)` for the missing-ingredients flow.
private struct CoverageShortfall: Identifiable, Equatable {
    let recipe: Recipe
    var id: String { recipe.id }
}

// MARK: - Add Plan Entry View

struct AddPlanEntryView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    let date: Date
    let mealSlot: MealSlot
    /// US-285: parent hook fired right before dismissal when the user
    /// added a recipe-backed entry. The parent uses this to queue a
    /// missing-ingredient shortfall sheet after this sheet closes (two
    /// sheets in flight at once jitter in SwiftUI; queue → present).
    var onRecipeAdded: ((Recipe) -> Void)? = nil

    @State private var entryType = 0 // 0 = Food, 1 = Recipe
    @State private var selectedFoodId: String?
    @State private var selectedRecipeId: String?
    @State private var searchText = ""
    /// Siblings to add the same meal for, so a shared family dinner is one
    /// add rather than one per child.
    @State private var alsoForKidIds: Set<String> = []
    /// Set when the pick contains the child's allergen; the add waits for an
    /// explicit "Add anyway".
    @State private var pendingAllergenWarning: String?

    private var activeKid: Kid? { appState.activeKid }

    private var siblings: [Kid] {
        appState.kids.filter { $0.id != appState.activeKidId }
    }

    private func allergen(in food: Food, for kid: Kid?) -> String? {
        guard let kid else { return nil }
        return AllergenMatcher.hit(for: kid, food: food)
    }

    private func allergen(in recipe: Recipe, for kid: Kid?) -> String? {
        guard let kid else { return nil }
        let ids = recipe.foodIds + recipe.ingredients.compactMap(\.foodId)
        for id in ids {
            guard let food = appState.foods.first(where: { $0.id == id }) else { continue }
            if let hit = AllergenMatcher.hit(for: kid, food: food) { return hit }
        }
        return nil
    }

    /// Expired food is left out: it shouldn't be offered for a meal. Safe
    /// foods come first, then the rest, and anything carrying this child's
    /// allergen sinks to the bottom with a red label.
    private var filteredFoods: [Food] {
        let base = appState.foods.filter { !$0.isExpired }
        let matched = searchText.isEmpty
            ? base
            : base.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
        // Rank each food once; the matcher is too costly to run per compare.
        let ranked = matched.enumerated().map { offset, food -> (offset: Int, rank: Int, food: Food) in
            let rank = allergen(in: food, for: activeKid) != nil ? 2 : (food.isSafe ? 0 : 1)
            return (offset, rank, food)
        }
        return ranked
            .sorted { $0.rank != $1.rank ? $0.rank < $1.rank : $0.offset < $1.offset }
            .map(\.food)
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

                    if let kid = activeKid {
                        LabeledContent("For", value: kid.name)
                        if let allergens = kid.allergens, !allergens.isEmpty {
                            Label("Allergies: \(allergens.joined(separator: ", "))", systemImage: "exclamationmark.triangle.fill")
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
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
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(food.name)
                                                .foregroundStyle(.primary)
                                            if let hit = allergen(in: food, for: activeKid) {
                                                Text("Contains \(hit)")
                                                    .font(.caption)
                                                    .fontWeight(.semibold)
                                                    .foregroundStyle(.red)
                                            } else if food.isSafe || food.isTryBite || food.isExpiringSoon() {
                                                Text([
                                                    food.isSafe ? "Safe food" : nil,
                                                    food.isTryBite ? "Try bite" : nil,
                                                    food.isExpiringSoon() ? "Use soon" : nil,
                                                ].compactMap { $0 }.joined(separator: " · "))
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
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
                                    // The food id is resolved from the recipe at
                                    // add time; setting it here left the Food
                                    // tab showing a food as picked.
                                    selectedRecipeId = recipe.id
                                    selectedFoodId = nil
                                } label: {
                                    HStack {
                                        Image(systemName: "book.fill")
                                            .foregroundStyle(.green)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(recipe.name)
                                                .foregroundStyle(.primary)
                                            if let hit = allergen(in: recipe, for: activeKid) {
                                                Text("Contains \(hit)")
                                                    .font(.caption2)
                                                    .fontWeight(.semibold)
                                                    .foregroundStyle(.red)
                                            } else if let difficulty = recipe.difficultyLevel {
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
            .safeAreaInset(edge: .bottom) {
                if !siblings.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Also add for")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(siblings) { sibling in
                                    Toggle(sibling.name, isOn: Binding(
                                        get: { alsoForKidIds.contains(sibling.id) },
                                        set: { on in
                                            if on { alsoForKidIds.insert(sibling.id) } else { alsoForKidIds.remove(sibling.id) }
                                        }
                                    ))
                                    .toggleStyle(.button)
                                    .buttonStyle(.bordered)
                                    .tint(.green)
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(.bar)
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
                        if let warning = selectionAllergenWarning {
                            pendingAllergenWarning = warning
                        } else {
                            Task { await addEntry() }
                        }
                    }
                    .disabled(selectedFoodId == nil && selectedRecipeId == nil)
                }
            }
            .alert(
                "Contains an allergen",
                isPresented: Binding(
                    get: { pendingAllergenWarning != nil },
                    set: { if !$0 { pendingAllergenWarning = nil } }
                ),
                presenting: pendingAllergenWarning
            ) { _ in
                Button("Add anyway", role: .destructive) {
                    pendingAllergenWarning = nil
                    Task { await addEntry() }
                }
                Button("Cancel", role: .cancel) { pendingAllergenWarning = nil }
            } message: { warning in
                Text(warning)
            }
        }
    }

    /// "Contains peanut, which Maya is allergic to." for the current pick,
    /// or nil when it's clear for the child being planned.
    private var selectionAllergenWarning: String? {
        guard let kid = activeKid else { return nil }
        let hit: String?
        if let recipeId = selectedRecipeId,
           let recipe = appState.recipes.first(where: { $0.id == recipeId }) {
            hit = allergen(in: recipe, for: kid)
        } else if let foodId = selectedFoodId,
                  let food = appState.foods.first(where: { $0.id == foodId }) {
            hit = allergen(in: food, for: kid)
        } else {
            hit = nil
        }
        return hit.map { "Contains \($0), which \(kid.name) is allergic to." }
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
               let recipe = appState.recipes.first(where: { $0.id == recipeId }) {
                // US-357: prefer a legacy linked food, then fall back to a
                // structured ingredient's foodId (US-354) so imported recipes
                // without `foodIds` aren't trapped as unplannable.
                if let firstFoodId = recipe.foodIds.first { return firstFoodId }
                if let linked = recipe.ingredients.compactMap(\.foodId).first { return linked }
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
            await addForSiblings(foodId: foodId)
            // US-285: fire the recipe-added hook before dismissing so the
            // parent can queue the missing-ingredient shortfall sheet.
            if let recipeId = selectedRecipeId,
               let recipe = appState.recipes.first(where: { $0.id == recipeId }) {
                onRecipeAdded?(recipe)
            }
            dismiss()
        } catch {
            // AppState already surfaces a toast; stay on the sheet so the
            // user can correct the input.
        }
    }

    /// Adds the same meal for each ticked sibling, skipping any it would put
    /// an allergen in front of, and says which were skipped.
    private func addForSiblings(foodId: String) async {
        let targets = siblings.filter { alsoForKidIds.contains($0.id) }
        guard !targets.isEmpty else { return }
        var skipped: [String] = []
        for sibling in targets {
            let hit: String?
            if let recipeId = selectedRecipeId,
               let recipe = appState.recipes.first(where: { $0.id == recipeId }) {
                hit = allergen(in: recipe, for: sibling)
            } else if let food = appState.foods.first(where: { $0.id == foodId }) {
                hit = allergen(in: food, for: sibling)
            } else {
                hit = nil
            }
            if let hit {
                skipped.append("\(sibling.name) (\(hit))")
                continue
            }
            let copy = PlanEntry(
                id: UUID().uuidString,
                userId: "",
                kidId: sibling.id,
                date: DateFormatter.isoDate.string(from: date),
                mealSlot: mealSlot.rawValue,
                foodId: foodId,
                recipeId: selectedRecipeId
            )
            try? await appState.addPlanEntry(copy, silent: true)
        }
        if !skipped.isEmpty {
            ToastManager.shared.warning(
                "Not added for everyone",
                message: "Skipped for allergies: \(skipped.joined(separator: ", "))"
            )
        }
    }
}

// MARK: - Cross-Kid Copy Sheet (US-229)

struct CopyWeekToKidSheet: View {
    @EnvironmentObject var appState: AppState
    let weekStart: Date
    let sourceKidId: String?
    @Binding var targetKidId: String?
    /// US-353: report the recipe ids of the recipe-backed entries we copied so
    /// the parent can fire the missing-ingredient prompt for them.
    var onApplied: (Set<String>) -> Void = { _ in }
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
    /// Uses the same check the copy applies (canonical match, recipe
    /// ingredients included), so the preview and the result agree.
    /// Named by recipe when the meal is one, since the hit may come from any
    /// of its ingredients rather than the entry's first food.
    private var conflictingFoods: [(id: String, name: String, allergens: [String])] {
        guard let target = targetKid, !(target.allergens ?? []).isEmpty else { return [] }

        var seen: Set<String> = []
        var result: [(id: String, name: String, allergens: [String])] = []
        for entry in sourceEntries {
            let key = entry.recipeId ?? entry.foodId
            guard !seen.contains(key),
                  let hit = MealPlanTemplateService.allergenHit(entry: entry, kid: target, appState: appState)
            else { continue }
            seen.insert(key)
            let name = entry.recipeId.flatMap { rid in appState.recipes.first { $0.id == rid }?.name }
                ?? appState.foods.first(where: { $0.id == entry.foodId })?.name
                ?? "Meal"
            result.append((id: key, name: name, allergens: [hit]))
        }
        return result
    }

    /// Meals (not distinct foods) the copy will skip.
    private var skippedMealCount: Int {
        guard let target = targetKid, !(target.allergens ?? []).isEmpty else { return 0 }
        return sourceEntries.filter {
            MealPlanTemplateService.allergenHit(entry: $0, kid: target, appState: appState) != nil
        }.count
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
                        ForEach(conflictingFoods, id: \.id) { row in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.name)
                                    .font(.subheadline)
                                Text("Allergen: \(row.allergens.joined(separator: ", "))")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    } header: {
                        Label(
                            "\(skippedMealCount) meal\(skippedMealCount == 1 ? "" : "s") will be skipped",
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

            // US-353: hand the copied recipe-backed entries to the parent for
            // the aggregated shortfall prompt.
            if !result.copiedRecipeIds.isEmpty {
                onApplied(Set(result.copiedRecipeIds))
            }

            onDismiss()
        } catch {
            HapticManager.error()
            ToastManager.shared.show(error, as: { .save(entity: "week copy", underlying: $0) })
        }
    }
}

#Preview {
    NavigationStack {
        MealPlanView()
    }
    .environmentObject(AppState())
}
