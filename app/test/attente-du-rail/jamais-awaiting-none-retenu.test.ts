// #3763 : sur le rail de l'app, la carte d'un ticket en file retenu par une attente — de son corps, de sa fiche, de l'arrêt
// d'un cook — dit `waits for #N — read from …`, la ligne même que `brigade <project> status` écrit
// (runtime/test/carte-attente/jamais-awaiting-none-retenu.test.ts), et n'ouvre que les tickets attendus ; une carte que rien
// ne retient n'en a aucune. Une attente sur une épique découpée se dit dans les tickets de son découpage, jamais le sien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../../runtime/src/carte-attente/carte-attente.ts";
import { MARQUEUR } from "../../../runtime/src/fiche.ts";
import { ligneEnAttente } from "../../src/ligne-carte.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";

const DEPOT = "chef/cantine";
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const commentaire = (body: string) => ({ id: 1, author_association: "OWNER", created_at: "2026-11-17T09:30:00Z", body });
const EPIQUE = "Split.\n\n<!-- brigade:tickets -->\n| #10 | A | open |\n| #11 | B | open |\n| #12 | C | open |\n<!-- /brigade:tickets -->";

// #4 tenu par un cook ; #5 l'attend par son corps, #6 par sa fiche, #7 par l'arrêt d'un cook ; #8 libre ; #9 aux
// commentaires illisibles ; #12 attend l'épique #3, découpée en #10 (tenu), #11 et #12 lui-même, qui ne s'attend pas.
const COMMENTAIRES: Record<number, unknown[]> = {
  6: [commentaire([MARQUEUR, "- awaiting: #4", "- zone: app/"].join("\n"))],
  7: [commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #4 -->\nThe cook stopped.`)],
};
const appeler: AppelGitHub = async (chemin) => {
  if (chemin.includes("/issues?")) {
    return ok([issue(3, ["fire"], EPIQUE), issue(4, ["fire", "taken"]), issue(5, ["fire"], "Builds on #4."), issue(6, ["fire"]), issue(7, ["fire"]), issue(8, ["fire"]), issue(9, ["fire"]), issue(10, ["fire", "taken"]), issue(11, ["fire"]), issue(12, ["fire"], "Builds on #3.")]);
  }
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/9/comments")) return { status: 502, data: {} };
  const sien = /\/issues\/(\d+)\/comments/.exec(chemin);
  if (sien !== null) return ok(COMMENTAIRES[Number(sien[1])] ?? []);
  if (/\/issues\/\d+\/events/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};
const CARTES: Record<number, string> = {
  5: "waits for #4 — read from the body: 'Builds on #4.'",
  6: "waits for #4 — read from the card",
  7: "waits for #4 — read from a cook's stop",
  9: "its card and its cooks' stops could not be read on GitHub",
  12: "waits for #10 — read from the body: 'Builds on #3.'; waits for #11 — read from the body: 'Builds on #3.'",
};

test("le rail de l'app : chaque carte retenue dit son attente et sa source, aucune ligne sur une carte libre, et ses liens sont les tickets attendus", async () => {
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  const lignes = lu.faits.lignesDesCartes ?? {};
  assert.deepEqual(lignes, CARTES);
  for (const [n, liens] of [[5, [4]], [6, [4]], [7, [4]], [12, [10, 11]]] as const) {
    assert.deepEqual(ligneEnAttente("en attente", undefined, lignes[n]), { ligne: CARTES[n], liens });
  }
});

// Les liens d'une carte en file sont les tickets qu'elle attend, jamais un numéro de la phrase du corps qu'elle cite.
test("la carte n'ouvre que le ticket attendu, pas ceux de la phrase citée", () => {
  const ligne = "waits for #1912 — read from the body: 'Builds on #1908'; waits for #4 — read from the card";
  assert.deepEqual(ligneEnAttente("en attente", undefined, ligne), { ligne, liens: [1912, 4] });
});
