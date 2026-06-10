/** Replace placeholder URLs before public release (independent operators, multiple regions). */
export const DEFAULT_BOOTSTRAP_RELAYS: string[] = [
  "wss://relay-a.REPLACE.example",
  "wss://relay-b.REPLACE.example",
  "wss://relay-c.REPLACE.example",
  "wss://relay-d.REPLACE.example",
];

/** Filtered pool for production builds (excludes unreplaced placeholders). */
export function fileBootstrapRelays(): string[] {
  return DEFAULT_BOOTSTRAP_RELAYS.filter((u) => u.length > 0 && !u.includes("REPLACE"));
}
