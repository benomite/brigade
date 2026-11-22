// #4006, critère 1 : un cook relancé sur une CI rouge reçoit le check en échec, son étape en échec et les lignes des tests
// en échec lues dans le journal du check. Par la station : la PR ouverte du ticket a un check rouge dont l'annotation ne dit
// que « Process completed with exit code 1. », l'étape en échec est connue de GitHub, et le journal porte les lignes des tests.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

test("a cook relaunched because of a red CI gets the failing check, its failed step and the failing test lines from its log (#4006)", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: false, mergeePar: null, fichiers: [] });
  const url = "https://github.com/faux/depot/actions/runs/7/job/31";
  let consigne = "";
  const lancer: Lancer = ({ entree, flux }) => {
    consigne = entree ?? "";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const journal = [
    "2026-11-20T10:00:00.0000000Z ##[group]Run npm --prefix runtime test",
    "2026-11-20T10:00:05.0000000Z ✖ the relaunch brief names the failing step (12.3ms)",
    "2026-11-20T10:00:05.0000000Z   AssertionError: expected the step to be named",
    "2026-11-20T10:00:06.0000000Z ##[error]Process completed with exit code 1.",
  ].join("\n");
  const station = stationDuDepot({
    nom: "box", places: 1, base: "main", depotGitHub: "faux/depot",
    github: {
      ...fauxClient(faux),
      ci: async () => [{ name: "runtime-windows", conclusion: "failure", outcome: "red", url }],
      annotationsDuCheck: async () => [{ chemin: null, ligne: null, titre: "runtime-windows", message: "Process completed with exit code 1." }],
      etapesEnEchec: async () => ["Run the runtime tests"],
      journalDuCheck: async () => journal,
    },
    depot: { connait: (branche) => branche === "cook/14-github", preparer: async () => assert.fail("the branch is resumed"), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 1, changes: () => [], diff: () => "", tete: () => "a".repeat(40) },
    prise: priseDeLaStation, claude: "claude", env: {}, cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1, reviewer: { model: "sonnet", effort: "medium" }, flux: repertoire, lancer, avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();

  assert.match(consigne, /the CI of PR #99 is red/);
  assert.match(consigne, /runtime-windows/);
  assert.match(consigne, /Run the runtime tests/);
  assert.match(consigne, /✖ the relaunch brief names the failing step/);
});
