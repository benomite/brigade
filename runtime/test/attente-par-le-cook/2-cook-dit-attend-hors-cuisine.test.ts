// Un cook qui dit que le ticket attend quelque chose hors de la cuisine, sans date, le met en WAITING (#3814) :
// ce qu'il attend et de qui.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { attenteDeLIssue } from "../../src/attente-github/attente-github.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LABEL_TAKEN, LABEL_WAITING } from "../../src/github-etat/etats.ts";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const B = 20;
const CALIBRE = ["fire", "model:opus", "effort:medium"];

// Une station sur le faux GitHub, dont le premier cook finit sur `bloque` et les suivants sur un livrable sans blocage.
// L'horloge de la station est `instant()`, que le test avance.
function station(t: TestContext, bloque: string) {
  const repertoire = mkdtempSync(join(tmpdir(), "attente-par-le-cook-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(B, CALIBRE, "## Context\n\nThe dashboard's second screen.");
  let cooks = 0;
  let instant = new Date("2026-11-18T09:00:00Z");
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.includes("consult"));
    if (!consulte) cooks += 1;
    const bloqueIci = !consulte && cooks === 1;
    const message = bloqueIci ? `I stopped.\n<livrable>\n<bloque>${bloque}</bloque>\n</livrable>` : "Done.\n<livrable>\nNothing.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: bloqueIci ? 0 : 1, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: { ...fauxClient(faux) } as GitHub,
    depot: depotNeuf(repertoire),
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoire,
    lancer,
    avertir: () => {},
    maintenant: () => instant,
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    await ouverte.tour();
    await ouverte.calme();
  };
  const attente = () => attenteDeLIssue((faux.commentaires.get(B) ?? []).map((c) => ({ body: c.body, association: c.association })));
  return { faux, tour, cooks: () => cooks, attente, ticket: () => faux.ticket(B), avancer: (iso: string) => void (instant = new Date(iso)) };
}

test("a cook that says the ticket waits for the client's answer, with no date, puts it in WAITING with what and from whom", async (t) => {
  const s = station(t, "I cannot start: the client has not sent the production API key yet. Nothing in the kitchen can produce it.");
  await s.tour();
  const ticket = s.ticket();
  assert.equal(ticket.labels.has(LABEL_WAITING), true, "the ticket carries `waiting`");
  assert.equal(ticket.labels.has(LABEL_TAKEN), false);
  assert.equal(ticket.labels.has(A_LA_MAIN), false, "not blocked-on-human");
  assert.equal(ticket.labels.has(CHEF_TODO), false, "no chef TODO card");
  const attente = s.attente();
  assert.ok(attente !== null, "a marked comment records the wait");
  assert.match(attente.what, /API key/i);
  assert.match(attente.who, /client/i);
  assert.equal(s.cooks(), 1);
});
