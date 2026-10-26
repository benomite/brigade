// Les gestes de la vue du rail, écrits sur le tableau de la cuisine (app/src/tableau-gestes/rail.ts, #1694) : chaque
// geste que la vue a aujourd'hui et que la grammaire du tableau connaît (docs/tableau-gestes.md, #1584) part en
// commentaire sur l'issue du tableau — l'écriture même est vérifiée, adresse et corps. Ceux qu'elle ne connaît pas ne
// partent pas sur le tableau, et le disent. GitHub est une doublure : aucun réseau, aucune box.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reponseLue, type CarteLue } from "../../src/carte-todo.ts";
import { ACTIONS } from "../../src/gestes-fiche.ts";
import type { ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type TableauLu } from "../../src/tableau/lecture.ts";
import { clientDesGestesGitHub, type Poste } from "../../src/tableau-gestes/github.ts";
import { GESTES_DE_FICHE, gesteDeFiche, POSTE, reponseDeCarte, ticketsDuTableau } from "../../src/tableau-gestes/rail.ts";
import { DEPOT, githubDuTableau, NUMERO, projetPublie } from "../tableau/projet-publie.ts";

type Ecrit = { adresse: string; corps: unknown };
function github(reponse: ReponseGitHub | Error = { status: 201, data: { id: 9001, html_url: `https://github.com/${DEPOT}/issues/${NUMERO}#issuecomment-9001` } }) {
  const ecrits: Ecrit[] = [];
  const poster: Poste = async (adresse, _entetes, corps) => {
    ecrits.push({ adresse, corps });
    if (reponse instanceof Error) throw reponse;
    return reponse;
  };
  const client = clientDesGestesGitHub({ jeton: async () => "gho_du_poste", poster, appeler: async () => ({ status: 404, data: {} }) });
  return { client, ecrits };
}
const COMMENTAIRES = `https://api.github.com/repos/${DEPOT}/issues/${NUMERO}/comments`;

async function tableau(t: Parameters<typeof projetPublie>[0]): Promise<TableauLu> {
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: githubDuTableau(projetPublie(t).corps).appeler });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  return lu;
}
const carteDe = (lu: TableauLu, ticket: number): CarteLue => {
  const attendu = (lu.faits?.attend as { ticket: number; carte?: CarteLue }[] | undefined)?.find((a) => a.ticket === ticket);
  return attendu?.carte ?? assert.fail(`no card for #${ticket}`);
};

test("« merge the PR » sur la fiche : `/brigade merge #<n>` est écrit sur l'issue du tableau", async (t) => {
  const lu = await tableau(t);
  const { client, ecrits } = github();
  const rendu = await gesteDeFiche(lu, "merger", 18, client);
  assert.deepEqual(rendu, { fait: POSTE, detail: `https://github.com/${DEPOT}/issues/${NUMERO}#issuecomment-9001` });
  assert.deepEqual(ecrits, [{ adresse: COMMENTAIRES, corps: { body: "/brigade merge #18" } }]);
});

test("« remove from the rail » sur la fiche : `/brigade set-aside #<n>` est écrit — un ticket du rail, même hors de la file du chef", async (t) => {
  const lu = await tableau(t);
  assert.ok(!lu.file.some(({ ticket }) => ticket === 30), "#30 n'attend pas le chef");
  const { client, ecrits } = github();
  const rendu = await gesteDeFiche(lu, "retirer", 30, client);
  assert.ok("fait" in rendu && rendu.fait === POSTE);
  assert.deepEqual(ecrits, [{ adresse: COMMENTAIRES, corps: { body: "/brigade set-aside #30" } }]);
});

test("un choix sur la carte de TODO : `/brigade choose #<n> <rang>` est écrit", async (t) => {
  const lu = await tableau(t);
  const carte = carteDe(lu, 24);
  const lue = reponseLue(carte, 24, { question: carte.question, choix: 2 });
  assert.ok(!("refus" in lue));
  const { client, ecrits } = github();
  assert.deepEqual(await reponseDeCarte(lu, lue, client), { repondue: true, dit: POSTE });
  assert.deepEqual(ecrits, [{ adresse: COMMENTAIRES, corps: { body: "/brigade choose #24 2" } }]);
});

test("un texte sur la carte de TODO : `/brigade answer #<n> <texte>` est écrit, ses lignes comprises", async (t) => {
  const lu = await tableau(t);
  const carte = carteDe(lu, 24);
  const lue = reponseLue(carte, 24, { question: carte.question, texte: "  Neither: one per station,\r\nthen one for all.  " });
  assert.ok(!("refus" in lue));
  const { client, ecrits } = github();
  assert.deepEqual(await reponseDeCarte(lu, lue, client), { repondue: true, dit: POSTE });
  assert.deepEqual(ecrits, [{ adresse: COMMENTAIRES, corps: { body: "/brigade answer #24 Neither: one per station,\nthen one for all." } }]);
});

test("chaque geste que la vue du rail a aujourd'hui : écrit sur le tableau s'il est de sa grammaire, sinon dit hors du tableau et rien n'y part", async (t) => {
  const lu = await tableau(t);
  // Les gestes de la fiche qui partaient vers la box (gestes-fiche.ts, `ACTIONS`) : ceux que la grammaire connaît
  // sont sur le tableau ; changer la priorité et renvoyer en cuisine un ticket revenu de WAITING n'y ont pas de mot.
  const versLaBox = Object.entries(ACTIONS).flatMap(([id, branchement]) => ("box" in branchement ? [id] : []));
  assert.deepEqual(versLaBox.sort(), ["cuisine", "merger", "priorite", "retirer"]);
  assert.deepEqual(Object.keys(GESTES_DE_FICHE).sort(), ["merger", "retirer"]);
  const { client, ecrits } = github();
  for (const id of ["cuisine", "priorite", "issue", "second", "inconnu"]) assert.deepEqual(await gesteDeFiche(lu, id, 35, client), { horsDuTableau: true }, id);
  assert.deepEqual(ecrits, []);
});

test("rien n'est écrit sans tableau lu, ni pour un ticket que le dernier tableau lu ne porte pas, ni pour une action qui ne nomme aucun ticket", async (t) => {
  const lu = await tableau(t);
  const { client, ecrits } = github();
  assert.deepEqual(await gesteDeFiche(undefined, "merger", 18, client), { refus: "nothing was posted: the Kitchen board of this project has not been read yet — read it again", detail: "" });
  assert.deepEqual(await gesteDeFiche(lu, "merger", 999, client), { refus: "nothing was posted: #999 is not on the latest Kitchen board read — read it again", detail: "" });
  assert.deepEqual(await gesteDeFiche(lu, "retirer", "30", client), { refus: "nothing was posted: the action names no ticket", detail: "" });
  assert.deepEqual(await reponseDeCarte(lu, { ticket: 999, choix: 1 }, client), { refus: "nothing was posted: #999 is not on the latest Kitchen board read — read it again", detail: "" });
  assert.deepEqual(ecrits, []);
  // Les tickets que le tableau porte : son rail, sa file, ce qui attend le chef.
  const tickets = ticketsDuTableau(lu);
  for (const ticket of [18, 19, 24, 30, 31, 35, 41]) assert.ok(tickets.has(ticket), `#${ticket}`);
});

test("GitHub qui refuse ou ne répond pas : le geste dit pourquoi en une phrase, la carte reste", async (t) => {
  const lu = await tableau(t);
  const refuse = await gesteDeFiche(lu, "merger", 18, github({ status: 403, data: { message: "Resource not accessible by integration." } }).client);
  assert.deepEqual(refuse, { refus: `The gesture could not be posted on the Kitchen board of ${DEPOT}: GitHub refused the comment (HTTP 403): Resource not accessible by integration.`, detail: "" });
  const muet = await reponseDeCarte(lu, { ticket: 24, choix: 1 }, github(new Error("getaddrinfo ENOTFOUND api.github.com")).client);
  assert.deepEqual(muet, { refus: `The gesture could not be posted on the Kitchen board of ${DEPOT}: getaddrinfo ENOTFOUND api.github.com.`, detail: "" });
});

test("la réponse d'une carte est lue avant de partir : une carte inconnue, une question changée, un choix hors rang ou un texte vide ne partent pas", async (t) => {
  const lu = await tableau(t);
  const carte = carteDe(lu, 24);
  assert.ok("refus" in reponseLue(undefined, 24, { question: carte.question, choix: 1 }));
  assert.ok("refus" in reponseLue(carte, 24, { question: "Another question?", choix: 1 }));
  assert.match((reponseLue(carte, 24, { question: carte.question, choix: 3 }) as { refus: string }).refus, /choices 1 to 2/);
  assert.ok("refus" in reponseLue(carte, 24, { question: carte.question, texte: "   " }));
});
