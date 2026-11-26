// La porte de confiance (#4421), telle que la cuisine d'un projet l'ouvre : ses
// éléments acceptés vivent dans son état et survivent à sa réouverture ; un
// agent de la cuisine est de confiance sans lecture, un inconnu que GitHub ne
// dit pas ne l'est pas.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { FAUX_CLAUDE, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const DECIDE = {
  BRIGADE_STATIONS: "box/claude:30:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

function preparer(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const etat = join(racine, "etat");
  const clone = join(racine, "clone");
  const session = join(racine, ".session");
  mkdirSync(etat);
  mkdirSync(clone);
  mkdirSync(session);
  git(clone, "init", "-q");
  const journal = ouvrirJournal(etat);
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  writeFileSync(join(session, "renouvellement"), "verifie=2026-10-08T10:00:00Z\necrits=2026-10-08T09:00:00Z\n");
  const dits: string[] = [];
  const ouvrir = () =>
    ouvrirCuisine(
      {
        HOME: racine,
        BRIGADE_STATE_DIR: etat,
        BRIGADE_PROJECT: "brigade",
        BRIGADE_GITHUB_REPO: "acme/brigade",
        // Aucun test ne joint GitHub : ce `gh` n'existe pas.
        BRIGADE_GH_BIN: join(racine, "gh-absent"),
        BRIGADE_REPO_DIR: clone,
        BRIGADE_BASE_BRANCH: "v2",
        BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
        BRIGADE_SESSION_DIR: session,
      },
      { dire: (ligne) => dits.push(ligne) },
    );
  return { etat, ouvrir, dits };
}

test("the kitchen keeps its accepted items across a reopening, and trusts its agent but not an unknown author", async (t) => {
  const { ouvrir, dits } = preparer(t);
  const premiere = ouvrir();
  try {
    assert.ok(premiere.acceptes, "the kitchen opens its store of accepted items");
    premiere.acceptes.accept({ kind: "comment", id: 7 });
    assert.ok(premiere.confiance);
    assert.equal(await premiere.confiance.isTrusted("github-actions[bot]"), true);
    // Sans `gh`, ni le chef ni le droit ne se lisent : l'inconnu n'est pas de confiance.
    assert.equal(await premiere.confiance.isTrusted("stranger"), false);
    assert.match(dits.join("\n"), /confiance de stranger non lue/);
  } finally {
    premiere.arreter("fin du test");
    await premiere.arretee?.();
  }
  const seconde = ouvrir();
  try {
    assert.equal(seconde.acceptes?.isAccepted({ kind: "comment", id: 7 }), true);
    assert.equal(seconde.acceptes?.isAccepted({ kind: "issue", id: 7 }), false);
  } finally {
    seconde.arreter("fin du test");
    await seconde.arretee?.();
  }
});

test("an unreadable store of accepted items opens the kitchen with none accepted, says so, and keeps the file", async (t) => {
  const { etat, ouvrir, dits } = preparer(t);
  writeFileSync(join(etat, "acceptes.json"), "{ not json");
  const cuisine = ouvrir();
  try {
    assert.equal(cuisine.acceptes, null);
    assert.match(dits.join("\n"), /éléments acceptés non lus/);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("cuisine-confiance.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
