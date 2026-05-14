import SwiftUI

/// US-289: iOS parity for the web quick-add (US-288). Lives at the top of
/// `PantryView` and lets the user type "2 lb chicken", hit return, and
/// keep going — no sheet, no pickers, no waiting.
///
/// Parsing chain (most-confident first):
///   1. `FoodBulkParser.parseLine` — handles "<qty> [unit] <name>" with
///      fractions, decimals, and the existing 25-token unit table.
///   2. `UnitInference.infer` — when only a bare name is given, fall back
///      to the 50-rule "what unit do people normally buy this in?" table
///      shared with the grocery quick-add (eggs → dozen, milk → gal).
///   3. Bare name with no inference — quantity defaults to 1, unit nil.
///
/// The "Add" CTA is intentionally always visible so RTL/voice users
/// without a hardware return key still have a tap target.
struct PantryQuickAddBar: View {
    /// Called after a successful local insert. Lets the parent refocus,
    /// haptic, etc. — the bar itself owns text state + clearing.
    let onAdded: () -> Void

    @EnvironmentObject private var appState: AppState

    @State private var text: String = ""
    @State private var isSubmitting = false
    @FocusState private var inputFocused: Bool

    @StateObject private var voice = VoiceInputService()
    @State private var isDictating = false

    /// Cached parse result. Recomputed on every text change so the live
    /// preview chip stays in sync without per-keystroke regex churn.
    private var parsed: ParseResult? { Self.parse(text) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)

                TextField(
                    "2 lb chicken — try voice or paste a list",
                    text: $text
                )
                .focused($inputFocused)
                .submitLabel(.done)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit { Task { await submit() } }

                if !text.isEmpty {
                    Button {
                        text = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear input")
                }

                voiceButton

                Button {
                    Task { await submit() }
                } label: {
                    Text("Add")
                        .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .controlSize(.small)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                .accessibilityLabel("Add to pantry")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

            if let parsed, !parsed.row.name.isEmpty {
                previewChip(parsed)
            }
        }
        .onChange(of: voice.liveTranscript) { _, new in
            // Stream partial transcripts into the field so the user sees
            // their speech land in real time.
            if isDictating { text = new }
        }
        .onChange(of: voice.finalTranscript) { _, new in
            guard !new.isEmpty else { return }
            text = new
            isDictating = false
        }
    }

    // MARK: - Voice

    @ViewBuilder
    private var voiceButton: some View {
        Button {
            if isDictating {
                voice.stop()
                isDictating = false
            } else {
                Task { await startDictation() }
            }
        } label: {
            Image(systemName: isDictating ? "mic.fill" : "mic")
                .foregroundStyle(isDictating ? Color.red : Color.accentColor)
                .imageScale(.large)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isDictating ? "Stop dictation" : "Dictate pantry item")
    }

    private func startDictation() async {
        let status = await voice.requestAuthorization()
        guard status == .authorized else {
            ToastManager.shared.error("Microphone or speech permission denied.")
            return
        }
        do {
            try await voice.start()
            isDictating = true
        } catch {
            ToastManager.shared.error("Couldn't start voice input.")
        }
    }

    // MARK: - Preview

    @ViewBuilder
    private func previewChip(_ parsed: ParseResult) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "arrow.turn.down.right")
                .font(.caption2)
                .foregroundStyle(.secondary)

            Text(parsed.row.category.icon)
            Text(parsed.row.name)
                .font(.caption.weight(.medium))
            Text("·")
                .foregroundStyle(.tertiary)
            Text(parsed.row.category.displayName)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("·")
                .foregroundStyle(.tertiary)
            Text(quantityLabel(parsed.row))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)

            Spacer()

            confidenceBadge(parsed.confidence)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Color.green.opacity(0.08), in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Will add \(parsed.row.name), \(parsed.row.category.displayName), \(quantityLabel(parsed.row))"
        )
    }

    @ViewBuilder
    private func confidenceBadge(_ confidence: Double) -> some View {
        let label: String = {
            if confidence >= 0.9 { return "exact" }
            if confidence >= 0.6 { return "auto" }
            return "guess"
        }()
        let color: Color = {
            if confidence >= 0.9 { return .green }
            if confidence >= 0.6 { return .blue }
            return .orange
        }()
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }

    private func quantityLabel(_ row: FoodBulkParser.ParsedRow) -> String {
        let qty = row.quantity ?? 1
        let qtyStr: String = {
            if qty == qty.rounded() { return String(Int(qty)) }
            return String(format: "%.2g", qty)
        }()
        if let u = row.unit, !u.isEmpty { return "\(qtyStr) \(u)" }
        return qtyStr
    }

    // MARK: - Submit

    private func submit() async {
        guard let parsed, !parsed.row.name.isEmpty, !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        let row = parsed.row
        let food = Food(
            id: UUID().uuidString,
            userId: "",
            name: row.name,
            category: row.category.rawValue,
            isSafe: true,
            isTryBite: false,
            quantity: row.quantity ?? 1,
            unit: row.unit
        )

        do {
            try await appState.addFood(food)
            AnalyticsService.track(
                .pantryQuickAddSubmitted(parseConfidence: parsed.confidence)
            )
            HapticManager.lightImpact()
            text = ""
            inputFocused = true
            onAdded()
        } catch {
            // AppState toasts on its own; leave the text so the user can
            // retry without retyping.
        }
    }

    // MARK: - Parsing

    /// Public so tests can exercise the same chain without spinning up a
    /// SwiftUI view.
    struct ParseResult: Equatable {
        let row: FoodBulkParser.ParsedRow
        /// 0..1 — caller (telemetry) uses this to spot under-performing
        /// input patterns. Currently: 1.0 explicit qty+unit, 0.7 bare
        /// name with UnitInference hit, 0.3 bare-name fallback.
        let confidence: Double
    }

    static func parse(_ raw: String) -> ParseResult? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard var row = FoodBulkParser.parseLine(trimmed) else { return nil }

        // Tier 1: explicit qty + unit (or just qty) parsed cleanly.
        if row.quantity != nil && row.unit != nil {
            return ParseResult(row: row, confidence: 1.0)
        }
        if row.quantity != nil {
            // Qty present, no unit — partial. Some unit will be inferred
            // below, but we still treat the quantity itself as exact.
        }

        // Tier 2: bare name → consult UnitInference catalog.
        if let inference = UnitInference.infer(name: row.name) {
            if row.quantity == nil { row.quantity = inference.quantity }
            if row.unit == nil { row.unit = inference.unit }
            return ParseResult(row: row, confidence: 0.7)
        }

        // Tier 3: bare name, no inference. Quantity defaults to 1, unit
        // stays nil — caller may show a "guess" badge.
        if row.quantity == nil { row.quantity = 1 }
        return ParseResult(row: row, confidence: 0.3)
    }
}
