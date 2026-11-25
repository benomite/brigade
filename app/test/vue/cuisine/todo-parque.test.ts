// Le TODO du chef est exactement les tickets parked pour lui (#4261, règle 13 de la spec du 2026-11-24) : qui un ticket
// attend décide, pas d'être nommé par la file, ni une date passée. Chaque entrée dit ce qui est demandé au chef et porte les
// boutons de sa carte ; un clic y répond. D'abord ce que le process principal pose (faits.ts), puis l'entrée seule devant un
// faux document (vue/cuisine/cuisine.js), puis la vue jouée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { GESTES_D_ATTENTE } from "../../../src/attente.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import type { CarteDeTodo } from "../../../src/carte-todo.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Carte, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { ceQuiTAttend, gestesDuTodo, planDeLaCuisine, poserLeTodo } from "../../../src/vue/cuisine/cuisine.js";
import { rangerLeRail } from "../../../src/vue/todo/todo.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const entree = (ticket: number, etat: string, plus: object = {}) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...plus });
const faits = (plus: Partial<Faits> & { rail: Faits["rail"] }): Faits => ({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...plus });
const tiers = (qui: string, relance: string) => ({ quoi: "the signed quote", qui, depuis: "2026-11-20T10:00:00Z", relance, aLArrivee: "goes back to the kitchen" });
// La carte que le manager pose au chef, lue de GitHub : sa question, ses deux choix.
const QUESTION = { sorte: "product-question", texte: "Ship the export as CSV?\n- [resume] Yes, ship it\n- [close] No, drop it" };

// #50 attend le chef (sa carte) ; #51 est parked pour le chef ; #52 est nommé par la file mais parked pour Stripe ; #53 est
// parked pour le client jusqu'à une date passée ; #54 cuit ; #70 attend bob.
const MONDE = faits({
  rail: [
    entree(51, "pris", { tiers: tiers("the chef", "2026-11-28T09:00:00Z") }),
    entree(52, "pris", { tiers: tiers("Stripe support", "2026-11-28T09:00:00Z") }),
    entree(53, "WAITING", { tiers: tiers("the client", "2026-11-24T09:00:00Z") }),
    entree(54, "pris"),
  ],
  attend: [
    { ticket: 50, titre: "Ticket 50", url: url(50), chef: QUESTION },
    { ticket: 52, titre: "Ticket 52", url: url(52) },
  ],
  attendAutres: [{ ticket: 70, titre: "Ticket 70", url: url(70), chef: QUESTION, qui: ["bob"] }],
});
function cartesDe(lus: Faits) {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(lus) }] });
  assert.ok("tableau" in recue);
  return recue.tableau.rail.colonnes;
}

describe("le TODO est exactement les tickets parked pour le chef", () => {
  test("ce qui attend le chef est parked pour lui, pour sa question ; ce qui attend un autre humain, pour lui", () => {
    const colonnes = cartesDe(MONDE);
    const de = (ticket: number) => colonnes.flatMap(({ cartes, autres }) => [...cartes, ...(autres ?? [])]).find((une) => une.ticket === ticket)?.parque;
    assert.deepEqual(de(50), { qui: "the chef", quoi: "Ship the export as CSV?", jusqua: null, chef: true });
    assert.deepEqual(de(70), { qui: "bob", quoi: "Ship the export as CSV?", jusqua: null });
    assert.deepEqual(de(51), { qui: "the chef", quoi: "the signed quote", jusqua: "2026-11-28T09:00:00Z", chef: true });
    assert.deepEqual(de(52), { qui: "Stripe support", quoi: "the signed quote", jusqua: "2026-11-28T09:00:00Z" });
    assert.equal(de(54), undefined);
  });

  test("le TODO : parked pour le chef, oui ; parked pour un autre, nommé par la file ou non, ou jusqu'à une date passée, non", () => {
    const plan = planDeLaCuisine(rangerLeRail(cartesDe(MONDE)).colonnes);
    assert.deepEqual(ceQuiTAttend(plan).map(({ ticket }) => ticket).sort(), [50, 51]);
  });

  test("ce que sa carte attend, faute de question, est ce qui est demandé au chef", () => {
    const colonnes = cartesDe(faits({ rail: [entree(55, "en attente")], attend: [{ ticket: 55, titre: "Ticket 55", url: url(55) }] }));
    const parque = colonnes.flatMap(({ cartes }) => cartes).find(({ ticket }) => ticket === 55)?.parque;
    assert.deepEqual(parque, { qui: "the chef", quoi: "no question found on #55", jusqua: null, chef: true });
  });
});

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARKED = { qui: "the chef", jusqua: null, chef: true };
const carte = (ticket: number, plus: Partial<Carte> = {}): Carte => ({ ticket, titre: `Ticket ${ticket}`, ouvrable: true, attendu: true, attend: [], dit: [], fiche: {} as Carte["fiche"], parque: PARKED, ...plus }) as Carte;
const todo = (plus: Partial<CarteDeTodo> = {}): CarteDeTodo => ({ sorte: "product-question", question: "Ship it?", choix: [{ texte: "Yes", prix: "" }, { texte: "No", prix: "" }], prixDuTexte: "", ...plus });
type Joue = [number, string, unknown];
function gestes(etape: "repos" | "envoi" | "refus" = "repos") {
  const joues: Joue[] = [];
  const etat = etape === "envoi" ? { etape, reponse: { question: "Ship it?", choix: 1 } } : etape === "refus" ? { etape, dit: "no", detail: "" } : { etape };
  return { joues, gestes: { etat: () => etat as never, attente: GESTES_D_ATTENTE, jouer: (ticket: number, sorte: string, reponse?: unknown) => void joues.push([ticket, sorte, reponse]) } };
}
const boutons = (ou: Faux) => ou.dessous("button").filter(({ dataset }) => dataset.bouton !== "discret");

describe("chaque entrée du TODO dit ce qui est demandé, avec ses boutons", () => {
  test("la question, puis un bouton par choix, le premier recommandé ; un clic y répond", () => {
    const { joues, gestes: siens } = gestes();
    const posee = poserLeTodo(doc, { cartes: [carte(50, { todo: todo(), parque: { ...PARKED, quoi: "Ship it?" } })], ouvrir: () => {}, gestes: siens as never }) as unknown as Faux;
    const [li] = posee.dessous("li");
    assert.ok(li !== undefined);
    assert.deepEqual(li.dessous("p").map(({ className, textContent }) => [className, textContent]), [["demande-du-todo", "Ship it?"]]);
    assert.deepEqual(boutons(li).map(({ textContent, className }) => [textContent, className]), [["Yes", "recommande"], ["No", ""]]);
    boutons(li)[1]?.click();
    assert.deepEqual(joues, [[50, "repondre", { question: "Ship it?", choix: 2 }]]);
  });

  test("la recommandation de la carte est le bouton plein ; sans recommandation, aucun", () => {
    const { gestes: siens } = gestes();
    const textes = (une: CarteDeTodo) => gestesDuTodo(carte(50, { todo: une }), siens as never).map(({ texte, recommande, reponse }) => [texte, recommande, reponse]);
    assert.deepEqual(textes(todo({ recommandation: { rang: 2, pourquoi: null } as never })), [["Yes", false, { question: "Ship it?", choix: 1 }], ["No", true, { question: "Ship it?", choix: 2 }]]);
    assert.deepEqual(textes(todo({ recommandation: null })), [["Yes", false, { question: "Ship it?", choix: 1 }], ["No", false, { question: "Ship it?", choix: 2 }]]);
  });

  test("sa réponse en route, ses choix attendent ; refusée, ils reviennent", () => {
    assert.deepEqual(gestesDuTodo(carte(50, { todo: todo() }), gestes("envoi").gestes as never), []);
    assert.equal(gestesDuTodo(carte(50, { todo: todo() }), gestes("refus").gestes as never).length, 2);
  });

  test("un écran à valider : « Validate » ; une revue : « Merge » — chacun joue le sien", () => {
    const { joues, gestes: siens } = gestes();
    const validation = carte(60, { todo: todo({ sorte: "design-validation", choix: [], validation: { pr: 9, ticket: 60 } }) });
    const revue = carte(62, { todo: todo({ sorte: "sensitive-review", choix: [], revue: { pr: 8, ticket: 62 } }) });
    const posee = poserLeTodo(doc, { cartes: [validation, revue], ouvrir: () => {}, gestes: siens as never }) as unknown as Faux;
    const [premiere, seconde] = posee.dessous("li");
    assert.deepEqual(boutons(premiere as Faux).map(({ textContent, className }) => [textContent, className]), [["Validate", "recommande"]]);
    assert.deepEqual(boutons(seconde as Faux).map(({ textContent }) => textContent), ["Merge"]);
    boutons(premiere as Faux)[0]?.click();
    boutons(seconde as Faux)[0]?.click();
    assert.deepEqual(joues, [[60, "valider", undefined], [62, "merger", undefined]]);
  });

  test("une carte de WAITING parked pour le chef : « resume » et « it arrived » ; « waiting for… » n'y répond pas", () => {
    const { joues, gestes: siens } = gestes();
    const attente = carte(51, { attendu: false, gestes: ["attente-reprendre", "attente-arrivee"] });
    const posee = poserLeTodo(doc, { cartes: [attente, carte(52, { gestes: ["attente-poser"] })], ouvrir: () => {}, gestes: siens as never }) as unknown as Faux;
    const [premiere, seconde] = posee.dessous("li");
    assert.deepEqual(boutons(premiere as Faux).map(({ textContent }) => textContent), ["resume", "it arrived, back to the kitchen"]);
    assert.deepEqual(boutons(seconde as Faux), []);
    assert.deepEqual((seconde as Faux).dessous("div"), []);
    boutons(premiere as Faux)[1]?.click();
    assert.deepEqual(joues, [[51, "attente-arrivee", undefined]]);
  });

  test("sans gestes — un projet en lecture seule —, la question se lit, aucun bouton ; sans question, aucune ligne", () => {
    const posee = poserLeTodo(doc, { cartes: [carte(50, { todo: todo(), parque: { ...PARKED, quoi: "Ship it?" } }), carte(53, { titre: undefined })], ouvrir: () => {} }) as unknown as Faux;
    const [premiere, seconde] = posee.dessous("li");
    assert.deepEqual(boutons(premiere as Faux), []);
    assert.equal((premiere as Faux).dessous("p")[0]?.textContent, "Ship it?");
    assert.deepEqual((seconde as Faux).dessous("p"), []);
    // Son numéro, son titre s'il en a un, et ce qui la tient parked au survol.
    assert.deepEqual(posee.dessous("button").map(({ textContent }) => textContent), ["#50 Ticket 50", "#53"]);
    assert.equal(posee.dessous("button")[1]?.title, "open #53's card — parked — waits for the chef, no date set");
  });
});

// La vue jouée : le TODO pose les boutons de chaque carte, et un clic part comme depuis la carte.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES, attente: GESTES_D_ATTENTE },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
async function montrer(lus: Faits): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], ouvrirIssue: () => true, repondreCarte: () => ({ repondue: true, dit: "posted", commentaire: 7 }), attente: () => ({ fait: "done", detail: "" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(lus) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const leTodo = (vue: Jouee): Faux => vue.element("rail").children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("pas de TODO");
const entreeDe = (vue: Jouee, ticket: number): Faux => leTodo(vue).dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`pas d'entrée #${ticket}`);
const appelsDe = (vue: Jouee, geste: string) => vue.appels.filter((appel) => appel.geste === geste).map(({ args }) => args);
const bon = (vue: Jouee, ticket: number): Faux => vue.element("rail").dessous("li").find(({ className, dataset }) => className.split(" ").includes("bon") && dataset.ticket === String(ticket)) ?? assert.fail(`pas de carte #${ticket}`);

describe("la vue : le TODO, ses questions et ses boutons", () => {
  test("seuls #50 et #51 sont dans le TODO, rouges ; #52 et #53, parked pour un autre, ne le sont pas", async () => {
    const vue = await montrer(MONDE);
    assert.deepEqual(leTodo(vue).dessous("li").map(({ dataset }) => Number(dataset.ticket)).sort(), [50, 51]);
    assert.equal(leTodo(vue).children[0]?.textContent, "TODO (2)");
    assert.deepEqual([50, 51, 52, 53].map((ticket) => bon(vue, ticket).dataset.carte === "attente"), [true, true, false, false]);
    assert.equal(entreeDe(vue, 50).dessous("p")[0]?.textContent, "Ship the export as CSV?");
    assert.equal(entreeDe(vue, 51).dessous("p")[0]?.textContent, "the signed quote");
  });

  test("un choix cliqué dans le TODO part comme depuis la carte : la réponse, avec sa question", async () => {
    const vue = await montrer(MONDE);
    (boutons(entreeDe(vue, 50)).find(({ textContent }) => textContent === "No, drop it") ?? assert.fail("pas de « No, drop it »")).click();
    await repos();
    assert.deepEqual(appelsDe(vue, "repondreCarte"), [[PARADE, 50, { question: "Ship the export as CSV?", choix: 2 }]]);
  });

  test("« resume » et « it arrived » d'une carte de WAITING parked pour le chef partent comme depuis sa carte", async () => {
    const vue = await montrer(MONDE);
    (boutons(entreeDe(vue, 51)).find(({ textContent }) => textContent === "resume") ?? assert.fail("pas de « resume »")).click();
    await repos();
    (boutons(entreeDe(vue, 51)).find(({ textContent }) => textContent === "it arrived, back to the kitchen") ?? assert.fail("pas de « it arrived »")).click();
    await repos();
    assert.deepEqual(appelsDe(vue, "attente").map(([projet, id, ticket]) => [projet, id, ticket]), [[PARADE, "attente-reprendre", 51], [PARADE, "attente-arrivee", 51]]);
  });

  test("un projet en lecture seule : le TODO dit ses questions, sans un bouton", async () => {
    const vue = await montrer({ ...MONDE, lectureSeule: { depot: "chef/parade" } });
    assert.equal(entreeDe(vue, 50).dessous("p")[0]?.textContent, "Ship the export as CSV?");
    assert.deepEqual(boutons(entreeDe(vue, 50)), []);
    assert.deepEqual(boutons(entreeDe(vue, 51)), []);
  });
});
