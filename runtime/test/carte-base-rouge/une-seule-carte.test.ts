import assert from "node:assert/strict";
import { test } from "node:test";
import { carteBaseRouge } from "../../src/carte-base-rouge/carte-base-rouge.ts";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";

type Ticket = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; motif?: string };
const SHA = "a".repeat(40);
const ROUGE = [{ name: "tests", outcome: "red" as const, url: "https://github.com/o/r/actions/runs/1/job/1" }];

test("a second run does not create a second card, and a new failure updates the same card", async () => {
  const tickets: Ticket[] = [];
  const reparation = (motif: string) => {
    const number = 101 + tickets.length;
    tickets.push({ number, title: "Repair main: tests red on aaaaaaa", body: marqueDeBaseRouge(SHA), labels: ["repair-main", "set-aside:failures"], state: "open", motif });
    return number;
  };
  const cartes: Ticket[] = [];
  const github = {
    teteDeLaBase: async () => SHA,
    instantDuCommit: async () => "2026-11-03T08:05:00Z",
    journalDuCheck: async () => "not ok 1 - the clock\nAssertionError: expected 2 to equal 3",
    reparations: async () => tickets.map((t) => ({ ...t })),
    motifDeLaMiseDeCote: async (n: number) => tickets.find((t) => t.number === n)?.motif ?? null,
    cartes: async () => cartes.map((c) => ({ ...c })),
    creerCarte: async ({ titre, corps }: { titre: string; corps: string }) => {
      cartes.push({ number: 500 + cartes.length, title: titre, body: corps, labels: ["chef-todo"], state: "open" });
      return 500 + cartes.length - 1;
    },
    ecrireCorps: async (n: number, corps: string) => void (cartes.find((c) => c.number === n)!.body = corps),
    fermerIssue: async () => {},
  };
  reparation("one");
  reparation("two");
  reparation("three");
  const passer = carteBaseRouge({ github, base: "main", maintenant: () => new Date("2026-11-03T12:00:00Z") });
  await passer(ROUGE);
  await passer(ROUGE);
  assert.equal(cartes.length, 1);
  const avant = cartes[0]!.body;
  const quatrieme = reparation("a fourth one, set aside too");
  await passer(ROUGE);
  assert.equal(cartes.length, 1, "same card, not a second");
  assert.equal(cartes[0]!.number, 500);
  assert.notEqual(cartes[0]!.body, avant);
  assert.match(cartes[0]!.body, new RegExp(`#${quatrieme}\\b.*a fourth one`));
  assert.equal(cartes[0]!.state, "open");
});
