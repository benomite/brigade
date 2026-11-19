// #3764 : une attente dont la décision est de produit part au chef en question ; toute autre est décidée sans lui.
// Mêmes conventions que `attente-longue-une-fois.test.ts` : le manager répond `{"issue":"produit","question":"…"}`,
// `"leve"` ou `"garde"`.
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
const QUESTION = "Should the second screen wait for the new palette, or ship with the old one?";

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

// Une cuisine dont le manager répond `reponse`, à #B tenu plus d'une heure.
async function apresUneHeure(t: TestContext, reponse: object) {
  const s = cuisine(t, () => JSON.stringify(reponse));
  await s.tour(0);
  await s.tour(61);
  await s.tour(62);
  return s;
}

test("a wait whose decision is a product one is sent to the chef as a question", async (t) => {
  const s = await apresUneHeure(t, { issue: "produit", question: QUESTION });
  assert.equal(s.faux.ticket(B).labels.has(A_LA_MAIN), true);
  const carte = s.commentaires().find((corps) => corps.startsWith("**Question for the chef"));
  assert.equal(carte?.split("\n")[0], `**Question for the chef (product):** ${QUESTION}`);
});

test("a wait lifted or kept is decided without the chef: no question, no blocked-on-human", async (t) => {
  for (const reponse of [
    { issue: "leve", commentaire: "Lifted: not a real dependency." },
    { issue: "garde", commentaire: "Kept: it is real." },
  ]) {
    const s = await apresUneHeure(t, reponse);
    assert.ok(s.commentaires().some((corps) => corps.includes(`<!-- brigade:attente-longue ${reponse.issue}`)), reponse.issue);
    assert.equal(s.faux.ticket(B).labels.has(A_LA_MAIN), false, reponse.issue);
    assert.ok(s.commentaires().every((corps) => !corps.startsWith("**Question for the chef")), reponse.issue);
  }
});
