// La cuisine d'un projet de la station, ouverte sur un clone frais de son
// dépôt : la branche d'intégration, le calibrage du manager et du reviewer et
// le plafond de calibrage viennent de `.claude/brigade/projet.json`, sur la
// branche d'intégration — ni la ligne de la station ni le journal de la box
// n'ont à les porter, et ce qu'ils portent est ignoré.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { FAUX_CLAUDE, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const PROJET_JSON = {
  integrationBranch: "v2",
  defaultCalibrations: { manager: { model: "opus", effort: "high" }, reviewer: { model: "sonnet", effort: "low" } },
  calibrationCeiling: { model: "sonnet", effort: "high" },
};

// Une station neuve, sous `racine`, qui sert le projet `espace` par la ligne
// `ligne` ; le journal du projet ne porte que les décisions `decisions`. Rend
// ce que la cuisine a dit en s'ouvrant.
function ouvrir(t: TestContext, ligne: string, decisions: Record<string, string>) {
  const racine = repertoireTemporaire(t);
  // Le clone frais, là où la station range celui du projet ; sa branche par
  // défaut n'est pas sa branche d'intégration.
  projetSurGit(t, { reglages: PROJET_JSON, parDefaut: "main", autres: ["v2"], clone: join(racine, CLONES, "espace") });
  const [projet] = lireConfiguration(ligne).projets;
  assert.ok(projet);
  // Aucun test ne joint GitHub : ce `gh` n'existe pas, le tableau de la cuisine ne se publie nulle part.
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: join(racine, "gh-absent") });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "espace", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const dits: string[] = [];
  const cuisine = ouvrirCuisine(env, { dire: (dit) => void dits.push(dit) });
  cuisine.arreter("fin du test");
  return dits;
}

test("a fresh clone and a newly registered station: the project's branch, calibrations and ceiling, with nothing but the station entered on the box", (t) => {
  // La ligne ne nomme ni branche ni réglage ; le journal ne porte que la station.
  const dits = ouvrir(t, "espace acme/espace", { BRIGADE_STATIONS: "box/claude:2:code" });
  assert.ok(
    dits.includes("project settings — branch v2 (from .claude/brigade/projet.json); from .claude/brigade/projet.json on origin/v2, reread at each use: manager opus/high, reviewer sonnet/low, ceiling sonnet/high, closer box"),
    dits.join("\n"),
  );
});

test("the box's branch, calibrations and ceiling, when they differ from the repository's, are ignored", (t) => {
  const dits = ouvrir(t, "espace acme/espace main", {
    BRIGADE_STATIONS: "box/claude:2:code",
    BRIGADE_MANAGER_MODEL: "haiku",
    BRIGADE_MANAGER_EFFORT: "low",
    BRIGADE_REVIEWER_MODEL: "haiku",
    BRIGADE_REVIEWER_EFFORT: "low",
    BRIGADE_CEILING_MODEL: "opus",
    BRIGADE_CEILING_EFFORT: "max",
  });
  assert.ok(dits.some((dit) => dit.startsWith("project settings — branch v2 (from .claude/brigade/projet.json); ") && dit.endsWith("manager opus/high, reviewer sonnet/low, ceiling sonnet/high, closer box")), dits.join("\n"));
});

test("cuisine-reglages-du-depot.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
