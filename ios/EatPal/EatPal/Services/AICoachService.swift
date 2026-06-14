import Foundation

@MainActor
final class AICoachService: ObservableObject {
    static let shared = AICoachService()

    @Published var messages: [ChatMessage] = []
    @Published var isLoading = false

    /// US-396: the last user prompt that failed against the edge function, so
    /// Retry can re-send it without the user re-typing.
    private var lastFailedUserText: String?
    private var lastKid: Kid?
    private var lastFoods: [Food] = []

    /// US-401: the in-flight send so Reset/clearChat can cancel it and a stale
    /// completion can be discarded instead of re-appending after reset.
    private var sendTask: Task<Void, Never>?

    private init() {
        messages.append(ChatMessage(
            role: .assistant,
            content: "Hi! I'm your AI meal coach. I can help with meal ideas, picky eating strategies, nutrition questions, and food introduction tips. How can I help?"
        ))
    }

    /// US-401: start a cancellable send. Cancels any prior in-flight request
    /// first so a stale completion can't re-append after a new send/reset.
    func send(_ text: String, kid: Kid?, foods: [Food]) {
        sendTask?.cancel()
        sendTask = Task { [weak self] in
            await self?.sendMessage(text, kid: kid, foods: foods)
        }
    }

    func sendMessage(_ text: String, kid: Kid?, foods: [Food]) async {
        let userMessage = ChatMessage(role: .user, content: text)
        messages.append(userMessage)
        isLoading = true
        // US-245: track only the count, never the prompt body. Lets us chart
        // engagement depth (1-message tries vs full conversations) without
        // ever sending the user's actual question.
        AnalyticsService.track(.aiCoachMessageSent(messageCount: messages.count))

        do {
            // Edge function contract (see supabase/functions/ai-coach-chat):
            //   { messages: [{role, content}], kidContext?: {...}, maxTokens? }
            // Previously this sent `{ conversation, kidName, ... }`, which
            // caused the function to return 400 "Messages array is required"
            // and forced the UI to fall back to the canned response.
            let history = messages.suffix(20).map { msg -> [String: String] in
                ["role": msg.role.rawValue, "content": msg.content]
            }

            var payload: [String: Any] = [
                "messages": history,
                "maxTokens": 2000
            ]

            if let kid = kid {
                var kidContext: [String: Any] = ["name": kid.name]
                if let age = kid.age { kidContext["age"] = age }
                if let allergens = kid.allergens { kidContext["allergens"] = allergens }
                if let pickiness = kid.pickinessLevel { kidContext["pickinessLevel"] = pickiness }
                kidContext["safeFoodsCount"] = foods.filter(\.isSafe).count
                kidContext["tryBiteFoodsCount"] = foods.filter(\.isTryBite).count
                payload["kidContext"] = kidContext
            }

            let requestBody = try JSONSerialization.data(withJSONObject: payload)

            struct CoachResponse: Decodable {
                let message: String
            }

            let decoded: CoachResponse = try await EdgeFunctions.invoke(
                "ai-coach-chat",
                jsonBody: requestBody,
                as: CoachResponse.self
            )
            // US-401: a response that arrives after reset/cancel is discarded,
            // not appended.
            if Task.isCancelled { isLoading = false; return }
            let assistantMessage = ChatMessage(role: .assistant, content: decoded.message)
            messages.append(assistantMessage)
            // Success clears any stored retry context.
            lastFailedUserText = nil
        } catch is CancellationError {
            isLoading = false
            return
        } catch {
            if Task.isCancelled { isLoading = false; return }
            // US-396: log the real failure to Sentry, not just a DEBUG print.
            SentryService.capture(error, extras: ["context": "ai_coach_chat"])
            handleFailure(for: text, kid: kid, foods: foods)
        }

        isLoading = false
    }

    /// US-396: re-send the last failed user message without re-typing. Drops
    /// the trailing error bubble first so the transcript reads cleanly.
    /// US-401: routed through the cancellable send Task.
    func retryLastMessage() {
        guard let text = lastFailedUserText else { return }
        let kid = lastKid
        let foods = lastFoods
        // Remove the trailing error bubble and the original user echo so
        // sendMessage re-appends a fresh user turn.
        if let last = messages.last, last.isError {
            messages.removeLast()
        }
        if let last = messages.last, last.role == .user, last.content == text {
            messages.removeLast()
        }
        send(text, kid: kid, foods: foods)
    }

    /// Branch the failure: offline -> a clearly-labeled offline-tips message;
    /// online (transient/5xx) -> a visible error bubble with retry context.
    private func handleFailure(for text: String, kid: Kid?, foods: [Food]) {
        lastFailedUserText = text
        lastKid = kid
        lastFoods = foods

        if NetworkMonitor.shared.isConnected {
            // US-396 AC3: do NOT fabricate a canned answer for a transient
            // online failure — surface it as an error the user can retry.
            messages.append(ChatMessage(
                role: .assistant,
                content: "Sorry — I couldn't reach the coach just now. Please try again.",
                isError: true
            ))
        } else {
            // Offline: the canned tips are still useful, but label them as
            // offline guidance rather than a real model reply.
            let tips = generateFallbackResponse(for: text, kid: kid)
            messages.append(ChatMessage(
                role: .assistant,
                content: "📴 You're offline. Here are some general tips while you reconnect:\n\n\(tips)"
            ))
        }
    }

    func clearChat() {
        // US-401: cancel any in-flight send so a late completion can't
        // re-append a message or re-activate the typing indicator after reset.
        sendTask?.cancel()
        sendTask = nil
        isLoading = false
        lastFailedUserText = nil
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
