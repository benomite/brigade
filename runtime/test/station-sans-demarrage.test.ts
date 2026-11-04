// Une station dont un cook n'a pas pu démarrer — il a fini sans un tour ni un
// token — ne prend plus de ticket, quelle qu'en soit la cause, plutôt que d'en
// tenir un par cook qui ne démarre pas : `status` et le tableau de la cuisine
// le disent, son ticket revient au rail pour une autre station, et elle reprend
// à son redémarrage ou dès qu'un cook lancé depuis produit un tour.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Demande, Mission, Reponse } from "../src/events/remote.ts";
import type { Fait } from "../src/evenements.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatStation, sansDemarrage } from "../src/projections/stations.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { tableauDeLaCuisine } from "../src/tableau/rendu/donnees.ts";
import { rendreLeTableau } from "../src/tableau/rendu/rendre.ts";
import { demander } from "./aides/demander.ts";
import { cuisine, issue, type Lieux } from "./aides/cuisine.ts";
import { horloge, jusqua, repertoireTemporaire } from "./outils.ts";

const [CLAUDE, PLAYWRIGHT, MAC] = ["box/claude", "box/playwright", "mac/claude"];
// Deux stations d'ici qui cuisinent les mêmes tickets : celle qui ne démarre
// pas laisse le sien à l'autre.
const DEUX = lireStations({ BRIGADE_STATIONS: `${CLAUDE}:1:code,${PLAYWRIGHT}:1:code` });
// Les cooks d'attente ne s'arrêtent pas d'eux-mêmes pendant le test.
const PLAFONDS_DU_TEST = { durationMs: 6 * 3_600_000, idleMs: 6 * 3_600_000 };

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

// Une cuisine à deux stations dont le premier cook — celui de `box/claude`,
// la première déclarée — ne démarre pas.
async function sansDemarrer(t: TestContext, relais = false) {
  const lieu = cuisine(t, { stations: DEUX, ...(relais ? { relais: true as const } : {}), scenario: "commite-puis-attend", suite: ["ne-demarre-pas"], plafonds: PLAFONDS_DU_TEST, issues: [issue(14)] });
  await jusqua(() => lieu.journal.tout().some((e) => e.type === "station.unstartable"));
  return lieu;
}

describe("une station dont un cook n'a pas pu démarrer", () => {
  test("elle ne prend plus de ticket : son ticket revient au rail et part sur l'autre station, `status` et le tableau disent pourquoi", async (t) => {
    const premiere = await sansDemarrer(t);
    const { journal, gh, lancements } = premiere;
    const preneur = (numero: number) => premiere.runtime.rail.tickets().find((ticket) => ticket.ticket === numero && ticket.state === "taken")?.station ?? null;
    const fait = journal.tout().find((e) => e.type === "station.unstartable");
    const exite = journal.duTicket(14).find((e) => e.type === "cook.exited");
    assert.deepEqual([fait?.author, fait?.ticket, exite?.payload.turns, exite?.payload.tokens], [`station:${CLAUDE}`, 14, 0, 0]);
    assert.equal(fait?.payload.run, exite?.payload.run);

    // Le ticket est revenu au rail, et c'est l'autre station qui le prend.
    await jusqua(() => preneur(14) === PLAYWRIGHT && lancements().length === 2);
    assert.equal(etatStation(journal.base, CLAUDE)?.unstartable?.run, fait?.payload.run);

    // Un ticket de plus : l'autre station est pleine, et celle qui ne démarre
    // pas ne le prend pas.
    gh.poser(issue(15));
    await jusqua(() => etatStation(journal.base, CLAUDE)?.heldReason === "unstartable");
    await laisserServir();
    assert.equal(premiere.etat(15), "waiting");
    assert.equal(lancements().length, 2);

    // `status` le dit, qu'un ticket l'attende ou non, avec ce cook et ce qui la fait reprendre.
    const status = decrireEtat(lireEtat(journal), new Date());
    const ligne = status.find((l) => l.startsWith(`stations   ${CLAUDE} NOT TAKING TICKETS`));
    assert.ok(ligne, status.join("\n"));
    assert.match(ligne, new RegExp(`its cook could not start: ${fait?.payload.run} ended with 0 turns and 0 tokens`));
    assert.match(ligne, /It takes tickets again when it restarts, or as soon as a cook launched since produces a turn/);
    assert.ok(status.some((l) => l.includes(`${CLAUDE} WITHHOLDING`) && l.includes("could not start (0 turns, 0 tokens)")), status.join("\n"));
    assert.ok(!status.some((l) => l.includes(`${PLAYWRIGHT} NOT TAKING TICKETS`)));

    // Le tableau de la cuisine porte le même état, et la même raison.
    const tableau = tableauDeLaCuisine(lireEtat(journal), new Date());
    const deLaStation = (station: string) => tableau.cuisine.stations.find((s) => s.station === station);
    assert.equal(deLaStation(CLAUDE)?.sansDemarrage?.run, fait?.payload.run);
    assert.equal(deLaStation(PLAYWRIGHT)?.sansDemarrage, null);
    const rubrique = tableau.cuisine.rubriques.find(({ titre }) => titre === "stations");
    assert.ok(rubrique?.lignes.some((l) => l.startsWith(`${CLAUDE} NOT TAKING TICKETS`) && l.includes("0 turns and 0 tokens")), JSON.stringify(tableau.cuisine.rubriques));
    assert.match(rendreLeTableau(tableau, new Date()), /NOT TAKING TICKETS/);

    // Le commentaire du ticket le dit aussi.
    assert.ok(gh.commentaires.some(([numero, corps]) => numero === 14 && corps.includes(`\`${CLAUDE}\` ne prend plus de ticket`)));
  });

  test("redémarrée, elle reprend : le ticket qui attendait part chez elle", async (t) => {
    // Le cook de l'autre station survit au redémarrage, et garde le #14 : le
    // ticket qui attendait, le #15, est le seul qui reste à prendre.
    const premiere = await sansDemarrer(t, true);
    premiere.gh.poser(issue(15));
    await jusqua(() => etatStation(premiere.journal.base, CLAUDE)?.heldReason === "unstartable");
    premiere.runtime.arreter("test");
    const seconde = cuisine(t, { lieux: premiere.lieux, relais: true, stations: DEUX, scenario: "commite-puis-attend", plafonds: PLAFONDS_DU_TEST, issues: [issue(14), issue(15)] });
    assert.equal(etatStation(seconde.journal.base, CLAUDE)?.unstartable, null);
    await jusqua(() => seconde.runtime.rail.tickets().find((ticket) => ticket.ticket === 15)?.station === CLAUDE);
    assert.ok(!decrireEtat(lireEtat(seconde.journal), new Date()).some((l) => l.includes("NOT TAKING TICKETS")));
  });

  test("un cook qui a tourné ne la retient pas : une fin en échec avec des tours ne dit rien de son démarrage", async (t) => {
    const { journal } = cuisine(t, { stations: [DEUX[0]!], scenario: "echec", issues: [issue(14)] });
    await jusqua(() => journal.duTicket(14).some((e) => e.type === "cook.reported"));
    assert.equal(journal.tout().filter((e) => e.type === "station.unstartable").length, 0);
    assert.equal(etatStation(journal.base, CLAUDE)?.unstartable, null);
  });
});

describe("une station distante dont un cook n'a pas pu démarrer", () => {
  const DECLAREES = lireStations({ BRIGADE_STATIONS: `${CLAUDE}:1:code,${MAC}:2:chrome-connecté:distante` });
  const poser = (gh: Lieux["gh"], numero: number) => {
    gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : chrome-connecté"].join("\n"));
    gh.poser(issue(numero));
  };
  function service(t: TestContext) {
    const lieu = cuisine(t, { stations: DECLAREES, scenario: "muet", presenceMs: 120_000 });
    const tirer = (demande: Demande): Promise<Reponse> => demander(lieu.repertoire, MAC, demande, { maintenant: lieu.heure.maintenant, pasMs: 2 });
    const reclamer = async (since?: string): Promise<Extract<Reponse, { verb: "claim" }>> => {
      const reponse = await tirer(since === undefined ? { verb: "claim" } : { verb: "claim", since });
      assert.ok(reponse.ok && reponse.verb === "claim", JSON.stringify(reponse));
      return reponse;
    };
    return { ...lieu, tirer, reclamer };
  }

  test("elle ne reçoit plus de ticket ; elle reprend quand elle réclame en disant avoir démarré depuis — pas avant", async (t) => {
    const { gh, journal, etat, heure, tirer, reclamer } = service(t);
    poser(gh, 16);
    assert.equal((await tirer({ verb: "announce" })).ok, true);
    await jusqua(() => etat(16) === "waiting");
    const demarreeAvant = new Date(heure.maintenant().getTime() - 3_600_000).toISOString();
    const mission = (await reclamer(demarreeAvant)).mission as Mission;
    assert.equal(mission.ticket, 16);

    const rendu = await tirer({ verb: "deliver", run: mission.run, ending: "failed", reason: "guard:idle", message: null, turns: 0, tokens: 0 });
    assert.equal(rendu.ok, true, JSON.stringify(rendu));
    await jusqua(() => journal.tout().some((e) => e.type === "station.unstartable"));
    assert.deepEqual(journal.tout().find((e) => e.type === "station.unstartable")?.payload.station, MAC);
    await jusqua(() => etat(16) === "waiting");

    // Plus rien pour elle, et elle sait pourquoi — sa réclamation dit le même démarrage.
    assert.deepEqual(await reclamer(demarreeAvant), { ok: true, verb: "claim", mission: null, held: "unstartable" });
    assert.deepEqual(await reclamer(), { ok: true, verb: "claim", mission: null, held: "unstartable" });
    assert.equal(etatStation(journal.base, MAC)?.unstartable?.run, mission.run);

    // Redémarrée après la panne, elle reprend : le ticket repart chez elle.
    const reprise = await reclamer(new Date(heure.maintenant().getTime() + 60_000).toISOString());
    assert.equal(reprise.mission?.ticket, 16);
    assert.equal(etatStation(journal.base, MAC)?.unstartable, null);
  });
});

describe("ce qui lève l'état, d'après le journal seul", { concurrency: 4 }, () => {
  const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  function journalDeTest(t: TestContext) {
    const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
    t.after(() => journal.fermer());
    const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "test", ...fait });
    const annoncer = (station: string, remote = false) =>
      noter({ type: "station.announced", payload: { station, engine: "claude", provides: ["code"], maxCooks: 2, ...(remote ? { remote: true } : {}) } });
    const lancer = (run: string, station: string) =>
      noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station, model: "sonnet", effort: "low", branch: `cook/${run}`, worktree: `worktrees/${run}` } }, 14);
    const tourner = (run: string, turns: number) => noter({ type: "cook.progressed", payload: { run, turns, tokens: turns * 10 } }, 14);
    const tomber = (run: string, station: string) => noter({ type: "station.unstartable", payload: { station, run, reason: "guard:idle" } }, 14);
    return { journal, base: journal.base, noter, annoncer, lancer, tourner, tomber };
  }

  test("un cook lancé depuis qui produit un tour la lève ; un cook lancé avant, ou sans tour, non", (t) => {
    const { base, annoncer, lancer, tourner, tomber, noter } = journalDeTest(t);
    annoncer(CLAUDE);
    lancer("14-avant", CLAUDE);
    tourner("14-avant", 3);
    lancer("14-mort", CLAUDE);
    tomber("14-mort", CLAUDE);
    assert.equal(sansDemarrage(base, CLAUDE)?.run, "14-mort");

    // Ses tours datent d'avant : il ne dit rien d'un cook qui démarre aujourd'hui.
    tourner("14-avant", 9);
    noter({ type: "cook.exited", payload: { run: "14-avant", outcome: "ok", code: 0, signal: null, turns: 12, tokens: 120, durationMs: 10 } }, 14);
    assert.notEqual(sansDemarrage(base, CLAUDE), null);
    // Lancé depuis, sans tour encore : rien n'est levé.
    lancer("15-apres", CLAUDE);
    tourner("15-apres", 0);
    assert.notEqual(sansDemarrage(base, CLAUDE), null);
    // Son premier tour : la station démarre ses cooks de nouveau.
    tourner("15-apres", 1);
    assert.equal(sansDemarrage(base, CLAUDE), null);
    assert.equal(etatStation(base, CLAUDE)?.unstartable, null);
  });

  test("un cook lancé depuis qui finit avec des tours la lève aussi", (t) => {
    const { base, annoncer, lancer, tomber, noter } = journalDeTest(t);
    annoncer(CLAUDE);
    lancer("14-mort", CLAUDE);
    tomber("14-mort", CLAUDE);
    lancer("15-apres", CLAUDE);
    noter({ type: "cook.exited", payload: { run: "15-apres", outcome: "failed", code: 1, signal: null, turns: 2, tokens: 20, durationMs: 10 } }, 15);
    assert.equal(sansDemarrage(base, CLAUDE), null);
  });

  test("le redémarrage du runtime lève celles d'ici, pas une distante : elle, c'est sa réclamation qui dit qu'elle a redémarré", (t) => {
    const { base, annoncer, lancer, tomber, noter } = journalDeTest(t);
    annoncer(CLAUDE);
    annoncer(MAC, true);
    lancer("14-ici", CLAUDE);
    tomber("14-ici", CLAUDE);
    lancer("16-mac", MAC);
    tomber("16-mac", MAC);
    const depuis = sansDemarrage(base, MAC)?.since ?? "";

    noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    assert.equal(sansDemarrage(base, CLAUDE), null);
    assert.equal(sansDemarrage(base, MAC)?.run, "16-mac");

    // Une réclamation sans démarrage dit, ou d'un démarrage d'avant, ne lève rien.
    noter({ type: "remote.asked", payload: { id: "aaaaaaaa-1", station: MAC, verb: "claim" } });
    noter({ type: "remote.asked", payload: { id: "aaaaaaaa-2", station: MAC, verb: "claim", since: new Date(Date.parse(depuis) - 60_000).toISOString() } });
    noter({ type: "remote.asked", payload: { id: "aaaaaaaa-3", station: MAC, verb: "claim", since: "pas une date" } });
    assert.notEqual(sansDemarrage(base, MAC), null);
    // Démarrée depuis : levée.
    noter({ type: "remote.asked", payload: { id: "aaaaaaaa-4", station: MAC, verb: "claim", since: new Date(Date.parse(depuis) + 60_000).toISOString() } });
    assert.equal(sansDemarrage(base, MAC), null);
  });

  test("une station retirée l'emporte avec elle, et l'état se recalcule tel quel en rejouant le journal", (t) => {
    const { journal, base, annoncer, lancer, tomber, noter } = journalDeTest(t);
    annoncer(CLAUDE);
    annoncer(PLAYWRIGHT);
    lancer("14-a", CLAUDE);
    tomber("14-a", CLAUDE);
    lancer("15-b", PLAYWRIGHT);
    tomber("15-b", PLAYWRIGHT);
    noter({ type: "station.withdrawn", payload: { station: PLAYWRIGHT } });
    const avant = [sansDemarrage(base, CLAUDE), sansDemarrage(base, PLAYWRIGHT)];
    assert.equal(avant[1], null);
    journal.reconstruire();
    assert.deepEqual([sansDemarrage(base, CLAUDE), sansDemarrage(base, PLAYWRIGHT)], avant);
  });
});
