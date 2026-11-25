// La station arrête elle-même la boucle de relances d'un ticket (#4041) : ses essais épuisés, il est parqué pour le
// superviseur (#4129), sa raison écrite, sa date dans sept jours. Il reprend seul où il était à sa date, ou dès que
// `parked` lui est retiré — le geste du chef ou du superviseur qui le relance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue, corpsDuParking } from "../../src/attente-github/attente-github.ts";
import { reprendALaDate } from "../../src/attente-github/marque.ts";
import { LABEL_PARKED } from "../../src/github-etat/etats.ts";
import { ECHECS_ATTEINTS } from "../../src/github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const MAINTENANT = new Date("2026-11-23T10:00:00Z");
const SEPT_JOURS_MS = 7 * 24 * 3_600_000;

async function tourner(faux: FauxGitHub, avertis: string[] = []) {
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: (texte) => void avertis.push(texte), maintenant: () => MAINTENANT, cuisiner: async () => ({ echec: "the gates failed on the import job" }) });
  for (let i = 0; i < 8; i++) {
    await a.tour();
    await a.calme();
  }
}

test("a ticket whose tries are spent waits on the supervisor, its reason written, until the supervisor answers — no date resumes it (#3911)", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  await tourner(faux);
  const ticket = faux.ticket(894);
  // Parqué par ses échecs (#4129) : `parked`, plus `set-aside:failures` ; sa marque dit qu'il attend le superviseur.
  assert.ok(ticket.labels.has(LABEL_PARKED), "the supervisor gets its dossier");
  assert.equal(ticket.labels.has(ECHECS_ATTEINTS), false, [...ticket.labels].join(", "));
  const attente = attenteDeLIssue((faux.commentaires.get(894) ?? []).map(({ body, association }) => ({ body, association })));
  assert.ok(attente !== null, "the parked mark is on the ticket");
  assert.equal(attente.who, "the supervisor");
  assert.equal(attente.failures, true);
  assert.match(attente.what, /the station stopped relaunching it[\s\S]*The reason: the gates failed on the import job/);
  assert.equal(attente.followUp, new Date(MAINTENANT.getTime() + SEPT_JOURS_MS).toISOString());
  assert.equal(attente.fact, "the supervisor answers");
  assert.equal(reprendALaDate(attente, new Date(attente.followUp)), false, "no timer puts it back on the rail: the supervisor answers (#3911)");
  assert.ok((faux.commentaires.get(894) ?? []).some(({ body }) => body.includes("It resumes exactly where it was as soon as someone says it happened: removing `parked` is that gesture.")));
});

test("removing `parked` unparks the station's failures and the ticket is taken at that turn; a ticket the chef parked stays", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  faux.feu(895, CALIBRE);
  const chef = faux.pour("chef");
  await chef.labelliser(895, [LABEL_PARKED]);
  await chef.commenter(895, corpsDuParking({ what: "the client's logo", who: "the client", followUp: "2026-12-01T00:00:00.000Z" }));
  let echecs = 0;
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, maintenant: () => MAINTENANT, cuisiner: async () => ({ echec: `the gates failed, run ${(echecs += 1)}` }) });
  for (let i = 0; i < 8; i++) {
    await a.tour();
    await a.calme();
  }
  assert.ok(faux.ticket(894).labels.has(LABEL_PARKED));
  const prises = faux.cuissons.filter(({ issue }) => issue === 894).length;
  // Le geste qui le déparque — `parked resume`, le bouton de l'app — retire `parked`, et rien d'autre.
  await chef.delabelliser(894, LABEL_PARKED);
  await a.tour();
  await a.calme();
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 894).length, prises + 1, "taken again at that turn");
  assert.ok(faux.ticket(895).labels.has(LABEL_PARKED), "the chef's parking is not the station's");
  assert.equal(faux.cuissons.some(({ issue }) => issue === 895), false);
});

test("a parking comment GitHub refuses leaves the ticket parked without its comment, its loop stopped, and the station says why", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  const pour = faux.pour.bind(faux);
  faux.pour = (station) => {
    const github = pour(station);
    return { ...github, commenter: async (numero, corps) => (corps.startsWith("<!-- brigade:parked") ? Promise.reject(new Error("HTTP 502")) : github.commenter(numero, corps)) };
  };
  const avertis: string[] = [];
  await tourner(faux, avertis);
  const ticket = faux.ticket(894);
  // Le commentaire refusé, `parked` reste : c'est lui qui arrête la boucle ; l'invariant 3 lui posera une raison et une date.
  assert.equal(ticket.labels.has(LABEL_PARKED), true);
  assert.ok(avertis.some((ligne) => /#894 — parked by its failure count, its loop is stopped, but the comment that says why could not be posted: HTTP 502/.test(ligne)), avertis.join("\n"));
  // Deux essais de suite au même motif arrêtent sa boucle : huit tours, et aucun autre cook.
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 894).length, 2, "its loop is stopped, it is not relaunched");
});
