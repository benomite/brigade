// #4227, critère 4 : aucun résultat du cook ne sert à accepter ou refuser un plat — un essai du cook rouge va quand même à la pass, qui seule décide.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;

test("a dish whose cook-side try is red still goes to the pass, which alone decides: its green gates and review merge it", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-4227-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(757, ["fire", "model:opus", "effort:high"]);
  const lancer: Lancer = ({ args, flux }) => {
    writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  // Le projet joue ses gates : rouges là où le cook essaie son travail, vertes dans la pass.
  const journalDesGates = join(repertoire, "gates.log");
  const worktreeDe = (run: string) => {
    const worktree = join(repertoire, run);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    const script = join(worktree, ".claude/brigade/gates.sh");
    writeFileSync(script, `#!/bin/sh\necho "$1" >> "${journalDesGates}"\ncase "$1" in\n  */gates-*) echo "PASS  all" ;;\n  *) echo "FAIL  the cook's own try"; exit 1 ;;\nesac\n`);
    chmodSync(script, 0o755);
    return worktree;
  };
  const avertis: string[] = [];
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
    avertir: (texte) => void avertis.push(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  for (let tour = 0; tour < 6 && faux.mergee(757) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
    const pr = faux.prs.find((p) => p.issue === 757);
    if (pr !== undefined) faux.sansCI.add(pr.number);
  }
  // Le cook a livré malgré son essai rouge : sa PR existe, la pass la juge — gates, CI et relecture — et la merge.
  assert.ok(faux.prs.some((p) => p.issue === 757), `the dish with a red cook-side try never reached the pass: ${avertis.join(" | ")}`);
  assert.equal(faux.mergee(757)?.mergeePar, "box", "the pass alone decides: its verdict was green");
  const sentBack = (faux.commentaires.get(757) ?? []).filter((c) => c.body.startsWith("<!-- brigade:renvoi") || c.body.startsWith("<!-- brigade:echec"));
  assert.deepEqual(sentBack, [], "nothing the cook's try said sent the dish back");
});
