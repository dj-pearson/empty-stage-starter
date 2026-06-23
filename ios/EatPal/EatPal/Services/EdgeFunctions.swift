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

    /// HTTP status codes that are worth retrying — transient gateway/upstream
    /// failures rather than client errors.
    private static let retryableStatuses: Set<Int> = [502, 503, 504]

    /// Max attempts (1 original + retries). US-400: at least one retry on a
    /// transient failure before surfacing the error.
    private static let maxAttempts = 2

    /// Invoke an edge function and return the raw response `Data`.
    ///
    /// US-400: retries transient failures (502/503/504, connection lost, timed
    /// out) with backoff, and honors Task cancellation so dismissing a view
    /// aborts in-flight work. Centralized here so every AI caller benefits.
    static func invokeRaw(_ name: String, jsonBody: Data) async throws -> Data {
        guard let url = url(for: name), let anonKey = anonKey() else {
            throw CallError.missingConfig
        }

        let bearer = (await sessionAccessToken()) ?? anonKey

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.httpBody = jsonBody
        request.timeoutInterval = 60

        var lastError: Error = CallError.invalidResponse
        for attempt in 1...maxAttempts {
            // Abort immediately if the caller's Task was cancelled (e.g. view
            // dismissed) rather than starting another network round-trip.
            try Task.checkCancellation()
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse else { throw CallError.invalidResponse }

                if (200..<300).contains(http.statusCode) {
                    return data
                }

                let statusError = CallError.status(http.statusCode, String(data: data, encoding: .utf8))
                // Only retry transient upstream/gateway statuses; 4xx and other
                // 5xx are surfaced immediately.
                if retryableStatuses.contains(http.statusCode), attempt < maxAttempts {
                    lastError = statusError
                    try await backoff(forAttempt: attempt)
                    continue
                }
                throw statusError
            } catch let error as CallError {
                throw error
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                // URLError (timed out, connection lost, can't connect, etc.).
                lastError = error
                if attempt < maxAttempts, isTransient(error) {
                    try await backoff(forAttempt: attempt)
                    continue
                }
                throw error
            }
        }
        throw lastError
    }

    /// Whether a URLSession error is transient and worth retrying.
    private static func isTransient(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .timedOut, .networkConnectionLost, .cannotConnectToHost,
             .cannotFindHost, .dnsLookupFailed, .notConnectedToInternet:
            return true
        default:
            return false
        }
    }

    /// Cancellation-aware exponential backoff: 0.5s, 1s, …
    private static func backoff(forAttempt attempt: Int) async throws {
        let seconds = 0.5 * pow(2.0, Double(attempt - 1))
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
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
