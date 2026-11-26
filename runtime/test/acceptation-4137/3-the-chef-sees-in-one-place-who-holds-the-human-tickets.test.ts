// #4137, critère 3 : le chef voit en un seul endroit les tickets qui attendent un cook humain, et qui.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { faits, lireEtat } from "../../src/etat.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { confierAUnHumain } from "../../src/sortie-attente-capacite/sortie.ts";
import { fauxGitHub, issue, montre } from "../aides/cuisine.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const CORPS = "## Context\n\nSign the contract.\n\n## Acceptance criteria\n\n- the contract is signed\n";

// Des tickets ordinaires du rail : aucun n attend une capacité, ils sont seulement du travail qu un humain peut seul faire.
function atelier(t: TestContext, tickets: number[]) {
  const heure = montre();
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: heure.maintenant });
  aArreter(t, () => journal.fermer());
  ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: heure.maintenant });
  const gh = fauxGitHub(...tickets.map((n) => issue(n, ["fire"], { title: `Ticket ${n}` })));
  for (const n of tickets) gh.decrire(n, { body: CORPS });
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: PROJET, ticket, author, ...fait });
  for (const n of tickets) noter(n, { type: "ticket.arrived", payload: { title: `Ticket ${n}`, priority: null, createdAt: `2026-10-01T00:00:${n}Z`, url: `https://github.com/acme/brigade/issues/${n}`, card: { waitsFor: [], zone: [`zone/${n}/`], problems: [] } } }, "github");
  return {
    journal, noter,
    marquer: (ticket: number, qui?: string) => confierAUnHumain(journal, gh.github, PROJET, ticket, qui),
    lire: () => faits(lireEtat(journal, heure.maintenant()), heure.maintenant()),
  };
}

test("facts lists, in one place, every ticket waiting on a human cook with who", async (t) => {
  const c = atelier(t, [23, 24, 25]);
  assert.equal((await c.marquer(23, "alice")).done, true);
  assert.equal((await c.marquer(25)).done, true);

  const attendus = (c.lire().attend ?? []).filter(({ tache }) => tache !== undefined).map(({ ticket, tache }) => [ticket, tache?.assignee]);
  assert.deepEqual(attendus.sort(), [[23, "alice"], [25, "chef"]]);
});
