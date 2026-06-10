#!/usr/bin/env node
/**
 * AethelOS Relay — a powerless bulletin board.
 *
 * It holds NO authoritative state: no ledger, no balances, no keys, no authority.
 * Its only memory is a transient, unauthenticated, TTL- and size-bounded delivery
 * buffer of recent signed messages, kept solely so an offline Node can catch up.
 */
import { startRelayServer } from "./server.js";

const PORT = Number(process.env["PORT"] ?? 8787);

const serverPromise = startRelayServer({ port: PORT });

serverPromise.then((server) => {
  console.log(
    `AethelOS Relay listening on port ${server.port} (ws + http health/metrics)`,
  );
});

function shutdown(signal: string): void {
  void serverPromise.then((server) => {
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        level: "info",
        msg: "shutting_down",
        signal,
      }),
    );
    void server.close().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
