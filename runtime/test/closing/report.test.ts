// Le bilan d'une passe qui écrit, tel que `run fermeture` le relit dans le
// journal : ce qu'elle a retiré et laissé, la pente avant et après, et trois
// garde-fous — dont l'échec se dit en tête, même sous des gates vertes.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import type { FaitFermeture } from "../../src/events/closing.ts";
import type { Gates } from "../../src/events/pass.ts";
import { direBilan, gardeFous } from "../../src/closing/report.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repertoireTemporaire } from "../outils.ts";

// Le numéro de la PR de la passe.
const PR = 101;

const gates = (outcome: Gates["outcome"], measures?: Record<string, number>): Gates => ({ outcome, code: outcome === "green" ? 0 : 1, failures: [], tail: "", ...(measures ? { measures } : {}) });

describe("le bilan d'une passe de fermeture", () => {
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
});
