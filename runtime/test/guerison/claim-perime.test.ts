// The release of a stale claim (#2751), against a fake GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirGitHub } from "../../src/github.ts";
import { ouvrirClaimPerime } from "../../src/guerison/claim-perime.ts";
import { FauxGitHub } from "../cout-par-ticket/faux-github.ts";

const MINUTE = 60_000;

function cuisine() {
  const faux = new FauxGitHub("o/r");
  let horloge = 0;
  const github = ouvrirGitHub({ depot: faux.depot, transport: faux.transport, maintenant: () => horloge });
  const claim = ouvrirClaimPerime({ github, maintenant: () => horloge });
  return { faux, claim, avancer: (minutes: number) => (horloge += minutes * MINUTE), github };
}

const existe = (c: ReturnType<typeof cuisine>, n: number) => { try { c.faux.issue(n); return true; } catch { return false; } };

// The tickets as the tick reads them: the fake's issues, labels as they stand.
async function passer(c: ReturnType<typeof cuisine>, vivants: number[] = []) {
  const tickets = [7, 8].flatMap((n) => (existe(c, n) ? [{ number: n, labels: c.faux.issue(n).labels }] : []));
  return c.claim.passer(tickets, new Set(vivants));
}

test("a taken ticket with no live cook for more than 45 minutes loses taken, keeps fire, and gets a comment", async () => {
  const c = cuisine();
  c.faux.feu(7, ["fire", "taken"]);
  await passer(c);
  c.avancer(46);
  const bilan = await passer(c);
  assert.deepEqual(bilan.liberes, [7]);
  assert.deepEqual(c.faux.issue(7).labels, ["fire"]);
  const commentaires = await c.github.commentaires(7);
  assert.equal(commentaires.length, 1);
  assert.match(commentaires[0]?.body ?? "", /released the claim/);
  assert.match(commentaires[0]?.body ?? "", /no live cook/);
});

test("a taken ticket with no live cook for 44 minutes is left untouched", async () => {
  const c = cuisine();
  c.faux.feu(7, ["fire", "taken"]);
  await passer(c);
  c.avancer(44);
  const bilan = await passer(c);
  assert.deepEqual(bilan.liberes, []);
  assert.deepEqual(c.faux.issue(7).labels, ["fire", "taken"]);
  assert.deepEqual(await c.github.commentaires(7), []);
});

test("a taken ticket whose cook is alive is left untouched, whatever its age", async () => {
  const c = cuisine();
  c.faux.feu(7, ["fire", "taken"]);
  await passer(c, [7]);
  c.avancer(600);
  const bilan = await passer(c, [7]);
  assert.deepEqual(bilan.liberes, []);
  assert.deepEqual(c.faux.issue(7).labels, ["fire", "taken"]);
});

test("the clock restarts when the cook comes back", async () => {
  const c = cuisine();
  c.faux.feu(7, ["fire", "taken"]);
  await passer(c);
  c.avancer(40);
  await passer(c, [7]);
  c.avancer(40);
  assert.deepEqual((await passer(c)).liberes, []);
  c.avancer(46);
  assert.deepEqual((await passer(c)).liberes, [7]);
});

test("a ticket that is not taken is never touched", async () => {
  const c = cuisine();
  c.faux.feu(8, ["fire"]);
  await passer(c);
  c.avancer(100);
  assert.deepEqual((await passer(c)).liberes, []);
  assert.deepEqual(c.faux.issue(8).labels, ["fire"]);
});
