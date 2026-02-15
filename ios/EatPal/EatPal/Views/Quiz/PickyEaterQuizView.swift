import SwiftUI

/// Picky eater personality quiz that helps parents understand their child's eating behavior
/// and provides tailored strategies.
struct PickyEaterQuizView: View {
    @Environment(\.dismiss) var dismiss
    @State private var currentQuestion = 0
    @State private var answers: [Int] = []
    @State private var showingResult = false

    var body: some View {
        NavigationStack {
            VStack {
                if showingResult {
                    QuizResultView(
                        personality: calculatePersonality(),
                        onDismiss: { dismiss() }
                    )
                } else {
                    // Progress
                    ProgressView(value: Double(currentQuestion), total: Double(questions.count))
                        .tint(.green)
                        .padding()

                    Text("Question \(currentQuestion + 1) of \(questions.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer()

                    // Question
                    VStack(spacing: 24) {
                        Text(questions[currentQuestion].text)
                            .font(.title3)
                            .fontWeight(.semibold)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)

                        // Options
                        VStack(spacing: 12) {
                            ForEach(Array(questions[currentQuestion].options.enumerated()), id: \.offset) { index, option in
                                Button {
                                    selectAnswer(index)
                                } label: {
                                    Text(option)
                                        .font(.body)
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal)
                    }

                    Spacer()
                }
            }
            .navigationTitle("Picky Eater Quiz")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func selectAnswer(_ index: Int) {
        answers.append(index)
        HapticManager.lightImpact()

        if currentQuestion < questions.count - 1 {
            withAnimation {
                currentQuestion += 1
            }
        } else {
            withAnimation {
                showingResult = true
            }
        }
    }

    private func calculatePersonality() -> PickyEaterPersonality {
        let score = answers.reduce(0, +)
        let maxScore = questions.count * 3

        let percentage = Double(score) / Double(maxScore)

        if percentage < 0.25 {
            return .adventurousEater
        } else if percentage < 0.5 {
            return .cautiousExplorer
        } else if percentage < 0.75 {
            return .selectiveSampler
        } else {
            return .routineReliant
        }
    }

    // MARK: - Questions

    private let questions: [QuizQuestion] = [
        QuizQuestion(
            text: "How does your child react when presented with a new food?",
            options: ["Excited to try it", "Cautious but willing to look", "Refuses initially but may try later", "Immediately pushes it away"]
        ),
        QuizQuestion(
            text: "How many different foods does your child eat regularly?",
            options: ["20+ foods", "10-20 foods", "5-10 foods", "Fewer than 5 foods"]
        ),
        QuizQuestion(
            text: "How important is food presentation to your child?",
            options: ["Doesn't matter", "Prefers familiar plating", "Very particular about appearance", "Won't eat if anything looks different"]
        ),
        QuizQuestion(
            text: "How does your child handle mixed textures (e.g., soup with chunks)?",
            options: ["No problem", "Slightly uncomfortable", "Will pick out certain textures", "Refuses completely"]
        ),
        QuizQuestion(
            text: "Does your child eat differently at home vs. other places?",
            options: ["Eats the same everywhere", "Slightly more adventurous out", "Much more restrictive at restaurants", "Won't eat anywhere but home"]
        ),
        QuizQuestion(
            text: "How long does it take your child to warm up to a new food?",
            options: ["First or second try", "3-5 exposures", "5-10 exposures", "More than 10 exposures"]
        ),
        QuizQuestion(
            text: "Does your child have strong reactions to food smells?",
            options: ["Not at all", "Occasionally bothered", "Often bothered", "Very sensitive to smells"]
        ),
        QuizQuestion(
            text: "How does your child respond to foods touching on the plate?",
            options: ["Doesn't care", "Prefers separation but tolerates", "Needs clear separation", "Will refuse entire plate"]
        ),
    ]
}

struct QuizQuestion {
    let text: String
    let options: [String]
}

// MARK: - Personalities

enum PickyEaterPersonality {
    case adventurousEater
    case cautiousExplorer
    case selectiveSampler
    case routineReliant

    var title: String {
        switch self {
        case .adventurousEater: return "Adventurous Eater"
        case .cautiousExplorer: return "Cautious Explorer"
        case .selectiveSampler: return "Selective Sampler"
        case .routineReliant: return "Routine Reliant"
        }
    }

    var icon: String {
        switch self {
        case .adventurousEater: return "star.circle.fill"
        case .cautiousExplorer: return "magnifyingglass.circle.fill"
        case .selectiveSampler: return "hand.point.up.fill"
        case .routineReliant: return "arrow.triangle.2.circlepath.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .adventurousEater: return .green
        case .cautiousExplorer: return .blue
        case .selectiveSampler: return .orange
        case .routineReliant: return .purple
        }
    }

    var description: String {
        switch self {
        case .adventurousEater:
            return "Your child is naturally curious about food! They're open to trying new things and generally have a wide variety of accepted foods."
        case .cautiousExplorer:
            return "Your child is willing to try new foods but needs time and encouragement. They prefer to observe before tasting."
        case .selectiveSampler:
            return "Your child has strong preferences and is particular about what they eat. They may be sensitive to textures or appearances."
        case .routineReliant:
            return "Your child finds comfort in familiar foods and routine. Changes to meals can be challenging, but with patience and the right approach, their diet can expand."
        }
    }

    var strategies: [String] {
        switch self {
        case .adventurousEater:
            return [
                "Continue exposing them to diverse cuisines",
                "Let them help with cooking",
                "Try themed food nights from different cultures",
            ]
        case .cautiousExplorer:
            return [
                "Use food bridges — modify accepted foods slightly",
                "Serve new foods alongside favorites",
                "Give them control by offering 2-3 choices",
                "Read books about food together",
            ]
        case .selectiveSampler:
            return [
                "Don't pressure — let them interact at their own pace",
                "Use food chaining to gradually bridge to new foods",
                "Focus on sensory exploration (touch, smell, lick before eat)",
                "Create consistent, low-pressure mealtimes",
                "Celebrate small wins (touching or smelling counts!)",
            ]
        case .routineReliant:
            return [
                "Make very small, gradual changes to accepted foods",
                "Keep a consistent mealtime routine",
                "Use visual schedules for meals",
                "Consider consulting a feeding therapist",
                "Use the food chaining tool in this app",
                "Be patient — progress may be slow but it adds up",
            ]
        }
    }
}

// MARK: - Result View

struct QuizResultView: View {
    let personality: PickyEaterPersonality
    let onDismiss: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Result Badge
                VStack(spacing: 12) {
                    Image(systemName: personality.icon)
                        .font(.system(size: 64))
                        .foregroundStyle(personality.color)

                    Text(personality.title)
                        .font(.title2)
                        .fontWeight(.bold)

                    Text(personality.description)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()

                // Strategies
                VStack(alignment: .leading, spacing: 12) {
                    Text("Recommended Strategies")
                        .font(.headline)

                    ForEach(personality.strategies, id: \.self) { strategy in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                                .font(.body)

                            Text(strategy)
                                .font(.subheadline)
                        }
                    }
                }
                .padding()
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

                Button("Done") {
                    onDismiss()
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }
            .padding()
        }
    }
}

#Preview {
    PickyEaterQuizView()
}
