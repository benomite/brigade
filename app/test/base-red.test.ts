// Une base rouge dont la réparation a échoué attend le chef : sa ligne est dans le bloc
// `attend` que `status` écrit, et elle se lit telle quelle là où ce bloc est lu — dans ce que
// l'app en met à part du reste de `status` (awaiting.ts), et dans le second, qui relaie la sortie
// entière de `status` mot pour mot (commands/po.md, « À l'ouverture »). Au retour au vert,
// elle en est sortie, chez les deux. Ce que la box rend est écrit ici par le runtime lui-même.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as status } from "../../runtime/src/status.ts";
import { putAPart, ticketsOf } from "../src/awaiting.ts";
import type { Reading } from "../src/box.ts";

const PARADE = "parade";
const HOUR_MS = 3_600_000;

// Une cuisine dont la base est rouge depuis trois heures : rejouée, elle l'est restée, et son
// ticket de réparation a quitté le rail sans être servi. `status` : ce que la box en rend.
function kitchen(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-base-rouge-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = ouvrirJournal(directory, { maintenant: () => new Date(Date.now() - 3 * HOUR_MS) });
  const note = (done: Fait, ticket: number | null = null, author = "pass") => log.ajouter({ project: PARADE, ticket, author, ...done });
  const gates = { outcome: "red" as const, code: 1, failures: ["FAIL  tests du runtime en échec"], tail: "" };
  note({ type: "base.checked", payload: { sha: "ba5e0001ffff", outcome: "red", gates, tickets: [] } });
  note({ type: "base.recheck-requested", payload: {} });
  note({ type: "base.checked", payload: { sha: "ba5e0001ffff", outcome: "red", gates, tickets: [] } });
  note({ type: "base.repair-opening", payload: { sha: "ba5e0001ffff" } });
  note({ type: "base.repair-opened", payload: { sha: "ba5e0001ffff", failures: ["tests du runtime en échec"], reconciled: false } }, 501);
  note({ type: "ticket.arrived", payload: { title: "Réparer la base `v2`", priority: 0, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/501" } }, 501, "github");
  note({ type: "ticket.left", payload: { reason: "closed" } }, 501, "github");
  log.fermer();
  return {
    status: () => {
      let text = "";
      const write = (line: string) => void (text += `${line}\n`);
      status({ args: [], env: { BRIGADE_STATE_DIR: directory }, dire: write, redire: write });
      return text;
    },
    // La base est revenue au vert : la pass l'a contrôlée.
    verdir: () => {
      const reopened = ouvrirJournal(directory);
      reopened.ajouter({ project: PARADE, ticket: null, author: "pass", type: "base.checked", payload: { sha: "ba5e0002ffff", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "" }, tickets: [] } });
      reopened.fermer();
    },
  };
}

const readEntry = (text: string): Reading => ({ projet: PARADE, demande: 1, a: "2026-10-14T10:00:00.000Z", sorties: [{ commande: "status", texte: text }] });
// La ligne de la base dans un texte : à deux espaces, nommée `base`, puis ce qu'elle dit.
const LINE = /^ {2}base {2}for 3 h 00 {2}BASE RED on ba5e000, failing: tests du runtime en échec — its repair #501 left the rail without being served — to repair: .*no app button for it yet$/m;
const linesOfBase = (text: string) => text.split("\n").filter((line) => line.startsWith("  base  "));

describe("une base rouge dont la réparation a échoué : la même ligne dans ce que l'app met à part et dans le second", () => {
  test("le second reçoit la sortie de `status`, qui porte la ligne dans le bloc `attend` ; l'app la met à part, mot pour mot, sans en faire un ticket", (t) => {
    const { status } = kitchen(t);
    const text = status();

    // Ce que le second relaie : la sortie entière, la ligne entre les bords du bloc.
    const start = text.indexOf("\nawaiting ");
    const end = text.indexOf("\nend awaiting\n");
    assert.match(text.slice(start, end), LINE);
    assert.match(text.slice(start, end), /^awaiting {3}1 decision awaits the chef — for 3 h 00$/m);
    const [line] = linesOfBase(text);

    // Ce que l'app en met à part : le même bloc, la même ligne — et rien d'elle dans le reste.
    const shownOne = putAPart(readEntry(text));
    assert.ok("attend" in shownOne && shownOne.attend !== undefined);
    assert.deepEqual(linesOfBase(shownOne.attend), [line]);
    assert.deepEqual(shownOne.sorties.flatMap(({ texte: text }) => linesOfBase(text)), []);
    assert.deepEqual(ticketsOf(shownOne.attend), []);
  });

  test("la base revenue au vert, la ligne a quitté le bloc : ni le second ni l'app ne la lisent plus", (t) => {
    const { status, verdir } = kitchen(t);
    assert.equal(linesOfBase(status()).length, 1);

    verdir();
    const text = status();
    assert.deepEqual(linesOfBase(text), []);
    const shownOne = putAPart(readEntry(text));
    assert.ok("attend" in shownOne);
    assert.equal(shownOne.attend, "awaiting   nothing awaits the chef\nend awaiting\n");
  });
});
