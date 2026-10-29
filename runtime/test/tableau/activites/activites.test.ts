// Ce que fait chaque cook du projet, publié dans le Kitchen board (#1844) : une
// app qui n'a qu'un compte GitHub le lit dans le corps de l'issue, par le
// lecteur que le runtime partage avec elle (bloc.ts, `lesActivitesDesCooks`) —
// ni ssh, ni la box. Le runtime est un vrai, son tick rafraîchit le tableau ;
// GitHub est un faux client, et le cook est raconté au journal comme sa
// station et ses garde-fous le racontent.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Activite } from "../../../src/activite.ts";
import type { Fait } from "../../../src/evenements.ts";
import { demarrer } from "../../../src/runtime.ts";
import { activitesDesCooks, ETAPES_MAX, FINIS_MAX, GARDE_MS } from "../../../src/tableau/activites/activites.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../../src/tableau/publication/client.ts";
import { brancherLeTableau } from "../../../src/tableau/publication/publier.ts";
import { ecrireLeBloc, lesActivitesDesCooks, lireLeTableau, type ActiviteDuCook, type Tableau } from "../../../src/tableau/rendu/bloc.ts";
import { LONGUEUR_MAX_DU_CORPS, rendreLeTableau } from "../../../src/tableau/rendu/rendre.ts";
import { aArreter, DEPOT, jusqua, repertoireTemporaire } from "../../outils.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const TABLEAU = 1;
const MINUTE = 60_000;
const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

// La box d'un projet et son tableau publié, branché comme main.ts le branche.
// `noter` raconte au journal ; `tick` avance d'une minute, et la box
// rafraîchit son tableau ; `activites` les lit dans le corps publié.
async function box(t: TestContext) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let instant = Date.parse("2026-10-08T10:00:00.000Z");
  const maintenant = () => new Date(instant);
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: PROJET, maintenant });
  aArreter(t, () => runtime.arreter("SIGTERM"));
  const noter = (fait: Fait, author: string, ticket: number | null = null) => runtime.journal.ajouter({ project: PROJET, ticket, author, ...fait });
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } }, `station:${STATION}`);

  let corps = "";
  let ecritures = 0;
  const vue = (): IssueDuTableau => ({ numero: TABLEAU, ouverte: true, titre: "Kitchen board", corps, labels: ["kitchen-board", "hors-cuisine"] });
  const client: ClientDuTableau = {
    auLabel: async () => (corps === "" ? [] : [vue()]),
    issue: async () => (corps === "" ? null : vue()),
    async creer({ corps: premier }) {
      corps = premier;
      ecritures += 1;
      return TABLEAU;
    },
    async ecrireCorps(_numero, nouveau) {
      corps = nouveau;
      ecritures += 1;
    },
    rouvrir: async () => {},
    epingler: async () => false,
  };
  brancherLeTableau(runtime, { client, depot: DEPOT, maintenant, dire: () => {}, avertir: () => {} });
  await jusqua(() => corps !== "");

  const activites = (): ActiviteDuCook[] => {
    const lues = lesActivitesDesCooks(corps);
    assert.ok(lues.lues, "le corps du tableau porte l'activité des cooks");
    return lues.activites;
  };
  // Le prochain tick de la box, une minute plus tard : le tableau est réécrit
  // dès que ce qu'il dit a changé.
  const tick = async (jusquA: () => boolean = () => true) => {
    instant += MINUTE;
    t.mock.timers.tick(MINUTE);
    await jusqua(jusquA);
  };
  // Un ticket du rail, pris par la station ; son cook part.
  const prendre = (ticket: number, run: string, branche = `cook/${run}`) => {
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://github.com/${DEPOT}/issues/${ticket}`, card: null } }, "github", ticket);
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: new Date(instant + 30 * MINUTE).toISOString() } }, `station:${STATION}`, ticket);
    lancer(ticket, run, branche);
  };
  const lancer = (ticket: number, run: string, branche = `cook/${run}`) =>
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION, model: "opus", effort: "high", branch: branche, worktree: `worktrees/${run}`, relaunch: false, unarbitrated: false, remote: false, head: "abc" } }, "runtime", ticket);
  // Le relevé du tick, tel que les garde-fous l'écrivent.
  const relever = (ticket: number, run: string, turns: number, activity: Activite | null | undefined) =>
    noter({ type: "cook.progressed", payload: { run, turns, tokens: turns * 1000, ...(activity === undefined ? {} : { activity }) } }, "runtime", ticket);
  const finir = (ticket: number, run: string, pr: string | null, outcome: "ok" | "failed" = "ok") => {
    noter({ type: "cook.exited", payload: { run, outcome, code: outcome === "ok" ? 0 : 1, signal: null, turns: 12, tokens: 12_000, durationMs: 1 } }, "runtime", ticket);
    noter({ type: "cook.reported", payload: { run, ending: outcome === "ok" ? "done" : "failed", reason: null, summary: null, branch: `cook/${run}`, pr } }, `station:${STATION}`, ticket);
  };
  return { runtime, noter, prendre, lancer, relever, finir, tick, activites, corps: () => corps, ecritures: () => ecritures, maintenant };
}

const geste = (doing: Activite["doing"], target: string | null, since: string): Activite => ({ doing, target, since });

describe("l'activité de chaque cook, publiée dans le Kitchen board", () => {
  test("tant que le cook tourne, son activité est publiée et suit ses gestes : d'un tick à l'autre, le corps réécrit dit ce qu'il fait maintenant, et les gestes d'avant", async (t) => {
    const b = await box(t);
    assert.deepEqual(b.activites(), [], "aucun cook : une liste vide, pas une box d'avant");

    b.prendre(18, "18-aa");
    b.relever(18, "18-aa", 3, geste("reading", "runtime/src/etat.ts", "2026-10-08T10:00:30.000Z"));
    await b.tick(() => b.activites().length === 1);
    const [premiere] = b.activites();
    assert.deepEqual(premiere, {
      ticket: 18,
      titre: "Ticket 18",
      run: "18-aa",
      station: STATION,
      lanceLe: "2026-10-08T10:00:00.000Z",
      finiLe: null,
      fin: null,
      maintenant: { fait: "lit", faitEn: "reading", cible: "runtime/src/etat.ts", depuis: "2026-10-08T10:00:30.000Z" },
      etapes: [{ fait: "lit", faitEn: "reading", cible: "runtime/src/etat.ts", depuis: "2026-10-08T10:00:30.000Z" }],
      tours: 3,
      tokens: 3000,
      pr: null,
    });

    // Le tick suivant, le cook écrit : le corps se réécrit, et l'étape de lecture reste derrière.
    const ecritures = b.ecritures();
    b.relever(18, "18-aa", 5, geste("writing", "runtime/src/tableau/activites/activites.ts", "2026-10-08T10:01:40.000Z"));
    await b.tick(() => b.activites()[0]?.maintenant?.faitEn === "writing");
    assert.ok(b.ecritures() > ecritures, "le corps de l'issue est réécrit");
    const [seconde] = b.activites();
    assert.deepEqual(seconde?.maintenant, { fait: "écrit", faitEn: "writing", cible: "runtime/src/tableau/activites/activites.ts", depuis: "2026-10-08T10:01:40.000Z" });
    assert.deepEqual(
      seconde?.etapes.map(({ faitEn, cible }) => `${faitEn} ${cible}`),
      ["reading runtime/src/etat.ts", "writing runtime/src/tableau/activites/activites.ts"],
    );
    assert.equal(seconde?.tours, 5);

    // Le même geste redit au tick suivant n'est pas une étape de plus.
    b.relever(18, "18-aa", 6, geste("writing", "runtime/src/tableau/activites/activites.ts", "2026-10-08T10:01:40.000Z"));
    await b.tick(() => b.activites()[0]?.tours === 6);
    assert.equal(b.activites()[0]?.etapes.length, 2);
  });

  test("le cook fini, son activité le dit fini, comment, et lie la PR de sa livraison ; sans PR, elle le dit aussi", async (t) => {
    const b = await box(t);
    b.prendre(18, "18-aa");
    b.relever(18, "18-aa", 3, geste("committing", null, "2026-10-08T10:00:30.000Z"));
    b.prendre(19, "19-aa");
    b.relever(19, "19-aa", 2, geste("testing", null, "2026-10-08T10:00:20.000Z"));
    await b.tick(() => b.activites().length === 2);

    b.finir(18, "18-aa", `https://github.com/${DEPOT}/pull/1904`);
    b.finir(19, "19-aa", null, "failed");
    await b.tick(() => b.activites().every(({ finiLe }) => finiLe !== null));
    const [livre, rate] = b.activites();
    assert.deepEqual(
      { finiLe: livre?.finiLe, fin: livre?.fin, maintenant: livre?.maintenant, pr: livre?.pr, tours: livre?.tours },
      { finiLe: "2026-10-08T10:01:00.000Z", fin: "ok", maintenant: null, pr: { numero: 1904, url: `https://github.com/${DEPOT}/pull/1904` }, tours: 12 },
    );
    assert.deepEqual(livre?.etapes.map(({ faitEn }) => faitEn), ["committing"], "ses gestes restent lisibles");
    assert.deepEqual({ fin: rate?.fin, maintenant: rate?.maintenant, pr: rate?.pr }, { fin: "failed", maintenant: null, pr: null });

    // La PR que la pass ouvre, faute que la station l'ait pu, est aussi la sienne.
    b.noter({ type: "pass.pr-opened", payload: { pr: `https://github.com/${DEPOT}/pull/1905`, number: 1905, reconciled: false } }, "pass", 19);
    await b.tick(() => b.activites()[1]?.pr !== null);
    assert.deepEqual(b.activites()[1]?.pr, { numero: 1905, url: `https://github.com/${DEPOT}/pull/1905` });
  });

  test("un cook renvoyé par la pass reprend la PR de son ticket dès son départ", async (t) => {
    const b = await box(t);
    b.prendre(18, "18-aa", "cook/18");
    b.finir(18, "18-aa", `https://github.com/${DEPOT}/pull/1904`);
    b.noter({ type: "pass.started", payload: { run: "18-aa", pr: `https://github.com/${DEPOT}/pull/1904`, number: 1904, sha: "s1" } }, "pass", 18);
    b.lancer(18, "18-bb", "cook/18");
    b.relever(18, "18-bb", 1, geste("reading-ticket", null, "2026-10-08T10:00:10.000Z"));
    await b.tick(() => b.activites()[0]?.run === "18-bb");
    const [reprise] = b.activites();
    assert.equal(reprise?.finiLe, null);
    assert.deepEqual(reprise?.pr, { numero: 1904, url: `https://github.com/${DEPOT}/pull/1904` });
    assert.deepEqual(reprise?.etapes.map(({ faitEn }) => faitEn), ["reading the ticket"], "seuls les gestes du cook qui tourne");
  });

  test("ni une relecture de la pass ni un jugement n'y sont, et un cook fini depuis plus de deux heures n'y est plus", (t) => {
    let instant = Date.parse("2026-10-08T10:00:00.000Z");
    const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: PROJET, maintenant: () => new Date(instant) });
    aArreter(t, () => runtime.arreter("SIGTERM"));
    const noter = (fait: Fait, ticket: number | null) => runtime.journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait });
    const lancer = (ticket: number | null, run: string, station: string) => noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station } }, ticket);
    lancer(18, "18-aa", STATION);
    noter({ type: "cook.exited", payload: { run: "18-aa", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } }, 18);
    lancer(18, "relecture-18", "reviewer");
    lancer(null, "manager-1", "manager");
    lancer(20, "20-aa", "box/autre");
    // Une station distante ne dit pas le geste de son cook : rien n'est inventé.
    noter({ type: "cook.progressed", payload: { run: "20-aa", turns: 4, tokens: 40 } }, 20);

    const lues = activitesDesCooks(runtime.journal.base, new Date(instant));
    assert.deepEqual(lues.map(({ run }) => run), ["18-aa", "20-aa"]);
    assert.deepEqual({ maintenant: lues[1]?.maintenant, etapes: lues[1]?.etapes, tours: lues[1]?.tours }, { maintenant: null, etapes: [], tours: 4 });

    instant += GARDE_MS + MINUTE;
    assert.deepEqual(activitesDesCooks(runtime.journal.base, new Date(instant)).map(({ run }) => run), ["20-aa"]);
  });

  test("le tableau reste borné : les derniers gestes d'un cook, les derniers cooks finis", (t) => {
    let instant = Date.parse("2026-10-08T10:00:00.000Z");
    const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: PROJET, maintenant: () => new Date(instant) });
    aArreter(t, () => runtime.arreter("SIGTERM"));
    const noter = (fait: Fait, ticket: number) => runtime.journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait });
    noter({ type: "cook.launched", payload: { run: "18-aa", limits: LIMITES, stream: "runs/18-aa.jsonl", station: STATION } }, 18);
    for (let rang = 0; rang < ETAPES_MAX + 3; rang += 1) {
      noter({ type: "cook.progressed", payload: { run: "18-aa", turns: rang, tokens: rang, activity: geste("reading", `f${rang}.ts`, new Date(instant + rang * 1000).toISOString()) } }, 18);
    }
    for (let ticket = 100; ticket < 100 + FINIS_MAX + 2; ticket += 1) {
      instant += 1000;
      noter({ type: "cook.launched", payload: { run: `${ticket}-a`, limits: LIMITES, stream: `runs/${ticket}-a.jsonl`, station: STATION } }, ticket);
      noter({ type: "cook.exited", payload: { run: `${ticket}-a`, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } }, ticket);
    }
    const lues = activitesDesCooks(runtime.journal.base, new Date(instant));
    assert.deepEqual(lues[0]?.etapes.map(({ cible }) => cible), Array.from({ length: ETAPES_MAX }, (_, rang) => `f${rang + 3}.ts`));
    assert.equal(lues.filter(({ finiLe }) => finiLe !== null).length, FINIS_MAX);
    assert.equal(lues.find(({ ticket }) => ticket === 100), undefined, "les plus anciens finis partent les premiers");
  });

  test("un corps trop long retire d'abord les étapes passées des cooks, jamais ce qu'ils font en ce moment", () => {
    const maintenant = { fait: "écrit", faitEn: "writing", cible: "a.ts", depuis: "2026-10-08T10:00:00.000Z" };
    const etapes = Array.from({ length: ETAPES_MAX }, (_, rang) => ({ ...maintenant, cible: `${"x".repeat(1000)}${rang}` }));
    const activites: ActiviteDuCook[] = Array.from({ length: 10 }, (_, rang) => ({
      ticket: rang,
      titre: null,
      run: `${rang}-a`,
      station: STATION,
      lanceLe: "2026-10-08T10:00:00.000Z",
      finiLe: null,
      fin: null,
      maintenant,
      etapes: [...etapes, maintenant],
      tours: 1,
      tokens: 1,
      pr: null,
    }));
    const tableau = { projet: PROJET, lu: "2026-10-08T10:00:00.000Z", file: [], bilans: [], cuisine: { rubriques: [] }, activites } as unknown as Tableau;
    const corps = rendreLeTableau(tableau, new Date("2026-10-08T10:00:00.000Z"));
    assert.ok(corps.length <= LONGUEUR_MAX_DU_CORPS);
    const lu = lireLeTableau(corps);
    assert.ok(lu.lu);
    assert.deepEqual(lu.tableau.resserre, ["activites.etapes"]);
    assert.ok(lu.tableau.activites?.every((activite) => JSON.stringify(activite.etapes) === JSON.stringify([maintenant]) && activite.maintenant !== null));
  });

  test("un tableau écrit par une box d'avant cette publication le dit, au lieu d'une cuisine sans cook", () => {
    const avant = { projet: PROJET, lu: "2026-10-08T10:00:00.000Z", file: [], bilans: [], cuisine: { rubriques: [] } } as unknown as Tableau;
    assert.deepEqual(lesActivitesDesCooks(ecrireLeBloc(avant, new Date("2026-10-08T10:00:00.000Z"))), {
      lues: false,
      raison: "the board was written by a box that does not publish its cooks' activity yet: update the box",
    });
    assert.deepEqual(lesActivitesDesCooks("no block here"), { lues: false, raison: "the board carries no machine block: it was not written by the box, or was edited by hand" });
  });
});
