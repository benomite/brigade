// Le ticket qui avait dit « pas avant le 2026-11-25 » reprend seul où il était à sa date, sans geste du chef (#3814, #4129).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { attenteDeLIssue } from "../../src/attente-github/attente-github.ts";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LABEL_PARKED, LABEL_TAKEN } from "../../src/github-etat/etats.ts";
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

test("on its date a parked ticket loses `parked` and a cook takes it again — before that date it stays", async (t) => {
  const s = station(t, "Too early: this ticket cannot be done before 2026-11-25. Waiting for the client's API team.");
  await s.tour();
  assert.equal(s.ticket().labels.has(LABEL_PARKED), true, "parked after the cook's report");
  s.avancer("2026-11-20T09:00:00Z");
  await s.tour();
  assert.equal(s.ticket().labels.has(LABEL_PARKED), true, "still parked before its date");
  assert.equal(s.cooks(), 1);
  s.avancer("2026-11-26T09:00:00Z");
  // Déparqué, il se prend au tour même où sa date est lue (#4129) : un tour de plus relancerait le cook qui échoue ici,
  // et ses échecs le parqueraient de nouveau, pour le superviseur.
  await s.tour();
  assert.equal(s.ticket().labels.has(LABEL_PARKED), false, "resumed by itself");
  assert.equal(s.ticket().labels.has("fire"), true);
  assert.equal(s.ticket().labels.has(CHEF_TODO), false);
  assert.equal(s.ticket().labels.has(CHEF_TODO), false);
  assert.equal(s.cooks(), 2, "a cook takes it again");
});
