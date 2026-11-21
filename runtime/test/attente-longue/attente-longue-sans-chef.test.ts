// #3764 : par la revue de l'attente longue, une attente levée ou gardée est décidée sans le chef, et seule une
// décision de produit lui va en question. Chaque cas vérifie d'abord que la revue a eu lieu.
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
const QUESTION = "Should the second screen wait for the new palette, or ship with the old one?";

// #B attend #A par son corps ; le manager répond `reponse` quand la station le consulte.
async function revue(t: TestContext, reponse: object) {
  const repertoire = mkdtempSync(join(tmpdir(), "attente-longue-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(A, ["fire", "model:opus"], "The base.");
  faux.feu(B, ["fire", "model:opus", "effort:medium"], `## Context\n\nDepends on #${A}.`);
  let consultations = 0;
  let cooks = 0;
  let maintenant = DEBUT;
  const lancer: Lancer = ({ args, entree, flux }) => {
    const consulte = args[args.indexOf("--tools") + 1] === "Read,Grep,Glob";
    if (consulte) consultations += 1;
    else cooks += 1;
    const message = consulte ? JSON.stringify(reponse) : "Done.\n<livrable>\nNothing.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: consulte ? 0 : 1, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: () => {}, maintenant: () => new Date(maintenant) });
  if ("refus" in station) throw new Error(station.refus);
  for (const minutes of [0, 61, 62]) {
    maintenant = DEBUT + minutes * MIN;
    await station.tour();
    await station.calme();
  }
  const commentaires = (faux.commentaires.get(B) ?? []).map((c) => c.body);
  return {
    consultations,
    cooks,
    commentaires,
    question: commentaires.some((corps) => corps.startsWith("**Question for the chef")),
    aLaMain: faux.ticket(B).labels.has(A_LA_MAIN),
  };
}

test("the manager lifts a wait held more than an hour: the lift is written on one line, and the chef is neither asked nor given the ticket", async (t) => {
  const s = await revue(t, { issue: "leve", commentaire: "Lifted:\nnot a real dependency." });
  assert.equal(s.consultations, 1);
  const levee = s.commentaires.find((corps) => corps.startsWith(`<!-- brigade:attente-levee #${A} -->`));
  assert.ok(levee !== undefined, s.commentaires.join("\n---\n"));
  assert.deepEqual(
    levee.split("\n").filter((ligne) => !ligne.startsWith("<!--")),
    [`The manager lifted the wait of #${B} on #${A} after more than an hour: Lifted: not a real dependency.`],
  );
  assert.ok(s.cooks >= 1, "the ticket starts");
  assert.equal(s.question, false);
  assert.equal(s.aLaMain, false);
});

test("the manager keeps a wait held more than an hour: the issue says why, and the chef is neither asked nor given the ticket", async (t) => {
  const s = await revue(t, { issue: "garde", commentaire: "Kept: it is real." });
  assert.equal(s.consultations, 1);
  const garde = s.commentaires.find((corps) => corps.startsWith("**The manager keeps the wait.**"));
  assert.ok(garde?.includes("Kept: it is real."), s.commentaires.join("\n---\n"));
  assert.equal(s.cooks, 0, "the ticket stays held");
  assert.equal(s.question, false);
  assert.equal(s.aLaMain, false);
});

test("the manager finds the wait a product decision: the chef gets the question and the ticket", async (t) => {
  const s = await revue(t, { issue: "produit", question: QUESTION });
  assert.equal(s.consultations, 1);
  assert.equal(s.question, true);
  assert.equal(s.aLaMain, true);
  assert.equal(s.cooks, 0);
});
