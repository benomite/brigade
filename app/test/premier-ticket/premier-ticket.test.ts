// Le premier ticket d'un projet prêt, écrit dans l'app (#3306, épique #3301). D'abord ses morceaux, devant un faux document :
// la question du second et son champ, le brouillon montré avec « yes » et les changements, l'issue sur le rail, et l'état
// tenu — rien n'est créé avant le « oui ». Puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : « Add a
// project », un dépôt prêt, la question au-dessus du rail, la réponse, le brouillon, une réécriture, puis le « oui ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import {
  CHANGER,
  CREE,
  ENVOYER,
  FERMER,
  LE_SECOND,
  OUI,
  PLUS_TARD,
  poserPremierTicket,
  PRIX_OUI,
  QUESTION,
  REDACTION,
  REECRITURE,
  RELIRE,
  tenirLesPremiersTickets,
  type Etat,
} from "../../src/vue/premier-ticket/premier-ticket.js";
import type { Brouillon, Creation, Demande, Redaction } from "../../../runtime/src/premier-ticket/premier-ticket.ts";
import { Faux, jouerLaVue, type Jouee, type Reponses, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOT = "chef/cantine";
const BROUILLON: Brouillon = { title: "Show the lunch menu on the home page", body: "## Context\n\nGuests should see the menu first.\n\n## Acceptance criteria\n\n- When I open the home page, I see today's menu." };
const REVU: Brouillon = { ...BROUILLON, title: "Show the lunch menu and its prices on the home page" };

const gestesVides = () => {
  const faits: string[] = [];
  return {
    faits,
    ecrire: (texte: string) => void faits.push(`ecrire ${texte}`),
    envoyer: () => void faits.push("envoyer"),
    oui: () => void faits.push("oui"),
    changer: () => void faits.push("changer"),
    fermer: () => void faits.push("fermer"),
  };
};
const poser = (etat: Etat, gestes = gestesVides()) => poserPremierTicket(doc, { depot: DEPOT, etat }, gestes) as unknown as Faux;
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide");
const bouton = (ou: Faux, texte: string) => boutons(ou).find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${boutons(ou).map(({ textContent }) => textContent).join(", ")}`);
const champ = (ou: Faux) => ou.dessous("textarea")[0] ?? assert.fail("pas de champ");
// Tout ce que l'écran montre, survols compris (leur texte est le nom accessible de leur « ? »).
const toutLeTexte = (ou: Faux) => [ou.textContent, ...[...ou.descendants()].map(({ ariaLabel, placeholder, title }) => `${ariaLabel} ${placeholder} ${title}`)].join(" ");

describe("le premier ticket, ses morceaux", () => {
  test("la question : le second demande ce qu'il faut changer d'abord, un champ pour la réponse, « send » éteint tant qu'il est vide", () => {
    const gestes = gestesVides();
    const carte = poser({ etape: "question", reponse: "" }, gestes);
    assert.equal(carte.dataset.etape, "question");
    assert.equal(carte.dessous("p")[0]?.textContent, LE_SECOND);
    assert.equal(carte.dessous("h2")[0]?.textContent, QUESTION(DEPOT));
    assert.equal(QUESTION(DEPOT), "chef/cantine is ready. What do you want to change first?");
    assert.deepEqual(boutons(carte).map(({ textContent }) => textContent), [ENVOYER, PLUS_TARD]);
    const envoyer = bouton(carte, ENVOYER);
    assert.ok(envoyer.className.includes("recommande"));
    assert.equal(envoyer.disabled, true);
    const saisie = champ(carte);
    saisie.value = "Show the menu first";
    saisie.declencher("input");
    assert.equal(envoyer.disabled, false);
    envoyer.click();
    bouton(carte, PLUS_TARD).click();
    assert.deepEqual(gestes.faits, ["ecrire Show the menu first", "envoyer", "fermer"]);
    // Une réponse déjà tapée revient dans le champ ; une rédaction ratée se dit en une ligne, sa cause au survol.
    const ratee = poser({ etape: "question", reponse: "Show the menu first", refus: { dit: "the second did not write the ticket", detail: "not logged in" } });
    assert.equal(champ(ratee).value, "Show the menu first");
    assert.equal(bouton(ratee, ENVOYER).disabled, false);
    assert.ok(ratee.dessous("span").some(({ textContent }) => textContent === "the second did not write the ticket"));
    assert.ok(ratee.dessous("button").some(({ ariaLabel }) => ariaLabel === "not logged in"));
  });

  test("le second écrit : ce que le chef a dit, et rien à faire — puis la même chose pour une réécriture", () => {
    const ecrit = poser({ etape: "redaction", reponse: "Show the menu first" });
    assert.equal(ecrit.dessous("h2")[0]?.textContent, REDACTION);
    assert.ok(ecrit.textContent.includes("“Show the menu first”"));
    assert.deepEqual(boutons(ecrit), []);
    const reecrit = poser({ etape: "redaction", reponse: "Show the menu first", brouillon: BROUILLON, changements: "Add the prices" });
    assert.equal(reecrit.dessous("h2")[0]?.textContent, REECRITURE);
    assert.ok(reecrit.textContent.includes("“Add the prices”"));
  });

  test("le brouillon : son titre, son corps, « yes » recommandé avec son prix au survol, et les changements avec « ask for changes »", () => {
    const gestes = gestesVides();
    const carte = poser({ etape: "brouillon", reponse: "x", brouillon: BROUILLON, changements: "" }, gestes);
    assert.equal(carte.dessous("h2")[0]?.textContent, RELIRE);
    assert.equal(carte.dessous("h3")[0]?.textContent, BROUILLON.title);
    assert.ok(carte.dessous("div").some(({ textContent }) => textContent === BROUILLON.body));
    const oui = bouton(carte, OUI);
    assert.ok(oui.className.includes("recommande"));
    assert.ok(carte.dessous("button").some(({ ariaLabel }) => ariaLabel === PRIX_OUI));
    const changer = bouton(carte, CHANGER);
    assert.equal(changer.className.includes("recommande"), false);
    assert.equal(changer.disabled, true);
    champ(carte).value = "Add the prices";
    champ(carte).declencher("input");
    assert.equal(changer.disabled, false);
    changer.click();
    oui.click();
    assert.deepEqual(gestes.faits, ["ecrire Add the prices", "changer", "oui"]);
  });

  test("le « oui » parti, tout attend ; refusé, le brouillon reste avec la raison ; créé, l'issue est sur le rail", () => {
    const enRoute = poser({ etape: "creation", reponse: "x", brouillon: BROUILLON });
    assert.equal(bouton(enRoute, OUI).disabled, true);
    assert.equal(bouton(enRoute, CHANGER).disabled, true);
    assert.equal(champ(enRoute).disabled, true);
    const refuse = poser({ etape: "brouillon", reponse: "x", brouillon: BROUILLON, changements: "", refus: { dit: "nothing was created: GitHub could not be reached", detail: "gh missing" } });
    assert.equal(bouton(refuse, OUI).disabled, false);
    assert.ok(refuse.dessous("span").some(({ textContent }) => textContent === "nothing was created: GitHub could not be reached"));
    const gestes = gestesVides();
    const cree = poser({ etape: "cree", ticket: 7, url: `https://github.com/${DEPOT}/issues/7` }, gestes);
    assert.equal(cree.dessous("h2")[0]?.textContent, CREE(7));
    assert.equal(CREE(7), "#7 is on the rail: the kitchen serves it.");
    bouton(cree, FERMER).click();
    assert.deepEqual(gestes.faits, ["fermer"]);
  });

  test("aucun écran ne demande d'ouvrir GitHub ni de taper un label : ni `fire`, ni label, ni GitHub à l'écran", () => {
    const etats: Etat[] = [
      { etape: "question", reponse: "" },
      { etape: "redaction", reponse: "x" },
      { etape: "redaction", reponse: "x", brouillon: BROUILLON, changements: "y" },
      { etape: "brouillon", reponse: "x", brouillon: BROUILLON, changements: "" },
      { etape: "creation", reponse: "x", brouillon: BROUILLON },
      { etape: "cree", ticket: 7, url: "https://github.com/chef/cantine/issues/7" },
    ];
    for (const etat of etats) assert.doesNotMatch(toutLeTexte(poser(etat)), /github|label|\bfire\b/i, etat.etape);
  });
});

// Un pont doublé : ce que le second rédige, dans l'ordre ; ce que la création rend. Chaque appel est noté.
function pont(redactions: Redaction[], creation: Creation = { ticket: 7, url: `https://github.com/${DEPOT}/issues/7` }) {
  const rediges: Demande[] = [];
  const crees: Brouillon[] = [];
  return {
    rediges,
    crees,
    rediger: async (_: string, demande: Demande) => (rediges.push(demande), redactions.shift() ?? { refus: "rien", detail: "" }),
    creer: async (_: string, brouillon: Brouillon) => (crees.push(brouillon), creation),
  };
}

describe("le premier ticket tenu", () => {
  test("la réponse part au second ; son brouillon revient — et rien n'est créé avant le « oui »", async () => {
    const doublure = pont([{ draft: BROUILLON }]);
    const rendus: string[] = [];
    const tenus = tenirLesPremiersTickets({ rendre: (projet) => void rendus.push(projet), ...doublure });
    tenus.commencer("cantine");
    assert.deepEqual(tenus.de("cantine"), { etape: "question", reponse: "" });
    // Vide, rien ne part.
    await tenus.envoyer("cantine");
    assert.deepEqual(doublure.rediges, []);
    tenus.ecrire("cantine", "Show the menu first");
    const envoi = tenus.envoyer("cantine");
    assert.equal(tenus.de("cantine")?.etape, "redaction");
    await envoi;
    assert.deepEqual(doublure.rediges, [{ answer: "Show the menu first" }]);
    assert.deepEqual(tenus.de("cantine"), { etape: "brouillon", reponse: "Show the menu first", brouillon: BROUILLON, changements: "" });
    assert.deepEqual(doublure.crees, []);
    // Une nouvelle question ne revient pas sur un brouillon tenu.
    tenus.commencer("cantine");
    assert.equal(tenus.de("cantine")?.etape, "brouillon");
    assert.ok(rendus.length > 0 && rendus.every((projet) => projet === "cantine"));
  });

  test("les changements font réécrire, avec le brouillon vu ; la boucle se répète, et toujours rien n'est créé", async () => {
    const doublure = pont([{ draft: BROUILLON }, { draft: REVU }, { refus: "the second did not write the ticket", detail: "timeout" }]);
    const tenus = tenirLesPremiersTickets({ rendre: () => {}, ...doublure });
    tenus.commencer("cantine");
    tenus.ecrire("cantine", "Show the menu first");
    await tenus.envoyer("cantine");
    // Sans changements tapés, rien ne part.
    await tenus.changer("cantine");
    assert.equal(doublure.rediges.length, 1);
    tenus.ecrire("cantine", "Add the prices");
    await tenus.changer("cantine");
    assert.deepEqual(doublure.rediges[1], { answer: "Show the menu first", draft: BROUILLON, changes: "Add the prices" });
    assert.deepEqual(tenus.de("cantine"), { etape: "brouillon", reponse: "Show the menu first", brouillon: REVU, changements: "" });
    // Une réécriture ratée garde le brouillon vu et les changements tapés, et le dit.
    tenus.ecrire("cantine", "Shorter title");
    await tenus.changer("cantine");
    assert.deepEqual(doublure.rediges[2], { answer: "Show the menu first", draft: REVU, changes: "Shorter title" });
    assert.deepEqual(tenus.de("cantine"), { etape: "brouillon", reponse: "Show the menu first", brouillon: REVU, changements: "Shorter title", refus: { dit: "the second did not write the ticket", detail: "timeout" } });
    assert.deepEqual(doublure.crees, []);
  });

  test("le « oui » crée une fois le brouillon montré ; refusé, il reste, et un second « oui » le reprend", async () => {
    const doublure = pont([{ draft: BROUILLON }], { refus: "nothing was created: GitHub could not be reached", detail: "gh missing" });
    const tenus = tenirLesPremiersTickets({ rendre: () => {}, ...doublure });
    // Pas de brouillon : le « oui » ne crée rien.
    tenus.commencer("cantine");
    await tenus.oui("cantine");
    assert.deepEqual(doublure.crees, []);
    tenus.ecrire("cantine", "Show the menu first");
    await tenus.envoyer("cantine");
    const premier = tenus.oui("cantine");
    // Parti : un second clic ne crée pas une seconde issue.
    await tenus.oui("cantine");
    await premier;
    assert.deepEqual(doublure.crees, [BROUILLON]);
    assert.deepEqual(tenus.de("cantine"), { etape: "brouillon", reponse: "Show the menu first", brouillon: BROUILLON, changements: "", refus: { dit: "nothing was created: GitHub could not be reached", detail: "gh missing" } });
    await tenus.oui("cantine");
    assert.deepEqual(doublure.crees, [BROUILLON, BROUILLON]);
    const ok = tenirLesPremiersTickets({ rendre: () => {}, ...pont([{ draft: BROUILLON }]) });
    ok.commencer("cantine");
    ok.ecrire("cantine", "Show the menu first");
    await ok.envoyer("cantine");
    await ok.oui("cantine");
    assert.deepEqual(ok.de("cantine"), { etape: "cree", ticket: 7, url: `https://github.com/${DEPOT}/issues/7` });
  });

  test("un pont qui lève : la rédaction et la création se disent ratées, rien n'est tenu pour fait", async () => {
    const tenus = tenirLesPremiersTickets({
      rendre: () => {},
      rediger: async () => Promise.reject(new Error("ipc closed")),
      creer: async () => Promise.reject(new Error("ipc closed")),
    });
    tenus.commencer("cantine");
    tenus.ecrire("cantine", "x");
    await tenus.envoyer("cantine");
    assert.deepEqual(tenus.de("cantine"), { etape: "question", reponse: "x", refus: { dit: "the app could not ask the second to write the ticket", detail: "ipc closed" } });
    const creation = tenirLesPremiersTickets({ rendre: () => {}, rediger: async () => ({ draft: BROUILLON }), creer: async () => Promise.reject(new Error("ipc closed")) });
    creation.commencer("cantine");
    creation.ecrire("cantine", "x");
    await creation.envoyer("cantine");
    await creation.oui("cantine");
    assert.deepEqual(creation.de("cantine"), { etape: "brouillon", reponse: "x", brouillon: BROUILLON, changements: "", refus: { dit: "nothing was created: GitHub could not be reached", detail: "ipc closed" } });
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const A = "2026-11-11T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => () => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const faits = (): Faits => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
});
const page = (vue: Jouee) => vue.element("parcours-premier-projet");
const premier = (vue: Jouee) => page(vue).dessous("section").find(({ className }) => className.split(" ").includes("premier-ticket")) ?? assert.fail("pas de premier ticket");

// Un ordinateur sans projet : « Add a project », chef/cantine choisi — prêt pour Brigade —, cet ordinateur le cuit.
async function cantinePrete(reponses: Reponses) {
  let vue: Jouee | undefined;
  vue = await jouerLaVue({
    demarrage: demarrage(),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    depotsDuChef: () => ({ depots: [{ depot: DEPOT, base: "main" }] }),
    ouvrirDUneStation: (nom, depot, base) => {
      vue?.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [{ nom, dossier: `/home/chef/Brigade/${nom}`, depot, base: base ?? "main" } satisfies Projet] }), []);
      return { state: "open", project: nom, repository: depot, folder: `/home/chef/Brigade/${nom}`, cloned: true };
    },
    projetsServis: () => ({ depots: [] }),
    servirUnProjet: (depot) => ({ depots: [depot] }),
    checkRepoSetup: () => ({ ready: true, missingBindings: [], missingLabels: [] }),
    espace: () => [SECOND],
    departDuProjet: () => ({ aucune: true }),
    ...reponses,
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  bouton(vue.element("ajout"), DEPOT).click();
  await repos();
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits()) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
  bouton(page(vue), "this computer").click();
  await repos();
  return vue;
}
const taper = async (vue: Jouee, texte: string) => {
  const saisie = champ(premier(vue));
  saisie.value = texte;
  saisie.declencher("input");
  await repos();
};
const gestesDuPont = (vue: Jouee, geste: string) => vue.appels.filter((appel) => appel.geste === geste).map(({ args }) => args);

describe("la vue jouée : un projet prêt, son premier ticket écrit dans l'app", () => {
  test("la question sur le projet prêt, la réponse, le brouillon, une réécriture, puis le « oui » : une seule création, après le « oui »", async () => {
    const redactions: Redaction[] = [{ draft: BROUILLON }, { draft: REVU }];
    const vue = await cantinePrete({
      redigerLePremierTicket: () => redactions.shift() ?? { refus: "rien", detail: "" },
      creerLePremierTicket: () => ({ ticket: 7, url: `https://github.com/${DEPOT}/issues/7` }),
    });
    // Prêt : le rail reprend la page, et au-dessus le second demande au chef ce qu'il veut changer d'abord.
    assert.equal(vue.element("main").dataset.parcours, undefined);
    assert.equal(premier(vue).dataset.etape, "question");
    assert.equal(premier(vue).dessous("h2")[0]?.textContent, QUESTION(DEPOT));
    await taper(vue, "Show the menu first");
    bouton(premier(vue), ENVOYER).click();
    await repos();
    assert.deepEqual(gestesDuPont(vue, "redigerLePremierTicket"), [["cantine", { answer: "Show the menu first" }]]);
    // Le brouillon montré : son titre et son corps ; rien n'est créé.
    assert.equal(premier(vue).dataset.etape, "brouillon");
    assert.equal(premier(vue).dessous("h3")[0]?.textContent, BROUILLON.title);
    assert.deepEqual(gestesDuPont(vue, "creerLePremierTicket"), []);
    // Des changements : le second réécrit, avec le brouillon vu ; toujours rien de créé.
    await taper(vue, "Add the prices");
    bouton(premier(vue), CHANGER).click();
    await repos();
    assert.deepEqual(gestesDuPont(vue, "redigerLePremierTicket")[1], ["cantine", { answer: "Show the menu first", draft: BROUILLON, changes: "Add the prices" }]);
    assert.equal(premier(vue).dessous("h3")[0]?.textContent, REVU.title);
    assert.deepEqual(gestesDuPont(vue, "creerLePremierTicket"), []);
    // Le « oui » : une création, du brouillon montré ; l'issue est sur le rail.
    bouton(premier(vue), OUI).click();
    await repos();
    assert.deepEqual(gestesDuPont(vue, "creerLePremierTicket"), [["cantine", REVU]]);
    assert.equal(premier(vue).dessous("h2")[0]?.textContent, CREE(7));
    // Rien n'a été écrit dans le terminal du second : le chef n'a rien à y taper.
    assert.deepEqual(gestesDuPont(vue, "ecrire"), []);
    bouton(premier(vue), FERMER).click();
    await repos();
    assert.equal(page(vue).hidden, true);
  });

  test("une rédaction qui échoue se dit sur la question, la réponse gardée ; « send » la reprend", async () => {
    const redactions: Redaction[] = [{ refus: "the second did not write the ticket", detail: "not logged in" }, { draft: BROUILLON }];
    const vue = await cantinePrete({ redigerLePremierTicket: () => redactions.shift() ?? { refus: "rien", detail: "" } });
    await taper(vue, "Show the menu first");
    bouton(premier(vue), ENVOYER).click();
    await repos();
    assert.equal(premier(vue).dataset.etape, "question");
    assert.equal(champ(premier(vue)).value, "Show the menu first");
    assert.ok(premier(vue).dessous("span").some(({ textContent }) => textContent === "the second did not write the ticket"));
    bouton(premier(vue), ENVOYER).click();
    await repos();
    assert.equal(premier(vue).dataset.etape, "brouillon");
    assert.deepEqual(gestesDuPont(vue, "creerLePremierTicket"), []);
  });
});
