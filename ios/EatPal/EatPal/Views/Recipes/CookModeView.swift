import SwiftUI
import UIKit

/// US-359: step-by-step cooking mode. Presents one instruction step at a time
/// with check-off and next/prev, and keeps the screen awake only while the
/// view is on screen (restored on exit).
struct CookModeView: View {
    let recipeName: String
    let instructions: String?

    @Environment(\.dismiss) private var dismiss
    // US-359 AC4: gate step transitions behind Reduce Motion.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var currentStep = 0
    @State private var checkedSteps: Set<Int> = []

    private var steps: [String] { RecipeStepParser.parse(instructions) }

    var body: some View {
        NavigationStack {
            Group {
                if steps.isEmpty {
                    ContentUnavailableView(
                        "No steps",
                        systemImage: "list.number",
                        description: Text("This recipe has no instructions to cook from yet.")
                    )
                } else {
                    cookContent
                }
            }
            .navigationTitle(recipeName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        // US-359 AC3: keep the screen awake only while cooking; restore on exit.
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private var cookContent: some View {
        VStack(spacing: 20) {
            ProgressView(value: Double(currentStep + 1), total: Double(steps.count))
                .tint(.green)
                .padding(.horizontal)

            Text("Step \(currentStep + 1) of \(steps.count)")
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer()

            ScrollView {
                Text(steps[currentStep])
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .padding()
                    .id(currentStep) // re-identify so transitions animate per step
            }
            .transition(.opacity)

            Spacer()

            Button {
                toggleChecked()
            } label: {
                Label(
                    checkedSteps.contains(currentStep) ? "Step done" : "Mark step done",
                    systemImage: checkedSteps.contains(currentStep) ? "checkmark.circle.fill" : "circle"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(.green)
            .padding(.horizontal)

            HStack(spacing: 16) {
                Button {
                    goTo(currentStep - 1)
                } label: {
                    Label("Previous", systemImage: "chevron.left")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(currentStep == 0)

                Button {
                    goTo(currentStep + 1)
                } label: {
                    Label(currentStep == steps.count - 1 ? "Finish" : "Next",
                          systemImage: currentStep == steps.count - 1 ? "checkmark" : "chevron.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }
            .padding([.horizontal, .bottom])
        }
    }

    private func toggleChecked() {
        if checkedSteps.contains(currentStep) {
            checkedSteps.remove(currentStep)
        } else {
            checkedSteps.insert(currentStep)
            HapticManager.lightImpact()
        }
    }

    private func goTo(_ index: Int) {
        if index >= steps.count {
            dismiss()
            return
        }
        guard index >= 0, index < steps.count else { return }
        accessibleWithAnimation(reduceMotion: reduceMotion) {
            currentStep = index
        }
    }
}
