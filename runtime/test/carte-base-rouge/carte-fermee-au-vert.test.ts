import assert from "node:assert/strict";
import { test } from "node:test";
import { carteBaseRouge } from "../../src/carte-base-rouge/carte-base-rouge.ts";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";

type Ticket = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; motif?: string };
const SHA = "a".repeat(40);
const ROUGE = [{ name: "tests", outcome: "red" as const, url: "https://github.com/o/r/actions/runs/1/job/1" }];
const VERT = [{ name: "tests", outcome: "green" as const }];

test("when main turns green, the card is closed", async () => {
  const tickets: Ticket[] = [1, 2, 3].map((i) => ({ number: 100 + i, title: "Repair main: tests red on aaaaaaa", body: marqueDeBaseRouge(SHA), labels: ["repair-main", "set-aside:failures"], state: "open", motif: `reason ${i}` }));
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
  const passer = carteBaseRouge({ github, base: "main", maintenant: () => new Date("2026-11-03T12:00:00Z") });
  await passer(ROUGE);
  assert.equal(cartes.filter((c) => c.state === "open").length, 1);
  await passer(VERT);
  assert.equal(cartes.filter((c) => c.state === "open").length, 0);
  assert.equal(cartes.length, 1, "closed, not deleted");
  await passer(VERT);
  assert.equal(cartes.length, 1, "a second green run writes nothing more");
});
