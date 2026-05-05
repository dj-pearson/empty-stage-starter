export interface UpgradePromptRequest {
  feature: string;
  message?: string;
}

type Listener = (request: UpgradePromptRequest) => void;

const listeners = new Set<Listener>();

export function requestUpgradePrompt(request: UpgradePromptRequest): void {
  listeners.forEach((listener) => listener(request));
}

export function subscribeUpgradePrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
