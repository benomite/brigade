// The facts a station writes of itself into its gist (`status`, runtime/src/station-gist.ts): what the Stations view
// shows of it, read with no trust in their shape — a station of an older version says none of them.
import { duration } from "./duration.ts";

export type FactsOfStation = {
  since: string | null;
  cooks: Array<{ project: string; issue: number; since: string }>;
  update: { result: "passed" | "rolled-back"; version: string; at: string } | null;
  quota: Array<{ name: string; limit: number; remaining: number }>;
  refusal: string | null;
};

const text = (value: unknown): value is string => typeof value === "string" && value !== "";
const date = (value: unknown): value is string => text(value) && !Number.isNaN(Date.parse(value));
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";

export function readFacts(raw: unknown): FactsOfStation | null {
  if (!object(raw)) return null;
  const last = object(raw.update) && object(raw.update.last) ? raw.update.last : null;
  const quota = object(raw.quota) ? raw.quota : {};
  return {
    since: date(raw.since) ? raw.since : null,
    cooks: (Array.isArray(raw.cooks) ? raw.cooks : []).flatMap((cook: unknown) => (object(cook) && text(cook.project) && typeof cook.issue === "number" && date(cook.since) ? [{ project: cook.project, issue: cook.issue, since: cook.since }] : [])),
    update: last !== null && (last.result === "passed" || last.result === "rolled-back") && text(last.version) && date(last.at) ? { result: last.result, version: last.version, at: last.at } : null,
    quota: Object.entries(quota).flatMap(([name, window]) => (object(window) && typeof window.limit === "number" && typeof window.remaining === "number" ? [{ name, limit: window.limit, remaining: window.remaining }] : [])),
    refusal: text(raw.refusal) ? raw.refusal : null,
  };
}

// The lines of the station's page, one fact each.
export function linesOfFacts(facts: FactsOfStation, version: string, now: number): string[] {
  return [
    `version ${version}${facts.since === null ? "" : ` · running for ${duration(now - Date.parse(facts.since))}`}`,
    facts.cooks.length === 0 ? "no cook running" : `cooks running: ${facts.cooks.map(({ project, issue }) => `${project} #${issue}`).join(", ")}`,
    ...(facts.update === null ? [] : [`last update: ${facts.update.result === "passed" ? "passed" : "rolled back"} on ${facts.update.version}, ${duration(now - Date.parse(facts.update.at))} ago`]),
    ...(facts.quota.length === 0 ? [] : [`GitHub quota left: ${facts.quota.map(({ name, remaining, limit }) => `${name} ${remaining}/${limit}`).join(", ")}`]),
    ...(facts.refusal === null ? [] : [`refuses to cook: ${facts.refusal}`]),
  ];
}
