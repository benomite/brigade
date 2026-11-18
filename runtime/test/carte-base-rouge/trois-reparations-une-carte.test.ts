import assert from "node:assert/strict";
import { test } from "node:test";
import { carteBaseRouge } from "../../src/carte-base-rouge/carte-base-rouge.ts";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";

// The module reads the repair tickets and the cards through this port, and writes the one card.
type Ticket = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; motif?: string };
const SHA = "a".repeat(40);
const ROUGE = [{ name: "tests", outcome: "red" as const, url: "https://github.com/o/r/actions/runs/1/job/1" }];

function depot() {
  const tickets: Ticket[] = [];
  let suivant = 500;
  const github = {
    teteDeLaBase: async () => SHA,
    instantDuCommit: async () => "2026-11-03T08:05:00Z",
    journalDuCheck: async () => "not ok 1 - the clock\nAssertionError: expected 2 to equal 3\n##[error]Process completed with exit code 1.",
    reparations: async () => tickets.filter((t) => t.title.startsWith("Repair main:") && t.labels.includes("repair-main")).map((t) => ({ ...t })),
    motifDeLaMiseDeCote: async (n: number) => tickets.find((t) => t.number === n)?.motif ?? null,
    cartes: async () => tickets.filter((t) => t.labels.includes("chef-todo")).map((t) => ({ ...t })),
    creerCarte: async ({ titre, corps }: { titre: string; corps: string }) => {
      tickets.push({ number: suivant, title: titre, body: corps, labels: ["chef-todo"], state: "open" });
      return suivant++;
    },
    ecrireCorps: async (n: number, corps: string) => {
      const t = tickets.find((x) => x.number === n);
      if (t) t.body = corps;
    },
    fermerIssue: async (n: number) => {
      const t = tickets.find((x) => x.number === n);
      if (t) t.state = "closed";
    },
  };
  const reparation = (motif: string, ecartee = true, sha = SHA) => {
    const number = 100 + tickets.length;
    tickets.push({ number, title: `Repair main: tests red on ${sha.slice(0, 7)}`, body: marqueDeBaseRouge(sha), labels: ["repair-main", ...(ecartee ? ["set-aside:failures"] : [])], state: "open", motif });
    return number;
  };
  const ouvertes = () => tickets.filter((t) => t.labels.includes("chef-todo") && t.state === "open");
  const cuisine = () => carteBaseRouge({ github, base: "main", maintenant: () => new Date("2026-11-03T12:00:00Z") });
  return { reparation, ouvertes, cuisine };
}

test("after 3 set-aside repair tickets for one red state, exactly one TODO card exists for the chef", async () => {
  const d = depot();
  d.reparation("its cook failed on a timeout");
  d.reparation("the delivery stayed red");
  const passer = d.cuisine();
  await passer(ROUGE);
  assert.equal(d.ouvertes().length, 0, "two set-aside repairs do not make a card");
  d.reparation("no delivery after three runs");
  await passer(ROUGE);
  assert.equal(d.ouvertes().length, 1);
});

test("repair tickets of another red state, or not set aside, do not count", async () => {
  const d = depot();
  d.reparation("a", true, "b".repeat(40));
  d.reparation("b", true, "b".repeat(40));
  d.reparation("c", false);
  d.reparation("d", true);
  d.reparation("e", true);
  await d.cuisine()(ROUGE);
  assert.equal(d.ouvertes().length, 0);
});
