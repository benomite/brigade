// La commande `setting` (#1309) : le passage de l'app vers les réglages du
// projet. Sans argument, elle les montre tels que la cuisine les applique, et
// d'où chacun vient ; un changement n'ouvre plus de PR (#2061) : elle répond un
// refus `no-runtime` en une ligne de JSON, et n'écrit rien au journal.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { Sortie } from "../src/appel.ts";
import { poserDecision } from "../src/decisions.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { changementDesMots, principal } from "../src/reglage-cli.ts";
import { FICHIER } from "../src/reglages-projet/reglages.ts";
import { BASE, depotGit, git, repertoireTemporaire } from "./outils.ts";

// Joue la commande dans le process du test : ses lignes et son code.
async function jouer(env: Record<string, string | undefined>, args: string[]) {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  let code = 0;
  try {
    await principal({ args, env, dire: (ligne) => sortie.push(ligne), redire: (ligne) => erreurs.push(ligne) });
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  return { code, sortie, erreurs, json: sortie.length === 1 ? (JSON.parse(sortie[0] as string) as Record<string, unknown>) : undefined };
}

// L'état d'un runtime qui a déjà tourné : son journal existe.
const etatDuRuntime = (t: Parameters<typeof repertoireTemporaire>[0]) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  return repertoire;
};

const evenements = (repertoire: string) => {
  const journal = ouvrirJournal(repertoire);
  try {
    return journal.tout();
  } finally {
    journal.fermer();
  }
};

describe("the `setting` command", () => {
  test("its words name a change of the settings file, or nothing", () => {
    assert.deepEqual(changementDesMots(["ceiling", "sonnet", "medium"]), { calibrationCeiling: { model: "sonnet", effort: "medium" } });
    assert.deepEqual(changementDesMots(["ceiling", "default"]), { calibrationCeiling: null });
    assert.deepEqual(changementDesMots(["manager", "opus", "high"]), { defaultCalibrations: { manager: { model: "opus", effort: "high" } } });
    assert.deepEqual(changementDesMots(["reviewer", "default"]), { defaultCalibrations: { reviewer: null } });
    assert.deepEqual(changementDesMots(["branch", "v3"]), { integrationBranch: "v3" });
    // Le closer (#1685) : son calibrage, et ses trois nombres — des chiffres sont un nombre, un autre mot reste un mot, que
    // l'écriture refuse en le nommant.
    assert.deepEqual(changementDesMots(["closer", "sonnet", "medium"]), { closer: { calibration: { model: "sonnet", effort: "medium" } } });
    assert.deepEqual(changementDesMots(["closer", "default"]), { closer: { calibration: null } });
    assert.deepEqual(changementDesMots(["closer-cooks", "2"]), { closer: { cooksBelow: 2 } });
    assert.deepEqual(changementDesMots(["closer-tokens", "200000"]), { closer: { maxTokens: 200_000 } });
    assert.deepEqual(changementDesMots(["closer-lines", "default"]), { closer: { maxRemovedLines: null } });
    assert.deepEqual(changementDesMots(["closer-lines", "1.5"]), { closer: { maxRemovedLines: "1.5" } });
    for (const mots of [["ceiling", "opus"], ["branch"], ["branch", "a", "b"], ["cooks", "4"], ["ceiling", "opus", "high", "x"], ["closer-cooks"], ["closer-cooks", "1", "2"], ["closer", "opus"], ["constructor", "1"]]) {
      assert.equal(changementDesMots(mots), null, mots.join(" "));
    }
  });

  test("words it does not read are a usage, in 2, and nothing is asked", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const lu = await jouer({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" }, ["ceiling", "opus"]);
    assert.equal(lu.code, 2);
    assert.match(lu.erreurs.join("\n"), /is not a setting change\nusage: .*run setting/);
    assert.deepEqual(evenements(repertoire), []);
  });

  test("a change, whatever its value, answers a `no-runtime` refusal in JSON, in 1: no PR, and nothing is written to the log", async (t) => {
    const repertoire = etatDuRuntime(t);
    for (const [mots, cle] of [[["ceiling", "sonnet", "high"], "calibrationCeiling"], [["reviewer", "sonnet", "medium"], "defaultCalibrations"], [["branch", "/home/chef/brigade"], "integrationBranch"], [["closer-cooks", "0"], "closer"]] as const) {
      const lu = await jouer({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" }, [...mots]);
      assert.equal(lu.code, 1, mots.join(" "));
      assert.deepEqual(lu.json, { ok: false, reason: "no-runtime", key: cle, message: `the kitchen no longer opens a settings PR: change ${FICHIER} by a pull request on GitHub` }, mots.join(" "));
    }
    assert.deepEqual(evenements(repertoire), []);
  });

  test("with no argument, it shows the settings the kitchen applies — the repository's first — and where each comes from", async (t) => {
    const { clone } = depotGit(t);
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    const closer = { calibration: { model: "sonnet", effort: "medium" }, maxTokens: 200_000 };
    writeFileSync(join(clone, FICHIER), `${JSON.stringify({ version: 1, integrationBranch: BASE, defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } }, calibrationCeiling: { model: "sonnet", effort: "high" }, closer })}\n`);
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "les réglages du projet");
    git(clone, "push", "-q", "origin", BASE);
    // Le calibrage du reviewer et la condition de départ du closer, que le dépôt ne porte pas : ceux que le chef a posés
    // sur la station. Le plafond de tokens du closer posé sur la station cède à celui du dépôt.
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoire);
    const poses = [["BRIGADE_REVIEWER_MODEL", "opus"], ["BRIGADE_REVIEWER_EFFORT", "high"], ["BRIGADE_CLOSING_COOKS", "3"], ["BRIGADE_CLOSING_MAX_TOKENS", "900000"]] as const;
    for (const [nom, valeur] of poses) poserDecision(journal, { projet: "brigade", nom, valeur, auteur: "chef" });
    journal.fermer();
    const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade", BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: BASE };
    const lu = await jouer(env, []);
    assert.equal(lu.code, 0, lu.erreurs.join("\n"));
    assert.deepEqual(lu.json, {
      file: FICHIER,
      inRepository: true,
      integrationBranch: { value: BASE, from: "repository" },
      defaultCalibrations: { manager: { model: "sonnet", effort: "medium", from: "repository" }, reviewer: { model: "opus", effort: "high", from: "station" } },
      calibrationCeiling: { model: "sonnet", effort: "high", from: "repository" },
      closer: {
        calibration: { model: "sonnet", effort: "medium", from: "repository" },
        cooksBelow: { value: 3, from: "station" },
        maxTokens: { value: 200_000, from: "repository" },
        maxRemovedLines: { value: 500, from: "default" },
      },
    });

    // Sans dépôt lisible : rien n'en vient, le plafond est le défaut.
    const sans = await jouer({ BRIGADE_STATE_DIR: etatDuRuntime(t), BRIGADE_PROJECT: "brigade" }, []);
    assert.equal(sans.code, 0, sans.erreurs.join("\n"));
    assert.deepEqual(sans.json, {
      file: FICHIER,
      inRepository: false,
      integrationBranch: null,
      defaultCalibrations: { manager: null, reviewer: null },
      calibrationCeiling: { model: "opus", effort: "high", from: "default" },
      // Sans calibrage, pas de closer ; ses nombres sont les défauts du runtime.
      closer: { calibration: null, cooksBelow: { value: 1, from: "default" }, maxTokens: { value: 500_000, from: "default" }, maxRemovedLines: { value: 500, from: "default" } },
    });
  });
});
