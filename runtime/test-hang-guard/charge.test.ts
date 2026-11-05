// The 2 s rule under load (#2463): a test that really exceeds 2 s of its own work is still over the limit,
// a fast test stretched by a saturated machine is not. The reporter itself is fed synthetic events.
import assert from "node:assert/strict";
import test from "node:test";
import { LIMITE_MS } from "../test/garde-duree/regle.ts";
import { juge } from "../test/garde-duree/reporteur.ts";
import { dureeSansCharge, etirement, FACTEUR_MAX, PAS_MS, Releve } from "./charge.ts";

// A reporter run over synthetic `test:pass` events; the exit code it sets is read then restored.
async function joue(duree: number, facteurSur: (ms: number) => number): Promise<{ sortie: string; code: number | string | undefined }> {
  const avant = process.exitCode;
  const evenements = [{ type: "test:pass", data: { name: "un test synthétique", nesting: 1, details: { type: "test", duration_ms: duree } } }];
  const source = (async function* () { yield* evenements; })();
  let sortie = "";
  for await (const morceau of juge(source, { facteurSur })) sortie += morceau;
  const code = process.exitCode;
  process.exitCode = avant;
  return { sortie, code };
}

test("the reporter fails a test that really waits past 2 s on a quiet machine", async () => {
  const { sortie, code } = await joue(2600, () => 1);
  assert.equal(code, 1);
  assert.match(sortie, /un test synthétique/);
});

test("the reporter lets a fast test stretched by a simulated saturated machine pass", async () => {
  const { sortie, code } = await joue(3000, () => 3); // 1 s of work, tripled
  assert.notEqual(code, 1);
  assert.doesNotMatch(sortie, /✖/);
});

test("the reporter still fails a test far past the limit whatever the load", async () => {
  const { code } = await joue(20_000, (ms) => (ms > 0 ? FACTEUR_MAX : 1));
  assert.equal(code, 1);
});


test("the factor is local to the window: load outside a test's span gives it no relief", () => {
  let t = 0;
  const releve = new Releve(() => t);
  for (let i = 1; i <= 40; i++) releve.enregistre(i * PAS_MS, i <= 20 ? 4 : 1); // saturated for the first second only
  t = 2000;
  assert.equal(releve.facteurSur(1000), 1); // the last second was quiet
  assert.equal(releve.facteurSur(2000), 2.5); // a window covering both halves averages them
  t = 1000;
  assert.equal(releve.facteurSur(1000), FACTEUR_MAX);
});

test("a window with no tick, a late timer and a broken value give the right stretch", () => {
  assert.equal(new Releve(() => 5000).facteurSur(1000), 1);
  assert.equal(etirement(PAS_MS), 1);
  assert.equal(etirement(PAS_MS * 3), 3);
  for (const v of [NaN, Infinity, -1, 0]) assert.equal(etirement(v), 1);
  assert.ok(dureeSansCharge(3000, 3) <= LIMITE_MS);
  assert.ok(dureeSansCharge(2500, 1) > LIMITE_MS);
});
