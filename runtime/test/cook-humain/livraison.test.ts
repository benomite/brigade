// La PR d'un cook humain entre en pass comme celle d'un cook (#4276) : aucune station ne prend un ticket marqué
// `human-cook`, et sa PR ouverte reçoit `in-pass` — d'où la même pass la juge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enLivraisonDuTour, laisserAuxCooksHumains, livrerLaPRDuCookHumain } from "../../src/cook-humain/livraison.ts";
import { LimiteGitHubAtteinte } from "../../src/limite-github.ts";

type PRLue = { state: "open" | "closed"; merged: boolean } | null;

function client(prs: Record<number, PRLue | Error>) {
  const labels: Array<[number, string[]]> = [];
  const avertis: string[] = [];
  return {
    labels, avertis,
    github: {
      prOuverteDuTicket: async (ticket: number) => {
        const pr = prs[ticket] ?? null;
        if (pr instanceof Error) throw pr;
        return pr;
      },
      labelliser: async (ticket: number, posés: string[]) => void labels.push([ticket, posés]),
      avertir: (ligne: string) => void avertis.push(ligne),
    },
  };
}

test("the human's open pull request enters the pass: its ticket gets in-pass", async () => {
  const c = client({ 23: { state: "open", merged: false } });
  assert.equal(await livrerLaPRDuCookHumain(23, c.github), true);
  assert.deepEqual(c.labels, [[23, ["in-pass"]]]);
});

test("no pull request, a closed one or a merged one: nothing enters the pass", async () => {
  const c = client({ 24: { state: "closed", merged: false }, 25: { state: "open", merged: true } });
  assert.equal(await livrerLaPRDuCookHumain(23, c.github), false);
  assert.equal(await livrerLaPRDuCookHumain(24, c.github), false);
  assert.equal(await livrerLaPRDuCookHumain(25, c.github), false);
  assert.deepEqual(c.labels, []);
});

test("the tickets marked for a human cook leave the free tickets of the turn; the others stay, in their order", async () => {
  const c = client({ 23: { state: "open", merged: false } });
  const libres = [
    { number: 21, labels: ["fire"] },
    { number: 23, labels: ["fire", "human-cook"] },
    { number: 22, labels: ["fire", "prio:1"] },
    { number: 24, labels: ["fire", "human-cook"] },
  ];
  assert.equal(await laisserAuxCooksHumains(libres, c.github), true);
  assert.deepEqual(libres.map(({ number }) => number), [21, 22]);
  assert.deepEqual(c.labels, [[23, ["in-pass"]]]);
});

test("with no human pull request open, nothing enters and nothing is said", async () => {
  const c = client({});
  const libres = [{ number: 24, labels: ["fire", "human-cook"] }];
  assert.equal(await laisserAuxCooksHumains(libres, c.github), false);
  assert.deepEqual(libres, []);
  assert.deepEqual([c.labels, c.avertis], [[], []]);
});

test("a pull request that cannot be read is said, and read again at the next turn; the GitHub limit stops the turn", async () => {
  const c = client({ 23: new Error("gh: 502"), 24: { state: "open", merged: false } });
  const libres = [{ number: 23, labels: ["human-cook"] }, { number: 24, labels: ["human-cook"] }];
  assert.equal(await laisserAuxCooksHumains(libres, c.github), true);
  assert.deepEqual(c.avertis, ["the pull request of #23, marked for a human cook, could not be read — gh: 502"]);
  assert.deepEqual(c.labels, [[24, ["in-pass"]]]);

  const limite = client({ 23: new LimiteGitHubAtteinte(0, 0) });
  await assert.rejects(laisserAuxCooksHumains([{ number: 23, labels: ["human-cook"] }], limite.github), LimiteGitHubAtteinte);
});

test("the station's turn reads the open pull request from its snapshot, or else from the ticket's branch", async () => {
  const lues: string[] = [];
  const pr = { state: "open" as const, merged: false };
  const avecInstantane = enLivraisonDuTour({
    prOuverteDuTicket: async (n) => (lues.push(`instantane ${n}`), pr),
    prDuTicket: async (n) => (lues.push(`branche ${n}`), pr),
    labelliser: async (n, l) => void lues.push(`label ${n} ${l.join(",")}`),
  });
  assert.equal(await livrerLaPRDuCookHumain(23, avecInstantane), true);
  const sansInstantane = enLivraisonDuTour({ prDuTicket: async (n) => (lues.push(`branche ${n}`), pr), labelliser: async () => {} });
  await sansInstantane.prOuverteDuTicket(24);
  assert.deepEqual(lues, ["instantane 23", "label 23 in-pass", "branche 24"]);
});
