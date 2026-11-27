// Une base rouge dont la réparation a échoué attend le chef : sa ligne est dans le bloc
// `attend` que `status` écrit, et elle se lit telle quelle là où ce bloc est lu — dans ce que
// l'app en met à part du reste de `status` (awaiting.ts), et dans le second, qui relaie la sortie
// entière de `status` mot pour mot (commands/po.md, « À l'ouverture »). Au retour au vert,
// elle en est sortie, chez les deux. Ce que la box rend est la sortie de `status` de l'ancien runtime,
// recopiée telle qu'il l'écrivait (runtime/src/status.ts, supprimé avec lui, #4499).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAside, ticketsOf } from "../src/awaiting.ts";
import type { Reading } from "../src/box.ts";

const PARADE = "parade";

// Une cuisine dont la base est rouge depuis trois heures : rejouée, elle l'est restée, et son
// ticket de réparation a quitté le rail sans être servi. Ce que `status` en rendait.
const STATUS_RED = [
  "project    parade",
  "runtime    never started",
  "kitchen    open · breaker closed (0 failures in a row, opens at ?)",
  "base       RED since 3 h 00 ago on ba5e000 — the station takes no more tickets, the pass neither judges nor merges",
  "           gates replayed 3 h 00 ago: the base is still red",
  "           replay its gates without waiting for a commit: brigade <projet> base replay",
  "backup     NEVER DONE — is the timer `brigade-sauvegarde@parade` running?",
  "",
  "awaiting   1 decision awaits the chef — for 3 h 00",
  "  base  for 3 h 00  BASE RED on ba5e000, failing: tests du runtime en échec — its repair #501 left the rail without being served — to repair: fix the base by hand, or restart #501: set `fire` on it again, its issue reopened if needed; the pass replays it as soon as it moves, and the kitchen starts again on its own once green; a red that is not down to the code is replayed on the station: no app button for it yet",
  "end awaiting",
  "",
  "rail       empty",
  "",
  "cooks      none running",
  "",
  "consumed   in flight: nothing",
  "           5 h: nothing",
  "           24 h: nothing",
  "           what this project has launched, not the account's consumption: /usage gives it",
  "",
  "latest events",
  "  1  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  2  2026-10-14T07:00:00.000Z  parade  -  base.recheck-requested  pass  {}",
  "  3  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  4  2026-10-14T07:00:00.000Z  parade  -  base.repair-opening  pass  {\"sha\":\"ba5e0001ffff\"}",
  "  5  2026-10-14T07:00:00.000Z  parade  #501  base.repair-opened  pass  {\"sha\":\"ba5e0001ffff\",\"failures\":[\"tests du runtime en échec\"],\"reconciled\":false}",
  "  6  2026-10-14T07:00:00.000Z  parade  #501  ticket.arrived  github  {\"title\":\"Réparer la base `v2`\",\"priority\":0,\"createdAt\":\"2026-10-01T00:00:00Z\",\"url\":\"https://exemple.test/501\"}",
  "  7  2026-10-14T07:00:00.000Z  parade  #501  ticket.left  github  {\"reason\":\"closed\"}",
  "identity   GitHub — single identity, the machine's `gh`: the chef's account is the kitchen's, nothing reserves the merge for the pass",
  "           calls by identity: cook 0, pass 0, manager 0, chef's account 0",
  "Restarts (24h): 0",
  "blocked w/o q 0",
  "chef        not resolved yet — the kitchen resolves it when it runs",
  "",
  "todo       last 7 d: 0 entered — product 0 · design 0",
  "product role: OFF — 0/3 issues filed today — last run: never",
  "tickets: no measured ticket yet",
  "Ticket time: no measure yet",
  "on time     no merged ticket in the last 24 h",
  "taken-to-merged 24 h: not known — the ticket times of the clone cannot be read",
  "lost time    no data yet / 2 min",
  "vs estimate  no data yet / ×1.50",
  "first try    no data yet / 70%",
  "main repairs no data yet / 0.1 per merge",
  "repairs     0 repairs of main / 0 merged PRs = n/a (recent tickets)",
].join("\n") + "\n";
// La base est revenue au vert : la pass l'a contrôlée. Ce que `status` en rendait alors.
const STATUS_GREEN = [
  "project    parade",
  "runtime    never started",
  "kitchen    open · breaker closed (0 failures in a row, opens at ?)",
  "base       base re-checked on ba5e000 0 s ago, after the base moved past ba5e000: green, the hold is lifted",
  "backup     NEVER DONE — is the timer `brigade-sauvegarde@parade` running?",
  "",
  "awaiting   nothing awaits the chef",
  "end awaiting",
  "",
  "rail       empty",
  "",
  "cooks      none running",
  "",
  "consumed   in flight: nothing",
  "           5 h: nothing",
  "           24 h: nothing",
  "           what this project has launched, not the account's consumption: /usage gives it",
  "",
  "latest events",
  "  1  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  2  2026-10-14T07:00:00.000Z  parade  -  base.recheck-requested  pass  {}",
  "  3  2026-10-14T07:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0001ffff\",\"outcome\":\"red\",\"gates\":{\"outcome\":\"red\",\"code\":1,\"failures\":[\"FAIL  tests du runtime en échec\"],\"tail\":\"\"},\"tickets\":[]}",
  "  4  2026-10-14T07:00:00.000Z  parade  -  base.repair-opening  pass  {\"sha\":\"ba5e0001ffff\"}",
  "  5  2026-10-14T07:00:00.000Z  parade  #501  base.repair-opened  pass  {\"sha\":\"ba5e0001ffff\",\"failures\":[\"tests du runtime en échec\"],\"reconciled\":false}",
  "  6  2026-10-14T07:00:00.000Z  parade  #501  ticket.arrived  github  {\"title\":\"Réparer la base `v2`\",\"priority\":0,\"createdAt\":\"2026-10-01T00:00:00Z\",\"url\":\"https://exemple.test/501\"}",
  "  7  2026-10-14T07:00:00.000Z  parade  #501  ticket.left  github  {\"reason\":\"closed\"}",
  "  8  2026-10-14T10:00:00.000Z  parade  -  base.checked  pass  {\"sha\":\"ba5e0002ffff\",\"outcome\":\"green\",\"gates\":{\"outcome\":\"green\",\"code\":0,\"failures\":[],\"tail\":\"\"},\"tickets\":[]}",
  "identity   GitHub — single identity, the machine's `gh`: the chef's account is the kitchen's, nothing reserves the merge for the pass",
  "           calls by identity: cook 0, pass 0, manager 0, chef's account 0",
  "Restarts (24h): 0",
  "blocked w/o q 0",
  "chef        not resolved yet — the kitchen resolves it when it runs",
  "",
  "todo       last 7 d: 0 entered — product 0 · design 0",
  "product role: OFF — 0/3 issues filed today — last run: never",
  "tickets: no measured ticket yet",
  "Ticket time: no measure yet",
  "on time     no merged ticket in the last 24 h",
  "taken-to-merged 24 h: not known — the ticket times of the clone cannot be read",
  "lost time    no data yet / 2 min",
  "vs estimate  no data yet / ×1.50",
  "first try    no data yet / 70%",
  "main repairs no data yet / 0.1 per merge",
  "repairs     0 repairs of main / 0 merged PRs = n/a (recent tickets)",
].join("\n") + "\n";

const readEntry = (text: string): Reading => ({ projet: PARADE, demande: 1, a: "2026-10-14T10:00:00.000Z", sorties: [{ commande: "status", texte: text }] });
// La ligne de la base dans un texte : à deux espaces, nommée `base`, puis ce qu'elle dit.
const LINE = /^ {2}base {2}for 3 h 00 {2}BASE RED on ba5e000, failing: tests du runtime en échec — its repair #501 left the rail without being served — to repair: .*no app button for it yet$/m;
const linesOfBase = (text: string) => text.split("\n").filter((line) => line.startsWith("  base  "));

describe("une base rouge dont la réparation a échoué : la même ligne dans ce que l'app met à part et dans le second", () => {
  test("le second reçoit la sortie de `status`, qui porte la ligne dans le bloc `attend` ; l'app la met à part, mot pour mot, sans en faire un ticket", () => {
    const text = STATUS_RED;

    // Ce que le second relaie : la sortie entière, la ligne entre les bords du bloc.
    const start = text.indexOf("\nawaiting ");
    const end = text.indexOf("\nend awaiting\n");
    assert.match(text.slice(start, end), LINE);
    assert.match(text.slice(start, end), /^awaiting {3}1 decision awaits the chef — for 3 h 00$/m);
    const [line] = linesOfBase(text);

    // Ce que l'app en met à part : le même bloc, la même ligne — et rien d'elle dans le reste.
    const shownOne = putAside(readEntry(text));
    assert.ok("attend" in shownOne && shownOne.attend !== undefined);
    assert.deepEqual(linesOfBase(shownOne.attend), [line]);
    assert.deepEqual(shownOne.sorties.flatMap(({ texte: text }) => linesOfBase(text)), []);
    assert.deepEqual(ticketsOf(shownOne.attend), []);
  });

  test("la base revenue au vert, la ligne a quitté le bloc : ni le second ni l'app ne la lisent plus", () => {
    assert.equal(linesOfBase(STATUS_RED).length, 1);

    const text = STATUS_GREEN;
    assert.deepEqual(linesOfBase(text), []);
    const shownOne = putAside(readEntry(text));
    assert.ok("attend" in shownOne);
    assert.equal(shownOne.attend, "awaiting   nothing awaits the chef\nend awaiting\n");
  });
});
