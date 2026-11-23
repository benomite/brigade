// Invariant 2 du rail (#4026) : le même échec sur le même commit n'est ni jugé
// ni relancé deux fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avecLaTete } from "../../src/invariants/meme-echec.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const echecs = (faux: FauxGitHub, numero: number) => (faux.commentaires.get(numero) ?? []).filter((c) => c.body.startsWith("<!-- brigade:echec")).map((c) => c.body);

test("the stop is written on the ticket, and the ticket is set aside for the supervisor; a ticket without a PR names no commit, and is relaunched as before", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  const pr = faux.prOuverte(["runtime/src/a.ts"], "cook/1-abcdef01");
  pr.issue = 1;
  faux.feu(3, CALIBRE);
  let fois = 0;
  const a = faux.station("A", { places: 2, sauter: () => {}, avertir: () => {}, cuisiner: async (issue) => ({ echec: issue === 1 ? "tests red" : `failure ${(fois += 1)}` }) });
  for (let i = 0; i < 3; i++) {
    await a.tour();
    await a.calme();
  }
  assert.match(echecs(faux, 1)[0] ?? "", new RegExp(`^<!-- brigade:echec n=1${avecLaTete(pr.sha)} -->`), "the failure names the commit it left");
  const arret = (faux.commentaires.get(1) ?? []).map((c) => c.body).find((body) => /invariant 2/i.test(body)) ?? "";
  assert.match(arret, new RegExp(`relaunched on commit \`${pr.sha.slice(0, 7)}\` of PR #${pr.number}[\\s\\S]*stopped it[\\s\\S]*set-aside:failures`));
  assert.ok(faux.ticket(1).labels.has("set-aside:failures"));
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 1).length, 1);
  // Sans PR : ni tête dite, ni arrêt — ses essais comptent comme avant.
  assert.equal(fois, 3);
  assert.deepEqual(echecs(faux, 3).slice(0, 2).map((body) => body.split("\n")[0]), ["<!-- brigade:echec n=1 -->", "<!-- brigade:echec n=2 -->"]);
});

test("a cook that moved its PR's head before failing is relaunched on the new head, and stopped only when it fails on the same one", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  const pr = faux.prOuverte(["runtime/src/a.ts"], "cook/1-abcdef01");
  pr.issue = 1;
  let fois = 0;
  const a = faux.station("A", {
    places: 1,
    sauter: () => {},
    avertir: () => {},
    cuisiner: async () => {
      fois += 1;
      // Le premier pousse un commit, puis s'arrête ; le second ne pousse rien.
      if (fois === 1) pr.sha = faux.sha();
      return { echec: `failure ${fois}` };
    },
  });
  for (let i = 0; i < 5; i++) {
    await a.tour();
    await a.calme();
  }
  assert.equal(fois, 2, "relaunched once on the new head, then stopped");
  assert.doesNotMatch(echecs(faux, 1)[0] ?? "", / sha=/, "the first failure left another commit than it started from");
  assert.match(echecs(faux, 1)[1] ?? "", new RegExp(`${avecLaTete(pr.sha)} -->`));
});

test("a ticket cooked on this station is not stopped, even when its last failure names its PR's head and its labels no longer say it is taken", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  const pr = faux.prOuverte(["runtime/src/a.ts"], "cook/1-abcdef01");
  pr.issue = 1;
  let finir = () => {};
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: () => new Promise((fini) => void (finir = () => fini({ echec: "not the point" }))) });
  await a.tour();
  assert.equal(faux.cuissons.length, 1);
  faux.ticket(1).labels.delete("taken");
  faux.poster(1, "A", `<!-- brigade:echec n=1${avecLaTete(pr.sha)} -->\nA — tests red`);
  await a.tour();
  assert.ok(!(faux.commentaires.get(1) ?? []).some((c) => /invariant 2/i.test(c.body)), "a cook in cooking is not stopped");
  finir();
  await a.calme();
});
