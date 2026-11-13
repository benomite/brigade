// La cuisine de la station pose l'interrupteur du projet comme le runtime d'un projet : à son ouverture,
// que ce soit au lancement de la station ou quand l'app ajoute le projet. Un interrupteur posé reste tel quel.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { managerAllume } from "../../src/projections/manager.ts";
import { etatDeLInterrupteur } from "../../src/projections/switch.ts";
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

// Ouvre la cuisine d'un projet dont le journal dit déjà `avant`, l'arrête, et rend l'interrupteur lu après.
function ouvrir(t: TestContext, avant: "on" | "off" | null) {
  const racine = repertoireTemporaire(t);
  const etat = join(racine, "etat");
  const clone = join(racine, "clone");
  mkdirSync(etat);
  mkdirSync(clone);
  git(clone, "init", "-q");
  const journal = ouvrirJournal(etat);
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  if (avant !== null) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: avant === "on" ? "project.switched-on" : "project.switched-off", payload: {} });
  journal.fermer();
  const dit: string[] = [];
  const cuisine = ouvrirCuisine(
    {
      HOME: racine,
      BRIGADE_STATE_DIR: etat,
      BRIGADE_PROJECT: "brigade",
      BRIGADE_GITHUB_REPO: "acme/brigade",
      BRIGADE_GH_BIN: join(racine, "gh-absent"),
      BRIGADE_REPO_DIR: clone,
      BRIGADE_BASE_BRANCH: "v2",
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      BRIGADE_SESSION_DIR: join(racine, ".session"),
    },
    { dire: (m: string) => void dit.push(m) },
  );
  cuisine.arreter("fin du test");
  const lu = ouvrirJournal(etat, { lectureSeule: true });
  try {
    return { etat: etatDeLInterrupteur(lu.base), manager: managerAllume(lu.base), dit };
  } finally {
    lu.fermer();
  }
}

test("la cuisine de la station sur un projet dont l'interrupteur n'est pas posé : il est allumé, et son manager qualifie", (t) => {
  const { etat, manager, dit } = ouvrir(t, null);
  assert.equal(etat?.on, true);
  assert.equal(manager, true);
  assert.ok(dit.some((m) => /allumé par défaut/.test(m)), dit.join(" | "));
});

test("la cuisine de la station laisse un interrupteur éteint explicitement éteint", (t) => {
  const { etat, manager } = ouvrir(t, "off");
  assert.equal(etat?.on, false);
  assert.equal(manager, false);
});

test("la cuisine de la station laisse un interrupteur allumé tel quel", (t) => {
  const { etat, dit } = ouvrir(t, "on");
  assert.equal(etat?.on, true);
  assert.ok(!dit.some((m) => /interrupteur du projet allumé/.test(m)), dit.join(" | "));
});

test("cuisine-interrupteur.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
