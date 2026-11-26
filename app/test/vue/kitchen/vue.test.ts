// Le plan de la cuisine dans la vue jouée (ticket 4238) : `facts` tel que le process principal le range, puis ce que la vue
// en pose — la carte parked dans la colonne où elle attend, ce qu'elle dit, le TODO qui ouvre la carte d'un clic, la bande
// du haut que l'équipe lue remplit, et chaque message du haut avec le geste qu'il offre au chef.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { holdBandes } from "../../../src/alerts.ts";
import { mettreAPart } from "../../../src/awaiting.ts";
import { BANNIERE, holdFacts, type Facts } from "../../../src/facts.ts";
import { actionsDeCard } from "../../../src/card-actions.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { holdLTeam } from "../../../src/vue/autonomy/team.js";
import { source } from "../../../src/vue/autonomy/source.js";
import { monterLeBanner } from "../../../src/vue/banner-stop/banner-stop.js";
import { linesDeRefusal } from "../../../src/vue/project/rail/refusal-de-station.js";
import { estRed } from "../../../src/vue/todo/todo.js";
import { type Faux, Faux as Element, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";
import { TEAM } from "../../autonomy/team-fixture.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const doc = { createElement: (balise: string) => new Element(balise) };
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
async function ouvrir(answers: Record<string, unknown> = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsDeCard(card), ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const entree = (ticket: number, state: string, plus: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...plus });
const facts = (plus: Partial<Facts> & { rail: Facts["rail"] }): Facts => ({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...plus });
async function show(vue: Jouee, plus: Partial<Facts> & { rail: Facts["rail"] }, a = new Date().toISOString()): Promise<Faux> {
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a, sorties: [{ commande: "facts", texte: JSON.stringify(facts(plus)) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue.element("rail");
}
const colonne = (rail: Faux, name: string): Faux => rail.dessous("section").find(({ dataset }) => dataset.colonne === name) ?? assert.fail(`pas de colonne ${name}`);
const slip = (ou: Faux, ticket: number): Faux => ou.dessous("li").find(({ className, dataset }) => className.split(" ").includes("bon") && dataset.ticket === String(ticket)) ?? assert.fail(`pas de carte #${ticket}`);
const parque = (card: Faux) => card.dessous("p").find(({ className }) => className === "parque")?.textContent;
const buttonNomme = (ou: Faux, texte: string): Faux => ou.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
// Le TODO, une ligne au-dessus des colonnes (#4354) : un clic la déplie et montre ses entrées.
const leTodo = (rail: Faux): Faux => {
  const opinion = rail.children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO");
  opinion.dessous("button")[0]?.click();
  return opinion.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("TODO pas déplié");
};
const TIERS = { quoi: "your call", qui: "the chef", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" };

describe("la carte parked, dans la colonne où elle attend", () => {
  test("parked pour le chef : dans Cooks, rouge, et dans son TODO ; parked pour un tiers : ni rouge, ni dans le TODO", async () => {
    const vue = await ouvrir();
    const rail = await show(vue, {
      rail: [entree(51, "pris", { tiers: TIERS }), entree(52, "pris", { tiers: { ...TIERS, qui: "Stripe support" } }), entree(53, "pris")],
      attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }],
    });
    const cooks = colonne(rail, "Cooks");
    assert.equal(parque(slip(cooks, 51)), "parked — waits for the chef, until 28 Nov, 09:00 UTC");
    assert.equal(slip(cooks, 51).dataset.parque, "");
    assert.equal(slip(cooks, 51).dataset.carte, "attente");
    assert.equal(parque(slip(cooks, 52)), "parked — waits for Stripe support, until 28 Nov, 09:00 UTC");
    assert.notEqual(slip(cooks, 52).dataset.carte, "attente");
    assert.equal(parque(slip(cooks, 53)), undefined);
    assert.equal(slip(cooks, 53).dataset.parque, undefined);
    const todo = leTodo(rail);
    assert.deepEqual(todo.dessous("li").map(({ dataset }) => dataset.ticket), ["51"]);
  });

  test("mis de côté par le runtime : parked dans la colonne où il attend, jusqu'à son retour", async () => {
    const vue = await ouvrir();
    const rail = await show(vue, { rail: [entree(40, "86", { attente: { raison: "the project setup", colonne: "en pass", retour: "2026-11-26T12:00:00Z" } }), entree(41, "86", { attente: { raison: "a free place", colonne: "pris", retour: null } })] });
    assert.equal(parque(slip(colonne(rail, "Pass"), 40)), "parked — waits for the project setup, until 26 Nov, 12:00 UTC");
    assert.equal(parque(slip(colonne(rail, "Cooks"), 41)), "parked — waits for a free place, no date set");
  });

  test("une entrée du TODO ouvre la fiche de sa carte, d'un clic", async () => {
    const vue = await ouvrir();
    const rail = await show(vue, { rail: [entree(51, "pris", { tiers: TIERS })], attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }] });
    assert.equal(vue.element("fiche").hidden, true);
    const todo = leTodo(rail);
    buttonNomme(todo, "#51 Ticket 51").click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.equal(vue.element("fiche").dessous("header")[0]?.children[0]?.textContent, "#51");
  });

  test("la carte parked pour le chef est rouge ; parked pour un autre, non", () => {
    const card = { ticket: 1, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} } as unknown as Parameters<typeof estRed>[0];
    assert.equal(estRed({ ...card, parque: { qui: "the chef", jusqua: null, chef: true } }), true);
    assert.equal(estRed({ ...card, parque: { qui: "Camille", jusqua: null } }), false);
  });
});

describe("le process principal pose `parque`", () => {
  // Qui il attend décide s'il attend le chef — plus d'être nommé par `attend` (#4261).
  test("un ticket qui attend un tiers est parked ; parked pour « the chef », il attend le chef ; mis de côté, jusqu'à son retour", () => {
    const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts({ rail: [entree(51, "pris", { tiers: TIERS }), entree(52, "WAITING", { tiers: TIERS }), entree(40, "86", { attente: { raison: "the setup", colonne: "en pass", retour: null } }), entree(53, "pris")], attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }] })) }] });
    assert.ok("tableau" in recue);
    const cards = recue.tableau.rail.colonnes.flatMap(({ cartes: siennes }) => siennes);
    const de = (ticket: number) => cards.find((une) => une.ticket === ticket)?.parque;
    assert.deepEqual(de(51), { qui: "the chef", quoi: "your call", jusqua: "2026-11-28T09:00:00Z", chef: true });
    assert.deepEqual(de(52), { qui: "the chef", quoi: "your call", jusqua: "2026-11-28T09:00:00Z", chef: true });
    assert.deepEqual(de(40), { qui: "the setup", jusqua: null });
    assert.equal(de(53), undefined);
  });

  test("les checks du dépôt : la page de GitHub Actions d'après une issue lue ; sans issue de GitHub, ou qui ne s'ouvre pas, faux", async () => {
    const tenus = holdFacts();
    const ouvertes: string[] = [];
    const ouvrirLa = async (adresse: string) => void ouvertes.push(adresse);
    assert.equal(await tenus.ouvrirLesChecks(PARADE, ouvrirLa), false);
    tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts({ rail: [entree(5, "pris", { url: "https://example.org/5" })], attend: [{ ticket: 6, titre: "Six", url: null }], livres: [{ ticket: 7, titre: "Sept", url: "https://github.com/chef/parade/pull/7", livre: A, station: null, pr: null }] })) }] });
    assert.equal(await tenus.ouvrirLesChecks(PARADE, ouvrirLa), true);
    assert.deepEqual(ouvertes, ["https://github.com/chef/parade/actions"]);
    assert.equal(await tenus.ouvrirLesChecks(PARADE, async () => Promise.reject(new Error("no browser"))), false);
    assert.equal(await tenus.ouvrirLesChecks(42, ouvrirLa), false);
    tenus.recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts({ rail: [entree(5, "pris", { url: "https://example.org/5" })] })) }] });
    assert.equal(await tenus.ouvrirLesChecks("cantine", ouvrirLa), false);
    assert.equal(ouvertes.length, 1);
  });
});

describe("chaque message du haut offre un geste", () => {
  const ALERT = { sorte: "base-rouge", phrase: "Main is red since 08:00.", fait: { depuis: "2026-11-25T08:00:00Z", check: "tests" }, geste: "Open the failing check", geree: null };

  test("une alerte qui nomme un check l'ouvre ; une qui nomme un ticket ouvre son issue", async () => {
    const vue = await ouvrir({ ouvrirLesChecks: () => true });
    let rail = await show(vue, { rail: [entree(41, "pris")], alertesDuRail: [ALERT] as unknown as NonNullable<Facts["alertesDuRail"]> });
    buttonNomme(rail, "open the checks").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLesChecks"), [PARADE]);
    rail = await show(vue, { rail: [entree(41, "pris")], alertesDuRail: [{ ...ALERT, fait: { depuis: ALERT.fait.depuis, ticket: 41 } }] as unknown as NonNullable<Facts["alertesDuRail"]> });
    buttonNomme(rail, "open #41").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 41]);
  });

  test("les checks qui ne s'ouvrent pas : la vue dit pourquoi", async () => {
    const vue = await ouvrir({ ouvrirLesChecks: () => false });
    const rail = await show(vue, { rail: [entree(41, "pris")], alertesDuRail: [ALERT] as unknown as NonNullable<Facts["alertesDuRail"]> });
    buttonNomme(rail, "open the checks").click();
    await repos();
    assert.match(vue.poses().map(({ textContent }) => textContent).join("\n"), /the repository's checks were not opened/);
  });

  test("une lecture vieille offre de relire : le bouton relit la box", async () => {
    const vue = await ouvrir();
    const rail = await show(vue, { rail: [entree(41, "pris")] }, "2026-10-01T00:00:00.000Z");
    const line = rail.children.find(({ className }) => className === "relisible") ?? assert.fail("pas de lecture à relire");
    assert.equal(line.children[0]?.className, "fraicheur");
    const avant = vue.appels.filter(({ geste: action }) => action === "relireBox").length;
    buttonNomme(line, "read again").click();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "relireBox").length, avant + 1);
  });

  test("la cuisine arrêtée : ouvrir le ticket gelé, les checks de main rouge, ou relire quand la cause est inconnue", () => {
    const calls: string[] = [];
    const hote = new Element("div");
    const banner = monterLeBanner(doc, hote, { ouvrirTicket: (ticket) => void calls.push(`#${ticket}`), ouvrirLesChecks: () => void calls.push("checks"), relire: () => void calls.push("relire") });
    const action = () => hote.dessous("button").map(({ textContent }) => textContent);
    banner.maj({ cause: { kind: "frozen-zone", ticket: 30, zone: "app/" }, since: A });
    assert.deepEqual(action(), ["open #30"]);
    hote.dessous("button")[0]?.click();
    banner.maj({ cause: { kind: "main-red" }, since: A });
    assert.deepEqual(action(), ["open the checks"]);
    hote.dessous("button")[0]?.click();
    banner.maj({ cause: { kind: "unknown" }, since: A });
    assert.deepEqual(action(), ["read again"]);
    hote.dessous("button")[0]?.click();
    assert.deepEqual(calls, ["#30", "checks", "relire"]);
    // Sans gestes — monté hors de l'app —, aucun bouton.
    const only = new Element("div");
    monterLeBanner(doc, only).maj({ cause: { kind: "main-red" }, since: A });
    assert.deepEqual(only.dessous("button"), []);
  });

  test("une station qui refuse le projet : sa ligne ouvre Stations", () => {
    let ouvertes = 0;
    const [line] = linesDeRefusal(doc, [{ station: "box/claude", etat: "refused", dit: "No access.", survol: "Give it access." }], () => void ouvertes++) as unknown as Faux[];
    buttonNomme(line ?? assert.fail("pas de ligne"), "open Cooks").click();
    assert.equal(ouvertes, 1);
    const [sans] = linesDeRefusal(doc, [{ station: "box/claude", etat: "refused", dit: "No access.", survol: "Give it access." }]) as unknown as Faux[];
    assert.deepEqual(sans?.dessous("button"), []);
  });
});

describe("la bande du haut et l'équipe (#4354)", () => {
  test("l'équipe lue montre le supervisor et le closer dans ses badges : la bande n'en repose pas de carte", async () => {
    const vue = await ouvrir({ lireLesAgents: () => structuredClone(TEAM) });
    const rail = await show(vue, { rail: [entree(41, "pris")] });
    await repos();
    const bande = rail.children.find(({ className }) => className === "bande-du-haut") ?? assert.fail("pas de bande du haut");
    assert.deepEqual(bande.dessous("button"), []);
    const badges = vue.element("equipe-du-projet").dessous("button").filter(({ className }) => className.split(" ").includes("badge"));
    assert.deepEqual(badges.slice(0, 2).map(({ dataset }) => dataset.agent), ["supervisor", "closer"]);
  });

  test("le bloc de l'équipe : l'agent du projet lu, rien d'un autre ; une lecture qui change l'équipe le dit, une qui ne change rien, non", async () => {
    const lu: string[] = [];
    const avant = { ...source };
    let rendus: unknown[] = structuredClone(TEAM);
    Object.assign(source, { lire: async () => rendus });
    try {
      const team = holdLTeam(doc, new Element("section"), (project) => void lu.push(project));
      team.lire(PARADE);
      await repos();
      assert.deepEqual(lu, [PARADE]);
      assert.equal(team.agent(PARADE, "closer")?.nextRun.text, "closer: next pass in 3 h");
      assert.equal(team.agent("cantine", "closer"), undefined);
      assert.equal(team.agent(PARADE, "personne"), undefined);
      team.lire(PARADE);
      await repos();
      assert.deepEqual(lu, [PARADE]);
      rendus = [];
      team.lire(PARADE);
      await repos();
      assert.deepEqual(lu, [PARADE, PARADE]);
    } finally {
      Object.assign(source, avant);
    }
  });
});

describe("le plan, colonne par colonne", () => {
  test("le rail vide le dit en tête du backlog ; un rail sans ticket prêt le dit aussi ; sans rien d'autre, pas de « Not ready yet »", async () => {
    const vue = await ouvrir();
    let rail = await show(vue, { rail: [] });
    const duRail = () => colonne(rail, "Backlog").dessous("div").find(({ className }) => className === "du-rail") ?? assert.fail("pas de rail en tête du backlog");
    assert.match(duRail().children[1]?.textContent ?? "", /^No ticket on the rail yet\./);
    rail = await show(vue, { rail: [entree(33, "BLOQUÉ")] });
    assert.equal(duRail().children[1]?.textContent, "no ticket is ready on the rail");
    assert.ok(colonne(rail, "Backlog").dessous("div").some(({ className }) => className === "pas-prets"));
    rail = await show(vue, { rail: [entree(31, "en attente")] });
    assert.equal(colonne(rail, "Backlog").dessous("div").some(({ className }) => className === "pas-prets"), false);
  });

  test("la station d'une carte s'étiquette dans Cooks et Pass, pas dans le backlog", async () => {
    const vue = await ouvrir();
    const rail = await show(vue, { rail: [entree(31, "en attente", { station: "box/claude" }), entree(32, "pris", { station: "box/claude" }), entree(33, "en pass", { station: "mac/claude" })] });
    const etiquette = (card: Faux) => card.dessous("span").find(({ className }) => className.includes("etiquette-station"))?.textContent;
    assert.equal(etiquette(slip(colonne(rail, "Backlog"), 31)), undefined);
    assert.equal(etiquette(slip(colonne(rail, "Cooks"), 32)), "box");
    assert.equal(etiquette(slip(colonne(rail, "Pass"), 33)), "mac");
  });

  test("ce qu'attendre un tiers veut dire s'explique une fois, sous le titre de la colonne où une carte est parked", async () => {
    const vue = await ouvrir({ lireLesExplications: () => ({ vus: [] }), marquerUneExplication: () => ({ vus: [] }) });
    const rail = await show(vue, { rail: [entree(31, "en attente"), entree(32, "pris", { tiers: { ...TIERS, qui: "Camille" } })] });
    await repos();
    const sous = rail.dessous("section").filter((une) => une.children[1]?.dataset.mot === "WAITING").map(({ dataset }) => dataset.colonne);
    assert.deepEqual(sous, ["Cooks"]);
  });
});

describe("le haut du rail, sous la bande", () => {
  test("une ligne sans geste ne passe pas devant une alerte qui en offre un", async () => {
    const vue = await ouvrir();
    const railBlocked = { tickets: [41], depuis: "2026-11-24T09:00:00Z", cause: "manager-muet", stations: [], geste: null, constat: "1 ticket waits for a manager.", phrase: "1 ticket waits for a manager." };
    const rail = await show(vue, { rail: [entree(41, "en attente")], railBloque: railBlocked, alertesDuRail: [{ sorte: "base-rouge", phrase: "Main is red.", fait: { depuis: "2026-11-25T08:00:00Z", ticket: 41 }, geste: "Open it", geree: null }] } as unknown as Facts);
    assert.doesNotMatch(rail.textContent, /waits for a manager/);
    assert.match(rail.textContent, /Main is red/);
  });

  test("la cuisine arrêtée, sur le rail du projet affiché : son bouton ouvre le ticket gelé, ou les checks de main rouge", async () => {
    const vue = await ouvrir({ ouvrirLesChecks: () => true });
    let rail = await show(vue, { rail: [entree(41, "en attente")], arretCuisine: { cause: { kind: "frozen-zone", ticket: 30, zone: "app/" }, since: A } } as unknown as Facts);
    buttonNomme(rail, "open #30").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 30]);
    rail = await show(vue, { rail: [entree(41, "en attente")], arretCuisine: { cause: { kind: "main-red" }, since: A } } as unknown as Facts);
    buttonNomme(rail, "open the checks").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLesChecks"), [PARADE]);
  });

  test("l'équipe lue après le rail : la bande se repose, ses cartes cèdent la place aux badges", async () => {
    let lire: (team: unknown) => void = () => {};
    const vue = await ouvrir({ lireLesAgents: () => new Promise((resolu) => (lire = resolu)) });
    const rail = await show(vue, { rail: [entree(41, "pris")] });
    const cards = () => rail.dessous("button").filter(({ className }) => className.split(" ").includes("carte-d-agent")).map(({ dataset }) => dataset.agent);
    assert.deepEqual(cards(), ["supervisor", "closer"]);
    lire(structuredClone(TEAM));
    await repos();
    assert.deepEqual(cards(), []);
  });

  test("le disjoncteur ouvert n'est plus sur le rail : la bande de l'espace le dit — pas la ligne du projet éteint, que son interrupteur dit", async () => {
    const vue = await ouvrir({ geste: () => undefined });
    await show(vue, { rail: [entree(21, "en attente")] });
    const lu = (command: string, texte: string) => ({ projet: PARADE, demande: 1, a: A, sorties: [{ commande: command, texte }] });
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir([PARADE]);
    bandes.faits(lu("facts", JSON.stringify(facts({ rail: [entree(21, "en attente")], etat: "retenue" }))));
    bandes.status(mettreAPart(lu("status", ["project    parade", "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)", ""].join("\n"))));
    vue.dire("surAlertes", bandes.manager(lu("manager", "manager               ÉTEINT depuis le 2026-11-03T09:25:21.838Z (par chef) — aucune issue n'est jugée, ce qu'il a posé reste posé\n")));
    await repos();
    assert.doesNotMatch(vue.element("alertes").textContent, /project off/);
    assert.match(vue.element("alertes").textContent, /breaker open/);
    assert.doesNotMatch(vue.element("rail").textContent, /breaker open/);
  });
});
