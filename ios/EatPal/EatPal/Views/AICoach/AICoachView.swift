import SwiftUI

struct AICoachView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var coachService = AICoachService.shared
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var messageText = ""
    @FocusState private var isInputFocused: Bool

    private var activeKid: Kid? {
        guard let kidId = appState.activeKidId else { return nil }
        return appState.kids.first { $0.id == kidId }
    }

    /// US-236: True on first open — only the seeded assistant greeting is
    /// present and the user hasn't sent anything yet.
    private var isEmptyState: Bool {
        coachService.messages.count <= 1 &&
        !coachService.messages.contains(where: { $0.role == .user })
    }

    private var examplePrompts: [String] {
        if let kid = activeKid {
            return [
                "Why won't \(kid.name) eat broccoli?",
                "Plan a nut-free dinner for \(kid.name)",
                "How do I introduce a new texture?",
                "Quick high-protein breakfast ideas",
            ]
        }
        return [
            "Why won't my kid eat broccoli?",
            "Plan a nut-free dinner",
            "How do I introduce a new texture?",
            "Quick high-protein breakfast ideas",
        ]
    }

    var body: some View {
        VStack(spacing: 0) {
            // Active Kid Context
            if let kid = activeKid {
                HStack(spacing: 8) {
                    Image(systemName: "person.circle.fill")
                        .foregroundStyle(.green)
                    Text("Coaching for \(kid.name)")
                        .font(.caption)
                        .fontWeight(.medium)
                    if let age = kid.age {
                        Text("(\(age) years)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(Color(.secondarySystemBackground))
            }

            // US-236: Offline notice at top of chat when not connected.
            if !network.isConnected {
                HStack(spacing: 8) {
                    Image(systemName: "wifi.slash")
                    Text("AI Coach needs internet — your message will fail until you're back online.")
                        .font(.caption)
                    Spacer()
                }
                .foregroundStyle(.orange)
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(Color.orange.opacity(0.1))
                .accessibilityElement(children: .combine)
            }

            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(coachService.messages) { message in
                            ChatBubble(message: message)
                                .id(message.id)
                        }

                        // US-236: empty-state prompt chips
                        if isEmptyState {
                            EmptyChatPromptChips(prompts: examplePrompts) { prompt in
                                messageText = prompt
                                isInputFocused = true
                            }
                            .padding(.top, 4)
                        }

                        if coachService.isLoading {
                            HStack(spacing: 8) {
                                TypingIndicator()
                                Text("EatPal is thinking…")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal)
                            .id("typing")
                            .accessibilityLabel("EatPal is generating a response")
                        }
                    }
                    .padding()
                }
                .onChange(of: coachService.messages.count) { _, _ in
                    withAnimation {
                        if let lastId = coachService.messages.last?.id {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
                .onChange(of: coachService.isLoading) { _, isLoading in
                    if isLoading {
                        withAnimation {
                            proxy.scrollTo("typing", anchor: .bottom)
                        }
                    }
                }
            }

            // Input Bar
            HStack(spacing: 12) {
                TextField("Ask about meals, nutrition...", text: $messageText, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20))
                    .focused($isInputFocused)
                    .accessibilityLabel("Message AI Coach")

                Button {
                    sendMessage()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(messageText.trimmingCharacters(in: .whitespaces).isEmpty ? .gray : .green)
                }
                .disabled(messageText.trimmingCharacters(in: .whitespaces).isEmpty || coachService.isLoading)
                .accessibilityLabel("Send message")
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(.bar)
        }
        .navigationTitle("AI Coach")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    coachService.clearChat()
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                }
                .accessibilityLabel("Reset conversation")
            }
        }
        .onTapGesture {
            isInputFocused = false
        }
    }

    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        messageText = ""
        Task {
            await coachService.sendMessage(text, kid: activeKid, foods: appState.foods)
        }
    }
}

// MARK: - Empty-state prompt chips (US-236)

private struct EmptyChatPromptChips: View {
    let prompts: [String]
    let onTap: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .foregroundStyle(.green)
                Text("Try one of these")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 2)

            ForEach(prompts, id: \.self) { prompt in
                Button {
                    onTap(prompt)
                } label: {
                    HStack {
                        Text(prompt)
                            .font(.subheadline)
                            .multilineTextAlignment(.leading)
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "arrow.up.circle")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Use prompt: \(prompt)")
            }
        }
    }
}

// MARK: - Chat Bubble

struct ChatBubble: View {
    let message: ChatMessage

    private var isUser: Bool {
        message.role == .user
    }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 60) }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .font(.subheadline)
                    .foregroundStyle(isUser ? .white : .primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        isUser ? Color.green : Color(.secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 16)
                    )

                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if !isUser { Spacer(minLength: 60) }
        }
    }
}

// MARK: - Typing Indicator

struct TypingIndicator: View {
    @State private var dotIndex = 0
    @State private var animationTimer: Timer?
    // US-246: skip the bouncing-dot animation under Reduce Motion; the
    // accompanying "EatPal is thinking…" caption already conveys the state.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(Color(.systemGray3))
                    .frame(width: 8, height: 8)
                    .scaleEffect(dotIndex == index ? 1.3 : 1.0)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        .onAppear {
            guard !reduceMotion else { return }
            animationTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                withAnimation(.easeInOut(duration: 0.3)) {
                    dotIndex = (dotIndex + 1) % 3
                }
            }
        }
        .onDisappear {
            // Stop the timer when the indicator goes away — leaving it running
            // burns CPU and posts pointless animations to off-screen views.
            animationTimer?.invalidate()
            animationTimer = nil
        }
        .accessibilityLabel("EatPal is thinking")
    }
}
