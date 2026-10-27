// La cuisine d'un projet sur le Mac du chef : elle ne s'ouvre que si le bac à
// sable de Claude Code y est utilisable, et dit alors que chaque `claude` y
// part. Hors de macOS, elle n'est pas locale, et rien ne change. La machine
// est simulée.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { SEATBELT, type Sondes } from "../../src/bac-a-sable/detection.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { FAUX_CLAUDE, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const DECIDE = {
  BRIGADE_STATIONS: "mac/claude:2:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

const MAC: Sondes = { plateforme: "darwin", existe: (chemin) => chemin === SEATBELT, versionDeClaude: () => "2.1.300 (Claude Code)\n" };

// Ouvre la cuisine d'un projet sur cette machine simulée ; rend ce qu'elle a
// dit, ou l'erreur qui l'a refusée.
function ouvrir(t: TestContext, sondes: Sondes) {
  const racine = repertoireTemporaire(t);
  const etat = join(racine, "etat");
  const clone = join(racine, "clone");
  const session = join(racine, ".session");
  mkdirSync(clone);
  mkdirSync(session);
  git(clone, "init", "-q");
  mkdirSync(etat);
  const journal = ouvrirJournal(etat);
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const dits: string[] = [];
  try {
    const cuisine = ouvrirCuisine(
      {
        // Le compte d'un Mac, hors du répertoire temporaire : les jugements du
        // manager y écrivent, et un cook n'écrit jamais au-dessus du compte.
        HOME: "/Users/chef",
        BRIGADE_STATE_DIR: etat,
        BRIGADE_PROJECT: "brigade",
        BRIGADE_GITHUB_REPO: "acme/brigade",
        // Aucun test ne joint GitHub : ce `gh` n'existe pas, le tableau de la cuisine ne se publie nulle part.
        BRIGADE_GH_BIN: join(racine, "gh-absent"),
        BRIGADE_REPO_DIR: clone,
        BRIGADE_BASE_BRANCH: "v2",
        BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
        BRIGADE_SESSION_DIR: session,
        BRIGADE_SANDBOX_CACHES: join(racine, "caches"),
      },
      { dire: (ligne) => void dits.push(ligne), sondes },
    );
    cuisine.arreter("fin du test");
    return { dits, erreur: null, etat };
  } catch (erreur) {
    return { dits, erreur, etat };
  }
}

test("sur un Mac qui a le bac à sable, la cuisine s'ouvre et dit que chaque `claude` y part", { skip: posixOnly("simulates a Mac whose station lives in the real temporary directory: the Seatbelt profile takes POSIX absolute paths only, and on Windows that directory is C:\\… (refused on the job)") }, (t) => {
  const { dits, erreur } = ouvrir(t, MAC);
  assert.equal(erreur, null);
  const ligne = dits.find((dit) => dit.startsWith("bac à sable — "));
  assert.match(ligne ?? "", /chaque `claude` de la cuisine \(cook, closer, reviewer, manager\) part dans celui de Claude Code \(claude 2\.1\.300\)/);
  assert.match(ligne ?? "", /ne lit ni ~\/\.ssh ni les identifiants du chef/);
});

test("sur un Mac sans bac à sable, la cuisine refuse de s'ouvrir — aucun cook n'y part à nu —, et la raison nomme ce qui manque", (t) => {
  const { erreur, etat } = ouvrir(t, { ...MAC, existe: () => false });
  assert.ok(erreur instanceof ConfigInvalide);
  assert.match(erreur.message, /^sur ce Mac, chaque cook part dans le bac à sable, et il n'est pas utilisable — Seatbelt est introuvable/);
  // Refusée avant de rien ouvrir : le verrou du projet n'est pas pris.
  assert.equal(existsSync(join(etat, "lock.db")), false);
});

test("hors de macOS, la cuisine n'est pas locale : elle s'ouvre comme avant, sans bac à sable", (t) => {
  const { dits, erreur } = ouvrir(t, { ...MAC, plateforme: "linux" });
  assert.equal(erreur, null);
  assert.equal(
    dits.some((dit) => dit.startsWith("bac à sable")),
    false,
  );
});

test("cuisine-bac-a-sable.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
