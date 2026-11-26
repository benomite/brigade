// #3990 : seule une PR fermée sans merge remet la branche en pass ; une PR mergée laisse le cook sans rien ajouté compter comme avant.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotRepris, fauxClient } from "./faux-github.ts";

const TICKET = 3955;
const BRANCHE = `cook/${TICKET}-github`;

// Un cook reprend une branche déjà livrée dont la PR a été fermée, ne commite rien
// et dit que tout est fait ; les gates passent (CI verte du faux).
async function cuisiner(t: TestContext, passages: number, merged: boolean, prIllisible = false) {
  const repertoire = mkdtempSync(join(tmpdir(), "acceptation-3990-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  const tete = "c".repeat(40);
  faux.prs.push({ number: 3960, issue: TICKET, branche: BRANCHE, sha: tete, state: "closed", merged, enRetard: false, mergeePar: null, fichiers: [] });
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "All 7 tests of the family pass, each under about 0.5 s." })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  let appels = 0;
  const avertis: string[] = [];
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: prIllisible ? { ...fauxClient(faux), prDeBranche: async (b: string) => { appels += 1; if (appels === 3) throw new Error("unreadable"); return fauxClient(faux).prDeBranche!(b); } } : fauxClient(faux), depot: depotRepris(repertoire, tete), flux: repertoire, lancer, maintenant: () => new Date("2026-11-21T09:07:00Z"), avertir: (texte) => avertis.push(texte) });
  if ("refus" in station) throw new Error(station.refus);
  for (let i = 0; i < passages; i += 1) {
    await station.tour();
    await station.calme();
  }
  const corps = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  return { faux, corps, avertis };
}

test("a branch whose PR was merged is not put back in pass: a cook that adds nothing counts as before", async (t) => {
  const { faux, corps } = await cuisiner(t, 1, true);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), false);
  assert.equal(corps.filter((c) => c.startsWith("<!-- brigade:echec")).length, 1);
});

// The cook's own read of its branch's PR is the third call; the others come from the tour before it.
test("a PR that cannot be read does not put the branch back in pass: a cook that adds nothing counts as before", async (t) => {
  const { faux, corps } = await cuisiner(t, 1, false, true);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), false);
  assert.equal(corps.filter((c) => c.startsWith("<!-- brigade:echec")).length, 1);
});
