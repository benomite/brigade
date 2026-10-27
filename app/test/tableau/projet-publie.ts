// Un projet d'exemple et le tableau de la cuisine que sa box en publie (#1693) — bâti par le runtime lui-même, comme
// runtime/test/tableau/rendu/rail.test.ts : l'état d'exemple du bas de `status`, une carte de TODO posée sur #24 par-dessus.
// `propositions` : le tableau porte aussi, dans sa file, une correction et un profil proposés (#1741), que la box y
// publie comme sa publication les publie (runtime/src/tableau/publication/publier.ts).
// Avec lui, ce que la box rendait par `ssh` du même état, au même instant — `facts` et `status` —, pour comparer le rail
// que l'app en dessine. Et l'issue du tableau telle que l'API de GitHub la liste : GitHub est une doublure, aucun réseau.
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { entrerDansTodo } from "../../../runtime/src/carte-todo.ts";
import { cartesDeCorrection } from "../../../runtime/src/correctif/cartes.ts";
import { decrireEtat, faits, lireEtat } from "../../../runtime/src/etat.ts";
import { ouvrirJournal, type Journal } from "../../../runtime/src/journal.ts";
import { cartesDeProfil } from "../../../runtime/src/profils/cartes.ts";
import { tableauDeLaCuisine } from "../../../runtime/src/tableau/rendu/donnees.ts";
import { rendreLeTableau } from "../../../runtime/src/tableau/rendu/rendre.ts";
import { LU_LE } from "../../../runtime/test/aides/haut-de-status.ts";
import { copieDeLExempleDuBas } from "../../../runtime/test/aides/opt-A-etat.ts";
import { aArreter } from "../../../runtime/test/outils.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";

export const DEPOT = "acme/brigade";
export const NUMERO = 7;
export const GENERE_LE = new Date("2026-10-12T10:04:30.000Z");
export { LU_LE };

// Une correction et un profil proposés, au journal comme le runtime les écrit ; rend leurs numéros.
function proposer(journal: Journal): { correction: number; profil: number } {
  const correction = journal.ajouter({
    project: "brigade",
    ticket: null,
    author: "runtime",
    type: "correction.proposed",
    payload: {
      candidate: 1,
      cause: "criteres",
      title: "contradictory criteria or incomplete ticket",
      tickets: [11, 12, 13],
      run: "correctif-1-0000",
      tokens: 4321,
      reason: "The cooks guessed.",
      diff: ["--- a/CLAUDE.md", "+++ b/CLAUDE.md", "@@ -1,1 +1,2 @@", " # Project", "+- **Criteria**: an incomplete ticket is said in the report.", ""].join("\n"),
      files: ["CLAUDE.md"],
      base: "abc123",
    },
  });
  const profil = journal.ajouter({
    project: "brigade",
    ticket: null,
    author: "runtime",
    type: "profile.proposed",
    payload: {
      name: "app-src-vue",
      zone: "app/src/vue",
      tickets: [4, 7, 9, 11, 14],
      window: 20,
      zoneFirstTry: { first: 2, merged: 5 },
      projectFirstTry: { first: 15, merged: 20 },
      gap: 35,
      settings: { window: 20, minTickets: 5, gapPoints: 20 },
      skills: [],
      perimeter: ["app/src/vue"],
      notebook: [],
    },
    dedupKey: "profile.proposed:app/src/vue",
  });
  assert.ok(correction !== null && profil !== null);
  return { correction: correction.seq, profil: profil.seq };
}

export function projetPublie(t: TestContext, { propositions = false }: { propositions?: boolean } = {}) {
  const journal = ouvrirJournal(copieDeLExempleDuBas(t), { maintenant: () => new Date("2026-10-12T10:03:00.000Z") });
  // Fermé avant que son répertoire ne soit retiré : sous Windows, un journal encore ouvert ne se retire pas (EPERM).
  aArreter(t, () => journal.fermer());
  entrerDansTodo(journal, "brigade", 24, { type: "product", resume: "The ticket adds a saved list.", enonce: "One list per project, or one for all?", choix: [{ texte: "One per project." }, { texte: "One for all.", suite: "resume" }] }, "manager");
  const proposees = propositions ? proposer(journal) : null;
  const etat = lireEtat(journal, LU_LE);
  const file = proposees === null ? {} : { corrections: cartesDeCorrection(journal, DEPOT), profils: cartesDeProfil(journal, DEPOT) };
  const corps = rendreLeTableau(tableauDeLaCuisine(etat, LU_LE, { depot: DEPOT, ...file }), GENERE_LE);
  return {
    etat,
    proposees,
    corps,
    // Ce que la box rendait par `ssh`, du même état, au même instant.
    facts: JSON.stringify(faits(etat, LU_LE, DEPOT)),
    status: decrireEtat(etat, LU_LE).join("\n"),
    issue: { number: NUMERO, title: "Kitchen board", body: corps, html_url: `https://github.com/${DEPOT}/issues/${NUMERO}`, labels: [{ name: "kitchen-board" }] },
  };
}

// GitHub, doublé : la liste des issues au label du tableau — ce corps-là —, et chaque chemin demandé.
export function githubDuTableau(corps: string | ReponseGitHub) {
  const chemins: string[] = [];
  const appeler: AppelGitHub = async (chemin) => {
    chemins.push(chemin);
    assert.match(chemin, new RegExp(`^/repos/${DEPOT}/issues\\?labels=kitchen-board`), `seul le tableau est lu : ${chemin}`);
    return typeof corps === "string" ? { status: 200, data: [{ number: NUMERO, title: "Kitchen board", body: corps, html_url: `https://github.com/${DEPOT}/issues/${NUMERO}` }] } : corps;
  };
  return { appeler, chemins };
}
