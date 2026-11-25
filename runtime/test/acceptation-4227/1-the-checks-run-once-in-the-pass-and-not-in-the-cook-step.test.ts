// #4227, critère 1 : pour un plat, les checks du projet se jouent une fois, dans la pass, et pas dans l'étape du cook.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;

test("one dish, cooked then judged: the project's gates are played once, in the pass's worktree, never in the cook's", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-4227-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(757, ["fire", "model:opus", "effort:high"]);
  const lancer: Lancer = ({ args, flux }) => {
    writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  // Les gates du projet notent chaque passage, avec le worktree où elles ont tourné.
  const journalDesGates = join(repertoire, "gates.log");
  const worktreeDe = (run: string) => {
    const worktree = join(repertoire, run);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    const script = join(worktree, ".claude/brigade/gates.sh");
    writeFileSync(script, `#!/bin/sh\necho "$1" >> "${journalDesGates}"\necho "PASS  all"\n`);
    chmodSync(script, 0o755);
    return worktree;
  };
  const bas = faux.pour("box");
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "BOBL-tech/espace",
    github: { ...fauxClient(faux), ci: async (sha) => (await bas.ci(sha)).map((check) => ({ ...check, conclusion: "", url: null })), statuts: bas.statuts, poserStatut: bas.poserStatut } as GitHub,
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: worktreeDe(run), branche: `cook/${run}` }),
      reprendre: async (run) => worktreeDe(run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["src/app.ts"],
      diff: () => "diff --git a/src/app.ts b/src/app.ts\n+x\n",
      tete: (branche) => faux.prs.findLast((p) => p.branche === branche)?.sha ?? "",
      vue: () => "e5ba5e",
      fichiers: () => [".github/workflows/ci.yml", "src/app.ts"],
      lire: (_revision, chemin) => (chemin === ".github/workflows/ci.yml" ? "name: CI\non:\n  workflow_dispatch:\njobs:\n  test:\n    runs-on: ubuntu-latest\n" : null),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    gates: { delaiMs: 2_000 },
    avertir: (texte) => assert.fail(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === 757);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  for (let tour = 0; tour < 4 && faux.mergee(757) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.mergee(757)?.mergeePar, "box");
  const jouees = readFileSync(journalDesGates, "utf8").split("\n").filter(Boolean);
  assert.equal(jouees.length, 1, `the gates ran ${jouees.length} times for one dish: ${jouees.join(", ")}`);
  assert.equal(jouees[0], join(repertoire, "gates-757-github"), "the one run is the pass's, not the cook's");
});
