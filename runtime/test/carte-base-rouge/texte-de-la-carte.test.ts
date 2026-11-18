import assert from "node:assert/strict";
import { test } from "node:test";
import { carteBaseRouge } from "../../src/carte-base-rouge/carte-base-rouge.ts";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";

type Ticket = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; motif?: string };
const SHA = "a".repeat(40);
const ROUGE = [{ name: "tests", outcome: "red" as const, url: "https://github.com/o/r/actions/runs/1/job/1" }];

test("the card says since when main is red in UTC, which test fails with its error, and one line per repair ticket", async () => {
  const tickets: Ticket[] = [];
  const motifs = ["its cook failed on a timeout", "the delivery stayed red", "no delivery after three runs"];
  motifs.forEach((motif, i) => tickets.push({ number: 101 + i, title: "Repair main: tests red on aaaaaaa", body: marqueDeBaseRouge(SHA), labels: ["repair-main", "set-aside:failures"], state: "open", motif }));
  const cartes: Ticket[] = [];
  const github = {
    teteDeLaBase: async () => SHA,
    instantDuCommit: async () => "2026-11-03T08:05:00Z",
    journalDuCheck: async () => "not ok 1 - the clock\nAssertionError: expected 2 to equal 3\n##[error]Process completed with exit code 1.",
    reparations: async () => tickets.map((t) => ({ ...t })),
    motifDeLaMiseDeCote: async (n: number) => tickets.find((t) => t.number === n)?.motif ?? null,
    cartes: async () => cartes.map((c) => ({ ...c })),
    creerCarte: async ({ titre, corps }: { titre: string; corps: string }) => {
      cartes.push({ number: 500, title: titre, body: corps, labels: ["chef-todo"], state: "open" });
      return 500;
    },
    ecrireCorps: async (_n: number, corps: string) => void (cartes[0]!.body = corps),
    fermerIssue: async () => {},
  };
  await carteBaseRouge({ github, base: "main", maintenant: () => new Date("2026-11-03T12:00:00Z") })(ROUGE);
  assert.equal(cartes.length, 1);
  const texte = cartes[0]!.body;
  assert.match(texte, /2026-11-03 08:05 UTC/);
  assert.match(texte, /tests/);
  assert.match(texte, /AssertionError: expected 2 to equal 3/);
  motifs.forEach((motif, i) => {
    const lignes = texte.split("\n").filter((ligne) => ligne.includes(`#${101 + i}`));
    assert.equal(lignes.length, 1, `one line for #${101 + i}`);
    assert.ok((lignes[0] ?? "").includes(motif), `the line of #${101 + i} says why it was set aside`);
  });
});
