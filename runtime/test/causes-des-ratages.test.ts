// Les causes des essais ratés : le classement est une fonction pure, essayée sur
// des signaux écrits à la main ; le journal, lui, est lu une fois, de bout en bout.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classerEssai, decrireCauses, mesurerCauses, SANS_SIGNAUX, type Cause, type Jugement, type Signaux } from "../src/causes-des-ratages.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { parcoursDesTickets } from "../src/parcours-des-tickets.ts";
import type { Essai, Parcours } from "../src/renvois.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const jugement = (surcharge: Partial<Jugement> = {}): Jugement => ({ noDiff: false, conflit: false, gates: { outcome: "green", failures: [] }, review: { outcome: "green", blocking: 0 }, ...surcharge });
const signaux = (surcharge: Partial<Signaux> = {}): Signaux => ({ ...SANS_SIGNAUX, textes: [], ...surcharge });
const gatesRouges = (...failures: string[]) => signaux({ jugement: jugement({ gates: { outcome: "red", failures } }) });

const CAS: Array<[Cause, Signaux]> = [
  ["relecture", signaux({ jugement: jugement({ review: { outcome: "red", blocking: 2 } }) })],
  ["gates-runtime", gatesRouges("FAIL  tests du runtime en échec — rejoue : npm --prefix runtime test")],
  ["gates-app", gatesRouges("FAIL  tests de l'app en échec — rejoue : npm --prefix app test")],
  ["gates-types", gatesRouges("FAIL  contrôle de types du runtime en échec — rejoue : npm --prefix runtime run typecheck")],
  ["conflit", signaux({ jugement: jugement({ conflit: true }) })],
  ["plafond", signaux({ arret: "turns" })],
  ["plafond", signaux({ arret: "duration" })],
  ["panne", signaux({ panne: true })],
  ["panne", signaux({ fin: "disconnected" })],
  ["criteres", signaux({ textes: ["Les critères contradictoires du ticket m'empêchent de livrer."] })],
  ["autre", SANS_SIGNAUX],
  ["autre", signaux({ arret: "tokens" })],
  ["autre", gatesRouges("FAIL  JSON invalide : .claude-plugin/plugin.json")],
  ["autre", signaux({ jugement: jugement({ review: { outcome: "red", blocking: 0 } }) })],
];

test("chaque signal range l'essai dans sa cause, et ce que rien ne tranche va dans « autre »", () => {
  for (const [cause, un] of CAS) assert.equal(classerEssai(un), cause, JSON.stringify(un));
});

test("« critères contradictoires ou ticket incomplet » n'est retenue que si le cook ou le manager l'a écrit", () => {
  assert.equal(classerEssai(signaux({ textes: ["Ticket incomplet : la zone manque."] })), "criteres");
  assert.equal(classerEssai(signaux({ textes: ["J'ai buté sur un test"], arret: null })), "autre");
  assert.equal(classerEssai(signaux({ textes: [] })), "autre");
});

const essai = (i: number, un: Signaux, fin: Partial<Essai> = {}): Essai => ({ run: `run-${i}`, at: JOUR_HORLOGE, outcome: "ok", verdict: "red", signaux: un, ...fin });
// Un ticket abandonné : tous ses essais ont raté.
const abandonne = (ticket: number, ...essais: Essai[]): Parcours => ({ ticket, takenAt: JOUR_HORLOGE, end: null, attempts: essais });

test("comptes, parts et 3 derniers tickets, sur un jeu qui couvre chaque cause ; le total classé est celui des essais ratés", () => {
  let i = 0;
  // Un ticket par essai du jeu, du plus ancien (#101) au plus récent ; les relecture bloquantes en plus sur 4 tickets.
  const parcours = CAS.map(([, un], k) => abandonne(101 + k, essai(i++, un)));
  const relectures = [201, 202, 203, 204].map((t) => abandonne(t, essai(i++, CAS[0]![1])));
  // Un ticket mergé au 2e essai : le 1er est raté, le 2e a abouti ; un ticket en cours dont l'essai tourne : pas raté.
  const merge: Parcours = { ticket: 301, takenAt: JOUR_HORLOGE, end: { kind: "merged", at: JOUR_HORLOGE }, attempts: [essai(i++, CAS[4]![1]), essai(i++, SANS_SIGNAUX, { verdict: "green" })] };
  const enCours = abandonne(302, essai(i++, SANS_SIGNAUX, { outcome: null, verdict: null }));
  const enAttente = abandonne(303, essai(i++, SANS_SIGNAUX, { verdict: "green" }));
  const tout = [...parcours, ...relectures, merge, enCours, enAttente];

  const { rates, lignes } = mesurerCauses(tout);
  const de = (cause: Cause) => lignes.find((l) => l.cause === cause)!;

  assert.equal(rates, CAS.length + relectures.length + 1);
  assert.equal(lignes.reduce((somme, l) => somme + l.essais, 0), rates);
  assert.equal(lignes.reduce((somme, l) => somme + l.pourcent, 0), 100);
  assert.deepEqual(lignes.map((l) => l.cause), ["relecture", "gates-runtime", "gates-app", "gates-types", "conflit", "plafond", "panne", "criteres", "autre"]);
  assert.equal(de("relecture").essais, 5);
  assert.equal(de("relecture").part, 5 / rates);
  assert.deepEqual(de("relecture").tickets, [204, 203, 202]);
  assert.equal(de("conflit").essais, 2);
  assert.deepEqual(de("conflit").tickets, [301, 105]);
  assert.equal(de("plafond").essais, 2);
  assert.deepEqual(de("plafond").tickets, [107, 106]);
  assert.equal(de("autre").essais, 4);
  for (const l of lignes) assert.ok(l.essais > 0, l.cause);
});

test("sans essai raté, rien n'est classé et toutes les parts sont nulles", () => {
  const { rates, lignes } = mesurerCauses([{ ticket: 1, takenAt: JOUR_HORLOGE, end: { kind: "merged", at: JOUR_HORLOGE }, attempts: [essai(0, SANS_SIGNAUX, { verdict: "green" })] }]);
  assert.equal(rates, 0);
  assert.ok(lignes.every((l) => l.essais === 0 && l.part === 0 && l.pourcent === 0 && l.tickets.length === 0));
  assert.deepEqual(decrireCauses({ rates, lignes }), ["failures   no failed attempt: nothing to sort"]);
});

test("la sortie dit chaque cause, son nombre, sa part et ses tickets ; les parts arrondies font 100 %", () => {
  const trois = [1, 2, 3].map((t) => abandonne(t, essai(t, signaux({ arret: "turns" }))));
  const dit = decrireCauses(mesurerCauses(trois));
  assert.equal(dit.length, 1 + 9);
  assert.equal(dit[0], "failures   3 failed attempts (not ending in a merge), each under one cause");
  assert.ok(dit.includes("           cap on turns or duration: 3 (100%) — #3, #2, #1"));
  assert.ok(dit.includes("           other: 0 (0%)"));
  const tiers = mesurerCauses([1, 2, 3].map((t) => abandonne(t, essai(t, [signaux({ arret: "turns" }), signaux({ panne: true }), SANS_SIGNAUX][t - 1]!))));
  assert.deepEqual(tiers.lignes.map((l) => l.pourcent).reduce((a, b) => a + b, 0), 100);
});

test("le journal est lu : l'arrêt, la panne, le jugement et le texte du cook se retrouvent sur l'essai qui les porte", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (ticket: number, fait: Parameters<typeof journal.ajouter>[0] extends infer F ? Omit<F & object, "project" | "ticket" | "author"> : never) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...(fait as object) } as never);
  const limites = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  const lancer = (run: string) => noter(7, { type: "cook.launched", payload: { run, limits: limites, stream: `runs/${run}.jsonl`, station: "box/claude" } });
  const sortir = (run: string, outcome: string) => noter(7, { type: "cook.exited", payload: { run, outcome, code: 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
  noter(7, { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: JOUR_HORLOGE } });
  lancer("a");
  noter(7, { type: "guard.tripped", payload: { run: "a", reason: "turns", limit: 100, observed: 100 } });
  sortir("a", "guard");
  lancer("b");
  noter(7, { type: "cook.reported", payload: { run: "b", ending: "failed", reason: "ticket incomplet", summary: null, branch: "x", pr: null } });
  sortir("b", "failed");
  lancer("c");
  noter(7, { type: "pass.judged", payload: { run: "c", pr: "p", number: 7, sha: "s", base: "b", merged: null, verdict: "red", gates: { outcome: "skipped", code: null, failures: [], tail: "" }, ci: { outcome: "none", checks: [] }, review: { outcome: "skipped", run: null, summary: null, findings: [] }, findings: [], judgeModified: false, noDiff: false } });
  sortir("c", "ok");

  const [parcours] = parcoursDesTickets(journal.base);
  assert.deepEqual(parcours!.attempts.map((e) => classerEssai(e.signaux!)), ["plafond", "criteres", "conflit"]);
  assert.deepEqual(mesurerCauses([parcours!]).lignes.filter((l) => l.essais > 0).map((l) => [l.cause, l.tickets]), [["conflit", [7]], ["plafond", [7]], ["criteres", [7]]]);
});
