// Rejoue #2551 (PR #2552, le verrou des gates sous le bac à sable) : un
// changement technique des gates, CI verte, qui a fini en carte « merge by
// hand ». Le rejeu passe par le vrai tour de la station (`stationGitHub`) sur le
// faux GitHub : le second juge approuve, la livraison se merge sans carte de
// TODO ni `blocked-on-human` ; s'il refuse, elle repart chez un cook avec ses
// raisons, et rien n'est mergé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
import { FauxGitHub, type PR } from "./faux-github.ts";

const TICKET = 2551;
const FICHIERS = [".claude/brigade/gates.sh", ".github/workflows/tests.yml", "runtime/src/gates-verrou.ts"];
const GATES = [".claude/brigade/gates.sh", ".github/workflows/tests.yml"];

const commentairesDe = (faux: FauxGitHub) => [...faux.commentaires.values()].flat();
const secondsDe = (faux: FauxGitHub, pr: number) => (faux.commentaires.get(pr) ?? []).filter((c) => c.body.startsWith("<!-- brigade:second-judge"));

// Le ticket #2551 cuisiné, sa PR changeant les gates, CI verte (celle du faux).
async function livraison(faux: FauxGitHub, station: ReturnType<FauxGitHub["station"]>): Promise<PR> {
  faux.feu(TICKET);
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === TICKET);
  assert.ok(pr, "the cook delivered a PR");
  pr.fichiers = FICHIERS;
  return pr;
}

test("replay of #2551: a gates change with green CI is merged once the second judge approves, with no TODO card and no blocked-on-human label", async () => {
  const faux = new FauxGitHub();
  const a = faux.station("A");
  const pr = await livraison(faux, a);
  for (let i = 0; i < 5 && faux.mergee(TICKET) === undefined; i += 1) await a.tour();
  assert.equal(faux.mergee(TICKET)?.mergeePar, "A");
  assert.equal(faux.ticket(TICKET).state, "closed");
  // Le second juge a bien été sollicité, sur la tête mergée et sur les gates seules.
  assert.deepEqual(faux.secondsJugements, [{ station: "A", pr: pr.number, sha: pr.sha, juges: GATES }]);
  assert.match(secondsDe(faux, pr.number)[0]?.body ?? "", /verdict=approve/);
  // Ni carte de TODO, ni attente du chef, ni issue créée.
  assert.ok(!faux.ticket(TICKET).labels.has("blocked-on-human"));
  assert.ok(![...faux.tickets.values()].some((t) => t.labels.has("blocked-on-human")));
  assert.ok(!commentairesDe(faux).some((c) => /by hand|TODO/i.test(c.body)));
  assert.deepEqual(faux.creations, []);
});

test("replay of #2551: without the second judge's approval the same delivery is not merged — the approval is what merges it", async () => {
  const faux = new FauxGitHub();
  const a = faux.station("A", { jugerEnSecond: async () => ({ verdict: "request-changes", motif: "no" }) });
  await livraison(faux, a);
  for (let i = 0; i < 3; i += 1) await a.tour();
  assert.equal(faux.mergee(TICKET), undefined);
});

test("replay of #2551: when the second judge refuses, the delivery goes back to a cook with its reasons and is not merged", async () => {
  const faux = new FauxGitHub();
  const motif = "`gates.sh` no longer fails on a red check, and the ticket does not ask for it.";
  const a = faux.station("A", { jugerEnSecond: async () => ({ verdict: "request-changes", motif }) });
  const pr = await livraison(faux, a);
  for (let i = 0; i < 3 && secondsDe(faux, pr.number).length === 0; i += 1) await a.tour();
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(pr.merged, false);
  const renvoi = (faux.commentaires.get(TICKET) ?? []).find((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.match(renvoi?.body ?? "", /sent back to a cook \(1\/2\) — the second judge requested changes: `gates\.sh` no longer fails on a red check, and the ticket does not ask for it\./);
  assert.match(secondsDe(faux, pr.number)[0]?.body ?? "", /verdict=request-changes/);
  assert.ok(!faux.ticket(TICKET).labels.has(LABEL_IN_PASS), "it leaves the pass");
  // Renvoyé à un cook, pas au chef.
  assert.ok(!faux.ticket(TICKET).labels.has("blocked-on-human"));
  assert.ok(!commentairesDe(faux).some((c) => /by hand/.test(c.body)));
  assert.deepEqual(faux.creations, []);
});
