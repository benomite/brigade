// La poêle (#2984) : une petite poêle 8-bit grésille à côté de ce qu'un agent fait en ce moment — un cook sur son ticket,
// la pass qui juge une livraison, le manager qui qualifie ou découpe une issue —, et seulement tant que le travail tourne :
// ni sur ce qui attend, ni d'une lecture hors ligne ou périmée, ni la cuisine arrêtée. Le process principal dit quels
// tickets sont au travail (faits.ts, `auTravail`) ; la vue est jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts) ; la peau est lue dans sa feuille.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../runtime/src/etat.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tableau, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { DIT_DE_LA_POELE, TRAMES } from "../src/vue/composants/poele/poele.js";
import { carteDuTicket, type Faux, type Jouee, jetonsDe, jouerLaVue, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const PARADE = "parade";
const a = (minute: number) => `2026-11-09T10:${String(minute).padStart(2, "0")}:00.000Z`;
const ISSUE = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;
const activite = (faitEn: string) => ({ fait: faitEn, faitEn, cible: null, depuis: a(0) });

// #14 cuit ; #15 est pris mais mis de côté ; #21 attend sa place ; #30 est jugé par la pass ; #31 attend la pass.
const FAITS: Faits = {
  etat: "ouverte",
  lu: a(0),
  dernierTick: a(0),
  compteurs: { rail: 1, auTravail: 2, aLaPass: 2, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: ISSUE(14), activite: activite("writes the tests") },
    { ticket: 15, etat: "pris", titre: "La carte des desserts", url: ISSUE(15), activite: null, attente: { raison: "setup du projet impossible", colonne: "pris", retour: null } },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null },
    { ticket: 30, etat: "en pass", titre: "Le menu du jour", url: ISSUE(30), activite: activite("judging") },
    { ticket: 31, etat: "en pass", titre: "La note", url: ISSUE(31), activite: activite("waiting for the pass") },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [],
};
const JUGE = { role: "pass", station: "box/claude", ticket: 30, fait: "judging", depuis: a(0) };
const QUALIFIE = { role: "manager", station: "box/claude", ticket: 40, fait: "qualifying the issue", depuis: a(0) };
const NETTOIE = { role: "closer", station: "box/claude", ticket: null, fait: "closing: cleaning up the project", depuis: a(0) };

describe("les tickets au travail, dits par le process principal (faits.ts)", () => {
  test("un ticket pris, et celui que la pass juge : pas un ticket mis de côté, en file, ni une livraison qui attend la pass", () => {
    assert.deepEqual(tableau(FAITS).auTravail, [14, 30]);
  });

  test("avec les agents que le runtime donne : le ticket que le manager qualifie aussi — le closer n'a pas de ticket", () => {
    assert.deepEqual(tableau({ ...FAITS, agents: [JUGE, QUALIFIE, NETTOIE] }).auTravail, [14, 30, 40]);
  });

  test("rien ne tourne : aucun ticket", () => {
    assert.deepEqual(tableau({ ...FAITS, rail: FAITS.rail.filter(({ etat }) => etat === "en attente"), cooks: [] }).auTravail, []);
  });
});

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

type Station = FaitsDuRuntime["stations"][number];
const station = (nom: string, plus: Partial<Station> = {}): Station => ({
  station: nom,
  distante: false,
  plafond: 2,
  ordinaires: false,
  bacASable: null,
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...plus,
});
// #14 cuit sur la box ; #16 finit sur le Mac, que le chef a arrêté.
const STATIONS: Station[] = [
  station("box/claude", { cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }] }),
  station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: a(0), cooks: [{ ticket: 16, titre: "La soupe", station: "mac/claude" }] }),
];

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const lu = (faits: Faits, minute = 0, stations?: Station[]): Dessinable =>
  tenirFaits().recevoir({ projet: PARADE, demande: 0, a: a(minute), sorties: [{ commande: "facts", texte: JSON.stringify(stations === undefined ? faits : { ...faits, stations }) }] });
const recevoir = (vue: Jouee, recue: Dessinable) => vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
// Sans réseau (tableau/rail.ts), et une lecture ratée en ligne, après un rail lu (#2151).
const horsLigne = (minute: number): Dessinable => tenirFaits().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: "GitHub could not be reached to read the Kitchen board of benomite/parade: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true });
const ratee = (minute: number): Dessinable => tenirFaits().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: "GitHub refused to read the rail of benomite/parade (HTTP 403): API rate limit exceeded for user ID 1.", atteinte: true, cas: null, duTableau: true });

const poeles = (pose: Faux) => pose.dessous("span").filter(({ className }) => className === "poele");
const cuisent = (vue: Jouee, tickets: number[]) => tickets.filter((ticket) => poeles(carteDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`)).length > 0);

describe("la poêle sur le rail : à côté du bon d'un ticket au travail, tant que la lecture le dit vrai", () => {
  test("le ticket que son cook cuit et celui que la pass juge la portent, au bout de leur tête ; ce qui attend, non", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS));
    assert.deepEqual(cuisent(vue, [14, 15, 21, 30, 31]), [14, 30]);
    const bon = carteDuTicket(vue, 14) ?? assert.fail("pas de carte #14");
    const [posee] = poeles(bon);
    assert.equal(posee?.parentElement, bon.children[0], "la poêle est dans la tête du bon");
    assert.equal(posee?.role, "img");
    assert.equal(posee?.ariaLabel, DIT_DE_LA_POELE);
    // Elle ne dit rien dans le texte de la carte : son dessin n'a pas de mot.
    assert.equal(posee?.textContent, "");
  });

  test("le travail fini, la poêle part : #14 servi, #30 renvoyé au rail", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS));
    const rail = FAITS.rail.map((ligne) => (ligne.ticket === 14 ? { ...ligne, etat: "servi", activite: undefined } : ligne.ticket === 30 ? { ...ligne, etat: "en attente", activite: null } : ligne));
    recevoir(vue, lu({ ...FAITS, rail }, 1));
    assert.deepEqual(cuisent(vue, [14, 15, 21, 30, 31]), []);
  });

  test("un ticket pris qui t'attend ne la porte pas : il attend le chef", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu({ ...FAITS, attend: [{ ticket: 14, titre: "Le journal en ajout seul", url: ISSUE(14) }] }));
    assert.deepEqual(cuisent(vue, [14, 30]), [30]);
  });

  test("la cuisine arrêtée : aucune poêle", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu({ ...FAITS, etat: BANNIERE.etat }));
    assert.deepEqual(cuisent(vue, [14, 30]), []);
  });

  test("hors ligne, le rail lu en dernier reste, sans poêle ; GitHub joint de nouveau, elle revient", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS));
    recevoir(vue, horsLigne(1));
    assert.deepEqual(cuisent(vue, [14, 30]), []);
    recevoir(vue, lu(FAITS, 2));
    assert.deepEqual(cuisent(vue, [14, 30]), [14, 30]);
  });

  test("une lecture périmée — les suivantes ont raté — ne la porte pas non plus", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu(FAITS));
    recevoir(vue, ratee(1));
    assert.ok(vue.element("rail").dessous("p").some(({ className }) => className.split(" ").includes("perime")), "le rail ne se dit pas périmé");
    assert.deepEqual(cuisent(vue, [14, 30]), []);
  });
});

describe("la poêle sur Stations : à côté de chaque cook et de chaque agent qui tourne", () => {
  const cuisson = (vue: Jouee, nom: string) => vue.element("rail").dessous("li").find((li) => li.className === "station-de-cuisson" && li.dataset.station === nom) ?? assert.fail(`pas de ligne pour ${nom}`);
  const lignes = (pose: Faux) => (pose.dessous("ul").find((ul) => ul.className.startsWith("cooks")) ?? assert.fail("pas de liste de cooks")).children;

  test("sur la station qui cuit, le cook, la pass, le manager qui qualifie et le closer la portent ; sur celle qu'on a arrêtée, le cook qui finit non", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu({ ...FAITS, agents: [JUGE, QUALIFIE, NETTOIE] }, 0, STATIONS));
    await ouvrirOnglet(vue, "Stations");
    const box = lignes(cuisson(vue, "box/claude"));
    assert.equal(box.length, 4);
    assert.deepEqual(box.map((li) => poeles(li).length), [1, 1, 1, 1]);
    // Au bout de la ligne : son texte reste ce qu'il était.
    assert.ok(box.every((li) => li.children.at(-1)?.className === "poele"));
    assert.deepEqual(lignes(cuisson(vue, "mac/claude")).map((li) => poeles(li).length), [0]);
  });

  test("hors ligne, ou la cuisine arrêtée : aucune", async () => {
    const vue = await ouvrir();
    recevoir(vue, lu({ ...FAITS, agents: [JUGE] }, 0, STATIONS));
    recevoir(vue, horsLigne(1));
    await ouvrirOnglet(vue, "Stations");
    assert.deepEqual(lignes(cuisson(vue, "box/claude")).map((li) => poeles(li).length), [0, 0]);
    recevoir(vue, lu({ ...FAITS, etat: BANNIERE.etat, agents: [JUGE] }, 2, STATIONS));
    assert.deepEqual(lignes(cuisson(vue, "box/claude")).map((li) => poeles(li).length), [0, 0]);
  });
});

describe("sa peau : petite, aux couleurs des jetons, immobile quand le système le demande", () => {
  const css = readFileSync(join(VUE, "composants/poele/poele.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const jetons = jetonsDe(readFileSync(join(VUE, "jetons.css"), "utf8"));

  test("trois trames qui se suivent, et la première seule, immobile, sous « reduce motion »", () => {
    assert.equal(TRAMES.length, 3);
    assert.match(css, /\.poele \.trame \{[^}]*animation: poele-gresille [^;]+ infinite;/);
    const [, reduit = ""] = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/.exec(css) ?? [];
    assert.match(reduit, /\.poele \.trame \{\s*animation: none;\s*\}/);
    assert.match(reduit, /\.poele \.trame-1 \{\s*opacity: 1;\s*\}/);
  });

  test("ses couleurs sont des jetons, et le fer se lit sur le papier d'un bon comme sur le sombre", () => {
    const nommees = [...css.matchAll(/fill: var\((--[a-z-]+)\)/g)].map(([, nom = ""]) => nom);
    assert.deepEqual(nommees, ["--gris", "--accent", "--discret"]);
    for (const nom of nommees) assert.ok(jetons.has(nom), nom);
  });

  test("elle tient dans une ligne : 22 × 14 px, et ne passe jamais à la ligne seule", () => {
    const vue = readFileSync(join(VUE, "composants/poele/poele.js"), "utf8");
    assert.match(vue, /width: "22", height: "14"/);
    assert.match(css, /\.poele \{[^}]*flex: none;/);
  });
});
