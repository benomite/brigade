// #3764 : aucun ticket n'est tenu plus d'une heure sans un commentaire qui dit ce qu'il attend et qui l'a décidé.
// Mêmes conventions que `attente-longue-une-fois.test.ts`. Ici le manager ne répond rien de lisible : seule la
// station a décidé de l'attente, et la ligne doit tout de même être là.
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
// Qui décide : la station, le manager ou le chef.
const DECIDEUR = /\b(station|manager|chef)\b/i;

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

test("a ticket that reaches the one-hour mark with no line saying what it waits for and who decided it gets one, once", async (t) => {
  const s = cuisine(t, () => "I could not decide.");
  const ligne = () => s.commentaires().filter((corps) => corps.includes(`#${A}`) && DECIDEUR.test(corps));
  await s.tour(0);
  await s.tour(30);
  assert.equal(s.commentaires().length, 0, "before the hour there is nothing to say");
  await s.tour(61);
  assert.equal(ligne().length, 1, `no line naming #${A} and who decided: ${s.commentaires().join("\n---\n")}`);
  for (const minutes of [62, 63, 90]) await s.tour(minutes);
  assert.equal(ligne().length, 1, "the line is written once");
});
