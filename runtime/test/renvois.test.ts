// Les renvois : combien d'essais un ticket a demandé de sa prise à son merge,
// lus du journal, puis mesurés sur les derniers tickets servis. Le journal est
// écrit à la main : aucune cuisine ne tourne ici.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { parcoursDesTickets } from "../src/parcours-des-tickets.ts";
import { decrireRenvois, derivePremierCoup, DERNIERS_PAR_DEFAUT, direDerivePremierCoupEn, mesurerRenvois, type Parcours } from "../src/renvois.ts";
import { horloge, JOUR_HORLOGE, lancer, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const MESURES = join(import.meta.dirname, "../src/montrer-mesures.ts");

const a = (heure: string) => `${JOUR_HORLOGE}T${heure}:00.000Z`;
const essais = (combien: number) => Array.from({ length: combien }, (_, i) => ({ run: `run-${i}`, at: a("10:00"), outcome: "ok", verdict: i === combien - 1 ? ("green" as const) : ("red" as const) }));
const merge = (ticket: number, combien: number, pris: string, merge: string): Parcours => ({ ticket, takenAt: a(pris), end: { kind: "merged", at: a(merge) }, attempts: essais(combien) });

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  let runs = 0;
  const prendre = (ticket: number) => noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: a("23:00") } }, ticket);
  const rendre = (ticket: number) => noter({ type: "ticket.released", payload: { reason: "lease", station: "box/claude" } }, ticket);
  const cuire = (ticket: number, station = "box/claude", outcome: "ok" | "failed" = "ok") => {
    const run = `run-${++runs}`;
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station, model: "opus", effort: "high" } }, ticket);
    noter({ type: "cook.exited", payload: { run, outcome, code: outcome === "ok" ? 0 : 1, signal: null, turns: 10, tokens: 1000, durationMs: 60_000 } }, ticket);
    return run;
  };
  const juger = (ticket: number, run: string, verdict: "green" | "red") =>
    noter(
      {
        type: "pass.judged",
        payload: {
          run,
          pr: `https://exemple.test/pull/${ticket}`,
          number: ticket,
          sha: `sha-${ticket}`,
          verdict,
          gates: { outcome: verdict, code: verdict === "green" ? 0 : 1, failures: [], tail: "" },
          ci: { outcome: "none", checks: [] },
          review: { outcome: "skipped", run: null, summary: null, findings: [] },
          findings: [],
          judgeModified: false,
          noDiff: false,
        },
      },
      ticket,
    );
  const merger = (ticket: number, by: "pass" | "outside" = "pass") => noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by, reconciled: false } }, ticket);
  // Un ticket servi de bout en bout : pris, `rouges` renvois, puis vert et mergé.
  const servir = (ticket: number, rouges = 0) => {
    prendre(ticket);
    for (let i = 0; i < rouges; i++) juger(ticket, cuire(ticket), "red");
    juger(ticket, cuire(ticket), "green");
    merger(ticket);
  };
  return { repertoire, journal, noter, prendre, rendre, cuire, juger, merger, servir };
}

test("sur un ticket livré du premier coup, un à deux essais et un à quatre, les trois chiffres sont exactement ceux attendus", () => {
  const renvois = mesurerRenvois([merge(1, 1, "10:00", "11:00"), merge(2, 2, "10:00", "12:00"), merge(3, 4, "10:00", "16:00")], 13);

  assert.deepEqual(renvois, { n: 13, servis: 3, retenus: 3, ecartes: 0, premierCoup: 1 / 3, essaisMoyens: 7 / 3, tempsMoyenMs: 3 * 3_600_000 });
  assert.deepEqual(decrireRenvois(renvois), [
    "retries    the last 13 served tickets (N = 13): 3 in the log, 3 kept, 0 set aside — not merged (running, dropped, or served without a diff): left out of the count",
    "           delivered on the first try: 33% (1 of 3)",
    "           attempts per ticket: 2.3 on average",
    "           from taking to merge: 3 h 00 on average",
  ]);
});

test("les tickets non mergés sont écartés du calcul et comptés ; seuls les N derniers servis sont regardés", () => {
  const enCours: Parcours = { ticket: 4, takenAt: a("10:00"), end: null, attempts: essais(3) };
  const sansDiff: Parcours = { ticket: 5, takenAt: a("10:00"), end: { kind: "served", at: a("10:30") }, attempts: essais(1) };
  const ancien = merge(6, 9, "08:00", "20:00");

  const renvois = mesurerRenvois([ancien, merge(1, 1, "10:00", "11:00"), enCours, merge(2, 2, "10:00", "12:00"), sansDiff], 4);

  assert.deepEqual(renvois, { n: 4, servis: 4, retenus: 2, ecartes: 2, premierCoup: 0.5, essaisMoyens: 1.5, tempsMoyenMs: 1.5 * 3_600_000 });
  assert.match(decrireRenvois(renvois)[0] ?? "", /^retries {4}the last 4 served tickets \(N = 4\): 4 in the log, 2 kept, 2 set aside — not merged/);
  assert.equal(mesurerRenvois([]).n, DERNIERS_PAR_DEFAUT);
});

test("sans ticket servi, ou sans aucun mergé, la mesure le dit au lieu de montrer des zéros", () => {
  assert.deepEqual(mesurerRenvois([], 20), { n: 20, servis: 0, retenus: 0, ecartes: 0, premierCoup: null, essaisMoyens: null, tempsMoyenMs: null });
  assert.deepEqual(decrireRenvois(mesurerRenvois([], 20)), ["retries    no served ticket in the log: nothing to measure (N = 20)"]);
  assert.deepEqual(decrireRenvois(mesurerRenvois([{ ticket: 4, takenAt: a("10:00"), end: null, attempts: [] }], 20)), [
    "retries    the last 20 served tickets (N = 20): 1 in the log, 0 kept, 1 set aside — not merged (running, dropped, or served without a diff): left out of the count",
    "           none is merged: nothing to measure",
  ]);
});

test("le parcours d'un ticket va de sa première prise à son merge, rendu et repris compris ; ni relecture ni jugement n'y sont des essais", (t) => {
  const { journal, prendre, rendre, cuire, juger, merger } = cuisine(t);
  prendre(7);
  const premier = cuire(7, "box/claude", "failed");
  rendre(7);
  prendre(7);
  const second = cuire(7);
  cuire(7, "reviewer");
  juger(7, second, "red");
  const troisieme = cuire(7);
  juger(7, troisieme, "green");
  merger(7);
  // Un merge sans prise n'ouvre rien ; repris après son merge, le ticket ouvre un autre parcours.
  merger(8, "outside");
  prendre(7);
  cuire(7);

  const parcours = parcoursDesTickets(journal.base);

  assert.equal(parcours.length, 2);
  const [servi, rouvert] = parcours;
  // Les `signaux` de chaque essai sont ceux de `causes-des-ratages.test.ts`.
  assert.deepEqual(servi && { ...servi, attempts: servi.attempts.map(({ signaux: _, ...essai }) => essai) }, {
    ticket: 7,
    takenAt: a("10:00"),
    end: { kind: "merged", at: `${JOUR_HORLOGE}T10:00:13.000Z` },
    attempts: [
      { run: premier, at: `${JOUR_HORLOGE}T10:00:01.000Z`, outcome: "failed", verdict: null },
      { run: second, at: `${JOUR_HORLOGE}T10:00:05.000Z`, outcome: "ok", verdict: "red" },
      { run: troisieme, at: `${JOUR_HORLOGE}T10:00:10.000Z`, outcome: "ok", verdict: "green" },
    ],
  });
  assert.equal(rouvert?.end, null);
  assert.equal(rouvert?.attempts.length, 1);
});

test("`measures --last` mesure les renvois des N derniers tickets servis, dit N et ce qu'il écarte, et refuse un N qui n'en est pas un", async (t) => {
  const { repertoire, servir, prendre, cuire } = cuisine(t);
  servir(1, 3);
  servir(2);
  servir(3, 1);
  servir(4, 3);
  prendre(5);
  cuire(5);

  const commande = lancer(t, MESURES, ["--last", "4", "--by", "2"], { BRIGADE_STATE_DIR: repertoire });
  const nul = lancer(t, MESURES, ["--last", "0"], { BRIGADE_STATE_DIR: repertoire });
  const double = lancer(t, MESURES, ["--last", "2", "--last", "3"], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /^report {5}brigade — 4 merges in the log, in slices of 2\n/);
  assert.match(
    commande.sortie(),
    /\n\nretries {4}the last 4 served tickets \(N = 4\): 4 in the log, 3 kept, 1 set aside — not merged[^\n]*\n {11}delivered on the first try: 33% \(1 of 3\)\n {11}attempts per ticket: 2\.3 on average\n {11}from taking to merge: \d+ s on average\n\nfailures/,
  );
  assert.equal(await nul.fin, 2);
  assert.match(nul.sortie(), /usage: .*--last <number of tickets>/);
  assert.equal(await double.fin, 2);
});

test("`measures` sur un journal où aucun ticket n'a été servi le dit, sans planter", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();

  const commande = lancer(t, MESURES, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /\n\nretries {4}no served ticket in the log: nothing to measure \(N = 20\)\n\nfailures/);
});

// La dérive sur le premier coup : `k` tickets livrés du premier coup sur `n`.
const servis = (n: number, premiers: number) => Array.from({ length: n }, (_, i) => merge(i + 1, i < premiers ? 1 : 2, "10:00", "11:00"));

test("la part livrée du premier coup sous le seuil est signalée, avec sa fenêtre et son seuil ; au seuil ou au-dessus, rien", () => {
  assert.deepEqual(derivePremierCoup(servis(10, 4), {}), { premiers: 4, retenus: 10, fenetre: 10, seuil: 50 });
  assert.equal(direDerivePremierCoupEn({ premiers: 4, retenus: 10, fenetre: 10, seuil: 50 }), "4/10 tickets delivered on the first try (threshold 50%)");
  assert.equal(derivePremierCoup(servis(10, 5), {}), null);
  assert.equal(derivePremierCoup(servis(10, 8), {}), null);
});

test("sans assez de tickets servis pour remplir la fenêtre, ou sans merge dans la fenêtre, la dérive ne dit rien et ne plante pas", () => {
  assert.equal(derivePremierCoup([], {}), null);
  assert.equal(derivePremierCoup(servis(9, 0), {}), null);
  const abandonnes: Parcours[] = Array.from({ length: 10 }, (_, i) => ({ ticket: i + 1, takenAt: a("10:00"), end: null, attempts: essais(1) }));
  assert.equal(derivePremierCoup(abandonnes, {}), null);
});

test("le seuil et la fenêtre se règlent : un autre seuil change le verdict, une autre fenêtre change les tickets regardés", () => {
  assert.equal(derivePremierCoup(servis(10, 5), { firstTryPercent: 60 })?.seuil, 60);
  assert.equal(derivePremierCoup(servis(10, 4), { firstTryPercent: 40 }), null);
  // Fenêtre de 4 : les quatre derniers ont tous demandé deux essais.
  assert.deepEqual(derivePremierCoup(servis(10, 6), { firstTryWindow: 4 }), { premiers: 0, retenus: 4, fenetre: 4, seuil: 50 });
  assert.equal(derivePremierCoup(servis(4, 4), { firstTryWindow: 4 }), null);
});
