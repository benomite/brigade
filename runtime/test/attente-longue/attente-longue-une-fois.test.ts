// #3764 : un ticket du rail tenu plus d'une heure par une attente (ici une dépendance déduite, `Depends on #A` avec
// #A ouvert) est regardé par le manager, une fois. Les tests passent par la station (`stationDuDepot`) sur un faux
// GitHub, avec une horloge que le test avance. Le faux `claude` est le manager quand il est lancé avec ses outils de
// lecture (`Read,Grep,Glob`), un cook sinon. Le manager répond par un objet JSON dont `issue` est :
//   "leve"    — l'attente n'est pas une vraie dépendance (`commentaire`, une ligne) ;
//   "garde"   — l'attente est réelle (`commentaire` dit pourquoi) ;
//   "produit" — seul le chef tranche (`question`).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const A = 10;
const B = 20;
const MIN = 60_000;
const DEBUT = Date.parse("2026-11-17T10:00:00Z");
// #A est ouvert mais aucun cook ne le prend (calibrage incomplet) ; #B attend #A.
const OUVERT = ["fire", "model:opus"];
const CALIBRE = ["fire", "model:opus", "effort:medium"];

// `manager(n)` : ce que le manager répond à sa n-ième consultation.
function cuisine(t: TestContext, manager: (n: number) => string) {
  const repertoire = mkdtempSync(join(tmpdir(), "attente-longue-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(A, OUVERT, "The base.");
  faux.feu(B, CALIBRE, `## Context\n\nDepends on #${A}.`);
  let cooks = 0;
  const consultations: string[] = [];
  let maintenant = DEBUT;
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args[args.indexOf("--tools") + 1] === "Read,Grep,Glob";
    if (consulte) consultations.push(args[args.indexOf("-p") + 1] ?? "");
    else cooks += 1;
    const message = consulte ? manager(consultations.length) : "Done.\n<livrable>\nNothing.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: consulte ? 0 : 1, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: () => {}, maintenant: () => new Date(maintenant) });
  if ("refus" in station) throw new Error(station.refus);
  // Un tour de la station, `minutes` après le début.
  const tour = async (minutes: number) => {
    maintenant = DEBUT + minutes * MIN;
    await station.tour();
    await station.calme();
  };
  const commentaires = () => (faux.commentaires.get(B) ?? []).map((c) => c.body);
  return { faux, tour, cooks: () => cooks, consultations, commentaires };
}

test("a ticket held by a wait for more than an hour goes to the manager once, not every minute", async (t) => {
  const s = cuisine(t, () => JSON.stringify({ issue: "garde", commentaire: `Kept: #${B} reads the module #${A} is writing.` }));
  for (const minutes of [0, 1, 20, 59]) await s.tour(minutes);
  assert.equal(s.consultations.length, 0, "within the hour the manager is not asked");
  await s.tour(61);
  assert.equal(s.consultations.length, 1, "past the hour the manager looks at the wait");
  assert.ok(s.consultations[0]?.includes(`#${B}`), "the consultation names the held ticket");
  for (let minutes = 62; minutes <= 180; minutes += 1) await s.tour(minutes);
  assert.equal(s.consultations.length, 1, "the same wait is not brought back every minute");
  assert.equal(s.cooks(), 0);
});
