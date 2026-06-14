import Foundation

struct ChatMessage: Identifiable, Equatable {
    let id: String
    let role: Role
    let content: String
    let timestamp: Date
    /// US-396: marks an assistant turn that failed (transient/5xx) so the UI
    /// can render it as an error with a Retry affordance instead of passing it
    /// off as a real model answer.
    let isError: Bool

    enum Role: String {
        case user
        case assistant
        case system
    }

    init(
        id: String = UUID().uuidString,
        role: Role,
        content: String,
        timestamp: Date = Date(),
        isError: Bool = false
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
        self.isError = isError
    }
}
