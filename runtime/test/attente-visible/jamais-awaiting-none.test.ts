// #3763, critère 3 : un ticket retenu par une attente, quelle qu'en soit la source, ne dit jamais `awaiting: none` .
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../src/attente-ticket/attente-ticket.ts";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { DEPOT } from "../outils.ts";

const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const commentaire = (body: string) => ({ body, created_at: "2026-11-17T09:30:00Z" });

async function lignes(corpsDe5: string, commentairesDe5: unknown[]): Promise<string[]> {
  const lire = async (chemin: string) => {
    if (chemin === FEUX) return [issue(4, ["fire", "taken"]), issue(5, ["fire"], corpsDe5), issue(6, ["fire"], "Independent work.")];
    if (chemin.includes("/issues/5/comments")) return commentairesDe5;
    return chemin.includes("/events?") || chemin.includes("/comments") ? [] : assert.fail(`not dictated: ${chemin}`);
  };
  return lignesDeLAttente({ depot: DEPOT, lire, stations: async () => ({ lues: [] }), maintenant: Date.parse("2026-11-17T10:00:00.000Z") });
}

const SOURCES: Array<[string, string, unknown[]]> = [
  ["le corps", "Depends on #4", []],
  ["la fiche", "Restyle the screen.", [commentaire([MARQUEUR, "- attend : #4"].join("\n"))]],
  ["l'arrêt d'un cook", "Restyle the screen.", [commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #4 -->\nThe cook stopped.`)]],
];

for (const [source, corps, commentaires] of SOURCES) {
  test(`retenu par ${source}, le ticket nomme son attente et ne dit jamais « awaiting: none »`, async () => {
    const dites = await lignes(corps, commentaires);
    const ligne = dites.find((l) => l.trimStart().startsWith("#5 ")) ?? "";
    assert.match(ligne, /waits for #4 — read from /);
    assert.doesNotMatch(dites.join("\n"), /awaiting: none/);
  });
}
