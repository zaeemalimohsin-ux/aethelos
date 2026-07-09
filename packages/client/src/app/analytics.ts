export type AnalyticsEvent = {
  name: string;
  at: string;
  props?: Record<string, string | number | boolean>;
};

const MAX_EVENTS = 50;
const events: AnalyticsEvent[] = [];

/** Tier-1 product funnel: noop by default, buffered for diagnostics export only. */
export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): void {
  events.push({
    name,
    at: new Date().toISOString(),
    ...(props ? { props } : {}),
  });
  if (events.length > MAX_EVENTS) events.shift();
}

export function getAnalyticsEvents(): readonly AnalyticsEvent[] {
  return events;
}
