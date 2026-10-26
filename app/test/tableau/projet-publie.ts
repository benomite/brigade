// Un projet d'exemple et le tableau de la cuisine que sa box en publie (#1693) — bâti par le runtime lui-même, comme
// runtime/test/tableau/rendu/rail.test.ts : l'état d'exemple du bas de `status`, une carte de TODO posée sur #24 par-dessus.
// Avec lui, ce que la box rendait par `ssh` du même état, au même instant — `facts` et `status` —, pour comparer le rail
// que l'app en dessine. Et l'issue du tableau telle que l'API de GitHub la liste : GitHub est une doublure, aucun réseau.
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { entrerDansTodo } from "../../../runtime/src/carte-todo.ts";
import { decrireEtat, faits, lireEtat } from "../../../runtime/src/etat.ts";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import { tableauDeLaCuisine } from "../../../runtime/src/tableau/rendu/donnees.ts";
import { rendreLeTableau } from "../../../runtime/src/tableau/rendu/rendre.ts";
import { LU_LE } from "../../../runtime/test/aides/haut-de-status.ts";
import { copieDeLExempleDuBas } from "../../../runtime/test/aides/opt-A-etat.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";

export const DEPOT = "acme/brigade";
export const NUMERO = 7;
export const GENERE_LE = new Date("2026-10-12T10:04:30.000Z");
export { LU_LE };

export function projetPublie(t: TestContext) {
  const journal = ouvrirJournal(copieDeLExempleDuBas(t), { maintenant: () => new Date("2026-10-12T10:03:00.000Z") });
  t.after(() => journal.fermer());
  entrerDansTodo(journal, "brigade", 24, { type: "product", enonce: "One list per project, or one for all?", choix: [{ texte: "One per project." }, { texte: "One for all.", suite: "resume" }] }, "manager");
  const etat = lireEtat(journal, LU_LE);
  const corps = rendreLeTableau(tableauDeLaCuisine(etat, LU_LE, { depot: DEPOT }), GENERE_LE);
  return {
    etat,
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
