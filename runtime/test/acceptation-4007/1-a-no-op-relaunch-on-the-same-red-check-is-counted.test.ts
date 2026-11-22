import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

// #4007 : un cook relancé sur une CI rouge, qui n'ajoute rien, compte comme un essai raté.
test("a relaunch where the cook adds nothing, with the CI still red for the same check, is counted as a failed try", async (t) => {
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
  await station.tour();
  await station.calme();

  const commentaires = (faux.commentaires.get(14) ?? []).map((c) => c.body);
  assert.ok(commentaires.some((corps) => corps.startsWith("<!-- brigade:echec")), "the no-op relaunch on a red CI is a failed try (an echec comment)");
  assert.ok(!commentaires.some((corps) => corps.includes("this is not counted as a failed cook")));
});
