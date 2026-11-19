// #3763, critère 2 : l'attente qui vient de la fiche et celle qui vient de l'arrêt d'un cook se montrent chacune avec leur source.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../src/attente-ticket/attente-ticket.ts";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { DEPOT } from "../outils.ts";

const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const commentaire = (body: string) => ({ body, created_at: "2026-11-17T09:30:00Z" });

async function ligneDe5(commentairesDe5: unknown[]): Promise<string> {
  const lire = async (chemin: string) => {
    if (chemin === FEUX) return [issue(4, ["fire", "taken"]), issue(5, ["fire"], "Restyle the screen.")];
    if (chemin.includes("/issues/5/comments")) return commentairesDe5;
    return chemin.includes("/events?") || chemin.includes("/comments") ? [] : assert.fail(`not dictated: ${chemin}`);
  };
  const lignes = await lignesDeLAttente({ depot: DEPOT, lire, stations: async () => ({ lues: [] }), maintenant: Date.parse("2026-11-17T10:00:00.000Z") });
  return lignes.find((l) => l.trimStart().startsWith("#5 ")) ?? "";
}

test("une attente posée par la ligne `attend` de la fiche dit que sa source est la fiche", async () => {
  const ligne = await ligneDe5([commentaire([MARQUEUR, "- attend : #4", "- zone : runtime/"].join("\n"))]);
  assert.match(ligne, /waits for #4 — read from the card/);
  assert.doesNotMatch(ligne, /read from the body/);
});

test("une attente posée par l'arrêt d'un cook dit que sa source est l'arrêt du cook", async () => {
  const ligne = await ligneDe5([commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #4 -->\nStation \`box\`: the cook stopped because this ticket builds on the unmerged work of #4.`)]);
  assert.match(ligne, /waits for #4 — read from a cook.s stop/);
  assert.doesNotMatch(ligne, /read from the (?:body|card)/);
});
