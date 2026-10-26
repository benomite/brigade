// Le bilan d'une passe qui écrit, tel que `run fermeture` le relit dans le
// journal : ce qu'elle a retiré et laissé, la pente avant et après, et trois
// garde-fous — dont l'échec se dit en tête, même sous des gates vertes.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import type { FaitFermeture } from "../../src/events/closing.ts";
import type { Gates } from "../../src/events/pass.ts";
import { direBilan, gardeFous } from "../../src/closing/report.ts";
import { principal } from "../../src/closing/command.ts";
import { SANS_MOTIF } from "../../src/closing/brief.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { chef } from "../aides/cuisine.ts";
import { appeler, BASE, ENV_GIT, git, jusqua, repertoireTemporaire } from "../outils.ts";
import { cuisineFermee, RETIRER_M1 } from "./kitchen.ts";
import { lignes, type Etape } from "./history.ts";

// Le numéro de la première PR du GitHub de test.
const PR = 101;

// Deux merges avant le projet : chacun ajoute dix lignes et en retire une.
const DEUX_MERGES: Etape[] = [
  { commit: { "stock.txt": lignes(40) } },
  { merge: { "plats/1.txt": lignes(10), "stock.txt": lignes(39) } },
  { merge: { "plats/2.txt": lignes(10), "stock.txt": lignes(38) } },
];

const gates = (outcome: Gates["outcome"], measures?: Record<string, number>): Gates => ({ outcome, code: outcome === "green" ? 0 : 1, failures: [], tail: "", ...(measures ? { measures } : {}) });

// La pass a jugé la base seule, sur sa tête : ce que ses gates y ont déclaré.
function jugerLaBase({ journal, teteDeLaBase }: ReturnType<typeof cuisineFermee>, mesures: Record<string, number>): void {
  journal.ajouter({ project: "brigade", ticket: null, author: "pass", type: "base.checked", payload: { sha: teteDeLaBase(), outcome: "green", gates: gates("green", mesures), tickets: [] } });
}

// Une passe qui retire M1, laisse D1 en le disant et M2 sans rien dire.
async function livrer({ demander, fin, closer }: ReturnType<typeof cuisineFermee>) {
  closer.gestes(RETIRER_M1);
  closer.message("<livrable>\nRetiré : M1.\nLAISSÉ D1 : deux modules qui évoluent à part\n</livrable>\n");
  const { code, sortie } = await demander();
  assert.equal(code, 0, sortie);
  return fin();
}

// Ce que `run fermeture` dit de la dernière passe : sa ligne `passe`, et son bilan.
async function lire({ clone, repertoire }: ReturnType<typeof cuisineFermee>): Promise<string[]> {
  const appel = appeler(principal, [], { ...ENV_GIT, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: BASE, BRIGADE_STATE_DIR: repertoire });
  assert.equal(await appel.fin, 0, appel.sortie());
  const sortie = appel.sortie().trimEnd().split("\n");
  return sortie.slice(sortie.findIndex((ligne) => ligne.startsWith("pass ")));
}

// Chaque test a sa cuisine — état, dépôt, GitHub : ils se jouent de front.
describe("le bilan d'une passe de fermeture", { concurrency: 8 }, () => {
  test("après une passe, `run fermeture` en donne le bilan sans rouvrir sa PR : chaque retrait avec son chemin et son motif, chaque candidat laissé avec sa raison, la pente avant et après sur les mêmes merges, et les trois garde-fous avec leur valeur avant, après et leur verdict", async (t) => {
    const cuisine = cuisineFermee(t, { histoire: DEUX_MERGES });
    const { repertoire, types, teteDeLaBase } = cuisine;
    const base = teteDeLaBase().slice(0, 7);
    chef(repertoire, "grant.activated");
    jugerLaBase(cuisine, { couverture: 87.5, verifications: 12 });
    // La PR de la passe, fusionnée avec la base : ses gates en déclarent autant.
    cuisine.gates.mesurer({ couverture: 87.5, verifications: 12 });

    const passe = await livrer(cuisine);
    await jusqua(() => types(PR).includes("merge.done"));

    // Le journal porte de quoi le dire : ce qu'elle a retiré, ce qu'elle a
    // ajouté, et la pente de la base dont elle est partie.
    assert.deepEqual(passe.removed, [{ id: "M1", what: "export `inutile` of `src/libre/outils.ts:2` — referenced nowhere" }]);
    assert.deepEqual([passe.removedLines, passe.addedLines], [1, 0]);
    assert.deepEqual(passe.slope, [20, 50, 100].map((window) => ({ window, merges: 2, added: 20, removed: 2 })));

    const [ligne, ...bilan] = await lire(cuisine);
    assert.match(ligne ?? "", /^pass {7}fermeture-[0-9a-f]{8}, on 2026-10-\d\d \d\d:\d\d — delivered: 1 line removed in 1 file/);
    assert.deepEqual(
      bilan.map((dit) => dit.replace(/merged on 2026-10-\d\d \d\d:\d\d$/, "merged on <date>")),
      [
        "summary    the slope falls (10:1 → 6.7:1 over 20 merges) · the three guardrails hold",
        "           PR #101 — judged green by the pass, merged on <date>",
        "removed    1 of 3 candidates · 1 line removed, none added, in `src/libre/outils.ts`",
        "           M1  export `inutile` of `src/libre/outils.ts:2` — referenced nowhere",
        "left       2, for lack of certainty",
        "           D1  8 identical lines of code: `src/libre/a.ts:1-8` = `src/libre/b.ts:1-8`  deux modules qui évoluent à part",
        `           M2  export \`oublie\` of \`src/tenu/outils.ts:2\` — referenced nowhere          ${SANS_MOTIF}`,
        "slope      added / removed over the same merges: before the pass → with what it removes",
        "           20 merges   +20 / −2  10:1  →  +20 / −3  6.7:1  falls — only 2 merges on the branch",
        "           50 merges   +20 / −2  10:1  →  +20 / −3  6.7:1  falls — only 2 merges on the branch",
        "           100 merges  +20 / −2  10:1  →  +20 / −3  6.7:1  falls — only 2 merges on the branch",
        `guardrails before the pass → after, by the gates the pass ran: on the base \`${base}\`, then on the PR merged with it`,
        "           test coverage  87.5 % → 87.5 %            holds",
        "           gate checks    12 → 12                    holds",
        "           product state  gates green → gates green  holds",
      ],
    );
  });

  test("une couverture ou un nombre de vérifications en baisse est un échec, dit en tête du bilan — même si les gates sont vertes et que la pass a mergé", async (t) => {
    const cuisine = cuisineFermee(t, { histoire: DEUX_MERGES });
    const { repertoire, journal, types } = cuisine;
    chef(repertoire, "grant.activated");
    jugerLaBase(cuisine, { couverture: 87.5, verifications: 12 });
    // Ce que le closer a retiré était vivant : un test est parti avec.
    cuisine.gates.mesurer({ couverture: 86.9, verifications: 11 });

    await livrer(cuisine);
    await jusqua(() => types(PR).includes("merge.done"));
    // Les gates étaient vertes, et la pass a mergé : elle ne juge pas ces mesures.
    const jugement = journal.duTicket(PR).findLast((fait) => fait.type === "pass.judged")?.payload;
    assert.deepEqual([jugement?.verdict, jugement?.gates.outcome], ["green", "green"]);

    const [, tete, ...suite] = await lire(cuisine);
    assert.equal(
      tete,
      "summary    FAILURE — test coverage : down (87.5 % → 86.9 %), gate checks : down (12 → 11), even if the gates are green — the pass may have removed live code · the slope falls (10:1 → 6.7:1 over 20 merges)",
    );
    assert.deepEqual(suite.slice(-3), [
      "           test coverage  87.5 % → 86.9 %            FAILURE — down",
      "           gate checks    12 → 11                    FAILURE — down",
      "           product state  gates green → gates green  holds",
    ]);
  });

  test("un seul garde-fou qui cède suffit, une mesure qui monte ou ne bouge pas tient, et des gates rouges sont l'échec du produit", () => {
    const verdicts = (avant: Gates | null, apres: Gates | null) => gardeFous(avant, apres, "no before", "no after").map(({ verdict, detail }) => [verdict, detail]);
    const base = gates("green", { couverture: 80, verifications: 30 });

    assert.deepEqual(verdicts(base, gates("green", { couverture: 80, verifications: 29 })), [["tenu", null], ["echec", "down"], ["tenu", null]]);
    assert.deepEqual(verdicts(base, gates("green", { couverture: 79.99, verifications: 30 })), [["echec", "down"], ["tenu", null], ["tenu", null]]);
    assert.deepEqual(verdicts(base, gates("green", { couverture: 91.2, verifications: 30 })), [["tenu", null], ["tenu", null], ["tenu", null]]);
    assert.deepEqual(verdicts(base, gates("red", { couverture: 80, verifications: 30 })), [["tenu", null], ["tenu", null], ["echec", "the test suite is not green"]]);
    assert.deepEqual(verdicts(base, gates("timeout")).at(-1), ["echec", "the test suite is not green"]);
  });

  test("un garde-fou que rien n'a mesuré n'est jamais dit tenu : le bilan dit ce qui manque — la PR pas encore jugée, des gates qui ne déclarent pas la mesure, une base que la pass n'a jamais jugée seule", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    const ecrire = (ticket: number | null, fait: Fait) => journal.ajouter({ project: "brigade", ticket, author: "essai", ...fait });
    const fin: Extract<FaitFermeture, { type: "closing.ended" }>["payload"] = {
      run: "fermeture-0a1b2c3d",
      outcome: "delivered",
      branch: "cook/fermeture-0a1b2c3d",
      pr: "https://github.com/acme/brigade/pull/101",
      sha: "c0ffee1",
      removedLines: 4,
      addedLines: 0,
      files: ["src/a.ts"],
      removed: [{ id: "M1", what: "export `inutile` of `src/a.ts:2` — referenced nowhere" }],
      kept: [],
      slope: [{ window: 20, merges: 20, added: 2000, removed: 100 }],
    };
    // L'arbre d'un commit, tel que le clone le donnerait.
    const arbreDe = (commit: string) => `arbre-de-${commit}`;
    const gardes = () => direBilan(journal, fin, arbreDe).slice(-3);
    const tete = () => direBilan(journal, fin, arbreDe)[0];
    const jugee = (numero: number, sur: string, arbre: string, jouees: Gates) =>
      ecrire(numero, {
        type: "pass.judged",
        payload: {
          run: "r",
          pr: `https://github.com/acme/brigade/pull/${numero}`,
          number: numero,
          sha: "c0ffee1",
          base: sur,
          merged: arbre,
          verdict: "green",
          gates: jouees,
          ci: { outcome: "none", checks: [] },
          review: { outcome: "green", run: null, summary: null, findings: [] },
          findings: [],
          judgeModified: false,
          noDiff: false,
        },
      });

    // La PR est en pass, pas encore jugée.
    ecrire(PR, { type: "pass.entered", payload: { run: fin.run, branch: fin.branch ?? "", pr: fin.pr ?? "", number: PR } });
    assert.equal(tete(), "summary    3 guardrails not established (test coverage, gate checks, product state): nothing says they hold · the slope falls (20:1 → 19.2:1 over 20 merges)");
    assert.equal(direBilan(journal, fin, arbreDe)[1], "           PR #101 — not yet judged by the pass, not merged: the base's slope only moves at its merge");
    assert.deepEqual(gardes(), [
      "           test coverage  — → —  not established — the pass has not judged the PR yet",
      "           gate checks    — → —  not established — the pass has not judged the PR yet",
      "           product state  — → —  not established — the pass has not judged the PR yet",
    ]);

    // Jugée verte, par des gates qui ne déclarent rien : le produit marche, et
    // rien d'autre n'est établi.
    jugee(PR, "ba5e001", "arbre-de-la-fusion", gates("green"));
    assert.deepEqual(gardes(), [
      "           test coverage  — → —            not established — the gates run on the PR do not declare `MESURE couverture`",
      "           gate checks    — → —            not established — the gates run on the PR do not declare `MESURE verifications`",
      "           product state  — → gates green  holds",
    ]);

    // Rejugée par des gates qui déclarent : sans gates jouées sur la base même,
    // il n'y a pas d'« avant » — et pas de verdict.
    jugee(PR, "ba5e001", "arbre-de-la-fusion", gates("green", { couverture: 90, verifications: 12 }));
    assert.match(tete() ?? "", /^summary {4}2 guardrails not established \(test coverage, gate checks\): nothing says they hold · /);
    assert.deepEqual(gardes().slice(0, 2), [
      "           test coverage  — → 90 %         not established — no gate in the log was run on the base `ba5e001` alone",
      "           gate checks    — → 12           not established — no gate in the log was run on the base `ba5e001` alone",
    ]);

    // Une autre base jugée seule ne dit rien de celle-ci ; ni un contrôle non joué.
    ecrire(null, { type: "base.checked", payload: { sha: "ba5e000", outcome: "green", gates: gates("green", { couverture: 95, verifications: 12 }), tickets: [] } });
    ecrire(null, { type: "base.checked", payload: { sha: "ba5e001", outcome: "skipped", gates: gates("skipped"), tickets: [] } });
    assert.match(gardes()[0] ?? "", /not established — no gate in the log/);

    // La livraison dont le merge a fait cette base a été jugée sur cet arbre :
    // ses gates sont l'« avant ». La couverture a baissé.
    jugee(7, "ba5e000", "arbre-de-ba5e001", gates("green", { couverture: 92.5, verifications: 12 }));
    assert.match(tete() ?? "", /^summary {4}FAILURE — test coverage : down \(92\.5 % → 90 %\), even if the gates are green — the pass may have removed live code · the slope falls/);
    assert.deepEqual(gardes(), [
      "           test coverage  92.5 % → 90 %              FAILURE — down",
      "           gate checks    12 → 12                    holds",
      "           product state  gates green → gates green  holds",
    ]);
  });

  test("une pente qui n'a pas bougé : le bilan écrit en toutes lettres que la passe n'a pas servi — qu'elle ait livré ou non", async (t) => {
    // Un merge de deux mille lignes ajoutées pour mille retirées : une ligne de
    // moins n'y change rien qui se lise.
    const lourde = cuisineFermee(t, { histoire: [{ commit: { "stock.txt": lignes(1100) } }, { merge: { "plats/1.txt": lignes(2000), "stock.txt": lignes(100) } }] });
    assert.equal((await livrer(lourde)).outcome, "delivered");
    await jusqua(() => lourde.types(PR).includes("pass.held"));
    const [, tete, pr, ...suite] = await lire(lourde);
    assert.match(tete ?? "", / · the slope did not move \(2:1 over 20 merges\): the pass was of no use$/);
    assert.equal(pr, "           PR #101 — judged green by the pass, not merged: the base's slope only moves at its merge");
    assert.ok(suite.includes("slope      added / removed over the same merges: before the pass → with what it removes, once its PR is merged"), suite.join("\n"));
    const fr = (valeur: number) => valeur.toLocaleString("en-US");
    assert.ok(suite.includes(`           20 merges   +${fr(2000)} / −${fr(1000)}  2:1  →  +${fr(2000)} / −${fr(1001)}  2:1  did not move — only 1 merge on the branch`), suite.join("\n"));

    // Un closer qui ne retire rien : aucune PR, et le bilan garde ce qu'il a laissé.
    const prudente = cuisineFermee(t, { histoire: DEUX_MERGES });
    prudente.closer.message("<livrable>\nLAISSÉ M1 : appelé par un script de déploiement hors du dépôt\nLAISSÉ M2 : idem\n</livrable>\n");
    assert.equal((await prudente.demander()).code, 0);
    assert.equal((await prudente.fin()).outcome, "nothing");
    const [, ...bilan] = await lire(prudente);
    assert.deepEqual(bilan, [
      "summary    nothing was removed: the slope did not move, the pass was of no use",
      "left       3, for lack of certainty",
      `           D1  8 identical lines of code: \`src/libre/a.ts:1-8\` = \`src/libre/b.ts:1-8\`  ${SANS_MOTIF}`,
      "           M1  export `inutile` of `src/libre/outils.ts:2` — referenced nowhere        appelé par un script de déploiement hors du dépôt",
      "           M2  export `oublie` of `src/tenu/outils.ts:2` — referenced nowhere          idem",
    ]);
  });

  test("une PR de passe rouge : l'état du produit est en échec, mesuré contre la base que la pass a jugée seule — et une passe demandée depuis n'efface pas le bilan de la dernière qui a fini", async (t) => {
    const cuisine = cuisineFermee(t, { histoire: DEUX_MERGES });
    const { types, clone, teteDeLaBase } = cuisine;
    cuisine.gates.mesurer({ couverture: 87.5, verifications: 12 });
    cuisine.gates.regler("rouge");

    await livrer(cuisine);
    // Rouge une fois fusionnée : la pass joue les gates sur la base seule — vertes.
    await jusqua(() => types(PR).includes("pass.escalated"));
    assert.equal(cuisine.dernier("closing.ended")?.outcome, "delivered");
    const base = cuisine.journal.duType("base.checked", 1)[0]?.payload;
    assert.deepEqual([base?.sha, base?.outcome], [teteDeLaBase(), "green"]);
    assert.equal(git(clone, "rev-parse", `origin/${BASE}`), teteDeLaBase());

    const [, tete, pr, ...suite] = await lire(cuisine);
    assert.equal(tete, "summary    FAILURE — product state : the test suite is not green (gates green → gates red) — the pass may have removed live code · the slope falls (10:1 → 6.7:1 over 20 merges)");
    assert.equal(pr, "           PR #101 — judged red by the pass, not merged: the base's slope only moves at its merge");
    assert.deepEqual(suite.slice(-3), [
      "           test coverage  87.5 % → 87.5 %          holds",
      "           gate checks    12 → 12                  holds",
      "           product state  gates green → gates red  FAILURE — the test suite is not green",
    ]);

    // Le chef redemande une passe : refusée, le closer n'étant plus réglé — son
    // refus est la dernière nouvelle, et le bilan de la passe finie reste lisible.
    cuisine.runtime.arreter("essai");
    const seconde = cuisineFermee(t, { lieux: cuisine.lieux, reglages: { calibration: null } });
    assert.equal((await seconde.demander()).code, 1);
    const [refus, rappel, bilan] = await lire(seconde);
    assert.match(refus ?? "", /^pass {7}refused on .* — the closer is not set on this project/);
    assert.match(rappel ?? "", /^ {11}the last finished pass: fermeture-[0-9a-f]{8}, on .* — delivered: 1 line removed in 1 file/);
    assert.equal(bilan, tete);
  });
});
