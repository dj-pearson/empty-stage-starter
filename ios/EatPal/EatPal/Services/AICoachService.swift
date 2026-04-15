import Foundation
import Supabase

@MainActor
final class AICoachService: ObservableObject {
    static let shared = AICoachService()
    private let client = SupabaseManager.client

    @Published var messages: [ChatMessage] = []
    @Published var isLoading = false

    private init() {
        messages.append(ChatMessage(
            role: .assistant,
            content: "Hi! I'm your AI meal coach. I can help with meal ideas, picky eating strategies, nutrition questions, and food introduction tips. How can I help?"
        ))
    }

    func sendMessage(_ text: String, kid: Kid?, foods: [Food]) async {
        let userMessage = ChatMessage(role: .user, content: text)
        messages.append(userMessage)
        isLoading = true

        do {
            let conversationHistory = messages.suffix(20).map { msg -> [String: String] in
                ["role": msg.role.rawValue, "content": msg.content]
            }

            var context: [String: Any] = [
                "conversation": conversationHistory
            ]

            if let kid = kid {
                context["kidName"] = kid.name
                context["kidAge"] = kid.age as Any
                context["allergens"] = kid.allergens as Any
                context["pickinessLevel"] = kid.pickinessLevel as Any
            }

            let safeFoodNames = foods.filter(\.isSafe).prefix(20).map(\.name)
            if !safeFoodNames.isEmpty {
                context["safeFoods"] = safeFoodNames
            }

            let requestBody = try JSONSerialization.data(withJSONObject: context)

            struct CoachResponse: Decodable {
                let message: String
            }

            let decoded: CoachResponse = try await client.functions.invoke(
                "ai-coach-chat",
                options: .init(body: requestBody)
            )
            let assistantMessage = ChatMessage(role: .assistant, content: decoded.message)
            messages.append(assistantMessage)
        } catch {
            // Fallback to canned responses
            let fallback = generateFallbackResponse(for: text, kid: kid)
            let assistantMessage = ChatMessage(role: .assistant, content: fallback)
            messages.append(assistantMessage)
        }

        isLoading = false
    }

    func clearChat() {
        messages = [ChatMessage(
            role: .assistant,
            content: "Hi! I'm your AI meal coach. I can help with meal ideas, picky eating strategies, nutrition questions, and food introduction tips. How can I help?"
        )]
    }

    private func generateFallbackResponse(for input: String, kid: Kid?) -> String {
        let lowered = input.lowercased()
        let kidName = kid?.name ?? "your child"

        if lowered.contains("picky") || lowered.contains("won't eat") || lowered.contains("refuse") {
            return """
            Picky eating is very common! Here are some strategies for \(kidName):

            1. Offer new foods alongside familiar favorites
            2. Let them explore food with all senses - touching and smelling count as progress
            3. Try food chaining - start with foods they like and gradually introduce similar ones
            4. Keep portions tiny for new foods (1-2 bites)
            5. Avoid pressure - keep mealtimes positive
            """
        }

        if lowered.contains("breakfast") || lowered.contains("lunch")
            || lowered.contains("dinner") || lowered.contains("meal idea") {
            return """
            Here are some balanced meal ideas for \(kidName):

            - **Breakfast**: Whole grain toast with nut butter + banana slices
            - **Lunch**: Roll-ups with turkey, cheese, and veggies
            - **Dinner**: Mini meatballs with pasta and hidden veggie sauce
            - **Snack**: Apple slices with yogurt dip

            Would you like more specific ideas based on their safe foods?
            """
        }

        if lowered.contains("nutrition") || lowered.contains("vitamin") || lowered.contains("nutrient") {
            return """
            Great question about nutrition for \(kidName)! Key nutrients for growing kids include:

            - **Iron**: Found in lean meats, beans, fortified cereals
            - **Calcium**: Dairy, fortified alternatives, leafy greens
            - **Fiber**: Fruits, vegetables, whole grains
            - **Protein**: Meat, eggs, dairy, legumes

            Would you like me to suggest foods rich in a specific nutrient?
            """
        }

        return """
        That's a great question! Here are some general tips for feeding \(kidName):

        - Keep introducing new foods - it can take 10-15 exposures
        - Model healthy eating habits
        - Involve them in meal prep when possible
        - Make food fun with different shapes and colors

        Would you like more specific advice? Tell me about any particular challenges you're facing.
        """
    }
}
