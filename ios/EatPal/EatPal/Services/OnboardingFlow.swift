import Foundation

/// US-704: who the parent is planning for, and what that answer sets up.
///
/// The same three choices, in the same order, with the same words as the
/// shipped web route `src/pages/Onboarding.tsx`. Copy is duplicated rather
/// than fetched because these are two apps, but it is duplicated deliberately
/// and the test suite compares it to the web file's strings -- a divergence
/// here is two products asking the same question differently.
enum PlanningFor: String, CaseIterable, Identifiable {
    case justMe = "just_me"
    case meAndPartner = "me_and_partner"
    case myFamily = "my_family"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .justMe: return "Just me"
        case .meAndPartner: return "Me and a partner"
        case .myFamily: return "My family"
        }
    }

    var subtitle: String {
        switch self {
        case .justMe:
            return "Planning my own meals."
        case .meAndPartner:
            return "Two adults sharing the cooking and the shopping."
        case .myFamily:
            return "One or more children, with their own likes and safe foods."
        }
    }

    var systemImage: String {
        switch self {
        case .justMe: return "person"
        case .meAndPartner: return "heart"
        case .myFamily: return "person.3"
        }
    }

    /// Only a family is asked about a child. A couple planning for themselves
    /// must not be made to invent one (AC4).
    var needsChild: Bool { self == .myFamily }
}

/// The step model and the one decision that creates data.
///
/// Pure, so the branches can be tested without standing up a view or a
/// Supabase client. `OnboardingView` reads these rather than repeating the
/// conditions inline, which is what kept the web route's `needsChild` and
/// `totalSteps` honest.
enum OnboardingFlow {
    /// Matches the web route's `totalSteps`: the adult branches are one step,
    /// family is two (AC7).
    static func totalSteps(for answer: PlanningFor?) -> Int {
        (answer?.needsChild ?? false) ? 2 : 1
    }

    /// Whether finishing with this state should create a child.
    ///
    /// Three ways to get false, and each is an acceptance criterion:
    /// an adult branch (AC4), a skip (AC6), and a blank name -- a first name
    /// is the only required field and an empty one is not an answer (AC3).
    static func createsChild(
        answer: PlanningFor?,
        skipped: Bool,
        childName: String
    ) -> Bool {
        guard let answer, answer.needsChild, !skipped else { return false }
        return !childName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The name to save, trimmed. Nil when nothing should be created.
    static func childNameToCreate(
        answer: PlanningFor?,
        skipped: Bool,
        childName: String
    ) -> String? {
        guard createsChild(answer: answer, skipped: skipped, childName: childName) else {
            return nil
        }
        return childName.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
