// Le plan de la cuisine dans la vue jouée (ticket 4238) : `facts` tel que le process principal le range, puis ce que la vue
// en pose — la carte parked dans la colonne où elle attend, ce qu'elle dit, le TODO qui ouvre la carte d'un clic, la bande
// du haut que l'équipe lue remplit, et chaque message du haut avec le geste qu'il offre au chef.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { gestesDeCarte } from "../../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { tenirLEquipe } from "../../../src/vue/autonomie/equipe.js";
import { source } from "../../../src/vue/autonomie/source.js";
import { monterLeBandeau } from "../../../src/vue/bandeau-arret/bandeau-arret.js";
import { lignesDeRefus } from "../../../src/vue/projet/rail/refus-de-station.js";
import { estRouge } from "../../../src/vue/todo/todo.js";
import { type Faux, Faux as Element, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";
import { EQUIPE } from "../../autonomie/equipe-fixture.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const doc = { createElement: (balise: string) => new Element(balise) };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
async function ouvrir(reponses: Record<string, unknown> = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (carte) => gestesDeCarte(carte), ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const entree = (ticket: number, etat: string, plus: object = {}) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...plus });
const faits = (plus: Partial<Faits> & { rail: Faits["rail"] }): Faits => ({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...plus });
async function montrer(vue: Jouee, plus: Partial<Faits> & { rail: Faits["rail"] }, a = new Date().toISOString()): Promise<Faux> {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a, sorties: [{ commande: "facts", texte: JSON.stringify(faits(plus)) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue.element("rail");
}
const colonne = (rail: Faux, nom: string): Faux => rail.dessous("section").find(({ dataset }) => dataset.colonne === nom) ?? assert.fail(`pas de colonne ${nom}`);
const bon = (ou: Faux, ticket: number): Faux => ou.dessous("li").find(({ className, dataset }) => className.split(" ").includes("bon") && dataset.ticket === String(ticket)) ?? assert.fail(`pas de carte #${ticket}`);
const parque = (carte: Faux) => carte.dessous("p").find(({ className }) => className === "parque")?.textContent;
const boutonNomme = (ou: Faux, texte: string): Faux => ou.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const TIERS = { quoi: "your call", qui: "the chef", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" };

describe("la carte parked, dans la colonne où elle attend", () => {
  test("parked pour le chef : dans Cooks, rouge, et dans son TODO ; parked pour un tiers : ni rouge, ni dans le TODO", async () => {
    const vue = await ouvrir();
    const rail = await montrer(vue, {
      rail: [entree(51, "pris", { tiers: TIERS }), entree(52, "pris", { tiers: { ...TIERS, qui: "Stripe support" } }), entree(53, "pris")],
      attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }],
    });
    const cooks = colonne(rail, "Cooks");
    assert.equal(parque(bon(cooks, 51)), "parked — waits for the chef, until 28 Nov, 09:00 UTC");
    assert.equal(bon(cooks, 51).dataset.parque, "");
    assert.equal(bon(cooks, 51).dataset.carte, "attente");
    assert.equal(parque(bon(cooks, 52)), "parked — waits for Stripe support, until 28 Nov, 09:00 UTC");
    assert.notEqual(bon(cooks, 52).dataset.carte, "attente");
    assert.equal(parque(bon(cooks, 53)), undefined);
    assert.equal(bon(cooks, 53).dataset.parque, undefined);
    const todo = rail.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("pas de TODO");
    assert.deepEqual(todo.dessous("li").map(({ dataset }) => dataset.ticket), ["51"]);
  });

  test("mis de côté par le runtime : parked dans la colonne où il attend, jusqu'à son retour", async () => {
    const vue = await ouvrir();
    const rail = await montrer(vue, { rail: [entree(40, "86", { attente: { raison: "the project setup", colonne: "en pass", retour: "2026-11-26T12:00:00Z" } }), entree(41, "86", { attente: { raison: "a free place", colonne: "pris", retour: null } })] });
    assert.equal(parque(bon(colonne(rail, "Pass"), 40)), "parked — waits for the project setup, until 26 Nov, 12:00 UTC");
    assert.equal(parque(bon(colonne(rail, "Cooks"), 41)), "parked — waits for a free place, no date set");
  });

  test("une entrée du TODO ouvre la fiche de sa carte, d'un clic", async () => {
    const vue = await ouvrir();
    const rail = await montrer(vue, { rail: [entree(51, "pris", { tiers: TIERS })], attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }] });
    assert.equal(vue.element("fiche").hidden, true);
    const todo = rail.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("pas de TODO");
    boutonNomme(todo, "#51 Ticket 51").click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.equal(vue.element("fiche").dessous("header")[0]?.children[0]?.textContent, "#51");
  });

  test("la carte parked pour le chef est rouge ; parked pour un autre, non", () => {
    const carte = { ticket: 1, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} } as unknown as Parameters<typeof estRouge>[0];
    assert.equal(estRouge({ ...carte, parque: { qui: "the chef", jusqua: null, chef: true } }), true);
    assert.equal(estRouge({ ...carte, parque: { qui: "Camille", jusqua: null } }), false);
  });
});

describe("le process principal pose `parque`", () => {
  test("un ticket qui attend un tiers est parked ; nommé par `attend`, il attend le chef ; mis de côté, jusqu'à son retour", () => {
    const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits({ rail: [entree(51, "pris", { tiers: TIERS }), entree(52, "WAITING", { tiers: TIERS }), entree(40, "86", { attente: { raison: "the setup", colonne: "en pass", retour: null } }), entree(53, "pris")], attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }] })) }] });
    assert.ok("tableau" in recue);
    const cartes = recue.tableau.rail.colonnes.flatMap(({ cartes: siennes }) => siennes);
    const de = (ticket: number) => cartes.find((une) => une.ticket === ticket)?.parque;
    assert.deepEqual(de(51), { qui: "the chef", jusqua: "2026-11-28T09:00:00Z", chef: true });
    assert.deepEqual(de(52), { qui: "the chef", jusqua: "2026-11-28T09:00:00Z" });
    assert.deepEqual(de(40), { qui: "the setup", jusqua: null });
    assert.equal(de(53), undefined);
  });

  test("les checks du dépôt : la page de GitHub Actions d'après une issue lue ; sans issue de GitHub, ou qui ne s'ouvre pas, faux", async () => {
    const tenus = tenirFaits();
    const ouvertes: string[] = [];
    const ouvrirLa = async (adresse: string) => void ouvertes.push(adresse);
    assert.equal(await tenus.ouvrirLesChecks(PARADE, ouvrirLa), false);
    tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits({ rail: [entree(5, "pris", { url: "https://example.org/5" })], attend: [{ ticket: 6, titre: "Six", url: null }], livres: [{ ticket: 7, titre: "Sept", url: "https://github.com/chef/parade/pull/7", livre: A, station: null, pr: null }] })) }] });
    assert.equal(await tenus.ouvrirLesChecks(PARADE, ouvrirLa), true);
    assert.deepEqual(ouvertes, ["https://github.com/chef/parade/actions"]);
    assert.equal(await tenus.ouvrirLesChecks(PARADE, async () => Promise.reject(new Error("no browser"))), false);
    assert.equal(await tenus.ouvrirLesChecks(42, ouvrirLa), false);
    tenus.recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits({ rail: [entree(5, "pris", { url: "https://example.org/5" })] })) }] });
    assert.equal(await tenus.ouvrirLesChecks("cantine", ouvrirLa), false);
    assert.equal(ouvertes.length, 1);
  });
});

describe("chaque message du haut offre un geste", () => {
  const ALERTE = { sorte: "base-rouge", phrase: "Main is red since 08:00.", fait: { depuis: "2026-11-25T08:00:00Z", check: "tests" }, geste: "Open the failing check", geree: null };

  test("une alerte qui nomme un check l'ouvre ; une qui nomme un ticket ouvre son issue", async () => {
    const vue = await ouvrir({ ouvrirLesChecks: () => true });
    let rail = await montrer(vue, { rail: [entree(41, "pris")], alertesDuRail: [ALERTE] as unknown as NonNullable<Faits["alertesDuRail"]> });
    boutonNomme(rail, "open the checks").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLesChecks"), [PARADE]);
    rail = await montrer(vue, { rail: [entree(41, "pris")], alertesDuRail: [{ ...ALERTE, fait: { depuis: ALERTE.fait.depuis, ticket: 41 } }] as unknown as NonNullable<Faits["alertesDuRail"]> });
    boutonNomme(rail, "open #41").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 41]);
  });

  test("les checks qui ne s'ouvrent pas : la vue dit pourquoi", async () => {
    const vue = await ouvrir({ ouvrirLesChecks: () => false });
    const rail = await montrer(vue, { rail: [entree(41, "pris")], alertesDuRail: [ALERTE] as unknown as NonNullable<Faits["alertesDuRail"]> });
    boutonNomme(rail, "open the checks").click();
    await repos();
    assert.match(vue.poses().map(({ textContent }) => textContent).join("\n"), /the repository's checks were not opened/);
  });

  test("une lecture vieille offre de relire : le bouton relit la box", async () => {
    const vue = await ouvrir();
    const rail = await montrer(vue, { rail: [entree(41, "pris")] }, "2026-10-01T00:00:00.000Z");
    const ligne = rail.children.find(({ className }) => className === "relisible") ?? assert.fail("pas de lecture à relire");
    assert.equal(ligne.children[0]?.className, "fraicheur");
    const avant = vue.appels.filter(({ geste }) => geste === "relireBox").length;
    boutonNomme(ligne, "read again").click();
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, avant + 1);
  });

  test("la cuisine arrêtée : ouvrir le ticket gelé, les checks de main rouge, ou relire quand la cause est inconnue", () => {
    const appels: string[] = [];
    const hote = new Element("div");
    const bandeau = monterLeBandeau(doc, hote, { ouvrirTicket: (ticket) => void appels.push(`#${ticket}`), ouvrirLesChecks: () => void appels.push("checks"), relire: () => void appels.push("relire") });
    const geste = () => hote.dessous("button").map(({ textContent }) => textContent);
    bandeau.maj({ cause: { kind: "frozen-zone", ticket: 30, zone: "app/" }, since: A });
    assert.deepEqual(geste(), ["open #30"]);
    hote.dessous("button")[0]?.click();
    bandeau.maj({ cause: { kind: "main-red" }, since: A });
    assert.deepEqual(geste(), ["open the checks"]);
    hote.dessous("button")[0]?.click();
    bandeau.maj({ cause: { kind: "unknown" }, since: A });
    assert.deepEqual(geste(), ["read again"]);
    hote.dessous("button")[0]?.click();
    assert.deepEqual(appels, ["#30", "checks", "relire"]);
    // Sans gestes — monté hors de l'app —, aucun bouton.
    const seul = new Element("div");
    monterLeBandeau(doc, seul).maj({ cause: { kind: "main-red" }, since: A });
    assert.deepEqual(seul.dessous("button"), []);
  });

  test("une station qui refuse le projet : sa ligne ouvre Stations", () => {
    let ouvertes = 0;
    const [ligne] = lignesDeRefus(doc, [{ station: "box/claude", etat: "refused", dit: "No access.", survol: "Give it access." }], () => void ouvertes++) as unknown as Faux[];
    boutonNomme(ligne ?? assert.fail("pas de ligne"), "open Cooks").click();
    assert.equal(ouvertes, 1);
    const [sans] = lignesDeRefus(doc, [{ station: "box/claude", etat: "refused", dit: "No access.", survol: "Give it access." }]) as unknown as Faux[];
    assert.deepEqual(sans?.dessous("button"), []);
  });
});

describe("la bande du haut lit l'équipe", () => {
  test("l'équipe lue remplit la ligne du supervisor et celle du closer, et « its thread » ouvre leur fil", async () => {
    const vue = await ouvrir({ lireLesAgents: () => structuredClone(EQUIPE) });
    const rail = await montrer(vue, { rail: [entree(41, "pris")] });
    await repos();
    const bande = rail.children.find(({ className }) => className === "bande-du-haut") ?? assert.fail("pas de bande du haut");
    const closer = bande.children.find(({ className }) => className === "ligne-du-closer") ?? assert.fail("pas de ligne du closer");
    assert.match(closer.textContent, /last tidy: deleted 412 dead lines/);
    assert.match(closer.textContent, /next tidy: next pass in 3 h/);
    assert.match(bande.children[0]?.textContent ?? "", /parked for you: \d+ so far/);
    boutonNomme(closer, "its thread").click();
    await repos();
    assert.ok(vue.element("equipe-du-projet").dessous("section").some(({ className, ariaLabel }) => className === "fil" && ariaLabel === "closer's thread"));
  });

  test("le bloc de l'équipe : l'agent du projet lu, rien d'un autre ; une lecture qui change l'équipe le dit, une qui ne change rien, non", async () => {
    const lu: string[] = [];
    const avant = { ...source };
    let rendus: unknown[] = structuredClone(EQUIPE);
    Object.assign(source, { lire: async () => rendus });
    try {
      const equipe = tenirLEquipe(doc, new Element("section"), (projet) => void lu.push(projet));
      equipe.lire(PARADE);
      await repos();
      assert.deepEqual(lu, [PARADE]);
      assert.equal(equipe.agent(PARADE, "closer")?.nextRun.text, "closer: next pass in 3 h");
      assert.equal(equipe.agent("cantine", "closer"), undefined);
      assert.equal(equipe.agent(PARADE, "personne"), undefined);
      equipe.lire(PARADE);
      await repos();
      assert.deepEqual(lu, [PARADE]);
      rendus = [];
      equipe.lire(PARADE);
      await repos();
      assert.deepEqual(lu, [PARADE, PARADE]);
    } finally {
      Object.assign(source, avant);
    }
  });
});
