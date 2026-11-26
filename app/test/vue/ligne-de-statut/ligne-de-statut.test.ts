// La ligne d'état du rail (#3523) : au-dessus des colonnes, la bande du haut et — seulement quand quelque chose retient la
// cuisine — une seule ligne ; aucun bandeau Backlog (#4354). Une issue que la cuisine a ouverte sur elle-même n'est jamais un besoin du Backlog : son contenu est cette
// ligne. Et la ligne ne dit jamais « no reason is found » devant une raison connue. Le module pur d'abord, puis la vue jouée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { COMMANDE, tenirAmont, voir } from "../../../src/amont.ts";
import type { Lecture } from "../../../src/box.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { gestesDeCarte } from "../../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { AppelGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../../src/tableau/lecture.ts";
import { lectureDuTableau } from "../../../src/tableau/rail.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";
import { ligneDesAlertes, phraseDeLAttente, retenuesConnues } from "../../../src/vue/ligne-de-statut/ligne-de-statut.js";

const PARADE = "parade";
const DEPOT = "chef/parade";
const A = "2026-10-15T09:12:04.000Z";
const url = (ticket: number) => `https://github.com/${DEPOT}/issues/${ticket}`;

type Ouverte = { number: number; title: string; labels: { name: string }[]; created_at: string; html_url: string; body: string };
const ouverte = (number: number, labels: string[] = [], title = `Ticket ${number}`, body = ""): Ouverte => ({ number, title, labels: labels.map((name) => ({ name })), created_at: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`, html_url: url(number), body });
const LISTE = (tickets: number[]) => ["<!-- brigade:tickets -->", ...tickets.map((t) => `| #${t} | t |`), "<!-- /brigade:tickets -->"].join("\n");

// Le dépôt de référence de test/amont.test.ts — huit issues avant le rail, dans quatre états —, plus #16, une épique
// découpée en #10 (au feu, sur le rail) et #30 (fermé, servi), et #17 qui t'attend (sa carte est dans Awaiting you).
const ISSUES = [
  ouverte(10, ["fire", "model:haiku", "effort:low"], "Sur le rail", "Epic: #16"),
  ouverte(11, ["model:opus", "effort:high", "prio:2"], "Prêt sans feu"),
  ouverte(12, ["blocked-on-human"]),
  ouverte(13, ["served-elsewhere"]),
  ouverte(14, ["model:opus"]),
  ouverte(16, ["epic", "prio:1"], "Une épique", `## Context\n\nGroups book in one gesture.\n\n${LISTE([10, 30])}`),
  ouverte(17, ["epic"], "Une question"),
  ouverte(20, [], "Pas encore lue"),
  ouverte(21),
  ouverte(22, ["fire", "model:opus", "effort:high"]),
];
const github = (issues: Ouverte[]): AppelGitHub => async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return { status: 200, data: issues.filter(({ labels }) => labels.some(({ name }) => name === "fire")) };
  if (chemin.includes("/issues?state=closed")) return { status: 200, data: [] };
  if (chemin.includes("/issues?")) return { status: 200, data: issues };
  if (chemin.includes("/pulls?")) return { status: 200, data: [] };
  return { status: 404, data: {} };
};
async function amontDe(issues: Ouverte[]): Promise<Lecture> {
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github(issues), maintenant: () => new Date(A) });
  return lectureDuTableau(lu, PARADE, 3, [COMMANDE]);
}
const lecture = (texte: string): Lecture => ({ projet: PARADE, demande: 3, a: A, sorties: [{ commande: COMMANDE, texte }] });

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (carte) => gestesDeCarte(carte) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Le rail : #10 et #22 en attente ; #17, l'épique qui attend le chef, nommée par la file.
const FAITS: Faits = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 10, etat: "en attente", titre: "Sur le rail", url: url(10), activite: null },
    { ticket: 22, etat: "en attente", titre: "Ticket 22", url: url(22), activite: null },
  ],
  cooks: [],
  attend: [{ ticket: 17, titre: "Une question", url: url(17) }],
};
const RAIL_VIDE: Faits = { ...FAITS, compteurs: { ...FAITS.compteurs, rail: 0, attend: 0 }, rail: [], attend: [] };
// Une lecture de maintenant : une lecture vieille se dit d'elle-même, en ligne d'état (rail.test.ts).
function recevoirFaits(vue: Jouee, faits: Faits): void {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: new Date().toISOString(), sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}


const enfants = (vue: Jouee): Faux[] => vue.element("rail").children;
const avantLesColonnes = (vue: Jouee): Faux[] => enfants(vue).slice(0, enfants(vue).findIndex(({ className }) => className === "colonnes"));
const statut = (vue: Jouee): Faux | undefined => enfants(vue).find(({ className }) => className.split(" ").includes("statut-du-rail") || className.split(" ").includes("attente-du-rail"));

// Les issues que la cuisine a ouvertes sur elle-même (la cuisine oisive, plus ouverte depuis #3945), et #21, mise de côté.
const INERTE = ouverte(35, ["bug"], "The kitchen is idle: no merge for 60 minutes with 2 cookable ticket(s) (no-station)");
const LONGUE = "The wait is longer than usual: the oldest queued ticket has waited 3 d and no reason is found. It resolves by itself.";
const FAITS_EN_ATTENTE = { ...FAITS, attenteDuRail: { raison: "normale", phrase: LONGUE, geste: null } };
const faitsAvec = (faits: object): Faits => faits as Faits;

describe("la ligne d'état : ce que la cuisine dit d'elle-même, jamais un besoin", () => {
  test("une alerte de la cuisine : son contenu est la ligne d'état, et la carte du supervisor la dit en deux mots", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe([...ISSUES, INERTE])));
    const superviseur = enfants(vue)[0]?.dessous("button").find(({ dataset }) => dataset.agent === "supervisor");
    assert.equal(superviseur?.textContent, "supervisoralert: #35");

    // La ligne d'état : celle de la cuisine oisive — et une seule, sous la bande du haut (#4238).
    assert.match(statut(vue)?.textContent ?? "", /^Kitchen idle: no merge for 60 minutes/);
    assert.deepEqual(avantLesColonnes(vue).map(({ className }) => className), ["bande-du-haut", "statut-du-rail"]);
  });

  test("la cuisine oisive, seule : sa ligne dit « Kitchen idle », et son seul geste ouvre l'issue que la cuisine a ouverte (#4238)", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe([...ISSUES, INERTE])));
    assert.match(statut(vue)?.textContent ?? "", /^Kitchen idle: no merge for 60 minutes with 2 cookable ticket\(s\)/);
    const gestes = statut(vue)?.dessous("button") ?? [];
    assert.deepEqual(gestes.map(({ textContent }) => textContent), ["open #35"]);
    gestes[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 35]);
  });

  test("rien ne retient la cuisine : aucune ligne d'état — la bande du haut est seule au-dessus des colonnes (#4354)", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));
    assert.deepEqual(avantLesColonnes(vue).map(({ className }) => className), ["bande-du-haut"]);
  });

  test("la file attend et un ticket est mis de côté : la ligne nomme cette raison, jamais « no reason is found »", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, faitsAvec(FAITS_EN_ATTENTE));
    // Sans raison connue de la vue, la phrase du runtime est dite telle quelle ; son geste, relire (#4238).
    const phrase = () => statut(vue)?.dessous("strong")[0]?.textContent;
    assert.equal(phrase(), LONGUE);
    assert.deepEqual(statut(vue)?.dessous("button").map(({ textContent }) => textContent), ["read again"]);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));
    assert.equal(phrase(), "The queue waits: #12, #13 are set aside.");
    assert.doesNotMatch(vue.element("rail").textContent, /no reason is found/);
    assert.deepEqual(avantLesColonnes(vue).map(({ className }) => className.split(" ")[0]), ["bande-du-haut", "attente-du-rail"]);
  });
});

describe("le TODO du haut est replié par défaut, et ne reste pas ouvert d'une visite à l'autre (#4354)", () => {
  test("ouvert d'un clic sur sa ligne, replié d'un second ; quitté pour Stations, il est replié au retour", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    await repos();
    const ligne = () => (enfants(vue).find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO")).dessous("button")[0] ?? assert.fail("pas de ligne");
    assert.equal(ligne().ariaExpanded, "false");
    ligne().click();
    assert.equal(ligne().ariaExpanded, "true");
    ligne().click();
    assert.equal(ligne().ariaExpanded, "false");
    ligne().click();
    await ouvrirOnglet(vue, "Stations");
    await ouvrirOnglet(vue, "Rail");
    assert.equal(ligne().ariaExpanded, "false");
  });
});

describe("le module pur de la ligne d'état", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) };
  test("les alertes : la première (par ticket) ; aucune alerte, aucune ligne", () => {
    assert.deepEqual(ligneDesAlertes(doc, undefined), []);
    assert.deepEqual(ligneDesAlertes(doc, []), []);
    const [ligne] = ligneDesAlertes(doc, [
      { ticket: 36, titre: "The kitchen is idle: y", genre: "inerte", dit: "Kitchen idle: y" },
      { ticket: 35, titre: "The kitchen is idle: x", genre: "inerte", dit: "Kitchen idle: x" },
    ]);
    assert.equal(ligne?.textContent, "Kitchen idle: x");
    assert.equal(ligne?.title, "The kitchen is idle: x — filed by the kitchen on issue #35");
  });
  test("les raisons connues : le ticket de côté, la cuisine arrêtée ; la phrase du runtime ne change que pour « normale »", () => {
    assert.deepEqual(retenuesConnues({ misDeCote: [], arretee: false }), []);
    assert.deepEqual(retenuesConnues({ misDeCote: [21], arretee: true }), ["the kitchen is stopped", "#21 is set aside"]);
    const normale = { raison: "normale", phrase: LONGUE, geste: null, stations: [] as string[] } as const;
    assert.equal(phraseDeLAttente(normale, []), normale);
    assert.equal(phraseDeLAttente(normale, ["#21 is set aside"]).phrase, "The queue waits: #21 is set aside.");
    const panne = { raison: "arretee", phrase: "The station is stopped.", geste: "demarrer-la-station", stations: [] as string[] } as const;
    assert.equal(phraseDeLAttente(panne, ["#21 is set aside"]), panne);
  });
});
