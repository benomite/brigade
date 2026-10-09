// Les gates du projet, jouées dans un worktree : de vrais scripts, écrits par
// le test.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aDesGates, jouerGates, jouerSetup } from "../src/gates.ts";
import { ENV_ENFANT, mort, repertoireTemporaire } from "./outils.ts";

// Les scripts d'essai lancent un `sleep 30` : s'il tenait ce qu'on attend, rien
// ne reviendrait avant trente secondes. La borne dit « bien avant », pas « vite » :
// sur une machine chargée, un script d'une ligne prend parfois des secondes.
const SANS_ATTENDRE_LE_SLEEP_MS = 20_000;

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

const jouer = (racine: string, delaiMs = 60_000) => jouerGates({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs });

// Chaque test a son worktree : ils se jouent de front.
describe("les gates", { concurrency: 8 }, () => {
  test("ce que le runtime garde de la sortie du setup et des gates est masqué", async (t) => {
    const racine = worktree(t, {
      setup: 'echo "base prête : $DATABASE_URL" >&2; echo "export BASE=$DATABASE_URL/ticket_$1"',
      gates: 'echo "FAIL  connexion refusée à $BASE"; echo "gates : ROUGE"; exit 1',
    });
    const demande = {
      worktree: racine,
      ticket: 17,
      env: { ...ENV_ENFANT, DATABASE_URL: "postgres://dev:secret-de-dev@localhost" },
      delaiMs: 60_000,
      masquer: (texte: string) => texte.replaceAll("postgres://dev:secret-de-dev@localhost", "[secret:DATABASE_URL]"),
    };

    const setup = await jouerSetup(demande);
    assert.equal(setup.sortie, "base prête : [secret:DATABASE_URL]\n");
    // L'environnement, lui, porte la vraie valeur : c'est le cook qui s'en sert.
    assert.equal(setup.pret && setup.env.BASE, "postgres://dev:secret-de-dev@localhost/ticket_17");

    const gates = await jouerGates(demande);
    assert.deepEqual(gates.failures, ["FAIL  connexion refusée à [secret:DATABASE_URL]/ticket_17"]);
    assert.equal(gates.tail.includes("secret-de-dev"), false);
  });

  test("des gates qui sortent en 0 sont vertes", async (t) => {
    const racine = worktree(t, { gates: 'echo "ok    tout va bien"; echo "gates : VERT"' });

    assert.deepEqual(await jouer(racine), { outcome: "green", code: 0, failures: [], tail: "ok    tout va bien\ngates : VERT" });
  });

  test("les mesures que les gates déclarent sont relevées, la dernière valeur d'un nom l'emportant ; ce qui n'en est pas une est laissé", async (t) => {
    const racine = worktree(t, {
      gates: 'echo "MESURE  tests=203"; echo "MESURE tests_s=1,1"; echo "MESURE  tests=622"; echo "MESURE  Tests=9"; echo "MESURE  poids=lourd"; echo "ok    MESURE  x=1"',
    });

    assert.deepEqual((await jouer(racine)).measures, { tests: 622, tests_s: 1.1 });
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

  test("les gates écrivent sur un seul canal : ce que le runtime en garde est dans l'ordre où elles l'ont écrit", async (t) => {
    const racine = worktree(t, { gates: '[ /dev/fd/1 -ef /dev/fd/2 ] && echo "un seul canal" || echo "deux canaux"' });

    assert.equal((await jouer(racine)).tail, "un seul canal");
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

  test("un setup qui dépasse le plafond des gates les arrête avant qu'elles ne partent", async (t) => {
    const racine = worktree(t, { setup: "sleep 30", gates: 'echo "gates jouées"' });

    const gates = await jouer(racine, 200);

    assert.equal(gates.outcome, "timeout");
    assert.doesNotMatch(gates.tail, /gates jouées/);
  });

  test("des gates qui dépassent leur plafond sont arrêtées, avec ce qu'elles ont lancé", async (t) => {
    const racine = worktree(t, { gates: "sleep 30 & wait" });

    const debut = Date.now();
    const gates = await jouer(racine, 200);

    assert.deepEqual([gates.outcome, gates.code], ["timeout", null]);
    // Le `sleep` tient la sortie des gates : s'il leur survivait, elles ne
    // rendraient rien avant trente secondes.
    assert.ok(Date.now() - debut < SANS_ATTENDRE_LE_SLEEP_MS);
  });

  test("des gates vertes qui laissent un process en arrière-plan sont vertes dès leur fin, et ne le laissent pas vivre", async (t) => {
    const racine = worktree(t, { gates: 'sleep 30 & echo "pid=$!"; echo "gates : VERT"' });

    const debut = Date.now();
    const gates = await jouer(racine);

    assert.deepEqual([gates.outcome, gates.code], ["green", 0]);
    assert.match(gates.tail, /gates : VERT$/);
    assert.ok(Date.now() - debut < SANS_ATTENDRE_LE_SLEEP_MS);
    const pid = Number(/pid=(\d+)/.exec(gates.tail)?.[1]);
    await mort(pid);
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

const preparer = (racine: string, delaiMs = 60_000) => jouerSetup({ worktree: racine, ticket: 17, env: { ...ENV_ENFANT, DEJA_LA: "avant" }, delaiMs });

describe("le setup du worktree", { concurrency: 8 }, () => {
  test("un projet sans setup n'a rien à jouer : l'environnement est rendu tel quel", async (t) => {
    const racine = worktree(t, { gates: "exit 0" });

    assert.deepEqual(await preparer(racine), { pret: true, joue: false, env: { ...ENV_ENFANT, DEJA_LA: "avant" }, sortie: "", masques: 0 });
  });

  test("le setup reçoit le numéro du ticket et le worktree, s'y joue, et ce qu'il exporte s'ajoute à l'environnement", async (t) => {
    const racine = worktree(t, {
      setup: [
        'echo "setup $1 $2 dans $(pwd -P)" >&2',
        'printf "export BASE_DE_TEST=%q\\n" "base du ticket $1"',
        'printf "export PORT=%q\\n" "$((20000 + $1))"',
        'printf "export DEJA_LA=%q\\n" "après"',
        "printf \"export SUR_DEUX_LIGNES=%q\\n\" $'un\\ndeux'",
      ].join("\n"),
    });

    const setup = await preparer(racine);

    assert.equal(setup.pret, true);
    assert.deepEqual(setup.pret && setup.env, {
      ...ENV_ENFANT,
      BASE_DE_TEST: "base du ticket 17",
      PORT: "20017",
      DEJA_LA: "après",
      SUR_DEUX_LIGNES: "un\ndeux",
    });
    assert.match(setup.sortie, new RegExp(`^setup 17 ${racine} dans .*brigade-test-`));
  });

  test("un setup en échec le dit : son code, et ce qu'il a écrit", async (t) => {
    const racine = worktree(t, { setup: 'echo "export A_MOITIE=1"; echo "npm ci a échoué" >&2; exit 3' });

    assert.deepEqual(await preparer(racine), { pret: false, depasse: false, code: 3, sortie: "npm ci a échoué\n", masques: 0 });
  });

  test("un setup qui n'imprime pas que des exports est en échec : son contrat est rompu", async (t) => {
    const racine = worktree(t, { setup: 'echo "worktree prêt ("' });

    const setup = await preparer(racine);

    assert.equal(setup.pret, false);
  });

  test("un setup qui dépasse son plafond est arrêté, avec ce qu'il a lancé", async (t) => {
    const racine = worktree(t, { setup: "sleep 30 & wait" });

    const debut = Date.now();
    const setup = await preparer(racine, 200);

    assert.deepEqual([setup.pret, !setup.pret && setup.depasse], [false, true]);
    assert.ok(Date.now() - debut < SANS_ATTENDRE_LE_SLEEP_MS);
  });

  test("un setup ne laisse rien tourner derrière lui", async (t) => {
    const racine = worktree(t, { setup: 'sleep 30 >/dev/null 2>&1 & echo "pid=$!" >&2; echo "export PRET=1"' });

    const debut = Date.now();
    const setup = await preparer(racine);

    assert.equal(setup.pret && setup.env.PRET, "1");
    assert.ok(Date.now() - debut < SANS_ATTENDRE_LE_SLEEP_MS);
    await mort(Number(/pid=(\d+)/.exec(setup.sortie)?.[1]));
  });
});
