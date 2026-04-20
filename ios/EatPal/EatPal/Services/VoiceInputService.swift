import AVFoundation
import Foundation
import Speech

/// Thin wrapper around `SFSpeechRecognizer` + `AVAudioEngine` that exposes a
/// live transcript and a simple state machine. Used by US-140 voice-to-grocery.
///
/// Design notes:
///  - On-device recognition is preferred (`requiresOnDeviceRecognition = true`)
///    so spoken grocery items never leave the phone.
///  - Authorization is split into mic and speech-recognition; either can be
///    denied independently. `requestAuthorization()` handles both.
///  - `stop()` finalises the current task; the last full transcript is
///    emitted via the `finalTranscript` property before state returns to `.idle`.
@MainActor
final class VoiceInputService: ObservableObject {
    enum State: Equatable {
        case idle
        case preparing
        case listening
        case error(String)
    }

    enum AuthorizationStatus {
        case authorized
        case micDenied
        case speechDenied
        case bothDenied
        case notDetermined
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var liveTranscript: String = ""
    @Published private(set) var finalTranscript: String = ""
    /// 0.0–1.0 approximation of current input level for the waveform UI.
    @Published private(set) var inputLevel: Double = 0

    private let recognizer: SFSpeechRecognizer?
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    init(locale: Locale = .current) {
        self.recognizer = SFSpeechRecognizer(locale: locale)
    }

    // MARK: - Authorization

    func authorizationStatus() -> AuthorizationStatus {
        let speech = SFSpeechRecognizer.authorizationStatus()
        let mic = AVAudioApplication.shared.recordPermission

        let speechOK = speech == .authorized
        let micOK = mic == .granted

        switch (speechOK, micOK) {
        case (true, true): return .authorized
        case (false, true): return .speechDenied
        case (true, false): return .micDenied
        case (false, false):
            if speech == .notDetermined || mic == .undetermined {
                return .notDetermined
            }
            return .bothDenied
        }
    }

    func requestAuthorization() async -> AuthorizationStatus {
        // Speech
        let speech = await withCheckedContinuation { (continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }

        // Microphone
        let micGranted = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }

        switch (speech == .authorized, micGranted) {
        case (true, true): return .authorized
        case (false, true): return .speechDenied
        case (true, false): return .micDenied
        case (false, false): return .bothDenied
        }
    }

    // MARK: - Recording lifecycle

    func start() async throws {
        guard state == .idle else { return }
        state = .preparing

        let status = authorizationStatus()
        switch status {
        case .notDetermined:
            let newStatus = await requestAuthorization()
            if newStatus != .authorized {
                state = .error(errorMessage(for: newStatus))
                return
            }
        case .authorized:
            break
        default:
            state = .error(errorMessage(for: status))
            return
        }

        guard let recognizer, recognizer.isAvailable else {
            state = .error("Speech recognizer is not available on this device right now.")
            return
        }

        // Configure audio session
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.request?.append(buffer)
            Task { @MainActor [weak self] in
                self?.updateInputLevel(from: buffer)
            }
        }

        audioEngine.prepare()
        try audioEngine.start()

        liveTranscript = ""
        finalTranscript = ""
        state = .listening

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            Task { @MainActor in
                if let result {
                    self.liveTranscript = result.bestTranscription.formattedString
                    if result.isFinal {
                        self.finalTranscript = result.bestTranscription.formattedString
                    }
                }
                if error != nil {
                    self.finish(withError: error)
                }
            }
        }
    }

    func stop() {
        guard state == .listening || state == .preparing else { return }

        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        task = nil
        request = nil

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        // If the recognizer never produced a final callback, fall back to the
        // most recent partial transcript so the UI still sees what was said.
        if finalTranscript.isEmpty {
            finalTranscript = liveTranscript
        }
        inputLevel = 0
        state = .idle
    }

    func cancel() {
        task?.cancel()
        stop()
        liveTranscript = ""
        finalTranscript = ""
    }

    // MARK: - Private helpers

    private func finish(withError error: Error?) {
        if let error {
            state = .error(error.localizedDescription)
        }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        task = nil
        request = nil
    }

    private func updateInputLevel(from buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?[0] else { return }
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return }

        var sum: Float = 0
        for i in 0..<frameLength {
            let sample = channelData[i]
            sum += sample * sample
        }
        let rms = sqrt(sum / Float(frameLength))
        let normalised = min(Double(rms) * 8.0, 1.0)  // visual scaling
        // Smooth: 70% old, 30% new
        self.inputLevel = inputLevel * 0.7 + normalised * 0.3
    }

    private func errorMessage(for status: AuthorizationStatus) -> String {
        switch status {
        case .micDenied: return "Microphone access denied. Enable it in Settings to use voice."
        case .speechDenied: return "Speech recognition denied. Enable it in Settings to use voice."
        case .bothDenied: return "Microphone and speech recognition are denied. Enable them in Settings."
        case .notDetermined: return "Permission was not granted."
        case .authorized: return ""
        }
    }
}
