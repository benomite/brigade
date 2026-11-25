// Les règles des statuts de CI (#3953) là où la station les joue : la règle A
// au réveil du superviseur, sur les checks de la base que le tour a lus et ses
// tickets de réparation ; la règle B avant le push de la livraison d'un cook.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type GitHubDuTour, type Lancer, type TicketLu } from "../../src/brigade-github.ts";
import { ticketDuCheck } from "../../src/carte-ci-windows.ts";
import { attenteDeLIssue } from "../../src/attente-github/attente-github.ts";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { LABEL_PARKED } from "../../src/github-etat/etats.ts";
import { ECHECS_ATTEINTS, HORS_CUISINE, type GitHub } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import type { RunDeCi } from "../../src/temps-ticket/ci-github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";
import { aArreter, jusqua, repertoireTemporaire } from "../outils.ts";

// Le commentaire de la règle B, et la clé de la carte d'un rouge de la base.
const MARQUE_DES_ROUGES = "<!-- brigade:rouges-de-suite";
const ticketDuRougeDe = (branche: string) => ticketDuCheck("red main", branche);

const ticket = (number: number, ...labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels: ["fire", "model:opus", "effort:high", ...labels], state: "open" });

test("the turn sees a base repair ticket set aside by its failures — and only then", async () => {
  const dicte = { tickets: [] as TicketLu[] };
  const suivi = suivreLeTour();
  const github = suivi.envelopper({ fires: async () => dicte.tickets, commentaires: async () => [] } as unknown as GitHubDuTour);
  // Avant le premier tour, rien n'est vu de côté.
  assert.equal(suivi.reparationMiseDeCote(), false);
  for (const [tickets, attendu] of [
    [[ticket(1, "prio:0")], false],
    [[ticket(1, ECHECS_ATTEINTS)], false],
    [[ticket(1, "prio:0", ECHECS_ATTEINTS)], true],
    [[ticket(2), ticket(1, "prio:0", HORS_CUISINE)], true],
  ] as const) {
    dicte.tickets = [...tickets];
    await github.fires();
    assert.equal(suivi.reparationMiseDeCote(), attendu, tickets.map(({ labels }) => labels.join(",")).join(" "));
  }
});

test("the turn sees a base repair ticket parked by its failures (#4129) — and only a repair ticket", async () => {
  const dicte = { tickets: [] as TicketLu[] };
  const suivi = suivreLeTour();
  const github = suivi.envelopper({ fires: async () => dicte.tickets, commentaires: async () => [] } as unknown as GitHubDuTour);
  for (const [tickets, attendu] of [
    [[ticket(1, "prio:0", "parked")], true],
    [[ticket(1, "parked")], false],
  ] as const) {
    dicte.tickets = [...tickets];
    await github.fires();
    assert.equal(suivi.reparationMiseDeCote(), attendu, tickets.map(({ labels }) => labels.join(",")).join(" "));
  }
});

// Le superviseur branché sur un tour dont le test dit les checks de la base et les tickets.
function supervise(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const dicte = { tickets: [] as TicketLu[], checks: [] as Array<{ name: string; outcome: "red" | "green" }> };
  const suivi = suivreLeTour();
  const github = suivi.envelopper({ fires: async () => dicte.tickets, commentaires: async () => [], checksDeLaBase: async () => dicte.checks } as unknown as GitHubDuTour);
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: "brigade", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  const dits: string[] = [];
  // Sans manager à consulter : seule la carte de la base se joue.
  brancherSuperviseur(runtime, { tour: suivi, github: fauxClient(new FauxGitHub()), depot: "faux/depot", branche: "main", consulter: () => null, dire: (ligne) => void dits.push(ligne) });
  const tourner = async () => {
    await github.fires();
    await github.checksDeLaBase();
    for (const ecouter of ecouteurs) ecouter("tick");
  };
  return { journal, dicte, tourner, dits };
}

test("the supervisor's wake-up: a red base whose repair is still alive makes no card; set aside, one card; green again, it leaves", async (t) => {
  const r = supervise(t);
  const cartes = () => cartesEnTodo(r.journal.base).map(({ ticket }) => ticket);
  r.dicte.checks = [{ name: "unit", outcome: "red" }];
  r.dicte.tickets = [ticket(70, "prio:0")];
  await r.tourner();
  // Le tour suivant ne pose rien de plus : rien n'attend que la carte arrive.
  await r.tourner();
  assert.deepEqual(cartes(), []);
  r.dicte.tickets = [ticket(70, "prio:0", ECHECS_ATTEINTS)];
  await r.tourner();
  await jusqua(() => cartes().length === 1);
  await r.tourner();
  await r.tourner();
  assert.deepEqual(cartes(), [ticketDuRougeDe("main")]);
  r.dicte.checks = [{ name: "unit", outcome: "green" }];
  await r.tourner();
  await jusqua(() => cartes().length === 0);
  assert.deepEqual(r.dits, []);
});

// Aucun ticket de réparation encore : la cuisine n'a pas essayé, elle en ouvrira
// un (le geste `fix` du superviseur) — la base rouge reste à elle, le chef n'a pas de carte. Elle
// n'y va qu'une fois ce ticket mis de côté.
test("the supervisor's wake-up: a red base with no repair ticket at all is still the kitchen's, and makes no card", async (t) => {
  const r = supervise(t);
  const cartes = () => cartesEnTodo(r.journal.base).map(({ ticket }) => ticket);
  r.dicte.checks = [{ name: "unit", outcome: "red" }];
  r.dicte.tickets = [ticket(71, HORS_CUISINE), ticket(72, ECHECS_ATTEINTS)];
  await r.tourner();
  await r.tourner();
  assert.deepEqual(cartes(), []);
  r.dicte.tickets = [ticket(70, "prio:0", ECHECS_ATTEINTS)];
  await r.tourner();
  await jusqua(() => cartes().length === 1);
  assert.deepEqual(r.dits, []);
});

// Une station dont le cook livre un commit, et dont la branche du ticket a déjà ces runs de CI.
// `reprise` faux : la branche est neuve, jamais poussée.
async function livrer(t: TestContext, runs: RunDeCi[] | Error | null, reprise = true) {
  const repertoire = mkdtempSync(join(tmpdir(), "statuts-ci-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(42, ["fire", "model:opus", "effort:high"]);
  const pousses: string[] = [];
  const lues: string[] = [];
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const client: GitHub =
    runs === null
      ? fauxClient(faux)
      : {
          ...fauxClient(faux),
          ciDeLaBranche: async (branche) => {
            lues.push(branche);
            if (runs instanceof Error) throw runs;
            return runs;
          },
        };
  const avertis: string[] = [];
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: client,
    depot: {
      // La branche du ticket a déjà été poussée : ses runs se lisent.
      connait: () => reprise,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: (branche) => void pousses.push(branche),
      commits: () => 1,
      changes: () => ["a.ts"],
      diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => void avertis.push(texte),
  });
  if ("refus" in station) throw new Error(String(station.refus));
  const pressees: Array<boolean | undefined> = [];
  station.presser = (maintenant) => void pressees.push(maintenant);
  await station.tour();
  await station.calme();
  return { faux, pousses, lues, avertis, pressees, commentaires: (faux.commentaires.get(42) ?? []).map(({ body }) => body) };
}

const runRouge = (id: number, creeLe: string, check = "unit"): RunDeCi => ({ id, tete: `t${id}`, creeLe, finiLe: creeLe, jobs: [{ creeLe, commenceLe: creeLe, finiLe: creeLe, nom: check, conclusion: "failure" }] });

test("a cook's delivery on a ticket whose CI is red on the same check three runs in a row is not pushed: one comment names the check and the runs, and the ticket is parked by its failures", async (t) => {
  const { faux, pousses, lues, commentaires, avertis, pressees } = await livrer(t, [runRouge(303, "2026-11-20T12:00:00Z"), runRouge(302, "2026-11-20T11:00:00Z"), runRouge(301, "2026-11-20T10:00:00Z")]);
  assert.deepEqual(pousses, []);
  assert.deepEqual(lues, ["cook/42-github"]);
  const rouges = commentaires.filter((corps) => corps.startsWith(MARQUE_DES_ROUGES));
  assert.equal(rouges.length, 1);
  assert.match(rouges[0] ?? "", /`unit`[\s\S]*run 303, run 302, run 301/);
  // Aucun autre commentaire que celui-là, hors de la prise et du lâcher de la station, et de son parking (#4129) : ni
  // échec, ni renvoi.
  const parking = commentaires.filter((corps) => corps.startsWith("<!-- brigade:parked "));
  assert.equal(parking.length, 1, commentaires.join("\n---\n"));
  const autres = commentaires.filter((corps) => !/^<!-- brigade:(prise|lache|parked) /.test(corps));
  assert.deepEqual(autres, rouges);
  // Parqué par ses échecs : il attend le superviseur, sa raison est la série rouge.
  assert.equal(faux.ticket(42).labels.has(LABEL_PARKED), true);
  assert.equal(faux.ticket(42).labels.has(ECHECS_ATTEINTS), false);
  const attente = attenteDeLIssue(parking.map((body) => ({ body, association: "OWNER" })));
  assert.equal(attente?.who, "the supervisor");
  assert.equal(attente?.failures, true);
  assert.match(attente?.what ?? "", /The reason: its CI is red on `unit` 3 runs in a row$/);
  assert.ok(avertis.some((ligne) => ligne.includes("#42") && ligne.includes("not pushed")), avertis.join("\n"));
  // Le commentaire est écrit : la station ne dit pas qu'il s'est perdu.
  assert.ok(!avertis.some((ligne) => ligne.includes("could not be posted")), avertis.join("\n"));
  // Rendu sans livraison, il libère sa place : un tour tout de suite.
  assert.ok(pressees.includes(true));
});

test("a cook's delivery whose last three runs are not red on one check is pushed, as is one on a station that cannot read the runs", async (t) => {
  const deux = await livrer(t, [runRouge(303, "2026-11-20T12:00:00Z"), runRouge(302, "2026-11-20T11:00:00Z"), runRouge(301, "2026-11-20T10:00:00Z", "lint")]);
  assert.deepEqual(deux.pousses, ["cook/42-github"]);
  assert.deepEqual(deux.lues, ["cook/42-github"]);
  assert.equal(deux.commentaires.filter((corps) => corps.startsWith(MARQUE_DES_ROUGES)).length, 0);
  assert.equal(deux.faux.ticket(42).labels.has(ECHECS_ATTEINTS), false);
  assert.equal(deux.faux.ticket(42).labels.has(LABEL_PARKED), false);
  assert.ok(!deux.avertis.some((ligne) => ligne.includes("could not be read")), deux.avertis.join("\n"));
  // Une branche neuve n'a jamais été poussée : aucun run ne se lit, et elle part.
  const neuve = await livrer(t, [runRouge(303, "2026-11-20T12:00:00Z"), runRouge(302, "2026-11-20T11:00:00Z"), runRouge(301, "2026-11-20T10:00:00Z")], false);
  assert.deepEqual(neuve.lues, []);
  assert.deepEqual(neuve.pousses, ["cook/42-github"]);
  const sans = await livrer(t, null);
  assert.deepEqual(sans.pousses, ["cook/42-github"]);
  // Des runs illisibles ne retiennent pas la livraison : elle part, et la station le dit.
  const illisibles = await livrer(t, new Error("HTTP 502"));
  assert.deepEqual(illisibles.pousses, ["cook/42-github"]);
  assert.ok(illisibles.avertis.some((ligne) => ligne.includes("#42") && ligne.includes("could not be read") && ligne.includes("HTTP 502")), illisibles.avertis.join("\n"));
});
