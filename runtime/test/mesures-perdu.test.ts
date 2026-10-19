// Les tickets payés plusieurs fois au relevé : combien de lancements, et ce
// que leurs tokens ont produit — utiles quand le lancement a livré, perdus
// sinon. Le journal est écrit à la main : aucune cuisine ne tourne ici.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { Issue } from "../src/evenements/garde-fous.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { decrireReleve, trancher } from "../src/mesures.ts";
import { livraisonsMergees, type CookMesure, type Livraison } from "../src/projections/mesures.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (ticket: number, fait: Fait) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;
  // Un lancement, de son intention à ce que sa station en rapporte.
  const cuire = (ticket: number, run: string, { outcome, tours, tokens, raison = null }: { outcome: Issue; tours: number; tokens: number; raison?: string | null }) => {
    const livre = outcome === "ok";
    noter(ticket, { type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: "box/claude", model: "opus", effort: "high" } });
    noter(ticket, { type: "cook.exited", payload: { run, outcome, code: 0, signal: null, turns: tours, tokens, durationMs: 60_000 } });
    noter(ticket, { type: "cook.reported", payload: { run, ending: livre ? "done" : "failed", reason: raison, summary: null, branch: `cook/${run}`, pr: livre ? pr(ticket) : null } });
  };
  const juger = (ticket: number, run: string, verdict: "green" | "red") =>
    noter(ticket, {
      type: "pass.judged",
      payload: {
        run,
        pr: pr(ticket),
        number: ticket,
        sha: `sha-${run}`,
        verdict,
        gates: { outcome: verdict, code: verdict === "green" ? 0 : 1, failures: [], tail: "" },
        ci: { outcome: "none", checks: [] },
        review: { outcome: "skipped", run: null, summary: null, findings: [] },
        findings: [],
        judgeModified: false,
        noDiff: false,
      },
    });
  const merger = (ticket: number) => noter(ticket, { type: "merge.done", payload: { pr: pr(ticket), sha: `sha-${ticket}`, by: "pass", reconciled: false } });
  return { base: journal.base, noter, cuire, juger, merger };
}

const releve = (livraisons: Livraison[], par?: number) => {
  const lignes = decrireReleve({ projet: "brigade", livraisons, seuils: null }, par);
  const debut = lignes.findIndex((ligne) => ligne.startsWith("launches"));
  return lignes.slice(debut, lignes.indexOf("", debut));
};

const cook = (tokens: number | null, delivered: boolean): CookMesure => ({ calibration: "sonnet/medium", turns: 5, durationMs: 1000, tokens, delivered });
const livraison = (ticket: number | null, cooks: CookMesure[]): Livraison => ({ ticket, at: `${JOUR_HORLOGE}T10:00:00.000Z`, measures: {}, state: {}, gatesS: null, cooks });

test("le cas #393 : deux lancements, un seul livre — les 450 627 tokens du cook sans commit sortent en perdus, le reste en utiles", (t) => {
  const { base, cuire, juger, merger } = cuisine(t);
  // Le premier cook finit son tour sans rien commiter : la station ne livre rien.
  cuire(393, "393-b42a9123", { outcome: "failed", tours: 56, tokens: 450_627, raison: "no-commit" });
  // Le second refait le ticket, et livre.
  cuire(393, "393-b12c8069", { outcome: "ok", tours: 22, tokens: 199_822 });
  juger(393, "393-b12c8069", "green");
  merger(393);

  const livraisons = livraisonsMergees(base);

  assert.deepEqual(livraisons[0]?.cooks.map(({ tokens, delivered }) => ({ tokens, delivered })), [
    { tokens: 450_627, delivered: false },
    { tokens: 199_822, delivered: true },
  ]);
  assert.deepEqual(trancher(livraisons)[0]?.paiements, [{ ticket: 393, lancements: 2, inconnus: 0, tokens: { utiles: 199_822, perdus: 450_627 } }]);
  assert.deepEqual(releve(livraisons), [
    "launches   tickets launched more than once, or with a launch that delivered nothing — useful: the tokens of the launches that delivered; lost: those of the others",
    "merges  ticket  launches  tokens   useful   lost",
    "1       #393    2         650,449  199,822  450,627 (69%)",
  ]);
});

test("un ticket cher dont tous les lancements ont livré affiche zéro perdu", (t) => {
  const { base, noter, cuire, juger, merger } = cuisine(t);
  // La pass refuse la première livraison : le second cook la corrige, et livre à son tour.
  cuire(401, "401-aaaaaaaa", { outcome: "ok", tours: 60, tokens: 450_627 });
  juger(401, "401-aaaaaaaa", "red");
  noter(401, { type: "pass.returned", payload: { n: 1, findings: ["un test échoue"] } });
  cuire(401, "401-bbbbbbbb", { outcome: "ok", tours: 20, tokens: 199_822 });
  juger(401, "401-bbbbbbbb", "green");
  merger(401);

  const livraisons = livraisonsMergees(base);

  assert.deepEqual(trancher(livraisons)[0]?.paiements, [{ ticket: 401, lancements: 2, inconnus: 0, tokens: { utiles: 650_449, perdus: 0 } }]);
  assert.deepEqual(releve(livraisons).slice(1), [
    "merges  ticket  launches  tokens   useful   lost",
    "1       #401    2         650,449  650,449  0",
  ]);
});

test("seule la fin `ok` d'un cook vaut livraison : arrêté, refusé, 86, ou mort avec le runtime, ses tokens sont perdus", (t) => {
  const { base, noter, cuire, juger, merger } = cuisine(t);
  cuire(7, "7-garde", { outcome: "guard", tours: 100, tokens: 300 });
  cuire(7, "7-stop", { outcome: "stop", tours: 3, tokens: 40 });
  cuire(7, "7-refus", { outcome: "refused", tours: 1, tokens: 20 });
  cuire(7, "7-quota", { outcome: "neutral", tours: 1, tokens: 5 });
  // Mort avec le runtime : lancé, jamais sorti — ses tokens ne sont pas connus.
  noter(7, { type: "cook.launched", payload: { run: "7-mort", limits: LIMITES, stream: "runs/7-mort.jsonl", station: "box/claude", model: "opus", effort: "high" } });
  noter(7, { type: "cook.interrupted", payload: { run: "7-mort" } });
  cuire(7, "7-livre", { outcome: "ok", tours: 10, tokens: 1000 });
  juger(7, "7-livre", "green");
  merger(7);

  assert.deepEqual(trancher(livraisonsMergees(base))[0]?.paiements, [{ ticket: 7, lancements: 6, inconnus: 1, tokens: { utiles: 1000, perdus: 365 } }]);
});

test("le relevé ne liste que les tickets payés plus d'une fois ou à perte, tranche par tranche, et dit quand il n'y en a aucun", () => {
  const lignes = releve(
    [
      // Un seul lancement, qui a livré : rien à en dire.
      livraison(1, [cook(9000, true)]),
      livraison(2, [cook(400, false), cook(1500, true), cook(2000, true)]),
      // Un seul lancement, qui n'a rien livré : le merge s'est fait sans lui.
      livraison(3, [cook(800, false)]),
      // Un lancement mort avec le runtime : ce qu'il a consommé n'est dans aucune somme, et le relevé le dit.
      livraison(4, [cook(null, false), cook(700, true)]),
      // Aucun de ses lancements n'a de tokens connus : le journal ne le sait pas.
      livraison(5, [cook(null, false), cook(null, true)]),
    ],
    2,
  );

  assert.deepEqual(lignes.slice(1), [
    "merges  ticket  launches                           tokens  useful  lost",
    "1-2     #2      3                                  3,900   3,500   400 (10%)",
    "3-4     #3      1                                  800     0       800 (100%)",
    "3-4     #4      2, of which 1 with unknown tokens  700     700     0",
    "5       #5      2, of which 2 with unknown tokens  —       —       —",
  ]);

  assert.deepEqual(releve([livraison(1, [cook(9000, true)]), livraison(null, [])]), ["launches   no ticket launched more than once, and no launch without a delivery, behind these merges"]);
});
