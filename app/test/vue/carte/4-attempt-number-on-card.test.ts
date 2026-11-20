// #3923, critère 4 : un ticket pris plus d'une fois porte son numéro d'essai (« 3rd try ») ; une première prise n'en porte pas.
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts) ; les faits sont ceux que le runtime donne dans `facts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { carteDuTicket, jouerLaVue, repos, type Jouee } from "../../aides/fausse-vue.ts";

const LU = "2026-11-19T12:04:30.000Z";
const IL_Y_A = (secondes: number) => new Date(Date.parse(LU) - secondes * 1000).toISOString();
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const carte = (ticket: number, etat: string, plus: object = {}) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: null, ...plus });
const activite = (faitEn: string, depuis: string) => ({ fait: faitEn, faitEn, cible: null, depuis });

// Ouvre le projet et lui donne une lecture, à l'heure `lu` : la voie par laquelle la cuisine suit le tableau.
async function ouvrir(rail: unknown[]): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  const faits = { etat: "ouverte", lu: LU, dernierTick: LU, compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [] };
  const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const texte = (vue: Jouee, numero: number): string => (carteDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`)).textContent;

// Les essais du séjour d'un ticket pris, tels que le runtime les donne dans `facts` : le plus ancien d'abord.
const essai = (depuis: string, jusqua: string | null) => ({ depuis, jusqua, arret: jusqua === null ? null : "idle", enCours: jusqua === null });
const ESSAIS = [essai(IL_Y_A(3000), IL_Y_A(2500)), essai(IL_Y_A(2000), IL_Y_A(1500)), essai(IL_Y_A(100), null)];
const LABEL_D_ESSAI = /\d(st|nd|rd|th) try/;

test('a ticket taken three times shows "3rd try" on its card', async () => {
  const vue = await ouvrir([carte(14, "pris", { essais: ESSAIS, activite: activite("running the tests", IL_Y_A(20)) })]);
  assert.ok(texte(vue, 14).includes("3rd try"), texte(vue, 14));
});

test('a ticket taken twice shows "2nd try"', async () => {
  const vue = await ouvrir([carte(14, "pris", { essais: ESSAIS.slice(1), activite: activite("running the tests", IL_Y_A(20)) })]);
  assert.ok(texte(vue, 14).includes("2nd try"), texte(vue, 14));
});

test("a first attempt shows no such label", async () => {
  const vue = await ouvrir([
    carte(14, "pris", { essais: ESSAIS.slice(2), activite: activite("running the tests", IL_Y_A(20)) }),
    carte(15, "pris", { activite: activite("writing", IL_Y_A(8)) }),
  ]);
  assert.doesNotMatch(texte(vue, 14), LABEL_D_ESSAI);
  assert.doesNotMatch(texte(vue, 15), LABEL_D_ESSAI);
  assert.ok(texte(vue, 14).includes("running the tests · 20 s ago"), texte(vue, 14));
});
