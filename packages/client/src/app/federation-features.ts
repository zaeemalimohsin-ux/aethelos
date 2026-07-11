/** Standard builds hide linked-chapter UI unless federation is explicitly enabled. */
export function isFederationEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_FEDERATION === "1";
}
