type UpdateFn = (reloadPage?: boolean) => Promise<void>;

let applyUpdate: UpdateFn | null = null;
const EVENT = "aethelos-sw-update";

export function setSwUpdateHandler(fn: UpdateFn): void {
  applyUpdate = fn;
}

export function notifySwUpdateReady(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function applySwUpdate(): void {
  void applyUpdate?.(true);
}

export function onSwUpdateReady(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
