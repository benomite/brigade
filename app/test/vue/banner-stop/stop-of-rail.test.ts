// #3924 : la cuisine arrêtée, de la lecture du rail sur GitHub au bandeau en tête du rail — le chemin de production :
// `lireLeRailSurGithub`, `avecLeRail`, la sortie `facts` relue (`comprendre`), le tableau, puis le bandeau monté.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../../runtime/src/attente-du-rail/stations.ts";
import { understand, board, type Facts } from "../../../src/facts.ts";
import type { CallGitHub } from "../../../src/board/client.ts";
import type { BoardRead } from "../../../src/board/read.ts";
import { stopKitchenRead, stopOfRail, zoneHeldOf } from "../../../src/vue/banner-stop/stop-of-rail.ts";
import { mountTheBanner } from "../../../src/vue/banner-stop/banner-stop.js";
import { withTheRail, readTheRailOnGithub, type SignsOfLife } from "../../../src/vue/rail/github.ts";
import { corpsDuParking } from "../../../../runtime/src/attente-github/marque.ts";
import { Fake } from "../../helpers/false-vue.ts";

const REPOSITORY = "chef/parade";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const station: StationDuCompte = { name: "parade-box", lastSeen: "2026-11-20T11:59:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY] };
const SIGNS: SignsOfLife = { lus: [station] };
const EMPTY: BoardRead = {
  lu: true,
  depot: REPOSITORY,
  luLe: NOW.toISOString(),
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: NOW.toISOString(), dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [], cooks: [], attend: [], livres: [], stations: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const doc = { createElement: (balise: string) => new Fake(balise) };

type Issue = { numero: number; labels: readonly string[]; creeLe?: string; titre?: string; commentaires?: readonly Record<string, unknown>[]; feuLe?: string };
const CARD = (zone: string) => ({ id: 2, body: `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`, author_association: "OWNER", created_at: "2026-11-20T07:00:00Z" });
// Mis de côté par ses échecs : la station le parque (`parked`, #4260 ; d'abord `set-aside:failures`), son commentaire de
// parking le dit (runtime/src/attente/attente-par-le-cook.ts).
const SET_ASIDE = (the: string) => ({ id: 3, body: corpsDuParking({ what: "its cooks failed too many times, the station stopped relaunching it. The reason: the cook failed 3 times", who: "the supervisor", followUp: "2026-11-27T08:30:00.000Z", fact: "the supervisor answers", failures: true }), author_association: "OWNER", created_at: the });

// GitHub, d'après les issues `fire` et les PR ouvertes (`cook/<n>-…`, ouverte à `le`).
function github(issues: readonly Issue[], prs: readonly { ticket: number; le: string }[] = []): CallGitHub {
  const ok = (data: unknown) => ({ status: 200, data });
  return async (path) => {
    if (path.includes("/issues?")) return ok(issues.map(({ numero: number, labels, creeLe: createdThe, titre: title }) => ({ number: number, title: title ?? `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: createdThe ?? "2026-11-20T06:00:00Z", labels: [{ name: "fire" }, ...labels.map((name) => ({ name }))] })));
    if (path.includes("/pulls?")) return ok(prs.map(({ ticket, le: the }) => ({ number: 100 + ticket, head: { ref: `cook/${ticket}-x` }, body: "", html_url: `https://github.com/${REPOSITORY}/pull/${100 + ticket}`, created_at: the })));
    const [, n, what] = /\/issues\/(\d+)\/(comments|events)/.exec(path) ?? [];
    const issue = issues.find(({ numero: number }) => number === Number(n));
    if (issue !== undefined && what === "comments") return ok(issue.commentaires ?? []);
    if (issue !== undefined && what === "events") return ok([{ event: "labeled", label: { name: "fire" }, created_at: issue.feuLe ?? issue.creeLe ?? "2026-11-20T06:00:00Z" }]);
    if (path.includes("/commits/")) return ok({ check_runs: [] });
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
    return { status: 404, data: {} };
  };
}

// Le rail lu, tel que la vue le reçoit : la sortie `facts`, relue, puis le tableau ; et le texte du bandeau monté.
async function read(issues: readonly Issue[], prs: readonly { ticket: number; le: string }[] = []) {
  const rail = await readTheRailOnGithub({ depot: REPOSITORY, appeler: github(issues, prs), maintenant: () => NOW });
  const facts = understand(JSON.stringify(withTheRail(EMPTY, rail, SIGNS).faits));
  assert.ok(!("informe" in facts), JSON.stringify(facts));
  const seenOne = board(facts as Facts);
  const host = new Fake("div");
  mountTheBanner(doc, host).maj(seenOne.arretCuisine);
  // `statut` : le texte du runtime que le bandeau dit ; les cas comparent la cause et l'heure, et le texte à part.
  const { statut: status, ...stop } = seenOne.arretCuisine ?? ({} as Partial<NonNullable<typeof seenOne.arretCuisine>>);
  return { rail, arret: seenOne.arretCuisine === undefined ? undefined : (stop as Omit<NonNullable<typeof seenOne.arretCuisine>, "statut">), statut: status, texte: host.textContent };
}

test("a set-aside ticket whose open PR holds the zone its fiche declares: the board names it, its zone, and since its setting aside", async () => {
  const { arret: stop, texte: text } = await read(
    [
      { numero: 21, labels: [], feuLe: "2026-11-20T09:00:00Z" },
      { numero: 30, labels: ["parked"], commentaires: [CARD("app/src/vue, app/src/facts.ts"), SET_ASIDE("2026-11-20T08:30:00Z")] },
    ],
    [{ ticket: 30, le: "2026-11-20T08:05:00Z" }],
  );
  assert.deepEqual(stop, { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue, app/src/facts.ts" }, since: "2026-11-20T08:30:00Z" });
  assert.equal(text, "STOPPEDThe kitchen is stopped since 08:30 UTC: frozen ticket #30 holds the file zone app/src/vue, app/src/facts.ts.");
});

test("a set-aside ticket without an open PR holds no zone: the cause is unknown, since the queued ticket entered the queue", async () => {
  const { arret: stop, texte: text } = await read([
    { numero: 21, labels: [], creeLe: "2026-11-20T05:00:00Z", feuLe: "2026-11-20T09:00:00Z" },
    { numero: 30, labels: ["parked"], creeLe: "2026-11-20T04:00:00Z", commentaires: [CARD("app/src/vue"), SET_ASIDE("2026-11-20T08:30:00Z")] },
  ]);
  assert.deepEqual(stop, { cause: { kind: "unknown" }, since: "2026-11-20T09:00:00Z" });
  assert.match(text, /since 09:00 UTC: cause unknown/);
});

test("a set-aside ticket with an open PR but no fiche, or an unreadable one, holds no zone the board can name", async () => {
  for (const comments of [[SET_ASIDE("2026-11-20T08:30:00Z")], [CARD("app/src/vue"), CARD("app/src/facts.ts")], [{ ...CARD(""), body: "<!-- brigade:fiche -->\n- awaiting: none" }]]) {
    const { arret: stop } = await read([{ numero: 21, labels: [], feuLe: "2026-11-20T09:00:00Z" }, { numero: 30, labels: ["parked"], commentaires: comments }], [{ ticket: 30, le: "2026-11-20T08:05:00Z" }]);
    assert.deepEqual(stop?.cause, { kind: "unknown" });
  }
});

test("main red, its repair queued: the board says main is red, since the repair was opened — before a frozen ticket", async () => {
  const { arret: stop, texte: text } = await read(
    [
      { numero: 12, labels: ["repair-main"], titre: "Repair main: runtime tests", creeLe: "2026-11-20T07:45:00Z" },
      { numero: 30, labels: ["parked"], commentaires: [CARD("app/src/vue"), SET_ASIDE("2026-11-20T08:30:00Z")] },
    ],
    [{ ticket: 30, le: "2026-11-20T08:05:00Z" }],
  );
  assert.deepEqual(stop, { cause: { kind: "main-red" }, since: "2026-11-20T07:45:00Z" });
  assert.match(text, /^STOPPEDThe kitchen is stopped since 07:45 UTC: main is red\.$/);
});

test("a card taken, or one in pass: no stop in the facts, and the notice goes away", async () => {
  const taking = { id: 9, body: "<!-- brigade:prise station=parade-box/claude -->", author_association: "OWNER", created_at: "2026-11-20T11:00:00Z" };
  for (const [issues, prs] of [
    [[{ numero: 21, labels: [] }, { numero: 22, labels: ["taken"], commentaires: [taking] }], []],
    [[{ numero: 21, labels: [] }, { numero: 22, labels: ["in-pass"] }], [{ ticket: 22, le: "2026-11-20T11:00:00Z" }]],
  ] as const) {
    const { rail, arret: stop, texte: text } = await read(issues, prs);
    assert.ok(rail.tickets.some(({ etat: state }) => state === "pris" || state === "en pass"), JSON.stringify(rail.tickets.map(({ etat: state }) => state)));
    assert.equal(stop, undefined);
    assert.equal(text, "");
  }
});

test("without a known cause, the stop runs from the oldest queued ticket's entry, or from the last service when it is later", () => {
  const file = [{ ticket: 21, etat: "queued" as const, entreLe: null, depend: [] }, { ticket: 22, etat: "queued" as const, entreLe: null, depend: [] }];
  const tickets = [
    { ticket: 21, creeLe: "2026-11-20T06:00:00Z", entreLe: "2026-11-20T09:10:00Z" },
    { ticket: 22, creeLe: "2026-11-20T08:00:00Z", entreLe: null },
    { ticket: 40, creeLe: "2026-11-20T03:00:00Z" },
  ];
  assert.equal(stopOfRail(file, tickets, [], null).arretCuisine?.since, "2026-11-20T08:00:00Z");
  assert.equal(stopOfRail(file, tickets, [{ livre: "2026-11-20T10:20:00Z" }, { livre: "2026-11-20T07:00:00Z" }], null).arretCuisine?.since, "2026-11-20T10:20:00Z");
  // Rien de lisible : l'arrêt se dit, sans heure inventée.
  const withoutHour = stopOfRail(file, [{ ticket: 21, creeLe: "" }], [], null).arretCuisine;
  assert.deepEqual(withoutHour, { cause: { kind: "unknown" }, since: "", statut: "cause unknown" });
  const host = new Fake("div");
  mountTheBanner(doc, host).maj(withoutHour);
  assert.equal(host.textContent, "STOPPEDThe kitchen is stopped: cause unknown.");
});

test("the zone a set-aside ticket holds: from its fiche, held by its open PR, since its setting aside or else its PR", () => {
  const comments = [CARD("app/src/vue")];
  assert.equal(zoneHeldOf(comments, null, "2026-11-20T08:30:00Z"), undefined);
  assert.deepEqual(zoneHeldOf(comments, { le: "2026-11-20T08:05:00Z" }, null), { zone: ["app/src/vue"], depuis: "2026-11-20T08:05:00Z" });
  assert.equal(zoneHeldOf(comments, { le: "" }, null), undefined);
});

test("`arretCuisine` read back from `facts`: nothing malformed sets it, and an unknown kind of cause still says the kitchen is stopped", () => {
  const since = "2026-11-20T08:30:00Z";
  for (const raw of [undefined, null, "stopped", [], { since }, { cause: null, since }, { cause: [], since }, { cause: { kind: "main-red" }, since: 3 }]) assert.deepEqual(stopKitchenRead(raw), {}, JSON.stringify(raw));
  assert.deepEqual(stopKitchenRead({ cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue" }, since }), { arretCuisine: { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue" }, since, statut: "frozen ticket #30 holds the file zone app/src/vue" } });
  assert.deepEqual(stopKitchenRead({ cause: { kind: "frozen-zone", ticket: "30", zone: "app/src/vue" }, since }), { arretCuisine: { cause: { kind: "unknown" }, since, statut: "cause unknown" } });
  assert.deepEqual(stopKitchenRead({ cause: { kind: "main-red" }, since }), { arretCuisine: { cause: { kind: "main-red" }, since, statut: "main is red" } });
  assert.deepEqual(stopKitchenRead({ cause: { kind: "out-of-gas" }, since }), { arretCuisine: { cause: { kind: "unknown" }, since, statut: "cause unknown" } });
});

const FROZEN = (number: number, zone: string) => ({ numero: number, labels: ["parked"], commentaires: [CARD(zone), SET_ASIDE("2026-11-20T08:30:00Z")] });
const EN_FILE = (number: number, zone: string) => ({ numero: number, labels: [], feuLe: "2026-11-20T09:00:00Z", commentaires: [CARD(zone)] });

test("every queued ticket's zone is held by a set-aside ticket's open PR: the board names the PR, never 'unknown' (#4244)", async () => {
  const { arret: stop, statut: status, texte: text } = await read([EN_FILE(21, "app/src/vue/x.ts"), FROZEN(30, "app/src/vue")], [{ ticket: 30, le: "2026-11-20T08:05:00Z" }]);
  assert.deepEqual(stop, { cause: { kind: "zone-held", pr: 130, zone: "app/src/vue" }, since: "2026-11-20T08:30:00Z" });
  assert.equal(text, "STOPPEDThe kitchen is stopped since 08:30 UTC: zone held by PR 130.");
  assert.doesNotMatch(text, /unknown/);
  assert.equal(status, "zone held by PR 130");
});

test("several held PRs: the board names the PR blocking the most queued tickets, the lowest number on a tie (#4244)", async () => {
  const frozen = [FROZEN(30, "app/src/vue"), FROZEN(31, "runtime/src")];
  const prs = [{ ticket: 30, le: "2026-11-20T08:05:00Z" }, { ticket: 31, le: "2026-11-20T08:06:00Z" }];
  const more = await read([EN_FILE(21, "runtime/src/a.ts"), EN_FILE(22, "runtime/src/b.ts"), EN_FILE(23, "app/src/vue/c.ts"), ...frozen], prs);
  assert.deepEqual(more.arret?.cause, { kind: "zone-held", pr: 131, zone: "runtime/src" });
  const equality = await read([EN_FILE(21, "runtime/src/a.ts"), EN_FILE(23, "app/src/vue/c.ts"), ...frozen], prs);
  assert.deepEqual(equality.arret?.cause, { kind: "zone-held", pr: 130, zone: "app/src/vue" });
});

test("a queued ticket that no open PR holds keeps the stop on the frozen ticket, not a held zone (#4244)", async () => {
  const { arret: stop } = await read([EN_FILE(21, "app/src/vue/x.ts"), EN_FILE(22, "docs"), FROZEN(30, "app/src/vue")], [{ ticket: 30, le: "2026-11-20T08:05:00Z" }]);
  assert.deepEqual(stop?.cause, { kind: "frozen-zone", ticket: 30, zone: "app/src/vue" });
});

test("a held zone survives the read-back of the facts and reaches the banner (#4244)", () => {
  const since = "2026-11-20T08:30:00Z";
  const cause = { kind: "zone-held", pr: 4077, zone: "app/src/vue" };
  const { arretCuisine: stopKitchen } = stopKitchenRead({ cause, since });
  assert.deepEqual(stopKitchen, { cause, since, statut: "zone held by PR 4077" });
  const host = new Fake("div");
  mountTheBanner(doc, host).maj(stopKitchen);
  assert.match(host.textContent, /zone held by PR 4077/);
  assert.deepEqual(stopKitchenRead({ cause: { kind: "zone-held", pr: "4077", zone: "app/src/vue" }, since }), { arretCuisine: { cause: { kind: "unknown" }, since, statut: "cause unknown" } });
});

test("an unknown kind never keeps a text the facts carry: the status is the runtime's 'cause unknown' (#4244)", () => {
  const since = "2026-11-20T08:30:00Z";
  assert.equal(stopKitchenRead({ cause: { kind: "out-of-gas" }, since, statut: "zone held by PR 1" }).arretCuisine?.statut, "cause unknown");
});

test("a banner without a status says each cause in its own words (#4244)", () => {
  const since = "2026-11-20T08:30:00Z";
  const said = (cause: unknown) => {
    const host = new Fake("div");
    mountTheBanner(doc, host).maj({ cause, since } as never);
    return host.textContent;
  };
  assert.match(said({ kind: "main-red" }), /main is red/);
  assert.match(said({ kind: "unknown" }), /the cause is unknown/);
  assert.doesNotMatch(said({ kind: "unknown" }), /main is red/);
});

test("a ticket parked by its failures (ticket 4260) whose open PR holds its zone freezes the kitchen like a set-aside one; without a held zone, it does not", () => {
  const file = [{ ticket: 21, etat: "queued" as const, entreLe: "2026-11-20T09:00:00Z", depend: [] }];
  const enFile = { ticket: 21, creeLe: "2026-11-20T06:00:00Z", entreLe: "2026-11-20T09:00:00Z" };
  const zoneHeld = { zone: ["app/src/vue", "app/src/facts.ts"], depuis: "2026-11-20T08:30:00Z" };
  assert.deepEqual(stopOfRail(file, [enFile, { ticket: 30, creeLe: "2026-11-20T06:00:00Z", parqueParEchecs: { zoneTenue: zoneHeld } }], [], null).arretCuisine, { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue, app/src/facts.ts" }, since: "2026-11-20T08:30:00Z", statut: "frozen ticket #30 holds the file zone app/src/vue, app/src/facts.ts" });
  assert.deepEqual(stopOfRail(file, [enFile, { ticket: 30, creeLe: "2026-11-20T06:00:00Z", parqueParEchecs: {} }], [], null).arretCuisine, { cause: { kind: "unknown" }, since: "2026-11-20T09:00:00Z", statut: "cause unknown" });
});

test("a ticket parked by its failures (ticket 4260) whose open PR holds a queued ticket's zone stops the kitchen on that PR (#4244)", () => {
  const file = [{ ticket: 21, etat: "queued" as const, entreLe: "2026-11-20T09:00:00Z", depend: [] }];
  const enFile = { ticket: 21, creeLe: "2026-11-20T06:00:00Z", entreLe: "2026-11-20T09:00:00Z", zone: ["app/src/vue/x.ts"] };
  const zoneHeld = { zone: ["app/src/vue"], depuis: "2026-11-20T08:30:00Z", pr: 130 };
  assert.deepEqual(stopOfRail(file, [enFile, { ticket: 30, creeLe: "2026-11-20T06:00:00Z", parqueParEchecs: { zoneTenue: zoneHeld } }], [], null).arretCuisine, { cause: { kind: "zone-held", pr: 130, zone: "app/src/vue" }, since: "2026-11-20T08:30:00Z", statut: "zone held by PR 130" });
});
