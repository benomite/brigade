// Les cartes ne disparaissent pas de la vue du rail tant que GitHub les tient (#2151) : la vue jouée telle qu'elle est,
// devant un faux document (aides/fausse-vue.ts), sur ce que le process principal range des lectures du tableau de la
// cuisine (faits.ts).
//   - Une lecture ratée en ligne — GitHub qui limite les appels, refuse, ne répond pas à temps — ne vide aucune colonne :
//     le dernier rail lu reste, et une ligne dit qu'il est périmé, et depuis quand.
//   - Tant que le chef répond sur une carte de TODO, aucune lecture ne la retire, ne la redessine ni ne la déplace, et son
//     texte n'est jamais perdu ; résolue entre-temps, la carte le dit à côté de son texte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import type { Rendu } from "../src/carte-todo.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { RailDuProjet } from "../../runtime/src/appairage/rail-du-projet.ts";
import { carteDuTicket, type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-11-03T16:${String(minute).padStart(2, "0")}:00.000Z`;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const PRODUIT = {
  type: "product",
  resume: "The journal export is ready to cook. It can write one file per project, or one for all.",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
  captures: null,
};
// Le rail lu : #14 en cuisine, #21 qui attend le chef sur sa carte.
const FAITS: Faits = {
  etat: "ouverte",
  lu: a(0),
  dernierTick: a(0),
  compteurs: { rail: 2, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: ISSUE(14), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 21, titre: "L'export du journal", url: ISSUE(21), decision: { quoi: "carte", motif: "product", cause: PRODUIT.question, pr: null }, carte: PRODUIT }],
};
// Le chef a tranché #21 ailleurs (sur GitHub, son téléphone) : la cuisine l'a pris.
const TRANCHE: Faits = { ...FAITS, compteurs: { ...FAITS.compteurs, auTravail: 2, attend: 0 }, rail: [FAITS.rail[0]!, { ...FAITS.rail[1]!, etat: "pris" }], attend: [] };
// Un autre ticket arrive sur le rail, #21 attend toujours.
const ARRIVE: Faits = { ...FAITS, compteurs: { ...FAITS.compteurs, rail: 3 }, rail: [...FAITS.rail, { ticket: 30, etat: "en attente", titre: "Un ticket neuf", url: ISSUE(30), activite: null }] };

const demarrage = (servi: boolean) => () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => servi),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Ce que le gist des stations dit d'un projet qu'aucune station du compte ne sert (rail-du-projet.ts) : la phrase que
// l'écran du chef montrait à la place de ses colonnes.
const NON_SERVI: RailDuProjet = { state: "unavailable", project: PARADE, cause: "not-served", reason: `No rail of ${PARADE} is published for this GitHub account: sign in to GitHub with the account your stations publish to.` };

async function ouvrir(reponses: Reponses = {}, servi = true): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(servi), espace: () => [], railDuProjet: () => NON_SERVI, ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Une lecture du tableau, passée par le process principal tel qu'il est.
const lu = (faits: Faits, minute: number): Dessinable => tenirFaits().recevoir({ projet: PARADE, demande: 0, a: a(minute), sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
// Une lecture du tableau ratée en ligne : GitHub a répondu, mais n'a pas donné le tableau (tableau/lecture.ts).
const LIMITE = "GitHub refused to read the rail of chef/parade (HTTP 403): API rate limit exceeded for user ID 1.";
const ratee = (minute: number): Dessinable => tenirFaits().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: LIMITE, atteinte: true, cas: null, duTableau: true });
const recevoir = (vue: Jouee, recue: Dessinable) => vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });

const colonnes = (vue: Jouee) => vue.element("rail").dessous("section").filter(({ className }) => className === "colonne");
const contenu = (vue: Jouee) => colonnes(vue).map((colonne) => [colonne.children[0]?.children[0]?.textContent, colonne.dessous("li").filter(({ className }) => className === "bon").map((bon) => bon.children[0]?.children[0]?.textContent)]);
const perime = (vue: Jouee) => vue.element("rail").dessous("p").filter(({ className }) => className.split(" ").includes("perime"));
const heure = (minute: number) => new Date(a(minute)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const carteTodo = (bon: Faux) => bon.dessous("section").find(({ className }) => className === "carte-todo") ?? assert.fail("pas de carte de TODO");
const champ = (bon: Faux) => bon.dessous("textarea")[0] ?? assert.fail("pas de champ");
const resolue = (bon: Faux) => bon.dessous("p").find(({ className }) => className === "resolue-entre-temps")?.textContent;
function taper(bon: Faux, texte: string): Faux {
  const saisie = champ(bon);
  carteTodo(bon).declencher("focusin");
  saisie.value = texte;
  saisie.declencher("input");
  return saisie;
}

describe("une lecture ratée ne vide aucune colonne (#2151)", () => {
  test("le dernier rail lu reste, entier, et une ligne dit qu'il est périmé depuis la première lecture ratée — la raison au survol ; la lecture revenue, la ligne part", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS, 0));
    const lus = contenu(vue);
    assert.ok(lus.flatMap(([, tickets]) => tickets ?? []).length === 2, JSON.stringify(lus));

    recevoir(vue, ratee(2));
    recevoir(vue, ratee(3));
    assert.deepEqual(contenu(vue), lus);
    assert.doesNotMatch(vue.element("rail").textContent, /not drawn|NOT READ/);
    assert.deepEqual(
      perime(vue).map(({ textContent }) => textContent),
      [`stale since ${heure(2)} — the rail shown was read at ${heure(0)}, and the readings since have failed`],
    );
    assert.match(perime(vue)[0]?.title ?? "", /API rate limit exceeded/);

    recevoir(vue, lu(ARRIVE, 4));
    assert.deepEqual(perime(vue), []);
    assert.ok(carteDuTicket(vue, 30) !== undefined);
  });

  test("un projet qu'aucune station de cet ordinateur ne sert garde ses colonnes : la phrase du gist des stations ne prend pas leur place", async () => {
    const vue = await ouvrir({}, false);
    recevoir(vue, lu(FAITS, 0));
    const lus = contenu(vue);
    assert.ok(lus.length > 0);

    recevoir(vue, ratee(2));
    assert.deepEqual(contenu(vue), lus);
    assert.doesNotMatch(vue.element("rail").textContent, /No rail of parade is published/);
    assert.equal(perime(vue).length, 1);
  });

  test("sans rien de lu avant, la lecture ratée se dit comme avant : il n'y a pas de rail à garder", async () => {
    const vue = await ouvrir();
    recevoir(vue, ratee(2));
    assert.deepEqual(colonnes(vue), []);
    assert.match(vue.element("rail").textContent, /the rail is not drawn: NOT READ FROM GITHUB — tried at /);
  });
});

describe("la carte où le chef répond ne bouge pas sous ses mains (#2151)", () => {
  test("une lecture qui arrive pendant qu'il tape ne retire, ne redessine ni ne déplace la carte : la même, son texte dedans ; le clavier parti, la lecture est posée", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS, 0));
    const bon = carteDuTicket(vue, 21) ?? assert.fail("pas de carte #21");
    const saisie = taper(bon, "One per project, and say so in the README");
    const avant = contenu(vue);

    recevoir(vue, lu(ARRIVE, 1));
    assert.equal(carteDuTicket(vue, 21), bon);
    assert.equal(champ(bon), saisie);
    assert.equal(saisie.value, "One per project, and say so in the README");
    assert.deepEqual(contenu(vue), avant);
    assert.equal(resolue(bon), undefined);

    carteTodo(bon).declencher("focusout", { relatedTarget: null });
    assert.ok(carteDuTicket(vue, 30) !== undefined);
    const reposee = carteDuTicket(vue, 21) ?? assert.fail("pas de carte #21");
    assert.equal(champ(reposee).value, "One per project, and say so in the README");
  });

  test("passer du champ à un bouton de la même carte la garde tenue", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS, 0));
    const bon = carteDuTicket(vue, 21) ?? assert.fail("pas de carte #21");
    taper(bon, "A single one");
    const envoyer = bon.dessous("button").find(({ textContent }) => textContent === "send") ?? assert.fail("pas de « send »");
    carteTodo(bon).declencher("focusout", { relatedTarget: envoyer });
    recevoir(vue, lu(ARRIVE, 1));
    assert.equal(carteDuTicket(vue, 21), bon);
    assert.equal(carteDuTicket(vue, 30), undefined);
  });

  test("résolue entre-temps, la carte le dit à côté du texte du chef, sans l'effacer ; le clavier parti, elle reste dans TODO avec son texte, jusqu'à ce qu'il l'écarte", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS, 0));
    const bon = carteDuTicket(vue, 21) ?? assert.fail("pas de carte #21");
    const saisie = taper(bon, "One per project");

    recevoir(vue, lu(TRANCHE, 1));
    assert.equal(carteDuTicket(vue, 21), bon);
    assert.equal(saisie.value, "One per project");
    assert.equal(resolue(bon), "resolved meanwhile: #21 is now in Taken — your text is kept here, nothing was sent");

    carteTodo(bon).declencher("focusout", { relatedTarget: null });
    const [taken, todo] = ["Taken", "Todo"].map((nom) => colonnes(vue).find((colonne) => colonne.children[0]?.children[0]?.textContent === nom) ?? assert.fail(`pas de colonne ${nom}`));
    assert.ok(taken?.dessous("li").some((li) => li.children[0]?.children[0]?.textContent === "#21"));
    const gardee = todo?.dessous("li").find((li) => li.children[0]?.children[0]?.textContent === "#21") ?? assert.fail("la réponse du chef n'est plus dans TODO");
    assert.equal(champ(gardee).value, "One per project");
    assert.equal(resolue(gardee), "resolved meanwhile: #21 is now in Taken — your text is kept here, nothing was sent");
    assert.match(gardee.textContent, /One journal export per project, or a single one\?/);

    // Une lecture de plus ne l'emporte pas.
    recevoir(vue, lu(TRANCHE, 2));
    assert.ok(colonnes(vue).some((colonne) => colonne.children[0]?.children[0]?.textContent === "Todo" && colonne.dessous("textarea").some(({ value }) => value === "One per project")));

    (gardee.dessous("button").find(({ textContent }) => textContent === "dismiss") ?? assert.fail("pas de « dismiss »")).click();
    assert.deepEqual(vue.element("rail").dessous("textarea").filter(({ value }) => value === "One per project"), []);
  });

  test("une lecture ratée pendant la saisie ne touche pas la carte", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS, 0));
    const bon = carteDuTicket(vue, 21) ?? assert.fail("pas de carte #21");
    taper(bon, "One per project");
    recevoir(vue, ratee(1));
    assert.equal(carteDuTicket(vue, 21), bon);
    assert.equal(resolue(bon), undefined);
  });

  test("répondre finit la saisie : la carte n'est plus tenue, et dit que sa réponse part", async () => {
    let repondre: (rendu: Rendu) => void = () => {};
    const vue = await ouvrir({ repondreCarte: () => new Promise<Rendu>((fait) => (repondre = fait)) });
    recevoir(vue, lu(FAITS, 0));
    const bon = carteDuTicket(vue, 21) ?? assert.fail("pas de carte #21");
    taper(bon, "One per project");
    (bon.dessous("button").find(({ textContent }) => textContent === "send") ?? assert.fail("pas de « send »")).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreCarte").slice(1), [21, { question: PRODUIT.question, texte: "One per project" }]);
    assert.match((carteDuTicket(vue, 21) ?? assert.fail("pas de carte #21")).textContent, /sending your answer…/);
    repondre({ repondue: true, dit: "posted on the Kitchen board", commentaire: 7 });
    await repos();
  });
});
