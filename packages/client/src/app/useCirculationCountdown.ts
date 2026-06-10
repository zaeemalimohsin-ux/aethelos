import { useEffect, useState } from "react";
import { MS_PER_MINUTE, nextRedistributionAt, type PoolState } from "@aethelos/core";

function formatTimeLeft(msLeft: number): string {
  const totalMinutes = Math.ceil(msLeft / MS_PER_MINUTE);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

/** Display-only countdown until the next redistribution flush (consensus runs on next activity). */
export function useCirculationCountdown(pool: PoolState | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!pool || pool.lastRedistributionTimestamp <= 0) {
    return { due: false, label: "" };
  }

  const nextAt = nextRedistributionAt(pool);
  const referenceNow = Math.max(now, pool.maxEventTimestamp);
  const due = referenceNow >= nextAt;
  const msLeft = Math.max(0, nextAt - referenceNow);

  const label = due
    ? "Redistribution due — applies when the community next records activity"
    : `Next redistribution in ~${formatTimeLeft(msLeft)}`;

  return { due, msLeft, label };
}
