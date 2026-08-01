import SwiftUI

/// US-607: exposure ladder board — the iOS counterpart of the web
/// `FoodLadderBoard`.
///
/// The app has always been able to answer "what happened last Tuesday". This
/// answers "where are we now", which is the question parents actually carry
/// around.
///
/// The tone is deliberate. Resting and paused foods are presented as resting,
/// never as failures, and no control here invites a retry on a food the child
/// refused twice — that decision stays entirely with the parent.
struct FoodLadderView: View {
    @EnvironmentObject var appState: AppState

    /// Working set first, finished last.
    private let sectionOrder: [LadderStatus] = [.active, .backedOff, .paused, .mastered]

    private var rows: [KidFoodLadder] {
        appState.ladderRows()
    }

    private var hasActiveRows: Bool {
        rows.contains { $0.ladderStatus == .active }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                if appState.isLoading && rows.isEmpty {
                    ForEach(0..<3, id: \.self) { _ in
                        SkeletonView(shape: .card)
                    }
                } else if appState.activeKidId == nil {
                    emptyMessage("Choose a child to see their ladder.")
                } else if rows.isEmpty {
                    emptyState
                } else {
                    ForEach(sectionOrder, id: \.self) { status in
                        let section = rows.filter { $0.ladderStatus == status }
                        if !section.isEmpty {
                            LadderSection(status: status, rows: section)
                        }
                    }
                }

                disclaimer
            }
            .padding()
        }
        .navigationTitle("Exposure ladder")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await appState.loadKidFoodLadder() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(
                "Where each food sits right now, and what comes next. Small steps, "
                + "at your child's pace — a food that gets a no simply steps back and rests."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)

            if hasActiveRows, let kidId = appState.activeKidId {
                Button {
                    Task { await appState.pauseAllLadders(kidId: kidId) }
                } label: {
                    Label("Pause everything", systemImage: "pause.circle")
                }
                .buttonStyle(.bordered)
                .accessibilityHint("Stops scheduling every food on this child's ladder")
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Start a ladder")
                .font(.headline)
            Text(
                "A ladder tracks each food one small step at a time — from just looking "
                + "at it, through touching and smelling, all the way to a full portion."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func emptyMessage(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 32)
    }

    private var disclaimer: some View {
        Text(
            "EatPal helps you keep track and keep things steady. It is not medical advice "
            + "or treatment. If mealtimes are affecting your child's growth or wellbeing, a "
            + "feeding therapist or your pediatrician is the right next step."
        )
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
}

// MARK: - Section

private struct LadderSection: View {
    let status: LadderStatus
    let rows: [KidFoodLadder]

    private var title: String {
        switch status {
        case .active: return "Working on"
        case .backedOff: return "Resting"
        case .paused: return "Paused"
        case .mastered: return "Made it"
        }
    }

    private var subtitle: String {
        switch status {
        case .active:
            return "These come back around on their own schedule."
        case .backedOff:
            return "A meal went badly, so these have stepped back and are taking a longer "
                + "break. Bring them back whenever you feel ready."
        case .paused:
            return "Nothing scheduled for these. They will wait as long as you need."
        case .mastered:
            return "Eaten as a full portion. These are part of the rotation now."
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text(title).font(.headline)
                Text("\(rows.count)")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color(.tertiarySystemFill), in: Capsule())
            }

            Text(subtitle)
                .font(.footnote)
                .foregroundStyle(.secondary)

            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 { Divider() }
                    LadderRowView(row: row)
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Row

private struct LadderRowView: View {
    @EnvironmentObject var appState: AppState

    let row: KidFoodLadder

    private var foodName: String {
        appState.foods.first { $0.id == row.foodId }?.name ?? "Removed food"
    }

    private var anchorName: String? {
        guard let anchorId = row.pairedSafeFoodId else { return nil }
        return appState.foods.first { $0.id == anchorId }?.name
    }

    private var context: String {
        var parts: [String] = []
        parts.append(anchorName.map { "Served with \($0)" } ?? "No safe food paired yet")

        if row.ladderStatus == .active, let due = row.nextDueOn {
            parts.append("next on \(due)")
        }
        if row.ladderStatus == .paused, row.pausedReason == "two_refusals" {
            parts.append("resting after two no's")
        }
        if row.ladderStatus == .backedOff {
            parts.append("resting after a hard meal")
        }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(foodName).font(.body.weight(.medium))
                    Text("\(row.rung.emoji) \(row.rung.displayName)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                RungTrack(rung: row.rung)

                Text(context)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            Menu {
                if row.ladderStatus == .active {
                    Button {
                        Task { await appState.pauseLadder(row) }
                    } label: {
                        Label("Pause", systemImage: "pause")
                    }
                } else if row.ladderStatus != .mastered {
                    Button {
                        Task { await appState.resumeLadder(row) }
                    } label: {
                        Label("Resume", systemImage: "play")
                    }
                }

                if row.ladderStatus != .mastered && row.rung != .looking {
                    Button {
                        Task { await appState.stepDownLadder(row) }
                    } label: {
                        Label("Make it gentler", systemImage: "chevron.down")
                    }
                }

                Button(role: .destructive) {
                    Task { await appState.removeFromLadder(row) }
                } label: {
                    Label("Remove", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .imageScale(.large)
            }
            .accessibilityLabel("Options for \(foodName)")
        }
        .padding(.vertical, 12)
    }
}

/// Eight segments, one per rung, filled up to where the child is. A plain
/// progress bar would lose which *step* they are on, and the step is the point.
private struct RungTrack: View {
    let rung: LadderRung

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(LadderRung.allCases.enumerated()), id: \.element) { index, _ in
                Capsule()
                    .fill(index <= rung.index ? Color.accentColor : Color(.tertiarySystemFill))
                    .frame(width: 16, height: 5)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(rung.displayName) — step \(rung.index + 1) of \(LadderRung.allCases.count)"
        )
    }
}
