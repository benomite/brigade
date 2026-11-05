// Ce que la cuisine fait tourner hors des cooks de ticket (#1971) : la pass, le manager, le triage, le closer — et
// la station d'ici qui les fait tourner. `facts` les donne dans `agents`.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { agentsEnCours, JUGE, NETTOIE } from "../src/agents-en-cours.ts";
import { faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "./aides/rail-du-journal.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const lancer = (run: string, station: string, ticket: number | null = null) =>
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station } }, ticket);
  const agents = () => {
    const a = new Date(`${JOUR_HORLOGE}T10:04:11.000Z`);
    return faits(lireEtat(journal, a), a).agents;
  };
  return { journal, noter, lancer, agents };
}

test("la pass qui juge une livraison, le manager qui qualifie une issue et le closer qui nettoie tournent sur la station d'ici : chacun dit son ticket, ce qu'il fait et depuis quand", (t) => {
  const { journal, noter, lancer, agents } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }); // 10:00:00
  noter({ type: "station.announced", payload: { station: "mac/claude", engine: "claude", provides: [], maxCooks: 1, remote: true } }); // :01
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: [], maxCooks: 2 } }); // :02
  noter({ type: "ticket.arrived", payload: { title: "Ticket 15", priority: 1, createdAt: "2026-10-01T00:00:15Z", url: "https://exemple.test/15" } }, 15, "github"); // :03
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:30.000Z`) });
  rail.prendre("box/claude"); // :04
  lancer("15-aa", "box/claude", 15); // :05
  noter({ type: "cook.exited", payload: { run: "15-aa", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 10, durationMs: 1000 } }); // :06
  noter({ type: "cook.reported", payload: { run: "15-aa", ending: "done", reason: null, summary: null, branch: "cook/15-aa", pr: "https://exemple.test/pr/40" } }, 15, "station:box/claude"); // :07
  rail.envoyerEnPass(15, "box/claude"); // :08
  // Rien ne juge encore la livraison : elle attend la pass, qui ne tourne pas.
  assert.deepEqual(agents(), []);

  noter({ type: "pass.started", payload: { run: "p1", pr: "https://exemple.test/pr/40", number: 40, sha: "sha-1" } }, 15); // :09
  lancer("juge-21-abcd1234", "manager"); // :10
  lancer("fermeture-0f0f0f0f", "closer"); // :11
  // Un découpage fini ne tourne plus ; un cook de ticket est sur le bloc de sa station, pas ici.
  lancer("decoupe-30-aaaa0000", "manager"); // :12
  noter({ type: "cook.exited", payload: { run: "decoupe-30-aaaa0000", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 10, durationMs: 1000 } }); // :13
  lancer("16-bbbb", "box/claude", 16); // :14

  assert.deepEqual(agents(), [
    { role: "pass", station: "box/claude", ticket: 15, fait: "running the gates", depuis: `${JOUR_HORLOGE}T10:00:09.000Z` },
    { role: "manager", station: "box/claude", ticket: 21, fait: "qualifying the issue", depuis: `${JOUR_HORLOGE}T10:00:10.000Z` },
    { role: "closer", station: "box/claude", ticket: null, fait: NETTOIE, depuis: `${JOUR_HORLOGE}T10:00:11.000Z` },
  ]);

  // La relecture partie, la pass en est là ; le runtime arrêté, plus rien ne tourne.
  lancer("review-15-cccc", "reviewer"); // :15
  assert.deepEqual(agents()[0], { role: "pass", station: "box/claude", ticket: 15, fait: "review in progress", depuis: `${JOUR_HORLOGE}T10:00:15.000Z` });
  noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });
  assert.deepEqual(agents(), []);
});

test("chaque préfixe de run du manager dit ce qu'il fait ; un préfixe inconnu se dit « judging », sans ticket quand son nom n'en porte pas", () => {
  const depuis = `${JOUR_HORLOGE}T10:00:00.000Z`;
  const run = (nom: string, station = "manager") => ({ run: nom, station, launchedAt: depuis });
  assert.deepEqual(
    agentsEnCours([], [run("decoupe-3-a"), run("reagit-4-a"), run("requalifie-5-a"), run("trie-6-a"), run("autre-7-a"), run("bizarre")]).map(({ role, ticket, fait }) => [role, ticket, fait]),
    [
      ["manager", 3, "splitting the epic"],
      ["manager", 4, "deciding what follows a red ticket"],
      ["manager", 5, "re-reading a held issue"],
      ["triage", 6, "triaging the card"],
      ["manager", 7, JUGE],
      ["manager", null, JUGE],
    ],
  );
  // Une livraison qui attend — la pass, la CI coupée, le chef — ne fait pas tourner la pass.
  const activite = (faitEn: string) => ({ fait: "", faitEn, cible: null, depuis });
  assert.deepEqual(
    agentsEnCours([{ ticket: 1, activite: activite("waiting for the pass") }, { ticket: 2, activite: activite("merging") }, { ticket: 3, activite: null }, { ticket: 4, activite: activite("escalated to the chef") }], []).map(({ ticket }) => ticket),
    [2],
  );
});
