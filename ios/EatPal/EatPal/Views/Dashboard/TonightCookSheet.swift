import SwiftUI
import AVFoundation
import UIKit

/// US-293: Hands-free cook view. Big text, persistent timer, screen
/// stays awake while cooking. Tap arrows or swipe to advance steps.
struct TonightCookSheet: View {
    let recipe: Recipe
    @Environment(\.dismiss) private var dismiss

    @State private var stepIndex = 0
    @State private var timerSeconds = 0
    @State private var timerRunning = false
    @State private var startedAt = Date()
    @State private var voiceEnabled = false

    @StateObject private var speech = SpeechCue()

    private var steps: [String] { Self.parseSteps(recipe.instructions) }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                stepBody
                    .padding(.horizontal, 24)
                    .padding(.vertical, 32)
            }
            footer
        }
        .background(Color(.systemBackground).ignoresSafeArea())
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            startedAt = Date()
            AnalyticsService.track(.tonightCookStarted(stepCount: steps.count))
            speakIfNeeded()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            speech.stop()
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in
            guard timerRunning, timerSeconds > 0 else { return }
            timerSeconds -= 1
            if timerSeconds == 0 {
                timerRunning = false
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
        .gesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    if value.translation.width < -40 { goNext() }
                    if value.translation.width >  40 { goPrev() }
                }
        )
    }

    // MARK: - Sub-views

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(recipe.name)
                    .font(.headline)
                Spacer()
                Button { complete() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Exit cooking mode")
            }
            Text("Step \(stepIndex + 1) of \(max(1, steps.count))")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.85))
            ProgressView(value: progress)
                .tint(.white)
        }
        .padding(16)
        .background(Color.orange)
        .foregroundStyle(.white)
    }

    @ViewBuilder
    private var stepBody: some View {
        if steps.isEmpty {
            VStack(spacing: 12) {
                Text("This recipe doesn't have step-by-step instructions yet.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                if let raw = recipe.instructions, !raw.isEmpty {
                    Text(raw)
                        .padding(12)
                        .background(.gray.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
                }
            }
        } else {
            Text(steps[stepIndex])
                .font(.system(size: 28, weight: .medium))
                .lineSpacing(8)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id("step-\(stepIndex)")
        }
    }

    private var footer: some View {
        VStack(spacing: 12) {
            timerBar
            Divider()
            HStack {
                Button(action: goPrev) {
                    Label("Back", systemImage: "chevron.left")
                }
                .disabled(stepIndex == 0)
                Spacer()
                Button(action: { voiceEnabled.toggle(); speakIfNeeded() }) {
                    Label(
                        voiceEnabled ? "Voice on" : "Voice off",
                        systemImage: voiceEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill"
                    )
                    .font(.caption)
                }
                .buttonStyle(.bordered)
                Spacer()
                if isLastStep {
                    Button(action: complete) {
                        Label("Done cooking", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                } else {
                    Button(action: goNext) {
                        Label("Next", systemImage: "chevron.right")
                            .labelStyle(.titleAndIcon)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                }
            }
        }
        .padding(16)
    }

    private var timerBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "timer")
            Text(formatTimer(timerSeconds))
                .font(.system(.title3, design: .monospaced))
                .accessibilityLabel("Timer \(timerSeconds) seconds")
            ForEach([60, 300, 600], id: \.self) { secs in
                Button("+\(secs / 60)m") {
                    timerSeconds = secs
                    timerRunning = true
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            if timerSeconds > 0 {
                Button {
                    timerRunning.toggle()
                } label: {
                    Image(systemName: timerRunning ? "pause.fill" : "play.fill")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel(timerRunning ? "Pause timer" : "Resume timer")
            }
        }
    }

    // MARK: - Helpers

    private var progress: Double {
        guard !steps.isEmpty else { return 0 }
        return Double(stepIndex + 1) / Double(steps.count)
    }

    private var isLastStep: Bool { stepIndex >= steps.count - 1 }

    private func goNext() {
        guard !isLastStep else { return }
        stepIndex += 1
        timerSeconds = 0
        timerRunning = false
        speakIfNeeded()
    }

    private func goPrev() {
        guard stepIndex > 0 else { return }
        stepIndex -= 1
        timerSeconds = 0
        timerRunning = false
        speakIfNeeded()
    }

    private func complete() {
        let duration = Int(Date().timeIntervalSince(startedAt))
        AnalyticsService.track(.tonightCookCompleted(
            durationSeconds: duration,
            stepCount: steps.count,
            voiceEnabled: voiceEnabled
        ))
        dismiss()
    }

    private func formatTimer(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%02d:%02d", m, s)
    }

    private func speakIfNeeded() {
        guard voiceEnabled, !steps.isEmpty else {
            speech.stop()
            return
        }
        speech.speak(steps[stepIndex])
    }

    static func parseSteps(_ raw: String?) -> [String] {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return []
        }
        let bullet = #"^\s*(\d+\.|[-*•])\s*"#
        let regex = try? NSRegularExpression(pattern: bullet)
        let lines = raw
            .components(separatedBy: .newlines)
            .map { line -> String in
                let nsLine = line as NSString
                let cleaned = regex?.stringByReplacingMatches(
                    in: line,
                    range: NSRange(location: 0, length: nsLine.length),
                    withTemplate: ""
                ) ?? line
                return cleaned.trimmingCharacters(in: .whitespaces)
            }
            .filter { !$0.isEmpty }
        if lines.count > 1 { return lines }

        return raw
            .components(separatedBy: ". ")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
}

/// Tiny wrapper around AVSpeechSynthesizer so the cook view can show
/// step-by-step audio cues without depending on VoiceInputService's
/// recognition pipeline.
final class SpeechCue: ObservableObject {
    private let synth = AVSpeechSynthesizer()

    func speak(_ text: String) {
        synth.stopSpeaking(at: .immediate)
        let utter = AVSpeechUtterance(string: text)
        utter.rate = 0.45
        utter.voice = AVSpeechSynthesisVoice(language: "en-US")
        synth.speak(utter)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }
}
