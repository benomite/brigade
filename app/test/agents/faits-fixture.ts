// Ce que les commandes du runtime rendent d'un projet, pour l'onglet Agents (#4117) : `facts` (ses agents, ses rôles, sa
// cadence, le budget de ses gates, ses stations), `setting`, `switch`, `closing --json` et `log`. Le test des fiches, celui du
// process principal et l'écran de capture `espace-projet-agents` les lisent tous. Les heures sont celles de la cuisine figée
// (2026-10-13, 10:04 UTC).
export const MAINTENANT = new Date("2026-10-13T10:04:12.000Z");

type Geste = { at: string; line: string; reason: string; outcome: string };
const geste = (at: string, line: string, reason: string, outcome: string): Geste => ({ at, line, reason, outcome });
const fiche = (agent: string, plus: Record<string, unknown>) => ({
  agent,
  state: "idle",
  lastGesture: null,
  nextRun: { text: `${agent}: next run not known yet`, at: null },
  thread: agent,
  autonomy: "act",
  exceptions: {},
  counters: { fixedBySelf: 0, handedToChef: 0 },
  gestures: [] as Geste[],
  ...plus,
});

export const EQUIPE = [
  fiche("manager", {
    state: "working on #4031",
    lastGesture: { line: "put #4030 on the rail", at: "2026-10-13T09:12:00.000Z" },
    nextRun: { text: "manager: runs when a ticket or the supervisor calls it", at: null },
    exceptions: { "split-epic": "propose" },
    gestures: [
      geste("2026-10-13T09:12:00.000Z", "split epic #4024 into 4 tickets", "the chef validated its spec", "fixed by itself"),
      geste("2026-10-12T16:30:00.000Z", "split epic #4010 into 3 tickets", "its spec was clear", "handed to the chef"),
      geste("2026-10-02T11:00:00.000Z", "split epic #3900 into 2 tickets", "an old one, out of the week", "fixed by itself"),
    ],
  }),
  fiche("supervisor", {
    nextRun: { text: "supervisor: wakes if nothing is merged by 11:40", at: "2026-10-13T11:40:00.000Z" },
    gestures: [geste("2026-10-13T08:00:00.000Z", "reran `tests` on 0de1ff5", "red for 10 min", "fixed by itself")],
  }),
  fiche("closer", {
    autonomy: "propose",
    nextRun: { text: "closer: next pass in 3 h", at: "2026-10-13T13:04:00.000Z" },
    gestures: [geste("2026-10-12T03:12:00.000Z", "opened the closing pass #4012 on `main`", "20 merges since the last pass", "not done")],
  }),
  fiche("pass", {
    state: "working on #4030",
    nextRun: { text: "pass: reviews each delivery as it comes", at: null },
    gestures: [geste("2026-10-13T07:20:00.000Z", "merged PR #4033 of #4028", "the gates and the review were green", "fixed by itself")],
  }),
  fiche("cook #4029", { state: "working on #4029", nextRun: { text: "cook #4029: works until it delivers", at: null }, gestures: [geste("2026-10-13T09:00:00.000Z", "took #4029 and cooks it", "it was first in the queue", "fixed by itself")] }),
  fiche("cook #4031", { state: "working on #4031", nextRun: { text: "cook #4031: works until it delivers", at: null } }),
];

export const ROLES = [
  { role: "manager", does: "Judges the project's issues, puts the ready ones on the rail, splits epics, and decides what follows a red ticket.", latest: null },
  { role: "pass", does: "x", latest: null },
  { role: "reviewer", does: "Reads each delivery's diff and writes the review the pass judges with.", latest: { what: "reviewed #4030: green, no finding", ticket: 4030, at: "2026-10-13T09:50:00.000Z" } },
  { role: "second judge", does: "Checks that a green delivery touching its own judges does not weaken them.", latest: null },
  { role: "triage", does: "Takes up a card before it reaches TODO.", latest: null },
  { role: "closer", does: "x", latest: null },
];

export const FAITS = {
  equipe: EQUIPE,
  agents: [{ role: "manager", station: null, ticket: 4031, fait: "judging", depuis: "2026-10-13T10:00:00.000Z" }],
  rolesCuisine: ROLES,
  cadence: { hours: [], medianSeconds: { taken: 2520, pass: null } },
  coutDesGates: { budget: { durationSeconds: 100, cpuSeconds: 400, parLeChef: { durationSeconds: false, cpuSeconds: true } } },
  stations: [{ station: "box/claude", plafond: 4 }],
};

// `setting`, tel que `reglagesVus` le lit : le manager et le reviewer calibrés sur la station, le plafond par défaut, le closer
// calibré par le dépôt — qui pose donc son calibrage — et ses trois nombres.
export const SETTING = JSON.stringify({
  file: ".claude/brigade/projet.json",
  integrationBranch: { value: "main", from: "default" },
  defaultCalibrations: { manager: { model: "sonnet", effort: "high", from: "station" }, reviewer: { model: "opus", effort: "medium", from: "station" } },
  calibrationCeiling: { model: "opus", effort: "high", from: "default" },
  closer: { calibration: { model: "sonnet", effort: "medium", from: "repository" }, cooksBelow: { value: 1, from: "default" }, maxTokens: { value: 500000, from: "station" }, maxRemovedLines: { value: 500, from: "default" } },
});

export const SWITCH = "switch     ON since 2026-10-12T20:00:00.000Z (by chef) — fired tickets are taken, the manager judges and splits the open issues, a green delivery is merged";
export const SWITCH_ETEINT = "switch     OFF since 2026-10-13T09:30:00.000Z (by chef) — nothing new is taken, judged, split or merged — running cooks finish, their deliveries are judged and wait";

// `closing --json`, réduit à ce que l'onglet lit.
export const FERMETURE = {
  configured: true,
  observation: { readable: true, mergesSinceCleanup: 14, ratio: [{ window: 100, merges: 100, added: 18340, removed: 7336, ratio: 2.5, reads: "2.5:1" }], duplicates: 5, deadExports: 3 },
};

// `log --last N`, une ligne par événement : <seq>  <heure>  <projet>  <ticket>  <type>  <auteur>  <charge>.
const ligne = (seq: number, at: string, type: string, payload: unknown) => [seq, at, "parade", "-", type, "chef", JSON.stringify(payload)].join("  ");
export const JOURNAL = [
  ligne(10, "2026-10-09T08:00:00.000Z", "decision.set", { name: "BRIGADE_MANAGER_MODEL", value: "opus", previous: null }),
  ligne(11, "2026-10-11T08:00:00.000Z", "decision.set", { name: "BRIGADE_MANAGER_MODEL", value: "sonnet", previous: "opus" }),
  ligne(12, "2026-10-12T18:00:00.000Z", "station.capped", { station: "box/claude", maxCooks: 4 }),
  ligne(13, "2026-10-12T18:10:00.000Z", "decision.set", { name: "BRIGADE_GATES_BUDGET_CPU_SECONDS", value: "400", previous: null }),
].join("\n");
