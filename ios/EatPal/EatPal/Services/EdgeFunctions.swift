import Foundation

/// Self-hosted Coolify-Supabase quirk: Kong's `/functions/v1/*` upstream
/// can't resolve the deno-functions container on this deployment, so
/// `client.functions.invoke(...)` from the Supabase Swift SDK 503s with
/// "name resolution failed". The web app side-steps this in
/// `src/lib/edge-functions.ts` by hitting `functions.tryeatpal.com/<name>`
/// directly. This helper is the iOS twin of that approach.
///
/// Use `EdgeFunctions.invoke(...)` instead of `client.functions.invoke(...)`
/// for any call that would otherwise route through Kong.
enum EdgeFunctions {
    enum CallError: Error, LocalizedError {
        case missingConfig
        case invalidResponse
        case status(Int, String?)
        case decoding(String)

        var errorDescription: String? {
            switch self {
            case .missingConfig:
                return "Edge functions URL or anon key not configured."
            case .invalidResponse:
                return "Invalid response from edge function."
            case .status(let code, let body):
                return "Edge function returned \(code)" + (body.map { ": \($0)" } ?? "")
            case .decoding(let detail):
                return "Couldn't decode edge function response: \(detail)"
            }
        }
    }

    /// Invoke an edge function with a Codable body, decode a Codable response.
    static func invoke<Response: Decodable>(
        _ name: String,
        body: some Encodable,
        as: Response.Type = Response.self
    ) async throws -> Response {
        let data = try JSONEncoder().encode(body)
        return try await invoke(name, jsonBody: data, as: Response.self)
    }

    /// Invoke an edge function with raw JSON `Data`, decode a Codable response.
    /// Use when the request body is built via `JSONSerialization` (heterogeneous
    /// dictionaries) rather than a typed `Encodable`.
    static func invoke<Response: Decodable>(
        _ name: String,
        jsonBody: Data,
        as: Response.Type = Response.self
    ) async throws -> Response {
        let data = try await invokeRaw(name, jsonBody: jsonBody)
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw CallError.decoding(error.localizedDescription)
        }
    }

    /// Invoke an edge function and return the raw response `Data`.
    static func invokeRaw(_ name: String, jsonBody: Data) async throws -> Data {
        guard let url = url(for: name), let anonKey = anonKey() else {
            throw CallError.missingConfig
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")

        let bearer = (await sessionAccessToken()) ?? anonKey
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.httpBody = jsonBody
        request.timeoutInterval = 60

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CallError.invalidResponse }

        guard (200..<300).contains(http.statusCode) else {
            throw CallError.status(http.statusCode, String(data: data, encoding: .utf8))
        }
        return data
    }

    // MARK: - Config

    private static func url(for name: String) -> URL? {
        baseURL()?.appendingPathComponent(name)
    }

    private static func baseURL() -> URL? {
        // 1. Explicit `FUNCTIONS_URL` Info.plist entry, if set.
        if let raw = Bundle.main.object(forInfoDictionaryKey: "FUNCTIONS_URL") as? String,
           !raw.isEmpty,
           raw != "$(FUNCTIONS_URL)",
           let url = URL(string: raw) {
            return url
        }
        // 2. Derive from `SUPABASE_URL` by swapping the `api.` subdomain for
        //    `functions.` — matches the web pattern.
        if let supabaseRaw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
           !supabaseRaw.isEmpty,
           supabaseRaw != "$(SUPABASE_URL)" {
            let derived = supabaseRaw.replacingOccurrences(of: "://api.", with: "://functions.")
            if let url = URL(string: derived) { return url }
        }
        // 3. Hard-coded fallback (matches `SupabaseClient.swift`'s default).
        return URL(string: "https://functions.tryeatpal.com")
    }

    private static func anonKey() -> String? {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
              !key.isEmpty,
              key != "$(SUPABASE_ANON_KEY)" else {
            return nil
        }
        return key
    }

    /// Best-effort lookup of the current session's access token. Falls back
    /// to `nil` if there's no session yet (cold launch, share extension, etc.).
    private static func sessionAccessToken() async -> String? {
        try? await SupabaseManager.client.auth.session.accessToken
    }
}
