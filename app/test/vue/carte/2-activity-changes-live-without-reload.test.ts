// #3923, critère 2 : la carte suit son cook sans rechargement — une nouvelle action change le texte et l'âge.
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
const IL_Y_A = (secondes: number, de = LU) => new Date(Date.parse(de) - secondes * 1000).toISOString();
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
async function ouvrir(rail: unknown[]): Promise<{ vue: Jouee; lire: (rail: unknown[], lu: string) => Promise<void> }> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const lire = async (lignes: unknown[], lu: string) => {
    const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
    const faits = { etat: "ouverte", lu, dernierTick: lu, compteurs: { rail: lignes.length, auTravail: lignes.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: lignes, cooks: [], attend: [] };
    const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: lu, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
    vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
    await repos();
  };
  await lire(rail, LU);
  return { vue, lire };
}
const texte = (vue: Jouee, numero: number): string => (carteDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`)).textContent;

test("the activity text and its age change when the cook starts a new action, with no reload", async () => {
  const { vue, lire } = await ouvrir([carte(14, "pris", { activite: activite("running the tests", IL_Y_A(20)) })]);
  assert.ok(texte(vue, 14).includes("running the tests · 20 s ago"), texte(vue, 14));
  const plusTard = "2026-11-19T12:05:00.000Z";
  await lire([carte(14, "pris", { activite: activite("writing", IL_Y_A(5, plusTard)) })], plusTard);
  assert.ok(texte(vue, 14).includes("writing · 5 s ago"), texte(vue, 14));
  assert.ok(!texte(vue, 14).includes("running the tests"), texte(vue, 14));
});
