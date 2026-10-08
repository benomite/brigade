// Les gates du projet, jouées dans un worktree : de vrais scripts, écrits par
// le test.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aDesGates, jouerGates } from "../src/gates.ts";
import { ENV_ENFANT, repertoireTemporaire } from "./outils.ts";

function worktree(t: TestContext, scripts: { gates?: string; setup?: string }) {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, ".claude/brigade"), { recursive: true });
  for (const [nom, corps] of [["gates.sh", scripts.gates], ["worktree-setup.sh", scripts.setup]] as const) {
    if (corps === undefined) continue;
    writeFileSync(join(racine, ".claude/brigade", nom), `#!/usr/bin/env bash\n${corps}\n`);
    chmodSync(join(racine, ".claude/brigade", nom), 0o755);
  }
  return racine;
}

const jouer = (racine: string, delaiMs = 10_000) => jouerGates({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs });

// Chaque test a son worktree : ils se jouent de front.
describe("les gates", { concurrency: 8 }, () => {
  test("des gates qui sortent en 0 sont vertes", async (t) => {
    const racine = worktree(t, { gates: 'echo "ok    tout va bien"; echo "gates : VERT"' });

    assert.deepEqual(await jouer(racine), { outcome: "green", code: 0, failures: [], tail: "ok    tout va bien\ngates : VERT" });
  });

  test("des gates rouges disent lesquelles : leurs lignes FAIL, leur code, la fin de leur sortie", async (t) => {
    const racine = worktree(t, {
      gates: 'echo "ok    JSON valide"; echo "FAIL  tests du runtime en échec" >&2; echo "FAIL  miroir périmé" >&2; echo "gates : ROUGE" >&2; exit 3',
    });

    const gates = await jouer(racine);

    assert.deepEqual([gates.outcome, gates.code], ["red", 3]);
    assert.deepEqual(gates.failures, ["FAIL  tests du runtime en échec", "FAIL  miroir périmé"]);
    assert.match(gates.tail, /ok {4}JSON valide\n.*gates : ROUGE$/s);
  });

  test("les gates reçoivent le worktree en argument et s'y jouent", async (t) => {
    const racine = worktree(t, { gates: 'echo "arg=$1"; echo "cwd=$(pwd -P)"' });

    const gates = await jouer(racine);

    assert.match(gates.tail, new RegExp(`arg=${racine}\n`));
    assert.match(gates.tail, /cwd=.*brigade-test-/);
  });

  test("le setup du worktree passe d'abord, avec le numéro du ticket, et ce qu'il exporte vaut pour les gates", async (t) => {
    const racine = worktree(t, {
      setup: 'echo "setup $1 $2" >&2; printf "export BASE_DE_TEST=%q\\n" "base du ticket $1"',
      gates: 'echo "vu=$BASE_DE_TEST"',
    });

    const gates = await jouer(racine);

    assert.equal(gates.outcome, "green");
    assert.equal(gates.tail, `setup 17 ${racine}\nvu=base du ticket 17`);
  });

  test("un setup en échec rend les gates rouges sans les jouer", async (t) => {
    const racine = worktree(t, { setup: 'echo "npm ci a échoué" >&2; exit 1', gates: 'echo "gates jouées"' });

    const gates = await jouer(racine);

    assert.equal(gates.outcome, "red");
    assert.match(gates.failures[0] ?? "", /^FAIL {2}setup du worktree en échec/);
    assert.doesNotMatch(gates.tail, /gates jouées/);
  });

  test("des gates qui dépassent leur plafond sont arrêtées, avec ce qu'elles ont lancé", async (t) => {
    const racine = worktree(t, { gates: "sleep 30 & wait" });

    const debut = Date.now();
    const gates = await jouer(racine, 200);

    assert.deepEqual([gates.outcome, gates.code], ["timeout", null]);
    // Le `sleep` tient la sortie des gates : s'il leur survivait, elles ne
    // rendraient rien avant trente secondes.
    assert.ok(Date.now() - debut < 5000);
  });

  test("le runtime qui s'arrête abandonne les gates en cours", async (t) => {
    const racine = worktree(t, { gates: "sleep 30" });
    const abandon = new AbortController();

    const enCours = jouerGates({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs: 60_000, signal: abandon.signal });
    setTimeout(() => abandon.abort(), 50);

    assert.equal((await enCours).outcome, "red");
  });

  test("des gates non exécutables sont rouges, et le disent", async (t) => {
    const racine = worktree(t, { gates: "exit 0" });
    chmodSync(join(racine, ".claude/brigade/gates.sh"), 0o644);

    const gates = await jouer(racine);

    assert.equal(gates.outcome, "red");
    assert.match(gates.tail, /gates\.sh/);
  });

  test("un worktree sans gates se reconnaît avant de rien jouer", (t) => {
    assert.equal(aDesGates(worktree(t, {})), false);
    assert.equal(aDesGates(worktree(t, { gates: "exit 0" })), true);
  });
});
