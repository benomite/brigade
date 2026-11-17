// La carte d'un ticket en file sur le rail de l'app dit chaque attente que la cuisine lui applique, et d'où elle la lit
// (ticket 3763) : son corps et la phrase, sa fiche, l'arrêt d'un cook — la ligne même que `brigade <project> status` écrit.
// Des commentaires qui ne se lisent pas ne la disent jamais libre ; une carte que rien ne retient n'a pas de ligne.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../../runtime/src/carte-attente/carte-attente.ts";
import { MARQUEUR } from "../../../runtime/src/fiche.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { ligneEnAttente } from "../../src/ligne-carte.ts";

const DEPOT = "chef/cantine";
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const commentaire = (body: string) => ({ id: 1, author_association: "OWNER", created_at: "2026-11-17T09:30:00Z", body });

test("le rail de l'app : chaque carte en file dit son attente et sa source, et rien pour une carte libre", async () => {
  const commentaires: Record<number, unknown[]> = {
    6: [commentaire([MARQUEUR, "- awaiting: #4", "- zone: app/"].join("\n"))],
    7: [commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #4 -->\nThe cook stopped.`)],
  };
  const appeler: AppelGitHub = async (chemin) => {
    if (chemin.includes("/issues?")) return ok([issue(4, ["fire", "taken"]), issue(5, ["fire"], "Builds on #4."), issue(6, ["fire"]), issue(7, ["fire"]), issue(8, ["fire"]), issue(9, ["fire"])]);
    if (chemin.includes("/pulls?")) return ok([]);
    if (chemin.includes("/issues/9/comments")) return { status: 502, data: {} };
    const sien = /\/issues\/(\d+)\/comments/.exec(chemin);
    if (sien !== null) return ok(commentaires[Number(sien[1])] ?? []);
    if (/\/issues\/\d+\/events/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  assert.deepEqual(lu.faits.lignesDesCartes, {
    5: "waits for #4 — read from the body: 'Builds on #4.'",
    6: "waits for #4 — read from the card",
    7: "waits for #4 — read from a cook's stop",
    9: "its card and its cooks' stops could not be read on GitHub",
  });
});

// Un ticket attendu découpé est attendu dans les tickets de son découpage, comme la porte de prise l'attend : la carte nomme
// chacun d'eux, avec la phrase du corps d'où l'attente est lue — jamais l'épique, qui n'est pas sur le rail.
test("le rail de l'app : une attente du corps sur une épique découpée se dit sur chacun de ses tickets", async () => {
  const epique = "Split.\n\n<!-- brigade:tickets -->\n| #10 | A | open |\n| #11 | B | open |\n<!-- /brigade:tickets -->";
  const appeler: AppelGitHub = async (chemin) => {
    if (chemin.includes("/issues?")) return ok([issue(3, ["fire"], epique), issue(10, ["fire", "taken"]), issue(11, ["fire"]), issue(5, ["fire"], "Builds on #3.")]);
    if (chemin.includes("/pulls?")) return ok([]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  assert.deepEqual(lu.faits.lignesDesCartes, { 5: "waits for #10 — read from the body: 'Builds on #3.'; waits for #11 — read from the body: 'Builds on #3.'" });
});

// Les liens d'une carte en file sont les tickets qu'elle attend, jamais un numéro de la phrase du corps qu'elle cite.
test("la carte n'ouvre que le ticket attendu, pas ceux de la phrase citée", () => {
  const ligne = "waits for #1912 — read from the body: 'Builds on #1908'; waits for #4 — read from the card";
  assert.deepEqual(ligneEnAttente("en attente", undefined, ligne), { ligne, liens: [1912, 4] });
});
