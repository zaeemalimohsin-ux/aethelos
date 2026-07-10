/** Pilot builds hide linked-chapter UI unless explicitly enabled. */
export function isFederationEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_FEDERATION === "1";
}
