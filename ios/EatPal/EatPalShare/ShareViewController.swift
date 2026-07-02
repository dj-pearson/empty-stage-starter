import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// US-143 / US-295: Share-extension entry point. The system instantiates this
/// class (declared as NSExtensionPrincipalClass in Info.plist) when the user
/// picks "EatPal" from the iOS share sheet. Extracts whatever the source app
/// shared (URL, plain text, or both) and hands it to `ShareImportView` inside
/// a UIHostingController so the user can route it to a recipe import or a
/// grocery list import.
final class ShareViewController: UIViewController {
    /// What the extension extracted from the host app's share payload.
    /// - `url`: a concrete URL (Safari, recipe sites, etc.) — defaults to the
    ///   recipe-import path but a chooser is still offered.
    /// - `text`: plain text without a recognisable URL (Notes lists,
    ///   Reminders, plain pastes) — defaults to the grocery-import path; the
    ///   recipe option is shown but disabled because `parse-recipe` needs a URL.
    /// - `urlInText`: the share carried text *and* an embedded URL we
    ///   detected via NSDataDetector (Instagram captions, etc.). Both options
    ///   are live; the recipe path uses the URL, the grocery path uses the
    ///   full text minus the URL.
    /// - `none`: nothing useful in the payload.
    enum SharedContent {
        case url(URL)
        case text(String)
        case urlInText(URL, text: String)
        case none
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        Task { @MainActor in
            let content = await extractSharedContent()
            presentImportView(content: content)
        }
    }

    /// US-451: cap on shared plain text before it enters the parser. Share
    /// extensions run under a tight (~30-120 MB) jetsam limit; a huge pasted
    /// selection would otherwise be loaded whole and re-parsed on every edit.
    private static let maxSharedTextLength = 20_000

    // MARK: - Item extraction

    private func extractSharedContent() async -> SharedContent {
        guard let extensionContext,
              let inputItems = extensionContext.inputItems as? [NSExtensionItem] else {
            return .none
        }

        var directURL: URL?
        var sharedText: String?

        for item in inputItems {
            guard let attachments = item.attachments else { continue }

            for provider in attachments {
                // Direct URL — Safari, most browsers, recipe sites.
                // US-451: only accept a real web URL. Some apps vend a *file*
                // URL (a shared PDF/photo) as UTType.url; routing that to the
                // recipe parser dead-ends in a network error, so reject
                // file/non-http(s) schemes and let it fall through to text.
                if directURL == nil,
                   provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(
                        forTypeIdentifier: UTType.url.identifier,
                        options: nil
                    ) as? URL,
                       !url.isFileURL,
                       let scheme = url.scheme?.lowercased(),
                       scheme == "http" || scheme == "https" {
                        directURL = url
                    }
                }

                // Plain text — Notes / Reminders / "Copy and Share" flows.
                if sharedText == nil,
                   provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let text = try? await provider.loadItem(
                        forTypeIdentifier: UTType.plainText.identifier,
                        options: nil
                    ) as? String {
                        // US-451: bound the text so the extension can't be
                        // pushed past its memory budget by a huge selection.
                        sharedText = String(text.prefix(Self.maxSharedTextLength))
                    }
                }
            }
        }

        // Decide the routing.
        if let directURL {
            return .url(directURL)
        }
        if let sharedText, !sharedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if let embedded = extractURLFromText(sharedText) {
                return .urlInText(embedded, text: sharedText)
            }
            return .text(sharedText)
        }
        return .none
    }

    /// Best-effort URL extraction from free text. Uses NSDataDetector so
    /// "Check this out https://example.com/recipe" still works.
    private func extractURLFromText(_ text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        let matches = detector.matches(in: text, options: [], range: NSRange(text.startIndex..., in: text))
        return matches.first?.url
    }

    // MARK: - Presentation

    private func presentImportView(content: SharedContent) {
        let hosting = UIHostingController(
            rootView: ShareImportView(
                content: content,
                onDone: { [weak self] in
                    self?.complete()
                },
                onCancel: { [weak self] in
                    self?.cancel()
                }
            )
        )

        addChild(hosting)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hosting.view)
        NSLayoutConstraint.activate([
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hosting.didMove(toParent: self)
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    private func cancel() {
        let error = NSError(domain: "com.eatpal.app.share", code: 0)
        extensionContext?.cancelRequest(withError: error)
    }
}
