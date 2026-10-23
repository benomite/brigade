// La commande `setting` (#1309) : le passage de l'app vers les réglages du
// projet. Sans argument, elle les montre tels que la cuisine les applique, et
// d'où chacun vient ; avec un changement, elle le demande au runtime du projet
// (`proposerAuRuntime`, #1308) et rend sa réponse en une ligne de JSON — la PR
// ouverte, ou pourquoi il n'y en a pas. Une valeur que l'écriture refuse ne
// s'écrit même pas au journal.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { Sortie } from "../src/appel.ts";
import { poserDecision } from "../src/decisions.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { changementDesMots, principal } from "../src/reglage-cli.ts";
import { FICHIER } from "../src/reglages-projet/reglages.ts";
import { BASE, depotGit, git, jusqua, repertoireTemporaire } from "./outils.ts";

// Joue la commande dans le process du test : ses lignes et son code.
async function jouer(env: Record<string, string | undefined>, args: string[], delaiMs?: number) {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  let code = 0;
  try {
    await principal({ args, env, dire: (ligne) => sortie.push(ligne), redire: (ligne) => erreurs.push(ligne) }, delaiMs);
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
    for (const mots of [["ceiling", "opus"], ["branch"], ["branch", "a", "b"], ["cooks", "4"], ["ceiling", "opus", "high", "x"]]) assert.equal(changementDesMots(mots), null, mots.join(" "));
  });

  test("words it does not read are a usage, in 2, and nothing is asked", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const lu = await jouer({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" }, ["ceiling", "opus"]);
    assert.equal(lu.code, 2);
    assert.match(lu.erreurs.join("\n"), /is not a setting change\nusage: .*run setting/);
    assert.deepEqual(evenements(repertoire), []);
  });

  test("a value the writer refuses answers its reason in JSON, in 1: no request is written to the log", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const lu = await jouer({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" }, ["branch", "/home/chef/brigade"]);
    assert.equal(lu.code, 1);
    assert.equal(lu.json?.ok, false);
    assert.equal(lu.json?.reason, "chemin");
    assert.equal(lu.json?.key, "integrationBranch");
    assert.match(String(lu.json?.message), /`integrationBranch` does not belong in the project's repository/);
    assert.deepEqual(evenements(repertoire), []);
  });

  test("a new ceiling is asked of the project's runtime; its answer — the PR — comes back as one line of JSON, in 0", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const enCours = jouer({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" }, ["ceiling", "sonnet", "high"]);
    // Le runtime du projet, ici joué à la main : il lit la demande et y répond.
    const journal = ouvrirJournal(repertoire);
    t.after(() => journal.fermer());
    await jusqua(() => journal.duType("setting.requested", 10).length === 1);
    const [demande] = journal.duType("setting.requested", 10);
    assert.deepEqual(demande?.payload.change, { calibrationCeiling: { model: "sonnet", effort: "high" } });
    const settings = { integrationBranch: "v2", calibrationCeiling: { model: "sonnet", effort: "high" } };
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "setting.proposed", payload: { request: demande?.payload.request ?? "", pr: "https://github.com/acme/brigade/pull/51", number: 51, branch: "brigade/reglage-1", settings } });
    const lu = await enCours;
    assert.equal(lu.code, 0, lu.erreurs.join("\n"));
    assert.deepEqual(lu.json, { ok: true, pr: "https://github.com/acme/brigade/pull/51", number: 51, branch: "brigade/reglage-1", settings });
  });

  test("with no runtime to answer in time, it says so in JSON, in 1", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const lu = await jouer({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade" }, ["reviewer", "sonnet", "medium"], 0);
    assert.equal(lu.code, 1);
    assert.equal(lu.json?.reason, "sans-reponse");
  });

  test("with no argument, it shows the settings the kitchen applies — the repository's first — and where each comes from", async (t) => {
    const { clone } = depotGit(t);
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    writeFileSync(join(clone, FICHIER), `${JSON.stringify({ version: 1, integrationBranch: BASE, defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } }, calibrationCeiling: { model: "sonnet", effort: "high" } })}\n`);
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "les réglages du projet");
    git(clone, "push", "-q", "origin", BASE);
    // Le calibrage du reviewer, que le dépôt ne porte pas : celui que le chef a posé sur la station.
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoire);
    for (const [nom, valeur] of [["BRIGADE_REVIEWER_MODEL", "opus"], ["BRIGADE_REVIEWER_EFFORT", "high"]] as const) poserDecision(journal, { projet: "brigade", nom, valeur, auteur: "chef" });
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
    });

    // Sans dépôt lisible : rien n'en vient, le plafond est le défaut.
    const sans = await jouer({ BRIGADE_STATE_DIR: etatDuRuntime(t), BRIGADE_PROJECT: "brigade" }, []);
    assert.equal(sans.code, 0, sans.erreurs.join("\n"));
    assert.deepEqual(sans.json, { file: FICHIER, inRepository: false, integrationBranch: null, defaultCalibrations: { manager: null, reviewer: null }, calibrationCeiling: { model: "opus", effort: "high", from: "default" } });
  });
});
