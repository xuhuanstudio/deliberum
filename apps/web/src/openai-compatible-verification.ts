import { useSyncExternalStore } from "react";

let openAICompatibleProviderVerified = false;
const openAICompatibleProviderListeners = new Set<() => void>();

export function markOpenAICompatibleProviderVerified(): void {
  setOpenAICompatibleProviderVerified(true);
}

export function clearOpenAICompatibleProviderVerified(): void {
  setOpenAICompatibleProviderVerified(false);
}

export function useOpenAICompatibleProviderVerification(): boolean {
  return useSyncExternalStore(
    subscribeOpenAICompatibleProviderVerification,
    readOpenAICompatibleProviderVerified,
    () => false
  );
}

function readOpenAICompatibleProviderVerified(): boolean {
  return openAICompatibleProviderVerified;
}

function setOpenAICompatibleProviderVerified(verified: boolean): void {
  if (openAICompatibleProviderVerified === verified) {
    return;
  }

  openAICompatibleProviderVerified = verified;

  for (const listener of openAICompatibleProviderListeners) {
    listener();
  }
}

function subscribeOpenAICompatibleProviderVerification(listener: () => void): () => void {
  openAICompatibleProviderListeners.add(listener);

  return () => {
    openAICompatibleProviderListeners.delete(listener);
  };
}
