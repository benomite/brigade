// Les restes d'un cook sorti sont retirés, ceux d'un cook vivant ou inconnu non (#4103).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { retirerLesRestesDuCook } from "../src/station/restes-du-cook.ts";
import { repertoireTemporaire } from "./outils.ts";

function restesDe(racine: string, run: string): string[] {
  const worktree = join(racine, "worktrees", run);
  mkdirSync(join(worktree, "node_modules", "x"), { recursive: true });
  writeFileSync(join(worktree, "node_modules", "x", "i.js"), "");
  const flux = join(racine, "runs");
  mkdirSync(flux, { recursive: true });
  const fichiers = [`${run}.flux.jsonl`, `${run}.flux.jsonl.stderr`, `${run}-mutations-1.flux.jsonl`].map((nom) => join(flux, nom));
  for (const fichier of fichiers) writeFileSync(fichier, "{}\n");
  const tmp = join(racine, "tmp", run);
  mkdirSync(tmp, { recursive: true });
  return [worktree, ...fichiers, tmp];
}

function deuxCooks(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const partage = join(racine, "cache-npm");
  mkdirSync(partage);
  return { racine, partage, sorti: restesDe(racine, "run-1"), vivant: restesDe(racine, "run-2") };
}

test("un cook sorti perd ses restes, un cook vivant garde les siens, un chemin absent ne lève pas (#4103)", (t) => {
  const { partage, sorti, vivant } = deuxCooks(t);
  const dits: string[] = [];
  const absent = join(partage, "..", "n-existe-pas");
  retirerLesRestesDuCook({ cook: "run-2", sorti: false, chemins: vivant, avertir: (m) => dits.push(m) });
  retirerLesRestesDuCook({ cook: "run-2", sorti: null, chemins: vivant, avertir: (m) => dits.push(m) });
  assert.ok(vivant.every(existsSync), "vivant ou inconnu : rien n'est retiré");
  const retires = retirerLesRestesDuCook({ cook: "run-1", sorti: true, chemins: [...sorti, absent, "relatif/chemin"], avertir: (m) => dits.push(m) });
  assert.ok(sorti.every((c) => !existsSync(c)), "les restes du cook sorti sont partis");
  assert.ok(vivant.every(existsSync), "ceux du cook vivant sont intacts");
  assert.ok(existsSync(partage), "le cache partagé n'est pas à lui");
  assert.deepEqual(retires, [...sorti, absent]);
  assert.equal(dits.length, 1);
  assert.match(dits[0] ?? "", /relatif\/chemin/);
});

test("une erreur de suppression est dite, sans lever, et les chemins suivants sont tentés (#4103)", (t) => {
  const { sorti } = deuxCooks(t);
  const dits: string[] = [];
  assert.doesNotThrow(() => retirerLesRestesDuCook({ cook: "run-1", sorti: true, chemins: ["/dev/null/x\0y", ...sorti], avertir: (m) => { dits.push(m); throw new Error("log cassé"); } }));
  assert.ok(sorti.every((c) => !existsSync(c)));
  assert.equal(dits.length, 1);
});
