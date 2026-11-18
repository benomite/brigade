// La date du commit rouge que la carte de la base rouge dit (#3816), sur le
// vrai client, contre un faux `gh` : datée, inconnue de GitHub, ou sans date.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirGitHub } from "../../src/github.ts";
import { DEPOT, fauxGh } from "../outils.ts";

test("a commit's instant is its committer's date; unknown to GitHub or undated, it is null, never made up", async (t) => {
  const gh = fauxGh(t);
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  gh.repondre(`repos/${DEPOT}/git/commits/abc`, { corps: { sha: "abc", committer: { date: "2026-11-03T08:05:00Z" } } });
  assert.equal(await github.instantDuCommit("abc"), "2026-11-03T08:05:00Z");
  gh.repondre(`repos/${DEPOT}/git/commits/def`, { statut: 404, corps: { message: "Not Found" } });
  assert.equal(await github.instantDuCommit("def"), null);
  gh.repondre(`repos/${DEPOT}/git/commits/ghi`, { corps: { sha: "ghi" } });
  assert.equal(await github.instantDuCommit("ghi"), null);
});
