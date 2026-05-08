import SwiftUI
import PhotosUI

/// US-294: Receipt scan sheet for the pantry. Pick or shoot a photo of a
/// grocery receipt, parse via the `parse-receipt-image` edge function,
/// confirm the line items in a tight review screen, and bulk-insert into
/// the pantry.
struct ScanReceiptSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState

    enum Stage {
        case picker
        case parsing
        case review
        case saving
    }

    @State private var stage: Stage = .picker
    @State private var pickerItem: PhotosPickerItem?
    @State private var pickedImage: UIImage?
    @State private var receipt: ReceiptScanService.Receipt?
    @State private var rows: [ReviewRow] = []
    @State private var errorMessage: String?
    @State private var startedAt: Date?

    private var acceptedRows: [ReviewRow] { rows.filter(\.accept) }
    private var droppedCount: Int { rows.count - acceptedRows.count }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Scan a receipt")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    if stage == .review {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Add \(acceptedRows.count)") {
                                Task { await save() }
                            }
                            .disabled(acceptedRows.isEmpty)
                        }
                    }
                }
        }
        .onChange(of: pickerItem) { _, newValue in
            guard let item = newValue else { return }
            Task { await handlePicked(item) }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch stage {
        case .picker:   picker
        case .parsing:  parsingView
        case .review:   reviewView
        case .saving:   savingView
        }
    }

    // MARK: - Stages

    private var picker: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "doc.text.viewfinder")
                .font(.system(size: 60))
                .foregroundStyle(.blue)
            VStack(spacing: 6) {
                Text("Snap your receipt")
                    .font(.title2.bold())
                Text("We'll read every line and add the items to your pantry.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            Spacer()
            PhotosPicker(
                selection: $pickerItem,
                matching: .images,
                photoLibrary: .shared()
            ) {
                Label("Choose photo", systemImage: "photo.on.rectangle.angled")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            .padding(.horizontal, 24)
            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            Text("Tip: lay the receipt flat, fill the frame, even light.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.bottom)
            Spacer().frame(height: 16)
        }
    }

    private var parsingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Reading your receipt…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var reviewView: some View {
        VStack(spacing: 0) {
            if let r = receipt {
                HStack(spacing: 8) {
                    if let merchant = r.merchant {
                        Text(merchant)
                            .font(.caption.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.gray.opacity(0.18), in: Capsule())
                    }
                    if let date = r.purchasedAt {
                        Text(date)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(r.currency)
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                    Spacer()
                    Menu {
                        Button("Trust all") { trustAll() }
                        Button("Skip low-confidence") { skipLowConfidence() }
                    } label: {
                        Label("Bulk", systemImage: "ellipsis.circle")
                            .labelStyle(.iconOnly)
                            .font(.title3)
                    }
                    .accessibilityLabel("Bulk options")
                }
                .padding(.horizontal)
                .padding(.top, 8)
            }

            List {
                ForEach($rows) { $row in
                    ReviewRowView(row: $row)
                }
                .onDelete { indexSet in
                    rows.remove(atOffsets: indexSet)
                }
            }
            .listStyle(.plain)
        }
    }

    private var savingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Saving \(acceptedRows.count) items to pantry…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Actions

    private func handlePicked(_ item: PhotosPickerItem) async {
        errorMessage = nil
        startedAt = Date()
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                errorMessage = "Couldn't load that photo."
                return
            }
            pickedImage = image
            AnalyticsService.track(.receiptScanStarted(fileSizeKb: Int(data.count / 1024)))
            stage = .parsing
            do {
                let r = try await ReceiptScanService.parse(image)
                receipt = r
                rows = r.lineItems.map { item in
                    ReviewRow(
                        item: item,
                        accept: item.confidence >= 0.5,
                        matchedFoodId: ReceiptScanService.matchExistingFood(
                            name: item.parsedName,
                            foods: appState.foods
                        )
                    )
                }
                let avgConfidence = r.lineItems.isEmpty ? 0 :
                    r.lineItems.reduce(0.0) { $0 + $1.confidence } / Double(r.lineItems.count)
                let durationMs = Int(Date().timeIntervalSince(startedAt ?? Date()) * 1000)
                AnalyticsService.track(.receiptParseCompleted(
                    avgConfidence: avgConfidence,
                    lineCount: r.lineItems.count,
                    durationMs: durationMs
                ))
                stage = .review
            } catch let serviceError as ReceiptScanService.ServiceError {
                errorMessage = serviceError.errorDescription
                stage = .picker
                AnalyticsService.track(.receiptScanFailed(reason: String(describing: serviceError)))
            } catch {
                errorMessage = error.localizedDescription
                stage = .picker
                AnalyticsService.track(.receiptScanFailed(reason: error.localizedDescription))
            }
        } catch {
            errorMessage = error.localizedDescription
            stage = .picker
        }
    }

    private func trustAll() {
        for index in rows.indices { rows[index].accept = true }
    }

    private func skipLowConfidence() {
        for index in rows.indices {
            rows[index].accept = rows[index].item.confidence >= 0.7
        }
    }

    private func save() async {
        guard !acceptedRows.isEmpty else { return }
        stage = .saving
        let foods: [Food] = acceptedRows.map { row in
            Food(
                id: UUID().uuidString,
                userId: "",
                householdId: nil,
                name: row.item.parsedName,
                category: ReceiptScanService.normalizedCategory(row.item.category),
                isSafe: true,
                isTryBite: false,
                allergens: nil,
                barcode: nil,
                aisle: nil,
                quantity: row.item.qty,
                unit: row.item.unit.isEmpty ? nil : row.item.unit,
                servingsPerContainer: nil,
                packageQuantity: nil,
                expiryDate: nil,
                pricePerUnit: row.item.unitPrice > 0 ? row.item.unitPrice : nil,
                currency: receipt?.currency,
                createdAt: nil,
                updatedAt: nil
            )
        }
        do {
            try await DataService.shared.bulkInsertFoods(foods)
            await appState.refreshFoodsAfterReceiptScan()
            AnalyticsService.track(.receiptItemsAccepted(
                acceptedCount: foods.count,
                droppedCount: droppedCount
            ))
            AnalyticsService.track(.receiptFirstScanCompleted(itemCount: foods.count))
            dismiss()
        } catch {
            errorMessage = "Couldn't save: \(error.localizedDescription)"
            stage = .review
        }
    }
}

// MARK: - Review row

struct ReviewRow: Identifiable, Equatable {
    let id = UUID()
    var item: ReceiptScanService.LineItem
    var accept: Bool
    var matchedFoodId: String?
}

private struct ReviewRowView: View {
    @Binding var row: ReviewRow

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            confidenceDot
            Toggle("", isOn: $row.accept)
                .labelsHidden()
                .toggleStyle(.switch)
                .tint(.green)
                .accessibilityLabel("Include \(row.item.parsedName)")
            VStack(alignment: .leading, spacing: 4) {
                TextField("Name", text: $row.item.parsedName)
                    .font(.subheadline.weight(.medium))
                HStack(spacing: 6) {
                    TextField("Qty", value: $row.item.qty, formatter: NumberFormatter.qty)
                        .keyboardType(.decimalPad)
                        .frame(width: 56)
                    TextField("unit", text: $row.item.unit)
                        .frame(width: 64)
                    Text("$\(row.item.lineTotal, specifier: "%.2f")")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Picker("Category", selection: $row.item.category) {
                        ForEach(["protein", "carb", "dairy", "fruit", "vegetable", "snack", "beverage", "pantry", "frozen", "household", "other"], id: \.self) {
                            Text($0).tag($0)
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                }
                .font(.caption)
            }
            if let matchedFoodId = row.matchedFoodId, !matchedFoodId.isEmpty {
                Image(systemName: "arrow.left.and.right.circle")
                    .foregroundStyle(.blue)
                    .accessibilityLabel("Will match an existing pantry food")
            }
        }
        .padding(.vertical, 4)
    }

    private var confidenceDot: some View {
        let color: Color = {
            if row.item.confidence >= 0.8 { return .green }
            if row.item.confidence >= 0.5 { return .orange }
            return .red
        }()
        return Circle()
            .fill(color)
            .frame(width: 10, height: 10)
            .padding(.top, 6)
            .accessibilityLabel("Confidence \(Int(row.item.confidence * 100)) percent")
    }
}

// MARK: - Helpers

extension NumberFormatter {
    static let qty: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        return f
    }()
}

extension ReceiptScanService {
    /// Map the receipt's wider category enum down to the in-app FoodCategory
    /// enum's string values. Anything unknown ends up in "snack" so it
    /// never blocks the import.
    static func normalizedCategory(_ raw: String) -> String {
        switch raw.lowercased() {
        case "protein": return "protein"
        case "carb": return "carb"
        case "dairy": return "dairy"
        case "fruit": return "fruit"
        case "vegetable": return "vegetable"
        case "snack": return "snack"
        default: return "snack"
        }
    }
}

extension AppState {
    /// Pulls foods from Supabase after a bulk receipt insert so the pantry
    /// view picks up the new rows. Errors are swallowed because the items
    /// are already persisted; a refresh is best-effort.
    @MainActor
    func refreshFoodsAfterReceiptScan() async {
        do {
            self.foods = try await DataService.shared.fetchFoods()
        } catch {
            // Best-effort; UI will catch up on next manual refresh.
        }
    }
}
