// #3764 : le manager garde une attente réelle. Mêmes conventions que `attente-longue-une-fois.test.ts` : le manager
// répond `{"issue":"garde","commentaire":"…"}`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const A = 10;
const B = 20;
const MIN = 60_000;
const DEBUT = Date.parse("2026-11-17T10:00:00Z");
const OUVERT = ["fire", "model:opus"];
const CALIBRE = ["fire", "model:opus", "effort:medium"];

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
  const tour = async (minutes: number) => {
    maintenant = DEBUT + minutes * MIN;
    await station.tour();
    await station.calme();
  };
  const commentaires = () => (faux.commentaires.get(B) ?? []).map((c) => c.body);
  return { faux, tour, cooks: () => cooks, consultations, commentaires };
}

test("the manager keeps the wait: the issue gets a comment saying why, and the ticket stays held", async (t) => {
  const pourquoi = `Kept: #${B} builds on the module #${A} is still writing.`;
  const s = cuisine(t, () => JSON.stringify({ issue: "garde", commentaire: pourquoi }));
  await s.tour(0);
  await s.tour(61);
  for (const minutes of [62, 63, 120]) await s.tour(minutes);
  assert.ok(s.commentaires().some((corps) => corps.includes(pourquoi)), s.commentaires().join("\n---\n"));
  assert.equal(s.cooks(), 0, "the ticket stays held");
  assert.equal(s.faux.ticket(B).labels.has("fire"), true, "and on the rail");
  assert.equal(s.faux.ticket(B).labels.has(A_LA_MAIN), false);
});
