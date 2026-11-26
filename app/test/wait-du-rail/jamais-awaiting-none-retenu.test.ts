// #3763 : sur le rail de l'app, la carte d'un ticket en file retenu par une attente — de son corps, de sa fiche, de l'arrêt
// d'un cook — dit `waits for #N — read from …`, la ligne même que `brigade <project> status` écrit
// (runtime/test/carte-attente/jamais-awaiting-none-retenu.test.ts), et n'ouvre que les tickets attendus ; une carte que rien
// ne retient n'en a aucune. Une attente sur une épique découpée se dit dans les tickets de son découpage, jamais le sien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../../runtime/src/attente-ticket/attente-ticket.ts";
import { MARQUEUR } from "../../../runtime/src/fiche.ts";
import { comprendre, rail, type Facts } from "../../src/facts.ts";
import { PRET } from "../../src/line-card.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuRepository } from "../../src/tableau/read.ts";
import { waitDuRailDe } from "../../src/vue/wait-du-rail/wait-du-rail.ts";

const REPOSITORY = "chef/cantine";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const comment = (body: string) => ({ id: 1, author_association: "OWNER", created_at: "2026-11-17T09:30:00Z", body });
// La ligne et les liens de la carte d'un ticket sur le rail que l'app dessine.
const card = (facts: Facts, numero: number) => {
  const dessine = rail(facts);
  const sienne = [...dessine.colonnes.flatMap(({ cartes: cards }) => cards), ...dessine.hors].find((une) => une.ticket === numero) ?? assert.fail(`pas de carte #${numero}`);
  return { ligne: sienne.ligne, ...(sienne.liens === undefined ? {} : { liens: sienne.liens }) };
};
const EPIC = "Split.\n\n<!-- brigade:tickets -->\n| #10 | A | open |\n| #11 | B | open |\n| #12 | C | open |\n<!-- /brigade:tickets -->";

// #4 tenu par un cook ; #5 l'attend par son corps, #6 par sa fiche, #7 par l'arrêt d'un cook ; #8 libre ; #9 aux
// commentaires illisibles ; #12 attend l'épique #3, découpée en #10 (tenu), #11 et #12 lui-même, qui ne s'attend pas.
const COMMENTAIRES: Record<number, unknown[]> = {
  6: [comment([MARQUEUR, "- awaiting: #4", "- zone: app/"].join("\n"))],
  7: [comment(`${MARQUE_D_ATTENTE_DE_TICKET} #4 -->\nThe cook stopped.`)],
};
const appeler: CallGitHub = async (chemin) => {
  if (chemin.includes("/issues?")) {
    return ok([issue(3, ["fire"], EPIC), issue(4, ["fire", "taken"]), issue(5, ["fire"], "Depends on #4."), issue(6, ["fire"]), issue(7, ["fire"]), issue(8, ["fire"]), issue(9, ["fire"]), issue(10, ["fire", "taken"]), issue(11, ["fire"]), issue(12, ["fire"], "Depends on #3.")]);
  }
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/9/comments")) return { status: 502, data: {} };
  const sien = /\/issues\/(\d+)\/comments/.exec(chemin);
  if (sien !== null) return ok(COMMENTAIRES[Number(sien[1])] ?? []);
  if (/\/issues\/\d+\/events/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};
const CARDS: Record<number, string> = {
  5: "after #4 — waiting for its merge; waits for #4 — read from the body: 'Depends on #4.'",
  6: "after #4 — waiting for its merge; waits for #4 — read from the card",
  7: "after #4 — waiting for its merge; waits for #4 — read from a cook's stop",
  9: "its card and its cooks' stops could not be read on GitHub",
  12: "after #10, #11 — waiting for their merge; waits for #10 — read from the body: 'Depends on #3.'; waits for #11 — read from the body: 'Depends on #3.'",
};

test("le rail de l'app : chaque carte retenue dit son attente et sa source, aucune ligne sur une carte libre, et ses liens sont les tickets attendus", async () => {
  const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  const facts = comprendre(JSON.stringify(lu.faits)) as Facts;
  assert.deepEqual(facts.lignesDesCartes, CARDS);
  assert.deepEqual(facts.attendusDesCartes, { 5: [4], 6: [4], 7: [4], 12: [10, 11] });
  for (const [n, liens] of [[5, [4]], [6, [4]], [7, [4]], [12, [10, 11]]] as const) assert.deepEqual(card(facts, n), { ligne: CARDS[n], liens }, `#${n}`);
  assert.deepEqual(card(facts, 9), { ligne: CARDS[9] });
  assert.deepEqual(card(facts, 8), { ligne: PRET });
});

// Les liens d'une carte en file sont les tickets qu'elle attend, jamais un numéro de la phrase du corps qu'elle cite, même
// quand cette phrase dit elle-même `waits for #13 — read from …` : #13, hors du rail, ne la retient pas.
test("la carte n'ouvre que le ticket attendu, pas ceux de la phrase citée", async () => {
  const phrase = "Depends on #4; waits for #13 — read from the spec.";
  const sien: CallGitHub = async (chemin, ...reste) =>
    chemin.includes("/issues?") ? ok([issue(4, ["fire", "taken"]), issue(5, ["fire"], phrase)]) : appeler(chemin, ...reste);
  const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler: sien, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  const facts = comprendre(JSON.stringify(lu.faits)) as Facts;
  assert.deepEqual(card(facts, 5), { ligne: `after #4 — waiting for its merge; waits for #4 — read from the body: '${phrase}'`, liens: [4] });
});

// Ce que la lecture du rail pose dans `facts` : derrière un cook qui tourne, la carte retenue par sa fiche, sa ligne et ses
// attendus, et aucune `attenteDuRail` ; une file libre sans station, la raison seule, sans ligne ni attendu de carte.
test("les faits du rail : la carte retenue porte sa ligne et ses attendus, une file libre n'en porte aucun", () => {
  const maintenant = Date.parse("2026-11-17T10:00:00Z");
  const retenue = waitDuRailDe(REPOSITORY, [
    { ticket: 4, etat: "taken", entreLe: null, depend: [] },
    { ticket: 6, etat: "queued", entreLe: null, depend: [4], attentes: [{ ticket: 4, source: "fiche" }], commentairesLus: true },
  ], { lues: [] }, maintenant);
  assert.deepEqual(retenue, { lignesDesCartes: { 6: "waits for #4 — read from the card" }, attendusDesCartes: { 6: [4] } });
  const free = waitDuRailDe(REPOSITORY, [{ ticket: 8, etat: "queued", entreLe: null, depend: [], attentes: [], commentairesLus: true }], { lues: [] }, maintenant);
  assert.deepEqual(Object.keys(free), ["attenteDuRail"]);
  assert.equal(free.attenteDuRail?.raison, "aucune-station");
});

// Les trois sources sur le rail de l'app, vers un ticket du rail (#4, qu'un cook tient) : chaque carte dit son attente et ouvre
// #4. Une attente sur #1912, ouvert mais hors du rail, ne se dit pas — le choix du chef sur #3810, comme `ligneDeLaCarte` —,
// et aucun ticket hors du rail n'est lu sur GitHub : la carte retombe sur « prête ». Un corps qui nomme son propre ticket
// et #4 n'attend que #4.
test("le rail de l'app : chaque source dit son attente d'un ticket du rail, une attente hors du rail ne se dit pas et ne se lit pas", async () => {
  const lues: string[] = [];
  const sien: CallGitHub = async (chemin, ...reste) => {
    if (chemin.includes("/issues?")) return ok([issue(4, ["fire", "taken"]), issue(5, ["fire"], "Depends on #4."), issue(6, ["fire"]), issue(7, ["fire"], "Depends on #1912."), issue(8, ["fire"]), issue(9, ["fire"], "Depends on #9\nDepends on #4")]);
    const comm = /\/issues\/(\d+)\/comments/.exec(chemin);
    if (comm !== null) return ok({ 6: [comment([MARQUEUR, "- awaiting: #1912", "- zone: app/"].join("\n"))], 8: [comment(`${MARQUE_D_ATTENTE_DE_TICKET} #4 -->\nThe cook stopped.`)] }[Number(comm[1])] ?? []);
    if (/\/issues\/\d+$/.test(chemin)) lues.push(chemin);
    return appeler(chemin, ...reste);
  };
  const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler: sien, maintenant: () => new Date("2026-11-17T10:00:00Z") });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  const facts = comprendre(JSON.stringify(lu.faits)) as Facts;
  assert.deepEqual(card(facts, 5), { ligne: "after #4 — waiting for its merge; waits for #4 — read from the body: 'Depends on #4.'", liens: [4] });
  assert.deepEqual(card(facts, 6), { ligne: PRET });
  assert.deepEqual(card(facts, 7), { ligne: PRET });
  assert.deepEqual(card(facts, 8), { ligne: "after #4 — waiting for its merge; waits for #4 — read from a cook's stop", liens: [4] });
  assert.match(card(facts, 9).ligne ?? "", /^after #4 — waiting for its merge; waits for #4 — read from the body: 'Depends on #4'$/);
  assert.deepEqual(card(facts, 9).liens, [4]);
  assert.deepEqual(lues, []);
});
