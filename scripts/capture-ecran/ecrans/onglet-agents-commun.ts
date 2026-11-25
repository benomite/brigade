// L'onglet Agents de « parade » (ticket 4224) : ce que l'API du runtime en rend, figé — quatre agents, l'un idle, l'un au
// travail sur un ticket, l'un cassé, et les réglages et les derniers gestes du closer. Les écrans `onglet-agents*` en partent.
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const chiffre = (label: string, value: string, meaning: string) => ({ label, value, meaning });
const AGENTS = [
  {
    id: "closer",
    name: "closer",
    role: "Prunes what the project no longer needs — dead code, duplicates — once twenty merges have landed.",
    state: "idle",
    workingOn: null,
    nextRun: "next pass in 3 h",
    figures: [chiffre("passes", "2", "closing passes it opened in the last 7 days"), chiffre("lines removed", "412", "lines its merged passes removed, last 7 days")],
  },
  {
    id: "manager",
    name: "manager",
    role: "Splits the epics into tickets a cook can cook, and calibrates each one.",
    state: "working",
    workingOn: 4231,
    nextRun: "next run in 10 min",
    figures: [chiffre("tickets split", "14", "tickets it wrote from epics in the last 7 days"), chiffre("sent back", "1", "tickets a cook could not cook as written"), chiffre("calibrated alone", "92 %", "share of tickets it calibrated with no chef's answer")],
  },
  {
    id: "pass",
    name: "pass",
    role: "Judges each delivery against its ticket, then merges it or sends it back.",
    state: "broken",
    workingOn: null,
    nextRun: "waits for the supervisor",
    figures: [chiffre("merged", "21", "deliveries it merged in the last 7 days"), chiffre("sent back", "6", "deliveries it returned to a cook, last 7 days")],
  },
  {
    id: "supervisor",
    name: "supervisor",
    role: "Watches the kitchen and steps in when a ticket loops or stalls.",
    state: "idle",
    workingOn: null,
    nextRun: "wakes if nothing is merged by 10:40",
    figures: [chiffre("stepped in", "3", "times it acted on a stalled ticket, last 7 days"), chiffre("parked for you", "1", "questions it handed to the chef, last 7 days")],
  },
];

const champ = (key: string, label: string, kind: string, value: unknown, plus: Record<string, unknown> = {}) => ({ key, label, kind, value, source: "runtime", editable: true, livesIn: null, changedAt: null, changedBy: null, ...plus });
export const REGLAGES_DU_CLOSER = [
  champ("model", "model", "text", "sonnet"),
  champ("effort", "effort", "text", "medium"),
  champ("autonomy", "autonomy", "text", "propose", { changedAt: "2026-10-12T16:20:00.000Z", changedBy: "chef" }),
  champ("paused", "paused", "boolean", false),
  champ("maxRemovedLines", "removed lines cap", "number", 500),
  champ("home", "state folder", "text", "/srv/brigade", { editable: false, source: "station", livesIn: "BRIGADE_STATE_DIR in the station's environment" }),
];
const GESTES_DU_CLOSER = [
  { at: "2026-10-13T03:12:00.000Z", summary: "opened closing pass #4219", reason: "20 merges since the last pass", issue: 4219 },
  { at: "2026-10-12T15:40:00.000Z", summary: "deleted 412 dead lines in runtime/src/retenue/", reason: "no import reached them after #4188", issue: 4203 },
  { at: "2026-10-11T09:05:00.000Z", summary: "skipped its pass", reason: "a cook was still in flight on the base", issue: null },
];

// Les données de l'écran ; `api` en remplace ou en ajoute des réponses.
export function donnees(api: Record<string, unknown> = {}): Donnees {
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)) },
    api: {
      "GET /api/agents": AGENTS,
      ...Object.fromEntries(AGENTS.map(({ id }) => [`GET /api/agents/${id}/settings`, { fields: id === "closer" ? REGLAGES_DU_CLOSER : [champ("model", "model", "text", "opus"), champ("paused", "paused", "boolean", false)] }])),
      "GET /api/agents/closer/gestures": GESTES_DU_CLOSER,
      ...api,
    },
    envois: cuisine(RENDUS),
  };
}

export const OUVRIR = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet > button:nth-child(3)" }];
