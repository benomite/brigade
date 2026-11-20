// #3924 : la cuisine arrêtée, de la lecture du rail sur GitHub au bandeau en tête du rail — le chemin de production :
// `lireLeRailSurGithub`, `avecLeRail`, la sortie `facts` relue (`comprendre`), le tableau, puis le bandeau monté.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../../runtime/src/rail-bloque/rail-bloque.ts";
import { comprendre, tableau, type Faits } from "../../../src/faits.ts";
import type { AppelGitHub } from "../../../src/tableau/client.ts";
import type { TableauLu } from "../../../src/tableau/lecture.ts";
import { arretCuisineLu, arretDuRail, zoneTenueDe } from "../../../src/vue/bandeau-arret/arret-du-rail.ts";
import { monterLeBandeau } from "../../../src/vue/bandeau-arret/bandeau-arret.js";
import { avecLeRail, lireLeRailSurGithub, type SignesDeVie } from "../../../src/vue/rail/github.ts";
import { Faux } from "../../aides/fausse-vue.ts";

const DEPOT = "chef/parade";
const MAINTENANT = new Date("2026-11-20T12:00:00.000Z");
const station: StationDuCompte = { name: "parade-box", lastSeen: "2026-11-20T11:59:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] };
const SIGNES: SignesDeVie = { lus: [station] };
const VIDE: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: MAINTENANT.toISOString(),
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: MAINTENANT.toISOString(), dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [], cooks: [], attend: [], livres: [], stations: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const doc = { createElement: (balise: string) => new Faux(balise) };

type Issue = { numero: number; labels: readonly string[]; creeLe?: string; titre?: string; commentaires?: readonly Record<string, unknown>[]; feuLe?: string };
const FICHE = (zone: string) => ({ id: 2, body: `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`, author_association: "OWNER", created_at: "2026-11-20T07:00:00Z" });
const MIS_DE_COTE = (le: string) => ({ id: 3, body: "Station `parade-box/claude`: the cook failed 3 times. Set aside by its failures (set-aside:failures).", author_association: "OWNER", created_at: le });

// GitHub, d'après les issues `fire` et les PR ouvertes (`cook/<n>-…`, ouverte à `le`).
function github(issues: readonly Issue[], prs: readonly { ticket: number; le: string }[] = []): AppelGitHub {
  const ok = (data: unknown) => ({ status: 200, data });
  return async (chemin) => {
    if (chemin.includes("/issues?")) return ok(issues.map(({ numero, labels, creeLe, titre }) => ({ number: numero, title: titre ?? `Ticket ${numero}`, html_url: `https://github.com/${DEPOT}/issues/${numero}`, created_at: creeLe ?? "2026-11-20T06:00:00Z", labels: [{ name: "fire" }, ...labels.map((name) => ({ name }))] })));
    if (chemin.includes("/pulls?")) return ok(prs.map(({ ticket, le }) => ({ number: 100 + ticket, head: { ref: `cook/${ticket}-x` }, body: "", html_url: `https://github.com/${DEPOT}/pull/${100 + ticket}`, created_at: le })));
    const [, n, quoi] = /\/issues\/(\d+)\/(comments|events)/.exec(chemin) ?? [];
    const issue = issues.find(({ numero }) => numero === Number(n));
    if (issue !== undefined && quoi === "comments") return ok(issue.commentaires ?? []);
    if (issue !== undefined && quoi === "events") return ok([{ event: "labeled", label: { name: "fire" }, created_at: issue.feuLe ?? issue.creeLe ?? "2026-11-20T06:00:00Z" }]);
    if (chemin.includes("/commits/")) return ok({ check_runs: [] });
    if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
    return { status: 404, data: {} };
  };
}

// Le rail lu, tel que la vue le reçoit : la sortie `facts`, relue, puis le tableau ; et le texte du bandeau monté.
async function lire(issues: readonly Issue[], prs: readonly { ticket: number; le: string }[] = []) {
  const rail = await lireLeRailSurGithub({ depot: DEPOT, appeler: github(issues, prs), maintenant: () => MAINTENANT });
  const faits = comprendre(JSON.stringify(avecLeRail(VIDE, rail, SIGNES).faits));
  assert.ok(!("informe" in faits), JSON.stringify(faits));
  const vu = tableau(faits as Faits);
  const hote = new Faux("div");
  monterLeBandeau(doc, hote).maj(vu.arretCuisine);
  return { rail, arret: vu.arretCuisine, texte: hote.textContent };
}

test("a set-aside ticket whose open PR holds the zone its fiche declares: the board names it, its zone, and since its setting aside", async () => {
  const { arret, texte } = await lire(
    [
      { numero: 21, labels: [], feuLe: "2026-11-20T09:00:00Z" },
      { numero: 30, labels: ["set-aside:failures"], commentaires: [FICHE("app/src/vue, app/src/faits.ts"), MIS_DE_COTE("2026-11-20T08:30:00Z")] },
    ],
    [{ ticket: 30, le: "2026-11-20T08:05:00Z" }],
  );
  assert.deepEqual(arret, { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue, app/src/faits.ts" }, since: "2026-11-20T08:30:00Z" });
  assert.equal(texte, "STOPPEDThe kitchen is stopped since 08:30 UTC: frozen ticket #30 holds the file zone app/src/vue, app/src/faits.ts.");
});

test("a set-aside ticket without an open PR holds no zone: the cause is unknown, since the queued ticket entered the queue", async () => {
  const { arret, texte } = await lire([
    { numero: 21, labels: [], creeLe: "2026-11-20T05:00:00Z", feuLe: "2026-11-20T09:00:00Z" },
    { numero: 30, labels: ["set-aside:failures"], creeLe: "2026-11-20T04:00:00Z", commentaires: [FICHE("app/src/vue"), MIS_DE_COTE("2026-11-20T08:30:00Z")] },
  ]);
  assert.deepEqual(arret, { cause: { kind: "unknown" }, since: "2026-11-20T09:00:00Z" });
  assert.match(texte, /since 09:00 UTC: the cause is unknown/);
});

test("a set-aside ticket with an open PR but no fiche, or an unreadable one, holds no zone the board can name", async () => {
  for (const commentaires of [[MIS_DE_COTE("2026-11-20T08:30:00Z")], [FICHE("app/src/vue"), FICHE("app/src/faits.ts")], [{ ...FICHE(""), body: "<!-- brigade:fiche -->\n- awaiting: none" }]]) {
    const { arret } = await lire([{ numero: 21, labels: [], feuLe: "2026-11-20T09:00:00Z" }, { numero: 30, labels: ["set-aside:failures"], commentaires }], [{ ticket: 30, le: "2026-11-20T08:05:00Z" }]);
    assert.deepEqual(arret?.cause, { kind: "unknown" });
  }
});

test("main red, its repair queued: the board says main is red, since the repair was opened — before a frozen ticket", async () => {
  const { arret, texte } = await lire(
    [
      { numero: 12, labels: ["repair-main"], titre: "Repair main: runtime tests", creeLe: "2026-11-20T07:45:00Z" },
      { numero: 30, labels: ["set-aside:failures"], commentaires: [FICHE("app/src/vue"), MIS_DE_COTE("2026-11-20T08:30:00Z")] },
    ],
    [{ ticket: 30, le: "2026-11-20T08:05:00Z" }],
  );
  assert.deepEqual(arret, { cause: { kind: "main-red" }, since: "2026-11-20T07:45:00Z" });
  assert.match(texte, /^STOPPEDThe kitchen is stopped since 07:45 UTC: main is red\.$/);
});

test("a card taken, or one in pass: no stop in the facts, and the notice goes away", async () => {
  const prise = { id: 9, body: "<!-- brigade:prise station=parade-box/claude -->", author_association: "OWNER", created_at: "2026-11-20T11:00:00Z" };
  for (const [issues, prs] of [
    [[{ numero: 21, labels: [] }, { numero: 22, labels: ["taken"], commentaires: [prise] }], []],
    [[{ numero: 21, labels: [] }, { numero: 22, labels: ["in-pass"] }], [{ ticket: 22, le: "2026-11-20T11:00:00Z" }]],
  ] as const) {
    const { rail, arret, texte } = await lire(issues, prs);
    assert.ok(rail.tickets.some(({ etat }) => etat === "pris" || etat === "en pass"), JSON.stringify(rail.tickets.map(({ etat }) => etat)));
    assert.equal(arret, undefined);
    assert.equal(texte, "");
  }
});

test("without a known cause, the stop runs from the oldest queued ticket's entry, or from the last service when it is later", () => {
  const file = [{ ticket: 21, etat: "queued" as const, entreLe: null, depend: [] }, { ticket: 22, etat: "queued" as const, entreLe: null, depend: [] }];
  const tickets = [
    { ticket: 21, creeLe: "2026-11-20T06:00:00Z", entreLe: "2026-11-20T09:10:00Z" },
    { ticket: 22, creeLe: "2026-11-20T08:00:00Z", entreLe: null },
    { ticket: 40, creeLe: "2026-11-20T03:00:00Z" },
  ];
  assert.equal(arretDuRail(file, tickets, [], null).arretCuisine?.since, "2026-11-20T08:00:00Z");
  assert.equal(arretDuRail(file, tickets, [{ livre: "2026-11-20T10:20:00Z" }, { livre: "2026-11-20T07:00:00Z" }], null).arretCuisine?.since, "2026-11-20T10:20:00Z");
  // Rien de lisible : l'arrêt se dit, sans heure inventée.
  const sansHeure = arretDuRail(file, [{ ticket: 21, creeLe: "" }], [], null).arretCuisine;
  assert.deepEqual(sansHeure, { cause: { kind: "unknown" }, since: "" });
  const hote = new Faux("div");
  monterLeBandeau(doc, hote).maj(sansHeure);
  assert.equal(hote.textContent, "STOPPEDThe kitchen is stopped: the cause is unknown.");
});

test("the zone a set-aside ticket holds: from its fiche, held by its open PR, since its setting aside or else its PR", () => {
  const commentaires = [FICHE("app/src/vue")];
  assert.equal(zoneTenueDe(commentaires, null, "2026-11-20T08:30:00Z"), undefined);
  assert.deepEqual(zoneTenueDe(commentaires, { le: "2026-11-20T08:05:00Z" }, null), { zone: ["app/src/vue"], depuis: "2026-11-20T08:05:00Z" });
  assert.equal(zoneTenueDe(commentaires, { le: "" }, null), undefined);
});

test("`arretCuisine` read back from `facts`: nothing malformed sets it, and an unknown kind of cause still says the kitchen is stopped", () => {
  const since = "2026-11-20T08:30:00Z";
  for (const brut of [undefined, null, "stopped", [], { since }, { cause: null, since }, { cause: [], since }, { cause: { kind: "main-red" }, since: 3 }]) assert.deepEqual(arretCuisineLu(brut), {}, JSON.stringify(brut));
  assert.deepEqual(arretCuisineLu({ cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue" }, since }), { arretCuisine: { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue" }, since } });
  assert.deepEqual(arretCuisineLu({ cause: { kind: "frozen-zone", ticket: "30", zone: "app/src/vue" }, since }), { arretCuisine: { cause: { kind: "unknown" }, since } });
  assert.deepEqual(arretCuisineLu({ cause: { kind: "main-red" }, since }), { arretCuisine: { cause: { kind: "main-red" }, since } });
  assert.deepEqual(arretCuisineLu({ cause: { kind: "out-of-gas" }, since }), { arretCuisine: { cause: { kind: "unknown" }, since } });
});
