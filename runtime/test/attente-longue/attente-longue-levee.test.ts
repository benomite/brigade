// #3764 : le manager lève une attente qui n'est pas une vraie dépendance. Mêmes conventions que
// `attente-longue-une-fois.test.ts` : station sur un faux GitHub, horloge avancée par le test, manager = faux `claude`
// lancé avec `Read,Grep,Glob`, qui répond `{"issue":"leve","commentaire":"…"}`.
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
  const lancer: Lancer = ({ args, entree, flux }) => {
    const consulte = args[args.indexOf("--tools") + 1] === "Read,Grep,Glob";
    if (consulte) consultations.push(entree ?? "");
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

test("the manager judges the wait is not a real dependency: it is lifted, the issue gets a one-line comment, and the ticket starts", async (t) => {
  const mot = `Lifted: #${B} does not touch what #${A} changes, so it is not a real dependency.`;
  const s = cuisine(t, () => JSON.stringify({ issue: "leve", commentaire: mot }));
  await s.tour(0);
  assert.equal(s.cooks(), 0, "held while the dependency is open");
  await s.tour(61);
  await s.tour(62);
  assert.equal(s.faux.ticket(A).state, "open", "the dependency itself is still open");
  assert.ok(s.cooks() >= 1, "the ticket is startable: a cook took it");
  const commentaire = s.commentaires().find((corps) => corps.includes(mot));
  assert.ok(commentaire !== undefined, s.commentaires().join("\n---\n"));
  const lignes = commentaire.split("\n").filter((ligne) => ligne.trim() !== "" && !ligne.trim().startsWith("<!--"));
  assert.equal(lignes.length, 1, "one line");
});
