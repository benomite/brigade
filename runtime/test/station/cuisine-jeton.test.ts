// La cuisine d'un projet de la station, sous un jeton longue durée : le
// renouvellement de session n'y est pas suivi, et la date du jeton y est écrite.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ecrireSecret } from "../../src/droits.ts";
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

// Ouvre la cuisine d'un projet, avec ou sans jeton, sur un fichier d'état du
// renouvellement qui annonce une connexion perdue, et rend les faits écrits.
function ouvrir(t: TestContext, avecJeton: boolean) {
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
  const jeton = join(racine, "claude-token");
  // Lisible du seul compte, sur toutes les plateformes : sous Windows, fermé par son ACL.
  ecrireSecret(jeton, "x".repeat(60));
  writeFileSync(`${jeton}.cree`, "2026-10-01\n");
  const cuisine = ouvrirCuisine(
    {
      HOME: racine,
      BRIGADE_STATE_DIR: etat,
      BRIGADE_PROJECT: "brigade",
      BRIGADE_GITHUB_REPO: "acme/brigade",
      // Aucun test ne joint GitHub : ce `gh` n'existe pas, le tableau de la cuisine ne se publie nulle part.
      BRIGADE_GH_BIN: join(racine, "gh-absent"),
      BRIGADE_REPO_DIR: clone,
      BRIGADE_BASE_BRANCH: "v2",
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      BRIGADE_SESSION_DIR: session,
      ...(avecJeton ? { BRIGADE_CLAUDE_TOKEN_FILE: jeton } : {}),
    },
    { dire: () => {} },
  );
  cuisine.arreter("fin du test");
  const lu = ouvrirJournal(etat, { lectureSeule: true });
  try {
    return lu.tout().map((e) => e.type);
  } finally {
    lu.fermer();
  }
}

test("la cuisine de la station sous un jeton : la date du jeton est écrite, le renouvellement n'est ni lu ni écrit", (t) => {
  const types = ouvrir(t, true);
  assert.ok(types.includes("token.observed"), types.join(", "));
  assert.ok(!types.includes("session.observed"), types.join(", "));
  assert.ok(!types.includes("session.restored"), types.join(", "));
});

test("la cuisine de la station sans jeton : le renouvellement est lu comme avant", (t) => {
  const types = ouvrir(t, false);
  assert.ok(types.includes("session.observed"), types.join(", "));
  assert.ok(!types.includes("token.observed"), types.join(", "));
});

test("cuisine-jeton.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
