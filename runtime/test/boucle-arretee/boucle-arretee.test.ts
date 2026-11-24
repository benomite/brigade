// La station arrête elle-même la boucle de relances d'un ticket (#4041) : ses essais épuisés, il est mis de côté pour le
// superviseur et passe en WAITING, sa raison écrite, sa relance dans sept jours. Il en sort à sa relance, ou dès que sa
// mise de côté lui est retirée — le geste du chef ou du superviseur qui le relance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue } from "../../src/attente-github/attente-github.ts";
import { LABEL_WAITING } from "../../src/github-etat/etats.ts";
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

test("a ticket whose tries are spent waits on the supervisor, its reason written, its follow-up seven days on", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  await tourner(faux);
  const ticket = faux.ticket(894);
  assert.ok(ticket.labels.has(ECHECS_ATTEINTS), "the supervisor gets its dossier");
  const attente = attenteDeLIssue((faux.commentaires.get(894) ?? []).map(({ body, association }) => ({ body, association })));
  assert.ok(attente !== null, "the WAITING mark is on the ticket");
  assert.equal(attente.who, "the supervisor");
  assert.match(attente.what, /stopped its relaunch loop[\s\S]*The reason: the gates failed on the import job/);
  assert.equal(attente.followUp, new Date(MAINTENANT.getTime() + SEPT_JOURS_MS).toISOString());
  assert.equal(attente.backOnFollowUp, true, "on its follow-up date it goes back on the rail, as invariant 3 says");
  assert.equal(attente.whileSetAside, true);
  assert.ok((faux.commentaires.get(894) ?? []).some(({ body }) => body.includes("as soon as `set-aside:failures` is removed")));
});

test("removing `set-aside:failures` lifts the station's WAITING and the ticket is taken at that turn; a chef's WAITING stays", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  faux.feu(895, CALIBRE);
  const chef = faux.pour("chef");
  await chef.labelliser(895, [LABEL_WAITING]);
  await chef.commenter(895, `<!-- brigade:waiting {"what":"the client's logo","who":"the client","followUp":"2026-12-01T00:00:00.000Z"} -->\nWAITING.`);
  let echecs = 0;
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, maintenant: () => MAINTENANT, cuisiner: async () => ({ echec: `the gates failed, run ${(echecs += 1)}` }) });
  for (let i = 0; i < 8; i++) {
    await a.tour();
    await a.calme();
  }
  assert.ok(faux.ticket(894).labels.has(LABEL_WAITING));
  const prises = faux.cuissons.filter(({ issue }) => issue === 894).length;
  await chef.delabelliser(894, ECHECS_ATTEINTS);
  await a.tour();
  await a.calme();
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 894).length, prises + 1, "taken again at that turn");
  assert.ok((faux.commentaires.get(894) ?? []).some(({ body }) => body.startsWith("**WAITING lifted — no longer set aside**")));
  assert.ok(faux.ticket(895).labels.has(LABEL_WAITING), "the chef's WAITING is not the station's");
  assert.equal(faux.cuissons.some(({ issue }) => issue === 895), false);
});

test("a WAITING comment GitHub refuses leaves the ticket set aside, not waiting, and the station says why", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  const pour = faux.pour.bind(faux);
  faux.pour = (station) => {
    const github = pour(station);
    return { ...github, commenter: async (numero, corps) => (corps.startsWith("<!-- brigade:waiting") ? Promise.reject(new Error("HTTP 502")) : github.commenter(numero, corps)) };
  };
  const avertis: string[] = [];
  await tourner(faux, avertis);
  const ticket = faux.ticket(894);
  assert.ok(ticket.labels.has(ECHECS_ATTEINTS));
  assert.equal(ticket.labels.has(LABEL_WAITING), false);
  assert.ok(avertis.some((ligne) => /#894 .*set aside, but it could not be put in WAITING: .*HTTP 502/.test(ligne)), avertis.join("\n"));
  // Deux essais de suite au même motif le mettent de côté : huit tours, et aucun autre cook.
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 894).length, 2, "set aside, it is not relaunched");
});
