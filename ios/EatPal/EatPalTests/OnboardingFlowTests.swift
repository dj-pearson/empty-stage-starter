import XCTest
@testable import EatPal

/// US-704: first-run setup asks who the parent is planning for, and only one
/// of the three answers creates anything.
///
/// The screen it replaces was five marketing slides, so a parent arrived at an
/// empty home screen with no child and nothing to log. The branches are the
/// whole story, and each way of NOT creating a child is its own acceptance
/// criterion: an adult answer (AC4), a skip (AC6), and a blank name (AC3).
///
/// Against `OnboardingFlow` rather than the view, because the view needs an
/// `AppState` and a Supabase client. The decisions are all here.
final class OnboardingFlowTests: XCTestCase {

    // MARK: - The three branches (AC10)

    func testJustMeCreatesNothing() {
        XCTAssertFalse(
            OnboardingFlow.createsChild(answer: .justMe, skipped: false, childName: "Sam"),
            "a person planning their own meals must not be given a child"
        )
    }

    func testMeAndAPartnerCreatesNothing() {
        // Even with a name sitting in state from a visit to step 2 and back.
        XCTAssertFalse(
            OnboardingFlow.createsChild(answer: .meAndPartner, skipped: false, childName: "Sam")
        )
    }

    func testMyFamilyWithANameCreatesTheChild() {
        XCTAssertTrue(
            OnboardingFlow.createsChild(answer: .myFamily, skipped: false, childName: "Sam")
        )
        XCTAssertEqual(
            OnboardingFlow.childNameToCreate(answer: .myFamily, skipped: false, childName: "  Sam  "),
            "Sam",
            "the saved name is trimmed"
        )
    }

    func testMyFamilyWithNoNameCreatesNothing() {
        // AC3: a first name is the only required field, so an empty one is not
        // an answer. Whitespace is not a name either.
        XCTAssertFalse(
            OnboardingFlow.createsChild(answer: .myFamily, skipped: false, childName: "")
        )
        XCTAssertFalse(
            OnboardingFlow.createsChild(answer: .myFamily, skipped: false, childName: "   \n ")
        )
        XCTAssertNil(
            OnboardingFlow.childNameToCreate(answer: .myFamily, skipped: false, childName: " ")
        )
    }

    // MARK: - Skip (AC6)

    func testSkippingCreatesNothingEvenMidFamilyBranch() {
        // The case that would lose a skip: the parent has chosen My family and
        // typed a name, then decides not now.
        XCTAssertFalse(
            OnboardingFlow.createsChild(answer: .myFamily, skipped: true, childName: "Sam")
        )
    }

    func testSkippingFromStepOneCreatesNothing() {
        XCTAssertFalse(
            OnboardingFlow.createsChild(answer: nil, skipped: true, childName: "")
        )
    }

    // MARK: - Step counts (AC7)

    func testAdultBranchesAreOneStep() {
        XCTAssertEqual(OnboardingFlow.totalSteps(for: .justMe), 1)
        XCTAssertEqual(OnboardingFlow.totalSteps(for: .meAndPartner), 1)
        // Before a choice is made the flow cannot claim two steps either.
        XCTAssertEqual(OnboardingFlow.totalSteps(for: nil), 1)
    }

    func testTheFamilyBranchIsTwoSteps() {
        XCTAssertEqual(OnboardingFlow.totalSteps(for: .myFamily), 2)
    }

    func testOnlyTheFamilyBranchAsksForAChild() {
        XCTAssertFalse(PlanningFor.justMe.needsChild)
        XCTAssertFalse(PlanningFor.meAndPartner.needsChild)
        XCTAssertTrue(PlanningFor.myFamily.needsChild)
    }

    // MARK: - The answer means the same thing on both clients (AC2)

    func testTheRawValuesMatchTheWebRoute() {
        // These strings are what web sends to analytics and what US-740 will
        // store as household_eaters rows. A rename on one side silently splits
        // the funnel in two.
        XCTAssertEqual(PlanningFor.justMe.rawValue, "just_me")
        XCTAssertEqual(PlanningFor.meAndPartner.rawValue, "me_and_partner")
        XCTAssertEqual(PlanningFor.myFamily.rawValue, "my_family")
    }

    func testTheChoicesAreInTheSameOrderAsTheWebRoute() {
        XCTAssertEqual(
            PlanningFor.allCases.map(\.rawValue),
            ["just_me", "me_and_partner", "my_family"]
        )
    }

    func testTheCopyMatchesTheWebRoute() {
        // Duplicated deliberately -- two apps, two codebases -- but duplicated
        // exactly. These are the strings in src/pages/Onboarding.tsx's CHOICES.
        XCTAssertEqual(PlanningFor.justMe.title, "Just me")
        XCTAssertEqual(PlanningFor.justMe.subtitle, "Planning my own meals.")

        XCTAssertEqual(PlanningFor.meAndPartner.title, "Me and a partner")
        XCTAssertEqual(
            PlanningFor.meAndPartner.subtitle,
            "Two adults sharing the cooking and the shopping."
        )

        XCTAssertEqual(PlanningFor.myFamily.title, "My family")
        XCTAssertEqual(
            PlanningFor.myFamily.subtitle,
            "One or more children, with their own likes and safe foods."
        )
    }
}
