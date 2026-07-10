import { WIRE_VERSION } from "./primitives.js";
import { isValidPointsAmountString } from "../money/points.js";
import type { SignedEvent, WireEnvelope, RelayMessage } from "./wire.js";
import type { EventPayload, EventType } from "./events.js";

/**
 * Strict, defensive validation of untrusted wire input. The Relay is powerless
 * and may forward anything; every Node independently validates structure here
 * before signature verification and reduction. This is the parser hardening layer.
 */

const HEX64 = /^[0-9a-f]{64}$/;
const HEX_SIG = /^[0-9a-f]{128}$/;

const EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  "genesis",
  "transaction",
  "epoch_close",
  "slider_update",
  "vouch_update",
  "invite",
  "cancel_invite",
  "accept_invite",
  "expel",
  "proposal_create",
  "proposal_vote",
  "proposal_close",
  "join_superstructure",
  "leave_superstructure",
  "bridge_transaction",
  "relay_cell_governance",
  "relay_contribute",
  "relay_revoke",
  "freeze_resolve",
]);

/** ws:// or wss:// mailbox URL for community relay contribution. */
export function isValidRelayUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  return /^wss?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(trimmed);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** A string that parses as a non-negative integer (used for BigInt amounts). */
function isNonNegativeIntString(v: unknown): v is string {
  return typeof v === "string" && /^\d+$/.test(v);
}

export function isValidPayload(p: unknown): p is EventPayload {
  if (!isObject(p)) return false;
  const type = p["type"];
  if (typeof type !== "string" || !EVENT_TYPES.has(type as EventType)) return false;

  switch (type as EventType) {
    case "genesis":
      return (
        typeof p["cellName"] === "string" &&
        isValidPointsAmountString(p["initialPoints"]) &&
        isObject(p["parameters"])
      );
    case "transaction":
      return isNonEmptyString(p["to"]) && isValidPointsAmountString(p["amount"]);
    case "epoch_close":
      return typeof p["epochNumber"] === "number";
    case "slider_update":
      return isNonEmptyString(p["parameter"]) && typeof p["value"] === "number";
    case "vouch_update":
      return isNonEmptyString(p["target"]) && typeof p["weight"] === "number";
    case "invite":
      // vouchBondAmount is legacy/advisory: the reducer always derives the binding
      // lien from requiredVouchLien(), so accept invites with or without it.
      return (
        isNonEmptyString(p["invitee"]) &&
        (p["vouchBondAmount"] === undefined ||
          isValidPointsAmountString(p["vouchBondAmount"])) &&
        isObject(p["parameters"])
      );
    case "cancel_invite":
      return isNonEmptyString(p["invitee"]);
    case "accept_invite":
      return isNonEmptyString(p["inviter"]);
    case "expel":
      return isNonEmptyString(p["target"]);
    case "proposal_create":
      return (
        isNonEmptyString(p["proposalId"]) &&
        isNonEmptyString(p["kind"]) &&
        isObject(p["data"])
      );
    case "proposal_vote":
      return isNonEmptyString(p["proposalId"]) && typeof p["approve"] === "boolean";
    case "proposal_close":
      return isNonEmptyString(p["proposalId"]);
    case "join_superstructure":
    case "leave_superstructure":
      return isNonEmptyString(p["superstructureId"]);
    case "bridge_transaction":
      return (
        isNonEmptyString(p["superstructureId"]) &&
        isNonEmptyString(p["localProposalId"]) &&
        isNonEmptyString(p["to"]) &&
        isValidPointsAmountString(p["amount"])
      );
    case "relay_cell_governance":
      return (
        isNonEmptyString(p["cellId"]) &&
        isObject(p["parameters"]) &&
        typeof p["population"] === "number" &&
        Number.isFinite(p["population"]) &&
        p["population"] >= 1
      );
    case "relay_contribute":
    case "relay_revoke":
      return isValidRelayUrl(p["url"]);
    case "freeze_resolve":
      return (
        isNonEmptyString(p["target"]) &&
        (p["action"] === "unfreeze" || p["action"] === "confirm_expel")
      );
    default:
      return false;
  }
}

export function isValidSignedEvent(e: unknown): e is SignedEvent {
  if (!isObject(e)) return false;
  return (
    isNonEmptyString(e["namespaceId"]) &&
    (e["prevHash"] === null ||
      (typeof e["prevHash"] === "string" && HEX64.test(e["prevHash"]))) &&
    typeof e["lamport"] === "number" &&
    Number.isFinite(e["lamport"]) &&
    typeof e["author"] === "string" &&
    HEX64.test(e["author"]) &&
    typeof e["timestamp"] === "number" &&
    typeof e["id"] === "string" &&
    HEX64.test(e["id"]) &&
    typeof e["signature"] === "string" &&
    HEX_SIG.test(e["signature"]) &&
    isValidPayload(e["payload"])
  );
}

export function isValidWireEnvelope(env: unknown): env is WireEnvelope {
  if (!isObject(env)) return false;
  return (
    env["version"] === WIRE_VERSION &&
    isNonEmptyString(env["namespaceId"]) &&
    isValidSignedEvent(env["event"])
  );
}

export function isValidRelayMessage(msg: unknown): msg is RelayMessage {
  if (!isObject(msg)) return false;
  switch (msg["type"]) {
    case "ping":
    case "pong":
      return true;
    case "announce":
      return isValidWireEnvelope(msg["envelope"]);
    case "request_sync":
      return (
        isNonEmptyString(msg["namespaceId"]) &&
        (msg["sinceHash"] === undefined ||
          (typeof msg["sinceHash"] === "string" && HEX64.test(msg["sinceHash"])))
      );
    case "sync_batch":
      return (
        isNonEmptyString(msg["namespaceId"]) &&
        Array.isArray(msg["events"]) &&
        msg["events"].every(isValidSignedEvent)
      );
    default:
      return false;
  }
}
