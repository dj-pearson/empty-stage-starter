import SwiftUI

/// US-242: Settings → Household. Lets a parent see who's in the family,
/// generate an invite code to add someone, accept a code from another
/// device, and revoke pending invites or members.
struct HouseholdSettingsView: View {
    @State private var household: Household?
    @State private var members: [HouseholdMember] = []
    @State private var openInvites: [HouseholdInviteCode] = []
    @State private var isLoading = true
    @State private var loadError: String?

    @State private var generatingInvite = false
    @State private var freshlyGeneratedCode: String?
    @State private var showCodeShareSheet = false

    @State private var joinCode: String = ""
    @State private var isJoining = false
    @State private var joinError: String?
    @State private var joinSuccess: String?

    @State private var memberToRemove: HouseholdMember?
    @State private var inviteToRevoke: HouseholdInviteCode?

    /// US-274: Household-shared smart-add preferences. Off by default so
    /// existing users see no behavior change; turning it on routes
    /// future preference writes to the household-scoped row that all
    /// members read from.
    @AppStorage(SmartProductService.householdShareEnabledKey)
    private var householdShareEnabled: Bool = false

    var body: some View {
        Form {
            if isLoading && household == nil {
                Section {
                    ProgressView("Loading household…")
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }

            if let loadError, household == nil {
                Section {
                    Text(loadError)
                        .font(.callout)
                        .foregroundStyle(.red)
                }
            }

            if let household {
                householdSection(household)
                membersSection
                smartAddSharingSection
                invitesSection
            }

            joinSection

            if household != nil {
                Section {
                    Text("Anyone you invite can view and edit the same meal plan, pantry, and grocery list. Removing a member revokes their access immediately.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Household")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .alert(
            "Remove from household?",
            isPresented: Binding(
                get: { memberToRemove != nil },
                set: { if !$0 { memberToRemove = nil } }
            ),
            presenting: memberToRemove
        ) { member in
            Button("Remove", role: .destructive) {
                Task { await remove(member) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("They'll lose access to the meal plan, pantry, and grocery list immediately.")
        }
        .alert(
            "Revoke invite?",
            isPresented: Binding(
                get: { inviteToRevoke != nil },
                set: { if !$0 { inviteToRevoke = nil } }
            ),
            presenting: inviteToRevoke
        ) { invite in
            Button("Revoke", role: .destructive) {
                Task { await revoke(invite) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { invite in
            Text("Code \(invite.code) will stop working straight away.")
        }
    }

    // MARK: - Sections

    private func householdSection(_ household: Household) -> some View {
        Section {
            HStack {
                Image(systemName: "house.fill")
                    .foregroundStyle(.green)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(household.name)
                        .font(.body)
                        .fontWeight(.medium)
                    Text("\(members.count) member\(members.count == 1 ? "" : "s")")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
        } header: {
            Text("Family")
        }
    }

    /// US-274: opt-in toggle for household-shared product preferences.
    /// When on, the smart-add resolver checks the household tier before
    /// the user-only tier and writes future preferences as household-
    /// scoped rows visible to every member.
    private var smartAddSharingSection: some View {
        Section {
            Toggle(isOn: $householdShareEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Share smart-add preferences")
                        .font(.body)
                    Text("Aisle, brand, and unit choices apply for everyone in the household.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .onChange(of: householdShareEnabled) { _, enabled in
                AnalyticsService.track(.householdPreferenceSyncToggled(enabled: enabled))
                HapticManager.selection()
            }
        } header: {
            Text("Smart Add")
        } footer: {
            Text("Future picks go into the shared layer when on. Existing per-user preferences keep working until you replace them.")
                .font(.caption2)
        }
    }

    private var membersSection: some View {
        Section {
            if members.isEmpty {
                Text("No members yet.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(members) { member in
                    HStack(spacing: 12) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.blue)
                        VStack(alignment: .leading, spacing: 2) {
                            // We don't surface the user's email/name here —
                            // RLS only exposes the membership row, not profile
                            // data. Showing the role + relative join date is
                            // a reasonable disambiguator.
                            Text(member.displayRole)
                                .font(.body)
                            if let joined = member.joinedAt {
                                Text("Joined \(formattedJoin(joined))")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Button(role: .destructive) {
                            memberToRemove = member
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove \(member.displayRole) from household")
                    }
                }
            }
        } header: {
            Text("Members")
        }
    }

    private var invitesSection: some View {
        Section {
            Button {
                Task { await createInvite() }
            } label: {
                HStack {
                    if generatingInvite {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "plus.circle.fill")
                            .foregroundStyle(.green)
                    }
                    Text("Generate new invite code")
                    Spacer()
                }
            }
            .disabled(generatingInvite)

            if let freshlyGeneratedCode {
                FreshlyMintedCodeRow(
                    code: freshlyGeneratedCode,
                    onShare: { showCodeShareSheet = true }
                )
            }

            ForEach(openInvites) { invite in
                inviteRow(invite)
            }
        } header: {
            Text("Open invites")
        } footer: {
            Text("Codes expire after 24 hours and can only be used once. Share over a private channel — anyone with the code can join.")
                .font(.caption2)
        }
        .sheet(isPresented: $showCodeShareSheet) {
            if let code = freshlyGeneratedCode {
                ShareSheet(items: ["Join my EatPal family with code: \(code)"])
            }
        }
    }

    private func inviteRow(_ invite: HouseholdInviteCode) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(invite.code)
                    .font(.system(.body, design: .monospaced))
                    .fontWeight(.semibold)
                Text(invite.expiresInDescription)
                    .font(.caption2)
                    .foregroundStyle(invite.isExpired ? .red : .secondary)
            }
            Spacer()
            Button {
                UIPasteboard.general.string = invite.code
                HapticManager.success()
            } label: {
                Image(systemName: "doc.on.doc")
                    .foregroundStyle(.blue)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Copy code \(invite.code)")

            Button(role: .destructive) {
                inviteToRevoke = invite
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.red)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Revoke code \(invite.code)")
        }
    }

    private var joinSection: some View {
        Section {
            HStack {
                TextField("6-digit code", text: $joinCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(.body, design: .monospaced))
                    .onChange(of: joinCode) { _, new in
                        // Soft cap at 6 chars + uppercase as the user types.
                        if new.count > 6 { joinCode = String(new.prefix(6)) }
                        joinCode = joinCode.uppercased()
                    }

                Button("Join") {
                    Task { await acceptInvite() }
                }
                .disabled(joinCode.count < 6 || isJoining)
            }

            if let joinError {
                Text(joinError)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            if let joinSuccess {
                Label(joinSuccess, systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        } header: {
            Text("Join an existing household")
        } footer: {
            Text("Ask the inviter to generate a code in their EatPal Settings.")
                .font(.caption2)
        }
    }

    // MARK: - Actions

    private func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        do {
            let h = try await HouseholdService.currentHousehold()
            household = h
            async let members = HouseholdService.members(householdId: h.id)
            async let invites = HouseholdService.openInviteCodes(householdId: h.id)
            self.members = try await members
            self.openInvites = try await invites
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription
                ?? error.localizedDescription
        }
    }

    private func createInvite() async {
        generatingInvite = true
        defer { generatingInvite = false }
        do {
            let code = try await HouseholdService.createInvite()
            freshlyGeneratedCode = code
            HapticManager.success()
            // Refresh the open list so the new code shows up alongside the
            // freshly-minted highlight row.
            if let id = household?.id {
                openInvites = (try? await HouseholdService.openInviteCodes(householdId: id)) ?? openInvites
            }
        } catch {
            ToastManager.shared.show(error, as: { .save(entity: "invite code", underlying: $0) })
        }
    }

    private func acceptInvite() async {
        joinError = nil
        joinSuccess = nil
        isJoining = true
        defer { isJoining = false }
        do {
            _ = try await HouseholdService.acceptInvite(code: joinCode)
            HapticManager.success()
            joinSuccess = "Joined! Reload the app to see the shared data."
            joinCode = ""
            await load()
        } catch {
            joinError = (error as? LocalizedError)?.errorDescription
                ?? error.localizedDescription
            HapticManager.error()
        }
    }

    private func remove(_ member: HouseholdMember) async {
        do {
            try await HouseholdService.removeMember(memberId: member.id)
            members.removeAll { $0.id == member.id }
            HapticManager.success()
        } catch {
            ToastManager.shared.show(error, as: { .delete(entity: "member", underlying: $0) })
        }
    }

    private func revoke(_ invite: HouseholdInviteCode) async {
        do {
            try await HouseholdService.revokeInvite(id: invite.id)
            openInvites.removeAll { $0.id == invite.id }
            if freshlyGeneratedCode == invite.code { freshlyGeneratedCode = nil }
            HapticManager.success()
        } catch {
            ToastManager.shared.show(error, as: { .delete(entity: "invite", underlying: $0) })
        }
    }

    private func formattedJoin(_ raw: String) -> String {
        guard let date = ISO8601DateFormatter.permissive.date(from: raw) else { return "recently" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Highlight row for a freshly generated code

private struct FreshlyMintedCodeRow: View {
    let code: String
    let onShare: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text(code)
                .font(.system(size: 36, weight: .bold, design: .monospaced))
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                // Spell each character individually for VoiceOver
                // ("A B C 1 2 3" instead of "ABC123"). map(String.init) is
                // unambiguous; Array(code) hits the variadic-literal overload.
                .accessibilityLabel("Invite code: \(code.map(String.init).joined(separator: " "))")

            HStack(spacing: 10) {
                Button {
                    UIPasteboard.general.string = code
                    HapticManager.success()
                    ToastManager.shared.success("Copied", message: code)
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    onShare()
                } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }
        }
        .padding(.vertical, 4)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
    }
}

// MARK: - Share sheet helper

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    NavigationStack {
        HouseholdSettingsView()
    }
}
