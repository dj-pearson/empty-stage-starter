import Foundation

struct ChatMessage: Identifiable, Equatable {
    let id: String
    let role: Role
    let content: String
    let timestamp: Date

    enum Role: String {
        case user
        case assistant
        case system
    }

    init(id: String = UUID().uuidString, role: Role, content: String, timestamp: Date = Date()) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
    }
}
