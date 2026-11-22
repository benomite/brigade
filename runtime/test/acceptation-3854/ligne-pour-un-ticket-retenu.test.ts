// #3854, critère 3 : si le test de la PR #3846 est remplacé, le nouveau exerce le comportement neuf de la
// livraison — la ligne d'attente d'un ticket que quelque chose retient — et non celui que main a déjà.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const REPO = "benomite/brigade";
const REVUE_SUR = "342e49dd94b5aa154126c6bf5cff8e936c27828a";
const FICHIER = "runtime/test/attente-visible/jamais-awaiting-none.test.ts";
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 26 });
const CAS = /\b(?:test|it)\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

test("the replacement of the empty-case test asserts the waiting line of a ticket something holds back, and is red on main", { skip: "reads live GitHub state of other deliveries (PR #3783/#3838/#3846); not a code test" }, () => {
  const tete = gh("pr", "view", "3846", "--repo", REPO, "--json", "headRefOid", "--jq", ".headRefOid").trim();
  assert.notEqual(tete, REVUE_SUR, "the PR head is still the reviewed commit: nothing was fixed");
  const lire = (f: string) => gh("api", `repos/${REPO}/contents/${f}?ref=${tete}`, "-H", "Accept: application/vnd.github.raw");
  let source: string;
  try {
    source = lire(FICHIER);
  } catch {
    return; // supprimé : aucun test honnête du cas vide ne peut échouer sur main, rien à exercer
  }
  const noms = [...source.matchAll(CAS)].map((m) => m[2]!);
  assert.ok(noms.length > 0, `${FICHIER} exists but declares no case`);
  assert.doesNotMatch(source, /brigade:guard|comme avant|as before/i, "the replacement is a guard of what main already does");
  assert.match(source, /awaiting|attente/i, "the replacement does not touch the waiting line");
  const dossier = mkdtempSync(join(tmpdir(), "acceptation-3854-"));
  execFileSync("tar", ["-x", "-C", dossier], { input: execFileSync("git", ["archive", "--format=tar", "main", "runtime"], { maxBuffer: 1 << 29 }) });
  mkdirSync(dirname(join(dossier, FICHIER)), { recursive: true });
  writeFileSync(join(dossier, FICHIER), source);
  const r = spawnSync("node", ["--test", "--test-reporter=tap", "--test-force-exit", join(dossier, FICHIER)], { cwd: join(dossier, "runtime"), encoding: "utf8" });
  assert.notEqual(r.status, 0, "the replacement passes on main: it does not exercise the new behavior");
});
