import assert from "node:assert/strict";
import { test } from "node:test";
import { carteBaseRouge } from "../../src/carte-base-rouge/carte-base-rouge.ts";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";

type Ticket = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; motif?: string };
const SHA = "a".repeat(40);
const ROUGE = [{ name: "tests", outcome: "red" as const, url: "https://github.com/o/r/actions/runs/1/job/1" }];

test("while the kitchen is held on base-red, the chef's TODO is never empty of this card", async () => {
  const tickets: Ticket[] = [];
  const reparation = (motif: string) =>
    tickets.push({ number: 101 + tickets.length, title: "Repair main: tests red on aaaaaaa", body: marqueDeBaseRouge(SHA), labels: ["repair-main", "set-aside:failures"], state: "open", motif });
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
    fermerIssue: async (n: number) => void (cartes.find((c) => c.number === n)!.state = "closed"),
  };
  const ouvertes = () => cartes.filter((c) => c.labels.includes("chef-todo") && c.state === "open");
  reparation("one");
  reparation("two");
  reparation("three");
  const passer = carteBaseRouge({ github, base: "main", maintenant: () => new Date("2026-11-03T12:00:00Z") });
  // Main stays red: the repairs close and others open, the card stays in the TODO at every run.
  for (let tour = 0; tour < 4; tour++) {
    await passer(ROUGE);
    assert.equal(ouvertes().length, 1, `run ${tour}: the card is in the TODO`);
    for (const t of tickets) t.state = "closed";
    reparation(`again ${tour}`);
  }
  // The card closed by hand while main is still red comes back at the next run, and a restarted station finds the same one.
  cartes[0]!.state = "closed";
  await carteBaseRouge({ github, base: "main", maintenant: () => new Date("2026-11-03T12:05:00Z") })(ROUGE);
  assert.equal(ouvertes().length, 1, "the card is back while main is red");
  assert.equal(cartes.length, 1, "it is the same card, reopened");
});
