// #3990, critère 1 : une branche qui porte une livraison, sans PR ouverte, voit sa PR ouverte (ou rouverte) et le ticket part en pass.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotRepris, fauxClient } from "../faux-github.ts";

const TICKET = 3955;
const BRANCHE = `cook/${TICKET}-github`;

// Un cook reprend une branche déjà livrée dont la PR a été fermée, ne commite rien
// et dit que tout est fait ; les gates passent (CI verte du faux).
async function cuisiner(t: TestContext, passages: number) {
  const repertoire = mkdtempSync(join(tmpdir(), "acceptation-3990-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  const tete = "c".repeat(40);
  faux.prs.push({ number: 3960, issue: TICKET, branche: BRANCHE, sha: tete, state: "closed", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "All 7 tests of the family pass, each under about 0.5 s." })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertis: string[] = [];
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot: depotRepris(repertoire, tete), flux: repertoire, lancer, maintenant: () => new Date("2026-11-21T09:07:00Z"), avertir: (texte) => avertis.push(texte) });
  if ("refus" in station) throw new Error(station.refus);
  for (let i = 0; i < passages; i += 1) {
    await station.tour();
    await station.calme();
  }
  const corps = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  return { faux, corps, avertis };
}

test("a complete branch whose PR was closed gets an open PR and its ticket goes to pass", async (t) => {
  const { faux, corps } = await cuisiner(t, 1);
  assert.ok(faux.prs.some((pr) => pr.branche === BRANCHE && pr.state === "open"), "a PR is open on the branch");
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), true);
  assert.equal(corps.filter((c) => c.startsWith("<!-- brigade:echec")).length, 0);
});

// #3990, critère 2 : ce cas ne compte jamais pour un cook raté.
// brigade:guard — moved unchanged from its own file by the closing pass #3993: it keeps guarding what main already does.
test("a cook that finds its branch complete with no open PR is never counted as a failed cook", async (t) => {
  const { faux, corps, avertis } = await cuisiner(t, 4);
  assert.equal(corps.filter((c) => c.startsWith("<!-- brigade:echec")).length, 0, "no failure comment");
  assert.equal(avertis.filter((a) => a.includes("stopped without a delivery")).length, 0, "no failed try warned");
  for (const label of ["served-elsewhere", "set-aside:failures"]) assert.equal(faux.ticket(TICKET).labels.has(label), false, label);
});
