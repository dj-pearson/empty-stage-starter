import SwiftUI

/// US-140: voice-to-grocery sheet. Listens via `VoiceInputService`, displays a
/// live transcript + waveform, parses the transcript into `ParsedGroceryItem`
/// previews, and commits selected items through `AppState.addGroceryItem`.
struct VoiceAddGrocerySheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @StateObject private var voice = VoiceInputService()
    @State private var parsedItems: [ParsedGroceryItem] = []
    @State private var excludedIds: Set<UUID> = []
    @State private var isSaving = false

    private var didRecord: Bool {
        !voice.liveTranscript.isEmpty || !voice.finalTranscript.isEmpty
    }

    private var displayedTranscript: String {
        voice.finalTranscript.isEmpty ? voice.liveTranscript : voice.finalTranscript
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                transcriptArea
                    .frame(maxHeight: .infinity)

                previewList

                controls
                    .padding()
                    .background(.ultraThinMaterial)
            }
            .navigationTitle("Voice Add")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        voice.cancel()
                        dismiss()
                    }
                }
            }
        }
        .task {
            _ = await voice.requestAuthorization()
        }
        .onChange(of: voice.liveTranscript) { _, newValue in
            if !newValue.isEmpty {
                parsedItems = GroceryTextParser.parse(newValue)
            }
        }
        .onChange(of: voice.finalTranscript) { _, newValue in
            if !newValue.isEmpty {
                parsedItems = GroceryTextParser.parse(newValue)
            }
        }
    }

    // MARK: - Sections

    private var transcriptArea: some View {
        VStack(spacing: 16) {
            WaveformView(level: voice.inputLevel, isActive: voice.state == .listening)
                .frame(height: 80)
                .padding(.horizontal)
                .padding(.top)

            if case .error(let message) = voice.state {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            } else if didRecord {
                ScrollView {
                    Text(displayedTranscript)
                        .font(.title3)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                        .padding(.bottom)
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.secondary)
                    Text("Tap the mic and dictate items.")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                    Text("Try: “milk, eggs, two pounds of chicken, bananas”.")
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                .padding(.vertical, 16)
            }
        }
    }

    @ViewBuilder
    private var previewList: some View {
        if !parsedItems.isEmpty {
            List {
                Section {
                    ForEach(parsedItems) { item in
                        HStack {
                            Image(systemName: excludedIds.contains(item.id)
                                  ? "circle"
                                  : "checkmark.circle.fill")
                                .foregroundStyle(excludedIds.contains(item.id) ? .secondary : .green)
                                .onTapGesture { toggle(item) }

                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name)
                                    .font(.body)
                                    .fontWeight(.medium)
                                HStack(spacing: 6) {
                                    let cat = FoodCategory(rawValue: item.category)
                                    Text("\(cat?.icon ?? "") \(cat?.displayName ?? item.category)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text("•")
                                        .foregroundStyle(.tertiary)
                                    Text(item.unit.isEmpty
                                         ? "\(formatted(item.quantity))"
                                         : "\(formatted(item.quantity)) \(item.unit)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            Spacer()

                            if item.confidence < 0.75 {
                                Image(systemName: "questionmark.circle")
                                    .foregroundStyle(.orange)
                                    .accessibilityLabel("Low confidence — review before saving")
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { toggle(item) }
                    }
                } header: {
                    Text("\(parsedItems.count - excludedIds.count) of \(parsedItems.count) selected")
                }
            }
            .listStyle(.insetGrouped)
            .frame(maxHeight: 320)
        }
    }

    private var controls: some View {
        HStack(spacing: 16) {
            Button(role: voice.state == .listening ? .destructive : nil) {
                toggleRecording()
            } label: {
                ZStack {
                    Circle()
                        .fill(voice.state == .listening ? Color.red : Color.green)
                        .frame(width: 64, height: 64)
                        .scaleEffect(voice.state == .listening ? 1.0 + voice.inputLevel * 0.2 : 1.0)
                        .animation(.easeInOut(duration: 0.15), value: voice.inputLevel)
                    Image(systemName: voice.state == .listening ? "stop.fill" : "mic.fill")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(voice.state == .listening ? "Stop recording" : "Start recording")

            VStack(spacing: 8) {
                Button {
                    Task { await saveSelected() }
                } label: {
                    Text(isSaving ? "Saving…" : "Add to grocery")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isSaving || selectedItems.isEmpty || voice.state == .listening)

                if !parsedItems.isEmpty {
                    Text("\(selectedItems.count) item\(selectedItems.count == 1 ? "" : "s") ready")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Helpers

    private var selectedItems: [ParsedGroceryItem] {
        parsedItems.filter { !excludedIds.contains($0.id) }
    }

    private func toggleRecording() {
        switch voice.state {
        case .listening:
            voice.stop()
            HapticManager.lightImpact()
        default:
            Task {
                do {
                    try await voice.start()
                    HapticManager.selection()
                } catch {
                    ToastManager.shared.error(
                        "Voice unavailable",
                        message: error.localizedDescription
                    )
                }
            }
        }
    }

    private func toggle(_ item: ParsedGroceryItem) {
        if excludedIds.contains(item.id) {
            excludedIds.remove(item.id)
        } else {
            excludedIds.insert(item.id)
        }
        HapticManager.selection()
    }

    private func saveSelected() async {
        let toSave = selectedItems
        guard !toSave.isEmpty else { return }

        isSaving = true
        defer { isSaving = false }

        var addedCount = 0
        for parsed in toSave {
            let item = GroceryItem(
                id: UUID().uuidString,
                userId: "",
                name: parsed.name,
                category: parsed.category,
                quantity: parsed.quantity,
                unit: parsed.unit.isEmpty ? "count" : parsed.unit,
                checked: false,
                addedVia: "voice"
            )
            do {
                try await appState.addGroceryItem(item)
                addedCount += 1
            } catch {
                continue
            }
        }

        if addedCount > 0 {
            HapticManager.success()
            ToastManager.shared.success(
                "Added \(addedCount) item\(addedCount == 1 ? "" : "s")",
                message: toSave.first?.name ?? ""
            )
            dismiss()
        } else {
            ToastManager.shared.error("Couldn't save voice items", message: "Try again or add manually.")
        }
    }

    private func formatted(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(format: "%.2g", value)
    }
}

// MARK: - Waveform visualiser

private struct WaveformView: View {
    let level: Double
    let isActive: Bool

    private let barCount = 30

    var body: some View {
        HStack(alignment: .center, spacing: 3) {
            ForEach(0..<barCount, id: \.self) { index in
                let phase = Double(index) / Double(barCount)
                // Deterministic per-bar shape so the centre bars read louder
                // than the edges — plays nice with the live `level` input
                // without needing a timeline.
                let shape = 0.5 + 0.5 * sin(phase * .pi * 4)
                let magnitude = isActive
                    ? max(0.1, min(1.0, level * shape + 0.1))
                    : 0.1

                Capsule()
                    .fill(isActive ? Color.green : Color.secondary.opacity(0.4))
                    .frame(width: 4, height: CGFloat(magnitude) * 80)
                    .animation(.easeInOut(duration: 0.12), value: magnitude)
            }
        }
    }
}
