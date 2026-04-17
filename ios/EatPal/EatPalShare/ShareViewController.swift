import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// US-143: Share-extension entry point. The system instantiates this class
/// (declared as NSExtensionPrincipalClass in Info.plist) when the user picks
/// "EatPal" from the iOS share sheet. Extracts the shared URL/text and hands
/// it to `ShareImportView` inside a UIHostingController.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        // Extract the shared URL / text from the extension context on launch.
        Task { @MainActor in
            let url = await extractSharedURL()
            presentImportView(url: url)
        }
    }

    // MARK: - Item extraction

    private func extractSharedURL() async -> URL? {
        guard let extensionContext,
              let inputItems = extensionContext.inputItems as? [NSExtensionItem] else {
            return nil
        }

        for item in inputItems {
            guard let attachments = item.attachments else { continue }

            for provider in attachments {
                // Prefer URL first — most browsers / Safari send this.
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(
                        forTypeIdentifier: UTType.url.identifier,
                        options: nil
                    ) as? URL {
                        return url
                    }
                }

                // Fall back to plain text — some apps (Instagram, TikTok) send
                // a caption with the URL embedded.
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let text = try? await provider.loadItem(
                        forTypeIdentifier: UTType.plainText.identifier,
                        options: nil
                    ) as? String,
                       let url = extractURLFromText(text) {
                        return url
                    }
                }
            }
        }

        return nil
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

    private func presentImportView(url: URL?) {
        let hosting = UIHostingController(
            rootView: ShareImportView(
                sharedURL: url,
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
