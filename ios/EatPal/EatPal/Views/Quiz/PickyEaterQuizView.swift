import SwiftUI

/// Picky eater personality quiz that helps parents understand their child's eating behavior
/// and provides tailored strategies.
///
/// US-240: When `kid` is non-nil, the result screen offers an "Apply to <name>"
/// action that writes the suggested pickiness level + strategies onto the kid
/// profile. Without `kid` (e.g., the standalone tool from More) it stays an
/// informational tool only.
struct PickyEaterQuizView: View {
    @Environment(\.dismiss) var dismiss
    @State private var currentQuestion = 0
    @State private var answers: [Int] = []
    @State private var showingResult = false

    /// Optional kid the result should be saved to. nil = pure exploration mode.
    var kid: Kid? = nil

    var body: some View {
        NavigationStack {
            VStack {
                if showingResult {
                    QuizResultView(
                        personality: calculatePersonality(),
                        kid: kid,
                        onDismiss: { dismiss() }
                    )
                    .onAppear {
                        // US-245: Fire on result reveal — pairs with quiz_started
                        // to give us a completion-rate funnel.
                        AnalyticsService.track(.quizCompleted(
                            personality: String(describing: calculatePersonality()),
                            kidId: kid?.id
                        ))
                    }
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
            .task {
                // US-245: Quiz funnel start. Pair with .quizCompleted to compute
                // abandon rate; deeper question-level abandon tracking lives
                // in `selectAnswer` if we add it later.
                AnalyticsService.track(.quizStarted)
                AnalyticsService.screen("quiz_picky_eater")
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

    /// US-240: Maps the 4 personality buckets onto the 3 pickiness levels we
    /// store on the Kid profile. The two middle personalities both land on
    /// `somewhat_picky` since the quiz is more granular than the legacy field.
    var suggestedPickinessLevel: String {
        switch self {
        case .adventurousEater: return "not_picky"
        case .cautiousExplorer, .selectiveSampler: return "somewhat_picky"
        case .routineReliant: return "very_picky"
        }
    }

    var pickinessDisplay: String {
        switch suggestedPickinessLevel {
        case "not_picky": return "Not Picky"
        case "somewhat_picky": return "Somewhat Picky"
        case "very_picky": return "Very Picky"
        default: return suggestedPickinessLevel
        }
    }
}

// MARK: - Result View

struct QuizResultView: View {
    @EnvironmentObject var appState: AppState
    let personality: PickyEaterPersonality
    var kid: Kid? = nil
    let onDismiss: () -> Void

    @State private var isApplying = false
    @State private var didApply = false

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

                // US-240: When the quiz was launched from a kid context, offer
                // to persist the result onto that kid (pickiness + strategies).
                if let kid {
                    VStack(spacing: 8) {
                        Button {
                            Task { await applyToKid(kid) }
                        } label: {
                            HStack {
                                if isApplying {
                                    ProgressView().tint(.white)
                                } else {
                                    Image(systemName: didApply ? "checkmark.circle.fill" : "person.crop.circle.badge.checkmark")
                                }
                                Text(didApply ? "Applied to \(kid.name)" : "Apply to \(kid.name)")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(didApply ? .gray : .green)
                        .disabled(isApplying || didApply)

                        Text("Sets pickiness to \(personality.pickinessDisplay) and saves these strategies to \(kid.name)'s profile.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.horizontal)
                }

                // Standalone-mode dismiss is the primary CTA (filled green);
                // when there's a kid the "Apply to <name>" button above is
                // primary, so this becomes a softer outlined Close. Two
                // separate Buttons because `.buttonStyle(condition ? .a : .b)`
                // tries to pick a common type from two different concrete
                // ButtonStyle types and ends up at the protocol, which has
                // no static `.borderedProminent`/`.bordered` members.
                if kid == nil {
                    Button("Done") { onDismiss() }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                } else {
                    Button("Close") { onDismiss() }
                        .buttonStyle(.bordered)
                        .tint(.green)
                }
            }
            .padding()
        }
    }

    private func applyToKid(_ kid: Kid) async {
        isApplying = true
        defer { isApplying = false }

        let updates = KidUpdate(
            pickinessLevel: personality.suggestedPickinessLevel,
            helpfulStrategies: personality.strategies
        )

        do {
            try await appState.updateKid(kid.id, updates: updates)
            didApply = true
            HapticManager.success()
            // updateKid already shows a success toast; auto-dismiss after a beat
            // so the user lands back where they started.
            try? await Task.sleep(for: .milliseconds(700))
            onDismiss()
        } catch {
            // updateKid surfaces its own error toast; no need to double-up.
        }
    }
}

#Preview {
    PickyEaterQuizView()
}
