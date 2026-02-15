import SwiftUI

/// Food chaining therapy tool that helps picky eaters gradually accept new foods
/// by creating chains from accepted foods to target foods through similar properties.
struct FoodChainingView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedSafeFood: Food?
    @State private var selectedTargetFood: Food?
    @State private var chainSteps: [ChainStep] = []
    @State private var isGenerating = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Explanation
                VStack(alignment: .leading, spacing: 8) {
                    Label("What is Food Chaining?", systemImage: "link")
                        .font(.headline)

                    Text("Food chaining helps picky eaters try new foods by creating small, gradual steps from foods they already accept to new target foods. Each step changes one small property (texture, flavor, color, or temperature).")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

                // Safe Food Selection
                VStack(alignment: .leading, spacing: 8) {
                    Text("Starting Food (Safe)")
                        .font(.subheadline)
                        .fontWeight(.medium)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(appState.safeFoods) { food in
                                FoodChip(
                                    food: food,
                                    isSelected: selectedSafeFood?.id == food.id
                                ) {
                                    selectedSafeFood = food
                                    generateChain()
                                }
                            }
                        }
                    }

                    if appState.safeFoods.isEmpty {
                        Text("Mark some foods as safe in your pantry first.")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }

                // Target Food Selection
                VStack(alignment: .leading, spacing: 8) {
                    Text("Target Food")
                        .font(.subheadline)
                        .fontWeight(.medium)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(appState.tryBiteFoods) { food in
                                FoodChip(
                                    food: food,
                                    isSelected: selectedTargetFood?.id == food.id
                                ) {
                                    selectedTargetFood = food
                                    generateChain()
                                }
                            }
                        }
                    }

                    if appState.tryBiteFoods.isEmpty {
                        Text("Mark some foods as 'Try Bite' in your pantry.")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }

                // Chain Steps
                if !chainSteps.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Food Chain")
                                .font(.headline)
                            Spacer()
                            Text("\(chainSteps.count) steps")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        ForEach(Array(chainSteps.enumerated()), id: \.offset) { index, step in
                            ChainStepRow(step: step, stepNumber: index + 1, isLast: index == chainSteps.count - 1)
                        }
                    }
                } else if selectedSafeFood != nil && selectedTargetFood != nil {
                    if isGenerating {
                        ProgressView("Generating chain...")
                    } else {
                        Text("Select both a safe food and a target food to generate a chain.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                // Tips
                VStack(alignment: .leading, spacing: 8) {
                    Label("Tips", systemImage: "lightbulb.fill")
                        .font(.headline)
                        .foregroundStyle(.orange)

                    ForEach(tips, id: \.self) { tip in
                        HStack(alignment: .top, spacing: 8) {
                            Text("•")
                            Text(tip)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding()
                .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            }
            .padding()
        }
        .navigationTitle("Food Chaining")
    }

    private let tips = [
        "Introduce one change at a time. Don't rush multiple steps.",
        "Let your child explore the food with all senses before tasting.",
        "Offer the new food alongside the accepted food — never replace it.",
        "Praise interaction with food, even just touching or smelling it.",
        "It may take 10-15 exposures before a child accepts a new food.",
    ]

    // MARK: - Chain Generation

    private func generateChain() {
        guard let safe = selectedSafeFood, let target = selectedTargetFood else { return }
        isGenerating = true

        // Generate intermediate steps based on category/property proximity
        var steps: [ChainStep] = []

        steps.append(ChainStep(
            foodName: safe.name,
            change: "Starting food — already accepted",
            category: safe.category,
            type: .safe
        ))

        // If same category, simple bridge
        if safe.category == target.category {
            steps.append(ChainStep(
                foodName: "Modified \(safe.name)",
                change: "Change preparation style (e.g., raw → cooked, plain → seasoned)",
                category: safe.category,
                type: .bridge
            ))
        } else {
            // Cross-category bridge
            steps.append(ChainStep(
                foodName: "\(safe.name) variation",
                change: "Change one texture property (e.g., smooth → slightly chunky)",
                category: safe.category,
                type: .bridge
            ))

            steps.append(ChainStep(
                foodName: "Mixed plate",
                change: "Serve alongside a small portion of the target category",
                category: "mixed",
                type: .bridge
            ))

            steps.append(ChainStep(
                foodName: "Similar \(FoodCategory(rawValue: target.category)?.displayName ?? target.category)",
                change: "Introduce a milder version of the target food type",
                category: target.category,
                type: .bridge
            ))
        }

        steps.append(ChainStep(
            foodName: target.name,
            change: "Target food — goal!",
            category: target.category,
            type: .target
        ))

        chainSteps = steps
        isGenerating = false
    }
}

// MARK: - Types

struct ChainStep {
    let foodName: String
    let change: String
    let category: String
    let type: StepType

    enum StepType {
        case safe, bridge, target
    }
}

// MARK: - Subviews

struct FoodChip: View {
    let food: Food
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 4) {
                Text(FoodCategory(rawValue: food.category)?.icon ?? "🍽")
                Text(food.name)
                    .font(.caption)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                isSelected ? Color.green : Color(.systemGray5),
                in: Capsule()
            )
            .foregroundStyle(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

struct ChainStepRow: View {
    let step: ChainStep
    let stepNumber: Int
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Step indicator
            VStack(spacing: 0) {
                ZStack {
                    Circle()
                        .fill(stepColor)
                        .frame(width: 32, height: 32)

                    Text("\(stepNumber)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                }

                if !isLast {
                    Rectangle()
                        .fill(Color(.separator))
                        .frame(width: 2, height: 30)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(step.foodName)
                    .font(.body)
                    .fontWeight(.medium)

                Text(step.change)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, isLast ? 0 : 8)
        }
    }

    private var stepColor: Color {
        switch step.type {
        case .safe: return .green
        case .bridge: return .orange
        case .target: return .blue
        }
    }
}

#Preview {
    NavigationStack {
        FoodChainingView()
    }
    .environmentObject(AppState())
}
