// Ce que la brigade rend à la machine quand elle la voit saturée sans cook vivant (#4089).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { reclamerLesRestes } from "../../../src/github-seul/garde-fous/recuperation.ts";

type LieuxARecuperer = Parameters<typeof reclamerLesRestes>[0];
import { repertoireTemporaire } from "../../outils.ts";

const LAISSE_MS = 3_600_000;
const MAINTENANT = 10 * LAISSE_MS;
const vieillir = (chemin: string, ageMs: number) => utimesSync(chemin, (MAINTENANT - ageMs) / 1000, (MAINTENANT - ageMs) / 1000);

test("only what is old enough is reclaimed: runs, private tmp entries, merged worktrees, and the npm cache", (t) => {
  const racine = repertoireTemporaire(t);
  const lieux: LieuxARecuperer = { worktrees: join(racine, "wt"), clone: join(racine, "clone"), runs: join(racine, "runs"), temporaires: [join(racine, "claude-1")], cacheNpm: true };
  for (const dossier of [lieux.worktrees, lieux.clone, lieux.runs, lieux.temporaires[0]!]) mkdirSync(dossier, { recursive: true });
  for (const nom of ["vieux", "neuf", "porte-du-travail", ".essais"]) mkdirSync(join(lieux.worktrees, nom));
  for (const nom of ["vieux", "porte-du-travail", ".essais"]) vieillir(join(lieux.worktrees, nom), 2 * LAISSE_MS);
  writeFileSync(join(lieux.runs, "vieux.jsonl"), "");
  writeFileSync(join(lieux.runs, "neuf.jsonl"), "");
  writeFileSync(join(lieux.runs, "notes.txt"), "");
  vieillir(join(lieux.runs, "vieux.jsonl"), 2 * LAISSE_MS);
  vieillir(join(lieux.runs, "notes.txt"), 2 * LAISSE_MS);
  mkdirSync(join(lieux.temporaires[0]!, "vieux"));
  mkdirSync(join(lieux.temporaires[0]!, "neuf"));
  vieillir(join(lieux.temporaires[0]!, "vieux"), 2 * LAISSE_MS);

  const joues: string[] = [];
  const bilan = reclamerLesRestes(lieux, {
    maintenant: () => MAINTENANT,
    jouer: (commande, args, cwd) => {
      joues.push(`${commande} ${args.filter((a) => !a.startsWith("-c") && !a.startsWith("core.")).join(" ")} @ ${cwd}`);
      if (args.includes("--contains")) return cwd.endsWith("porte-du-travail") ? "" : "  origin/main\n";
      return "";
    },
  });

  assert.deepEqual(joues, [
    `git branch -r --contains HEAD @ ${join(lieux.worktrees, "porte-du-travail")}`,
    `git branch -r --contains HEAD @ ${join(lieux.worktrees, "vieux")}`,
    `git worktree remove ${join(lieux.worktrees, "vieux")} @ ${lieux.clone}`,
    `npm cache clean --force @ ${lieux.clone}`,
  ]);
  assert.deepEqual(bilan.echecs, []);
  assert.equal(existsSync(join(lieux.runs, "vieux.jsonl")), false);
  assert.equal(existsSync(join(lieux.runs, "neuf.jsonl")), true);
  assert.equal(existsSync(join(lieux.runs, "notes.txt")), true);
  assert.equal(existsSync(join(lieux.temporaires[0]!, "vieux")), false);
  assert.equal(existsSync(join(lieux.temporaires[0]!, "neuf")), true);
  assert.deepEqual(bilan.retires.filter((r) => r.startsWith("worktree")), [`worktree ${join(lieux.worktrees, "vieux")}`]);
  assert.ok(bilan.retires.includes("npm cache"));
});

test("a leftover that resists is said and does not stop the others", (t) => {
  const racine = repertoireTemporaire(t);
  const lieux: LieuxARecuperer = { worktrees: join(racine, "wt"), clone: racine, runs: join(racine, "runs"), temporaires: [], cacheNpm: true };
  mkdirSync(join(lieux.worktrees, "sale"), { recursive: true });
  vieillir(join(lieux.worktrees, "sale"), 2 * LAISSE_MS);
  const bilan = reclamerLesRestes(lieux, {
    maintenant: () => MAINTENANT,
    jouer: (commande, args) => {
      if (args.includes("--contains")) return "origin/main";
      throw new Error(`${commande} refused`);
    },
  });
  assert.deepEqual(bilan.retires, []);
  assert.equal(bilan.echecs.length, 2);
  assert.match(bilan.echecs[0]!, /worktree .*sale kept — git refused/);
  assert.match(bilan.echecs[1]!, /npm cache kept — npm refused/);
});
