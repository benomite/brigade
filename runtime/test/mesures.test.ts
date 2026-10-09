// Le relevé des mesures : ce que le journal dit de la lourdeur du projet,
// livraison mergée par livraison mergée, et ce que le chef en lit. Le journal
// est écrit à la main : aucune cuisine ne tourne ici.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { Seuils } from "../src/evenements/derive.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { decrireReleve, direJauge, franchis, jauger, SANS_SEUIL, trancher } from "../src/mesures.ts";
import { livraisonsMergees, seuilsEnVigueur, signalements, type Livraison } from "../src/projections/mesures.ts";
import { horloge, lancer, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const MESURES = join(import.meta.dirname, "../src/montrer-mesures.ts");

type Cuisson = { tours: number; ms: number; modele?: string; effort?: string; station?: string };

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  let runs = 0;
  const cuire = (ticket: number | null, { tours, ms, modele = "sonnet", effort = "low", station = "box/claude" }: Cuisson) => {
    const run = `run-${++runs}`;
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station, model: modele, effort } }, ticket);
    noter({ type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: tours, tokens: 1000, durationMs: ms } }, ticket);
  };
  const juger = (ticket: number, measures: Record<string, number> | undefined, verdict: "green" | "red" = "green") =>
    noter(
      {
        type: "pass.judged",
        payload: {
          run: `run-${runs}`,
          pr: `https://exemple.test/pull/${ticket}`,
          number: ticket,
          sha: `sha-${ticket}`,
          verdict,
          gates: { outcome: verdict, code: verdict === "green" ? 0 : 1, failures: [], tail: "", ...(measures ? { measures } : {}) },
          ci: { outcome: "none", checks: [] },
          review: { outcome: "skipped", run: null, summary: null, findings: [] },
          findings: [],
          judgeModified: false,
          noDiff: false,
        },
      },
      ticket,
    );
  const merger = (ticket: number) => noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by: "pass", reconciled: false } }, ticket);
  // Une livraison entière : un cook, des gates vertes, le merge.
  const livrer = (ticket: number, measures: Record<string, number> | undefined, cuisson: Cuisson = { tours: 10, ms: 60_000 }) => {
    cuire(ticket, cuisson);
    juger(ticket, measures);
    merger(ticket);
  };
  return { repertoire, journal, base: journal.base, noter, cuire, juger, merger, livrer };
}

const livraison = (measures: Record<string, number>, reste: Partial<Livraison> = {}): Livraison => ({ ticket: 1, at: "2026-10-08T10:00:00.000Z", measures, state: measures, gatesS: null, cooks: [], ...reste });
const seuils = (declares: Partial<Seuils>): Seuils => ({ ...SANS_SEUIL, ...declares });

test("une livraison mergée porte les mesures de ses dernières gates, la durée de toutes, et ses cooks", (t) => {
  const { base, cuire, juger, merger } = cuisine(t);
  cuire(17, { tours: 30, ms: 600_000 });
  juger(17, { tests: 200, gates_s: 8 }, "red");
  cuire(17, { tours: 12, ms: 120_000, modele: "opus", effort: "high" });
  juger(17, { tests: 203, gates_s: 9 });
  merger(17);

  assert.deepEqual(livraisonsMergees(base), [
    {
      ticket: 17,
      at: "2026-10-08T10:00:06.000Z",
      measures: { tests: 203, gates_s: 9 },
      state: { tests: 203, gates_s: 9 },
      gatesS: 17,
      cooks: [
        { calibration: "sonnet/low", turns: 30, durationMs: 600_000 },
        { calibration: "opus/high", turns: 12, durationMs: 120_000 },
      ],
    },
  ]);
});

test("ni une relecture ni un jugement ne comptent parmi les cooks d'un ticket, et une livraison non mergée n'est pas relevée", (t) => {
  const { base, cuire, juger, livrer } = cuisine(t);
  cuire(17, { tours: 4, ms: 30_000, station: "reviewer" });
  cuire(17, { tours: 2, ms: 10_000, station: "manager" });
  cuire(null, { tours: 2, ms: 10_000 });
  livrer(17, { tests: 203 });
  cuire(18, { tours: 9, ms: 90_000 });
  juger(18, { tests: 210 });

  assert.deepEqual(livraisonsMergees(base).map(({ ticket, cooks }) => [ticket, cooks.length]), [[17, 1]]);
});

test("un ticket servi deux fois fait deux livraisons, chacune avec ses gates et ses cooks", (t) => {
  const { base, livrer } = cuisine(t);
  livrer(17, { tests: 203 }, { tours: 10, ms: 60_000 });
  livrer(17, { tests: 240 }, { tours: 25, ms: 90_000 });

  assert.deepEqual(livraisonsMergees(base).map(({ measures, cooks }) => [measures.tests, cooks.map((cook) => cook.turns)]), [[203, [10]], [240, [25]]]);
});

test("des gates qui ne déclarent rien laissent une livraison sans mesure, jamais à zéro", (t) => {
  const { base, livrer } = cuisine(t);
  livrer(17, undefined);

  assert.deepEqual(livraisonsMergees(base).map(({ measures, gatesS }) => ({ measures, gatesS })), [{ measures: {}, gatesS: null }]);
});

test("une livraison jugée avant une autre et mergée après elle, sans rejeu, ne dit rien de l'état du projet", (t) => {
  const { base, cuire, juger, merger } = cuisine(t);
  // A est jugée verte puis attend ; B est jugée et mergée ; A est mergée telle quelle.
  cuire(17, { tours: 10, ms: 60_000 });
  juger(17, { tests: 916, depot_octets: 2_000_000, gates_s: 9 });
  cuire(18, { tours: 10, ms: 60_000 });
  juger(18, { tests: 930, gates_s: 12 });
  merger(18);
  merger(17);

  const livraisons = livraisonsMergees(base);

  // Le dépôt, lui, n'a été déclaré par personne depuis : A reste ce qu'on en sait de mieux.
  assert.deepEqual(livraisons.map(({ ticket, measures, state }) => ({ ticket, tests: measures.tests, state })), [
    { ticket: 18, tests: 930, state: { tests: 930, gates_s: 12 } },
    { ticket: 17, tests: 916, state: { depot_octets: 2_000_000 } },
  ]);
  assert.deepEqual(franchis(livraisons, seuils({ tests: 920 })), [{ measure: "tests", observed: 930, limit: 920 }]);
  assert.deepEqual(trancher(livraisons, 1).map(({ etats, gatesS }) => [etats.tests, gatesS]), [[930, 12], [null, 9]]);
});

test("rejouée sur la base qui a avancé, la même livraison dit de nouveau l'état du projet", (t) => {
  const { base, noter, cuire, juger, merger } = cuisine(t);
  cuire(17, { tours: 10, ms: 60_000 });
  juger(17, { tests: 916 });
  cuire(18, { tours: 10, ms: 60_000 });
  juger(18, { tests: 930 });
  merger(18);
  noter({ type: "pass.replayed", payload: { sha: "sha-17", base: "base-2", gates: { outcome: "green", code: 0, failures: [], tail: "", measures: { tests: 946 } }, findings: [] } }, 17);
  merger(17);

  assert.deepEqual(livraisonsMergees(base).map(({ state }) => state.tests), [930, 946]);
});

test("les seuils déclarés et les franchissements signalés se lisent au journal ; une mesure revenue sous son seuil n'est plus signalée", (t) => {
  const { base, noter } = cuisine(t);
  assert.equal(seuilsEnVigueur(base), null);

  noter({ type: "drift.configured", payload: { limits: seuils({ tests: 500 }) } });
  noter({ type: "drift.crossed", payload: { measure: "tests", observed: 622, limit: 500 } });
  noter({ type: "drift.crossed", payload: { measure: "growth:tests", observed: 54, limit: 30 } });
  noter({ type: "drift.cleared", payload: { measure: "tests" } });

  assert.deepEqual(seuilsEnVigueur(base), seuils({ tests: 500 }));
  assert.deepEqual(signalements(base), ["growth:tests"]);
});

test("une tranche vaut l'état que laisse sa dernière livraison, et la médiane de ce qui se répète", () => {
  const tranches = trancher(
    [
      livraison({ tests: 203, gates_s: 8 }, { gatesS: 8, cooks: [{ calibration: "sonnet/low", turns: 10, durationMs: 92_000 }] }),
      livraison({ tests: 210, gates_s: 20 }, { gatesS: 20, cooks: [{ calibration: "sonnet/low", turns: 30, durationMs: 180_000 }] }),
      livraison({}, { at: "2026-10-09T08:00:00.000Z" }),
      livraison({ tests: 622, gates_s: 21 }, { at: "2026-10-09T09:00:00.000Z", gatesS: 21, cooks: [{ calibration: "sonnet/low", turns: 40, durationMs: 79_000 }, { calibration: "opus/high", turns: 18, durationMs: 0 }] }),
    ],
    3,
  );

  assert.deepEqual(
    tranches.map(({ premier, dernier, jusquAu, etats, gatesS, partGates, tours }) => ({ premier, dernier, jusquAu, tests: etats.tests, gatesS, partGates, tours: [...tours] })),
    [
      // La troisième livraison ne déclare rien : l'état est celui de la deuxième.
      { premier: 1, dernier: 3, jusquAu: "2026-10-09T08:00:00.000Z", tests: 210, gatesS: 14, partGates: 0.09, tours: [["sonnet/low", { mediane: 20, tickets: 2 }]] },
      // Monté d'un calibrage : tous ses tours, sous celui avec lequel il a fini.
      { premier: 4, dernier: 4, jusquAu: "2026-10-09T09:00:00.000Z", tests: 622, gatesS: 21, partGates: 0.21, tours: [["opus/high", { mediane: 58, tickets: 1 }]] },
    ],
  );
});

test("un plafond est franchi quand il est dépassé, le compteur de merges quand il est atteint ; un seuil non déclaré ne juge rien", () => {
  const livraisons = [livraison({ tests: 500, tests_s: 6.2, gates_s: 21, contexte_octets: 9400, depot_octets: 2_900_000 }), livraison({})];

  assert.deepEqual(jauger(livraisons, SANS_SEUIL), []);
  // La valeur est comparée telle quelle : l'arrondi n'est qu'un affichage.
  assert.deepEqual(franchis([livraison({ depot_octets: 5_040_000 })], seuils({ repoMb: 5 })), [{ measure: "depot_octets", observed: 5.04, limit: 5 }]);
  assert.deepEqual(franchis([livraison({ tests_s: 0.28 })], seuils({ testsSeconds: 0.29 })), []);
  assert.deepEqual(franchis(livraisons, seuils({ tests: 500, testsSeconds: 10, gatesSeconds: 20, contextKb: 9, repoMb: 3, merges: 2 })), [
    { measure: "contexte_octets", observed: 9.4, limit: 9 },
    { measure: "gates_s", observed: 21, limit: 20 },
    { measure: "merges", observed: 2, limit: 2 },
  ]);
});

test("la pente compare une mesure à ce qu'elle valait dix merges plus tôt, et ne dit rien avant", () => {
  const stable = Array.from({ length: 10 }, () => livraison({ tests: 200, doc_octets: 1000 }));
  const pente = seuils({ growthPercent: 30 });

  // Dix merges : aucun n'a dix merges derrière lui.
  assert.deepEqual(franchis([...stable.slice(1), livraison({ tests: 900, doc_octets: 9000 })], pente), []);
  // Trente pour cent tout juste : le seuil est atteint, pas dépassé.
  assert.deepEqual(franchis([...stable, livraison({ tests: 260, doc_octets: 1300 })], pente), []);
  assert.deepEqual(franchis([...stable, livraison({ tests: 262, doc_octets: 1290 })], pente), [
    { measure: "growth:tests", observed: 31, limit: 30 },
  ]);
});

test("une mesure face à son seuil se lit dans l'unité du seuil", () => {
  assert.deepEqual(
    [
      { measure: "tests", observed: 622, limit: 500 },
      { measure: "tests_s", observed: 6.2, limit: 5 },
      { measure: "depot_octets", observed: 2.9, limit: 2 },
      { measure: "contexte_octets", observed: null, limit: 8 },
      { measure: "merges", observed: 80, limit: 80 },
      { measure: "growth:doc_octets", observed: 54.3, limit: 30 },
    ].map(direJauge),
    [
      "tests 622 pour un seuil de 500",
      "suite 6,2 s pour un seuil de 5 s",
      "dépôt 2,9 Mo pour un seuil de 2 Mo",
      "contexte — pour un seuil de 8 ko",
      "80 merges depuis la dernière fermeture pour un seuil de 80",
      "doc +54 % en 10 merges pour un seuil de 30 %",
    ],
  );
});

test("le chef lit les mesures dans le temps : une ligne par tranche, la pente, les tours par calibrage, les seuils", (t) => {
  const { base, livrer } = cuisine(t);
  livrer(1, { tests: 203, tests_s: 1.1, gates_s: 9, depot_octets: 1_200_000, contexte_octets: 6100, doc_octets: 212_000 }, { tours: 31, ms: 216_000, modele: "opus", effort: "high" });
  livrer(2, { tests: 287, tests_s: 1.9, gates_s: 11, depot_octets: 1_500_000, contexte_octets: 6100, doc_octets: 268_000 }, { tours: 12, ms: 209_000 });
  livrer(3, undefined, { tours: 14, ms: 100_000 });
  livrer(4, { tests: 622, tests_s: 6.2, gates_s: 21, depot_octets: 2_900_000, contexte_octets: 9400, doc_octets: 511_000 }, { tours: 58, ms: 170_000, modele: "opus", effort: "high" });

  assert.deepEqual(decrireReleve({ projet: "brigade", livraisons: livraisonsMergees(base), seuils: seuils({ tests: 500, testsSeconds: 10 }) }, 2), [
    "relevé     brigade — 4 merges au journal, par tranches de 2",
    "           4 depuis la dernière fermeture (aucune au journal) · 4 depuis le dernier regard sécurité (aucun au journal)",
    "           seules comptent les livraisons que la pass a jugées, et les cooks du journal — pas la consommation du compte",
    "",
    "merges  jusqu'au    tests  suite  gates  part gates  dépôt   contexte  doc",
    "1-2     2026-10-08  287    1,9 s  10 s   5 %         1,5 Mo  6,1 ko    268 ko",
    "3-4     2026-10-08  622    6,2 s  21 s   11 %        2,9 Mo  9,4 ko    511 ko",
    "pente               ×2,2   ×3,3   ×2,1               ×1,9    ×1,5      ×1,9",
    "",
    "tours      d'un ticket, médiane par calibrage (entre parenthèses : sur combien de tickets)",
    "merges  opus/high  sonnet/low",
    "1-2     31 (1)     12 (1)",
    "3-4     58 (1)     14 (1)",
    "",
    "seuils     tests 622 pour un seuil de 500 — FRANCHI",
    "           suite 6,2 s pour un seuil de 10 s",
  ]);
});

test("sans merge, sans cook calibré ou sans seuil, le relevé le dit au lieu de montrer des zéros", () => {
  assert.deepEqual(decrireReleve({ projet: "brigade", livraisons: [], seuils: null }), ["relevé     brigade — aucun merge au journal : rien à relever"]);

  const lignes = decrireReleve({ projet: "brigade", livraisons: [livraison({})], seuils: null });

  assert.deepEqual(lignes.slice(4), [
    "merges  jusqu'au    tests  suite  gates  part gates  dépôt  contexte  doc",
    "1       2026-10-08  —      —      —      —           —      —         —",
    "pente",
    "",
    "tours      aucun cook calibré derrière ces merges",
    "",
    "seuils     aucun déclaré — rien n'est signalé",
  ]);
});

test("au-delà de douze tranches, seules les dernières sont montrées, et le relevé le dit", () => {
  const lignes = decrireReleve({ projet: "brigade", livraisons: Array.from({ length: 14 }, () => livraison({ tests: 1 })), seuils: null }, 1);

  assert.equal(lignes[0], "relevé     brigade — 14 merges au journal, par tranches de 1 (les 12 dernières)");
  assert.deepEqual(lignes.slice(5, 17).map((ligne) => ligne.split(" ")[0]), ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
});

test("la commande montre le relevé sans rien écrire, et refuse un argument qu'elle ne connaît pas", async (t) => {
  const { repertoire, journal, livrer } = cuisine(t);
  livrer(1, { tests: 203 });
  livrer(2, { tests: 287 });
  const avant = journal.dernierSeq();

  const commande = lancer(t, MESURES, ["--par", "1"], { BRIGADE_STATE_DIR: repertoire });
  const refus = lancer(t, MESURES, ["--par", "zéro"], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /^relevé {5}brigade — 2 merges au journal, par tranches de 1\n/);
  assert.match(commande.sortie(), /\n2 {7}2026-10-08 {2}287 /);
  assert.equal(journal.dernierSeq(), avant);
  assert.equal(await refus.fin, 2);
  assert.match(refus.sortie(), /usage : BRIGADE_STATE_DIR=/);
});
