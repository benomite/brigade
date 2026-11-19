// #3763 : sur le rail de l'app, la carte d'un ticket en file retenu par une attente — de son corps, de sa fiche, de l'arrêt
// d'un cook — dit `waits for #N — read from …`, la ligne même que `brigade <project> status` écrit
// (runtime/test/carte-attente/jamais-awaiting-none-retenu.test.ts), et n'ouvre que les tickets attendus ; une carte que rien
// ne retient n'en a aucune. Une attente sur une épique découpée se dit dans les tickets de son découpage, jamais le sien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../../runtime/src/attente-ticket/attente-ticket.ts";
import { MARQUEUR } from "../../../runtime/src/fiche.ts";
import { comprendre, rail, type Faits } from "../../src/faits.ts";
import { PRET } from "../../src/ligne-carte.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { attenteDuRailDe } from "../../src/vue/attente-du-rail/attente-du-rail.ts";

const DEPOT = "chef/cantine";
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const commentaire = (body: string) => ({ id: 1, author_association: "OWNER", created_at: "2026-11-17T09:30:00Z", body });
// La ligne et les liens de la carte d'un ticket sur le rail que l'app dessine.
const carte = (faits: Faits, numero: number) => {
  const dessine = rail(faits);
  const sienne = [...dessine.colonnes.flatMap(({ cartes }) => cartes), ...dessine.hors].find((une) => une.ticket === numero) ?? assert.fail(`pas de carte #${numero}`);
  return { ligne: sienne.ligne, ...(sienne.liens === undefined ? {} : { liens: sienne.liens }) };
};
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
  const faits = comprendre(JSON.stringify(lu.faits)) as Faits;
  assert.deepEqual(faits.lignesDesCartes, CARTES);
  assert.deepEqual(faits.attendusDesCartes, { 5: [4], 6: [4], 7: [4], 12: [10, 11] });
  for (const [n, liens] of [[5, [4]], [6, [4]], [7, [4]], [12, [10, 11]]] as const) assert.deepEqual(carte(faits, n), { ligne: CARTES[n], liens }, `#${n}`);
  assert.deepEqual(carte(faits, 9), { ligne: CARTES[9] });
  assert.deepEqual(carte(faits, 8), { ligne: PRET });
});

// Les liens d'une carte en file sont les tickets qu'elle attend, jamais un numéro de la phrase du corps qu'elle cite, même
// quand cette phrase dit elle-même `waits for #13 — read from …` : #13, hors du rail, ne la retient pas.
test("la carte n'ouvre que le ticket attendu, pas ceux de la phrase citée", async () => {
  const phrase = "Builds on #4; waits for #13 — read from the spec.";
  const sien: AppelGitHub = async (chemin, ...reste) =>
    chemin.includes("/issues?") ? ok([issue(4, ["fire", "taken"]), issue(5, ["fire"], phrase)]) : appeler(chemin, ...reste);
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: sien, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  const faits = comprendre(JSON.stringify(lu.faits)) as Faits;
  assert.deepEqual(carte(faits, 5), { ligne: `waits for #4 — read from the body: '${phrase}'`, liens: [4] });
});

// Ce que la lecture du rail pose dans `facts` : derrière un cook qui tourne, la carte retenue par sa fiche, sa ligne et ses
// attendus, et aucune `attenteDuRail` ; une file libre sans station, la raison seule, sans ligne ni attendu de carte.
test("les faits du rail : la carte retenue porte sa ligne et ses attendus, une file libre n'en porte aucun", () => {
  const maintenant = Date.parse("2026-11-17T10:00:00Z");
  const retenue = attenteDuRailDe(DEPOT, [
    { ticket: 4, etat: "taken", entreLe: null, depend: [] },
    { ticket: 6, etat: "queued", entreLe: null, depend: [4], attentes: [{ ticket: 4, source: "fiche" }], commentairesLus: true },
  ], { lues: [] }, maintenant);
  assert.deepEqual(retenue, { lignesDesCartes: { 6: "waits for #4 — read from the card" }, attendusDesCartes: { 6: [4] } });
  const libre = attenteDuRailDe(DEPOT, [{ ticket: 8, etat: "queued", entreLe: null, depend: [], attentes: [], commentairesLus: true }], { lues: [] }, maintenant);
  assert.deepEqual(Object.keys(libre), ["attenteDuRail"]);
  assert.equal(libre.attenteDuRail?.raison, "aucune-station");
});

// La porte de prise retient un ticket en file sur tout ticket ouvert qu'il attend, sur le rail ou non : sa carte le dit et
// l'ouvre. #1912, ouvert hors du rail, retient #5 par son corps et #6 par sa fiche ; #20, fermé, ne retient pas #7 ; #30,
// illisible, retient #8 par l'arrêt d'un cook, comme à la porte de prise. Chaque ticket hors du rail se lit une fois.
test("le rail de l'app : une attente sur un ticket ouvert hors du rail se dit sur la carte, une attente sur un ticket fermé non", async () => {
  const lues: string[] = [];
  const hors: AppelGitHub = async (chemin, ...reste) => {
    if (chemin.includes("/issues?")) return ok([issue(5, ["fire"], "Builds on #1912."), issue(6, ["fire"]), issue(7, ["fire"], "Builds on #20."), issue(8, ["fire"])]);
    const sien = /\/issues\/(\d+)\/comments/.exec(chemin);
    if (sien !== null) return ok({ 6: [commentaire([MARQUEUR, "- awaiting: #1912", "- zone: app/"].join("\n"))], 8: [commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #30 -->\nThe cook stopped.`)] }[Number(sien[1])] ?? []);
    const seule = /\/issues\/(\d+)$/.exec(chemin);
    if (seule === null) return appeler(chemin, ...reste);
    lues.push(chemin);
    return { 1912: ok({ state: "open", body: "" }), 20: ok({ state: "closed", body: "" }), 30: { status: 502, data: {} } }[Number(seule[1])] ?? { status: 404, data: {} };
  };
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: hors, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  const faits = comprendre(JSON.stringify(lu.faits)) as Faits;
  assert.deepEqual(carte(faits, 5), { ligne: "waits for #1912 — read from the body: 'Builds on #1912.'", liens: [1912] });
  assert.deepEqual(carte(faits, 6), { ligne: "waits for #1912 — read from the card", liens: [1912] });
  assert.deepEqual(carte(faits, 7), { ligne: PRET });
  assert.deepEqual(carte(faits, 8), { ligne: "waits for #30 — read from a cook's stop", liens: [30] });
  assert.equal(lues.filter((chemin) => chemin.endsWith("/1912")).length, 1);
});
