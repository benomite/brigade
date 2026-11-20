// #3952 : sur un run de la cuisine, chaque check de `tests.yml` court sans rendre le run rouge et pose sa vraie issue
// en statut de commit ; hors cuisine, rien ne change.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WORKFLOW = readFileSync(new URL("../../../.github/workflows/tests.yml", import.meta.url), "utf8").replace(/^\s*#.*$/gm, "");
const CUISINE = "(github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'pull_request' && startsWith(github.head_ref, 'cook/') && github.event.pull_request.head.repo.full_name == github.repository)";
const occurrences = (motif: string) => WORKFLOW.split(motif).length - 1;

test("a kitchen run is a push on main or a PR from a cook branch, and only there do the jobs go on after a failure", () => {
  assert.equal(occurrences(`CUISINE: \${{ ${CUISINE} }}`), 1);
  assert.equal(occurrences("continue-on-error:"), 3, "gates, types and tests");
  assert.equal(occurrences(`continue-on-error: \${{ ${CUISINE} }}`), 3);
});

test("each check posts its real outcome under its own name, linking its job, only on a kitchen run", () => {
  assert.equal(occurrences("- name: Statut du check"), 3);
  assert.equal(occurrences("if: ${{ always() && env.CUISINE == 'true' }}"), 3);
  assert.equal(occurrences("ETAT: ${{ job.status == 'success' && 'success' || 'failure' }}"), 3);
  for (const nom of ["NOM: gates", "NOM: types (${{ matrix.zone }})", "NOM: tests ${{ matrix.zone }} (${{ matrix.part }}/${{ matrix.of }})"]) assert.equal(occurrences(nom), 1, nom);
  assert.equal(occurrences('-f state="$ETAT" -f context="$NOM"'), 3);
  assert.equal(occurrences('-f target_url="$RUN${JOB:+/job/$JOB}"'), 3);
});
