/// <reference lib="webworker" />
import "../crypto-init.js";
import {
  reduceWithSnapshot,
  type ReducerSnapshot,
  type RejectedReduction,
  type SignedEvent,
} from "@aethelos/core";

interface InitMsg {
  type: "init";
  namespaceId: string;
}
interface ReduceMsg {
  type: "reduce";
  seq: number;
  events: SignedEvent[];
}
type InMsg = InitMsg | ReduceMsg;

let namespaceId = "";
let snapshot: ReducerSnapshot | undefined;

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    namespaceId = msg.namespaceId;
    snapshot = undefined;
    return;
  }
  if (msg.type === "reduce") {
    const rejected: RejectedReduction[] = [];
    snapshot = reduceWithSnapshot(namespaceId, msg.events, snapshot, rejected);
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "state",
      seq: msg.seq,
      state: snapshot.state,
      rejected,
    });
  }
};
