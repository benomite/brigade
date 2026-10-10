// La station devant l'arbitre entre projets : elle le consulte avant chaque
// lancement, lui redit son état, et tourne en mode dégradé — au plus un cook —
// quand il ne répond pas. Chaque test a son arbitre, sur le port 0.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirArbitre, ouvrirReglages, servirArbitre, type Mot } from "../src/arbitre.ts";
import { ArbitreInjoignable, joindreArbitre, type Arbitrage } from "../src/arbitrage.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Machine } from "../src/machine.ts";
import { etatStation } from "../src/projections/stations.ts";
import { STATION } from "../src/station.ts";
import { connexionRefusee } from "./aides/connexion-refusee.ts";
import { chef, cuisine, issue, MACHINE_CALME, plafonner } from "./aides/cuisine.ts";
import { jusqua, repertoireTemporaire } from "./outils.ts";

// Un arbitre sur son port, et de quoi le couper puis le rendre : coupé, tout
// échange est refusé comme le serait une connexion.
async function arbitre(t: TestContext, plafond: number, repertoire = repertoireTemporaire(t)) {
  const ouvert = ouvrirArbitre({ repertoire, plafond });
  const serveur = await servirArbitre(ouvert, 0);
  t.after(async () => {
    await serveur.fermer();
    ouvert.fermer();
  });
  const client = joindreArbitre(serveur.port);
  let coupe = false;
  const sauf = <A extends unknown[], R>(appel: (...args: A) => Promise<R>) => async (...args: A) => {
    if (coupe) throw new ArbitreInjoignable(serveur.port, "connexion refusée");
    return appel(...args);
  };
  const joint: Arbitrage = { port: serveur.port, echanger: sauf(client.echanger), quitter: sauf(client.quitter), etat: sauf(client.etat) };
  const projet = (nom: string) => ouvert.etat().projets.find((connu) => connu.projet === nom);
  return { ouvert, repertoire, serveur, joint, projet, couper: () => void (coupe = true), rendre: () => void (coupe = false) };
}

const lances = (journal: { tout(): Array<{ type: string; ticket: number | null; payload: object }> }) =>
  journal.tout().flatMap((e) => (e.type === "cook.launched" ? [[e.ticket, (e.payload as { unarbitrated?: boolean }).unarbitrated ?? false]] : []));

test("la station demande sa place à l'arbitre avant chaque lancement, et lui redit ce qu'elle fait tourner", async (t) => {
  const { joint, projet } = await arbitre(t, 10);
  const { journal, lancements, types } = cuisine(t, { arbitre: joint, cooks: 5, scenario: "muet", issues: [issue(14), issue(15)] });
  await jusqua(() => lancements().length === 2);
  await jusqua(() => projet("brigade")?.cooks === 2 && projet("brigade")?.demande === false);

  assert.deepEqual(lances(journal), [[14, false], [15, false]]);
  assert.deepEqual([projet("brigade")?.presence, projet("brigade")?.nonArbitres], ["entendu", 0]);
  assert.equal(types().some((type) => type === "station.unarbitrated" || type === "station.held"), false);
});

test("refusée par l'arbitre, la station se retient et le dit ; la place rendue par une fin de cook, le ticket part", async (t) => {
  const { joint, projet } = await arbitre(t, 1);
  const { journal, etat, dernier, lancements, conclure } = cuisine(t, { arbitre: joint, cooks: 5, scenario: "commite-puis-attend", issues: [issue(14), issue(15)] });
  await jusqua(() => dernier("station.held") !== undefined && lancements().length === 1);

  assert.deepEqual(dernier("station.held"), { station: STATION, reason: "arbiter" });
  assert.deepEqual([etat(14), etat(15), lancements().length], ["taken", "waiting", 1]);
  assert.deepEqual([projet("brigade")?.cooks, projet("brigade")?.encore], [1, 0]);
  assert.match(decrireEtat(lireEtat(journal), new Date()).join("\n"), /SE RETIENT depuis .* — l'arbitre entre projets garde la place pour un autre projet/);

  conclure();
  await jusqua(() => lancements().length === 2);
  await jusqua(() => etatStation(journal.base, STATION)?.heldReason === null);
});

test("arbitre injoignable : le projet lance quand même, un cook à la fois, le journalise et le signale une fois ; au retour, il reprend", async (t) => {
  const { joint, projet, couper, rendre } = await arbitre(t, 10);
  couper();
  const { journal, etat, dernier, types, lancements, avertissements } = cuisine(t, { arbitre: joint, cooks: 5, scenario: "muet", issues: [issue(14), issue(15), issue(16)] });
  await jusqua(() => dernier("station.held") !== undefined && lancements().length === 1);
  // Le temps de quelques ticks : rien ne se redit.
  await new Promise((resoudre) => setTimeout(resoudre, 80));

  assert.deepEqual([etat(14), etat(15), etat(16), lancements().length], ["taken", "waiting", "waiting", 1]);
  assert.deepEqual(lances(journal), [[14, true]]);
  assert.deepEqual(dernier("station.held"), { station: STATION, reason: "unarbitrated" });
  assert.equal(types().filter((type) => type === "station.unarbitrated").length, 1);
  assert.deepEqual(avertissements, [
    `brigade : arbitre injoignable sur 127.0.0.1:${joint.port} — connexion refusée — mode dégradé : la station ${STATION} ne lance plus qu'un cook à la fois, sans arbitrage, jusqu'à son retour`,
  ]);
  const photo = decrireEtat(lireEtat(journal), new Date()).join("\n");
  assert.match(photo, /ARBITRE INJOIGNABLE depuis .* — connexion refusée : box\/claude ne lance plus qu'un cook à la fois, sans arbitrage/);

  rendre();
  await jusqua(() => lancements().length === 3);
  await jusqua(() => projet("brigade")?.cooks === 3);
  // Le cook parti sans lui tourne encore : l'arbitre le compte, et le sait.
  assert.deepEqual(lances(journal), [[14, true], [15, false], [16, false]]);
  assert.equal(projet("brigade")?.nonArbitres, 1);
  assert.equal(types().filter((type) => type === "station.arbitrated").length, 1);
  assert.equal(etatStation(journal.base, STATION)?.unarbitratedAt, null);
  assert.equal(avertissements.at(-1), `brigade : l'arbitre répond à nouveau — fin du mode dégradé de la station ${STATION}`);
  assert.equal(avertissements.length, 2);
});

test("un arbitre qui n'a jamais été là : la connexion refusée suffit, sans attendre", async (t) => {
  // Le refus est joué, par le vrai client : le port d'un arbitre qu'on vient de
  // fermer n'est pas muet pour autant, un voisin peut l'avoir repris. Celui du
  // test écoute encore — joint, il accorderait la place.
  const { serveur } = await arbitre(t, 10);
  const absent = joindreArbitre(serveur.port, { joindre: connexionRefusee });
  const { journal, dernier, lancements } = cuisine(t, { arbitre: absent, cooks: 5, scenario: "muet", issues: [issue(14)] });
  await jusqua(() => lancements().length === 1);
  assert.deepEqual(lances(journal), [[14, true]]);
  assert.deepEqual(dernier("station.unarbitrated"), { station: STATION, reason: "connexion refusée" });
});

test("sans arbitre désigné, le projet tourne comme avant : ni mode dégradé, ni avertissement — et il sort de celui d'une vie précédente", async (t) => {
  const { joint, couper } = await arbitre(t, 10);
  couper();
  const avant = cuisine(t, { arbitre: joint, cooks: 5, scenario: "muet", issues: [issue(14)] });
  await jusqua(() => avant.types().includes("station.unarbitrated"));
  avant.runtime.arreter("test");

  const { journal, avertissements } = cuisine(t, { lieux: avant.lieux, cooks: 5, scenario: "muet", issues: [issue(14), issue(15)] });
  avant.lieux.gh.poser(issue(15));
  await jusqua(() => lances(journal).length === 3);
  assert.equal(etatStation(journal.base, STATION)?.unarbitratedAt, null);
  // Le cook de la première vie était parti sans arbitre ; ceux-ci partent comme avant.
  assert.deepEqual(lances(journal).map(([, sansArbitre]) => sansArbitre), [true, false, false]);
  assert.deepEqual(avertissements, []);
});

test("un runtime qui s'arrête proprement rend sa part ; l'arbitre qui redémarre se remplit de ce que les runtimes lui redisent", async (t) => {
  const premier = await arbitre(t, 10);
  let courant = premier.joint;
  const relais: Arbitrage = { port: 0, echanger: (...args) => courant.echanger(...args), quitter: (...args) => courant.quitter(...args), etat: () => courant.etat() };
  const { runtime, lancements } = cuisine(t, { arbitre: relais, cooks: 5, scenario: "muet", issues: [issue(14)] });
  await jusqua(() => premier.projet("brigade")?.cooks === 1 && lancements().length === 1);

  // L'arbitre redémarre : il ne sait plus rien, que le nom du projet.
  // Coupé d'abord : la station ne parle pas à un port fermé, qu'un voisin peut avoir repris.
  premier.couper();
  await premier.serveur.fermer();
  premier.ouvert.fermer();
  const second = await arbitre(t, 10, premier.repertoire);
  assert.deepEqual([second.projet("brigade")?.presence, second.projet("brigade")?.cooks], ["muet", null]);
  courant = second.joint;
  await jusqua(() => second.projet("brigade")?.cooks === 1);
  assert.equal(lancements().length, 1);

  runtime.arreter("test");
  await jusqua(() => second.projet("brigade")?.presence === "absent");
});

test("deux projets, un plafond haut, la machine saturée par le premier : le second finit par partir", async (t) => {
  const { joint, ouvert, projet } = await arbitre(t, 50);
  // Le premier projet remplit la machine de ses cooks.
  const premier = cuisine(t, { projet: "thermigo", arbitre: joint, cooks: 30, entrees: 30, scenario: "muet", issues: [issue(11), issue(12)] });
  await jusqua(() => premier.lancements().length === 2 && projet("thermigo")?.cooks === 2);

  // Le second a un ticket, et sa station se retient : la machine n'en peut plus.
  let machine: Machine = { ...MACHINE_CALME, charge: 16.2 };
  const second = cuisine(t, { projet: "brigade", arbitre: joint, cooks: 30, scenario: "muet", machine: () => machine, issues: [issue(21)] });
  await jusqua(() => ouvert.etat().saturePar.includes("brigade"));
  assert.deepEqual(second.dernier("station.held"), { station: STATION, reason: "machine" });

  // Un ticket de plus pour le premier, dont la station voit, elle, de quoi
  // lancer : l'arbitre le lui refuse — il a plus que sa part de ce qui tourne.
  premier.lieux.gh.poser(issue(13));
  await jusqua(() => premier.dernier("station.held") !== undefined);
  assert.deepEqual(premier.dernier("station.held"), { station: STATION, reason: "arbiter" });
  assert.deepEqual([premier.etat(13), premier.lancements().length, second.lancements().length], ["waiting", 2, 0]);
  assert.deepEqual([projet("thermigo")?.part, projet("thermigo")?.encore, projet("brigade")?.part, projet("brigade")?.encore], [1, 0, 1, 1]);

  // La machine respire : c'est le second qui part.
  machine = MACHINE_CALME;
  await jusqua(() => second.lancements().length === 1);
  assert.equal(second.etat(21), "taken");
  // Plus personne n'attend la machine : le premier retrouve sa part du compte.
  await jusqua(() => premier.lancements().length === 3);
  await jusqua(() => ouvert.etat().cooks === 4);
  assert.deepEqual(ouvert.etat().saturePar, []);
});

test("le chef donne du poids à un projet : sa part grandit sans toucher au plafond de l'autre", async (t) => {
  const { joint, ouvert, repertoire, projet } = await arbitre(t, 4);
  const issues = (de: number) => [0, 1, 2, 3].map((rang) => issue(de + rang));
  const reglages = ouvrirReglages(repertoire);
  t.after(() => reglages.fermer());
  reglages.peser("thermigo", 3, "2026-10-09T09:00:00.000Z");
  // Les deux projets ont de la demande avant que l'un ne lance : aucun ne part seul.
  const demande: Mot = { cooks: 0, demande: true, machine: false, nonArbitres: 0, consommation: { jour: 0, semaine: 0 } };
  ouvert.dire("thermigo", demande);
  ouvert.dire("brigade", demande);
  const lourd = cuisine(t, { projet: "thermigo", arbitre: joint, cooks: 30, entrees: 30, scenario: "muet", issues: issues(11) });
  const leger = cuisine(t, { projet: "brigade", arbitre: joint, cooks: 30, entrees: 30, scenario: "muet", issues: issues(21) });
  await jusqua(() => leger.lancements().length === 1 && projet("brigade")?.cooks === 1);
  await jusqua(() => lourd.lancements().length === 3 && projet("thermigo")?.cooks === 3);
  await jusqua(() => lourd.dernier("station.held") !== undefined && leger.dernier("station.held") !== undefined);

  assert.deepEqual([projet("thermigo")?.part, projet("brigade")?.part], [3, 1]);
  assert.deepEqual([lourd.lancements().length, leger.lancements().length], [3, 1]);
});

test("un projet arrêté par le chef ne demande rien : ses tickets qui attendent ne réservent aucune place chez l'autre", async (t) => {
  const { joint, projet } = await arbitre(t, 6);
  const issues = (de: number) => [0, 1, 2, 3, 4, 5].map((rang) => issue(de + rang));
  // Le second projet a des tickets, et le chef l'a arrêté avant qu'il ne lance.
  const arrete = cuisine(t, { projet: "brigade", arbitre: joint, cooks: 30, entrees: 30, scenario: "muet", session: "absente", issues: issues(21) });
  await jusqua(() => projet("brigade")?.presence === "entendu");
  chef(arrete.repertoire, "kitchen.stopped");
  await jusqua(() => arrete.dernier("station.held")?.reason === "stopped" && projet("brigade")?.demande === false);

  // Le premier prend tout le compte : rien n'est dû à qui ne peut rien lancer.
  const premier = cuisine(t, { projet: "thermigo", arbitre: joint, cooks: 30, entrees: 30, scenario: "muet", issues: issues(11) });
  await jusqua(() => premier.lancements().length === 6);
  assert.equal(arrete.lancements().length, 0);
});

test("un projet au plafond de cooks que le chef lui a réglé ne réserve pas le reste de sa part", async (t) => {
  const { joint, ouvert, projet } = await arbitre(t, 6);
  const issues = (de: number) => [0, 1, 2, 3, 4, 5].map((rang) => issue(de + rang));
  // Plafond propre : un cook. Il en tient un, et des tickets attendent derrière.
  const borne = cuisine(t, { projet: "brigade", arbitre: joint, cooks: 1, scenario: "muet", issues: issues(21) });
  await jusqua(() => borne.lancements().length === 1 && borne.dernier("station.held")?.reason === "cap");
  await jusqua(() => projet("brigade")?.cooks === 1 && projet("brigade")?.demande === false);

  const premier = cuisine(t, { projet: "thermigo", arbitre: joint, cooks: 30, entrees: 30, scenario: "muet", issues: issues(11) });
  await jusqua(() => premier.lancements().length === 5);
  await jusqua(() => premier.dernier("station.held") !== undefined);
  assert.deepEqual([premier.dernier("station.held"), ouvert.etat().cooks, borne.lancements().length], [{ station: STATION, reason: "arbiter" }, 6, 1]);

  // Le chef relève le plafond du projet borné : il redemande, et sa part lui revient au fil des fins de cooks.
  plafonner(borne.repertoire, 3);
  await jusqua(() => projet("brigade")?.demande === true);
});

test("une écriture qui lève à l'entrée en mode dégradé ne retient pas la station : la demande n'est pas perdue", async (t) => {
  const { joint, couper } = await arbitre(t, 10);
  couper();
  let leve = false;
  const { journal, lancements } = cuisine(t, {
    arbitre: joint,
    cooks: 5,
    scenario: "muet",
    issues: [issue(14)],
    avertir: (message) => {
      if (/mode dégradé/.test(message) && !leve) {
        leve = true;
        throw new Error("journald plein");
      }
    },
  });
  await jusqua(() => lancements().length === 1);
  assert.equal(leve, true);
  assert.deepEqual(lances(journal), [[14, true]]);
});
