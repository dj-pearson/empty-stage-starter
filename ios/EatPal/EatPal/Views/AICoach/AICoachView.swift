import SwiftUI

struct AICoachView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var coachService = AICoachService.shared
    @State private var messageText = ""
    @FocusState private var isInputFocused: Bool

    private var activeKid: Kid? {
        guard let kidId = appState.activeKidId else { return nil }
        return appState.kids.first { $0.id == kidId }
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

            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(coachService.messages) { message in
                            ChatBubble(message: message)
                                .id(message.id)
                        }

                        if coachService.isLoading {
                            HStack {
                                TypingIndicator()
                                Spacer()
                            }
                            .padding(.horizontal)
                            .id("typing")
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

                Button {
                    sendMessage()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(messageText.trimmingCharacters(in: .whitespaces).isEmpty ? .gray : .green)
                }
                .disabled(messageText.trimmingCharacters(in: .whitespaces).isEmpty || coachService.isLoading)
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
            Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                withAnimation(.easeInOut(duration: 0.3)) {
                    dotIndex = (dotIndex + 1) % 3
                }
            }
        }
    }
}
