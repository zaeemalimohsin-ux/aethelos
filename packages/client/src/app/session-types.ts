export interface Session {
  publicKeyHex: string;
  displayName: string;
  namespaceId: string;
  relayUrls: string[];
  /** Community mailbox URLs this device will not connect to (troubleshooting opt-out). */
  ignoredCommunityRelays?: string[];
}
