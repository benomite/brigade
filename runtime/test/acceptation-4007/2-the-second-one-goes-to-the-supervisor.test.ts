import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

// #4007 : au second renvoi sans rien ajouter sur le même check rouge, le ticket va au superviseur.
test("on the second no-op relaunch for the same red check, the ticket goes to the supervisor and is not relaunched", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: false, mergeePar: null, fichiers: [] });
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 3, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box", places: 1, base: "main", depotGitHub: "faux/depot",
    github: { ...fauxClient(faux), ci: async () => [{ name: "tests runtime (1/16)", conclusion: "failure", outcome: "red", url: "https://github.com/faux/depot/actions/runs/7/job/31" }] },
    depot: { connait: (branche) => branche === "cook/14-github", preparer: async () => assert.fail("the branch is resumed"), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 1, changes: () => [], diff: () => "", tete: () => "a".repeat(40) },
    prise: priseDeLaStation, claude: "claude", env: {}, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 }, graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" }, flux: repertoire, lancer, avertir: () => {},
  });
  assert.ok(!("refus" in station), "refus" in station ? station.refus : "");
  if ("refus" in station) return;
  const lancements = () => (faux.commentaires.get(14) ?? []).filter((c) => c.body.includes("the cook added nothing") || c.body.startsWith("<!-- brigade:echec")).length;
  for (let tour = 0; tour < 4 && !faux.ticket(14).labels.has("set-aside:failures"); tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.ok(faux.ticket(14).labels.has("set-aside:failures"), "the ticket is set aside for the supervisor");
  const avant = lancements();
  for (let tour = 0; tour < 2; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(lancements(), avant, "the ticket is not relaunched");
  // Invariant 2 du rail (#4026) : la relance laisse la même tête, rouge du même check ; elle n'est pas rejouée une seconde fois.
  assert.equal((faux.commentaires.get(14) ?? []).filter((c) => c.body.startsWith("<!-- brigade:echec")).length, 1, "one relaunch on the same commit, then a stop");
});
