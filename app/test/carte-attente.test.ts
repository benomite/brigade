// « after #N » sur la carte d'un ticket du rail qui en attend d'autres (ticket 3510, épique 3502). Le champ `attend` de
// son entrée du rail (numéros de tickets, écrit par l'ordonnancement du rail) se lit, puis la vue le dit sur la carte :
//   - `attend: [42]` → « after #42 » ; deux numéros → « after #12, #15 » ;
//   - `attend` vide ou absent → rien de plus sur la carte ;
//   - un `attend` qui n'est pas une liste de numéros n'est pas lu (la lecture des faits le refuse) : la carte ne dit rien.
// La vue est jouée telle qu'elle est, devant un faux document et un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { marqueApres } from "../src/vue/carte-attente/carte-attente.js";
import { carteDuTicket, Faux, jouerLaVue, repos, type Jouee } from "./aides/fausse-vue.ts";

const A = "2026-11-11T12:04:12.000Z";

describe("les mots de la marque", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) } as never;
  test("un numéro, deux numéros", () => {
    assert.equal(marqueApres(doc, [42])?.textContent, "after #42");
    assert.equal(marqueApres(doc, [12, 15])?.textContent, "after #12, #15");
  });

  test("`attend` vide ou absent : pas de marque", () => {
    assert.equal(marqueApres(doc, []), null);
    assert.equal(marqueApres(doc, undefined), null);
  });
});

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

const enFile = (ticket: number, attend?: unknown) => ({ ticket, etat: "en attente", titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, ...(attend === undefined ? {} : { attend }) });
const faits = (rail: unknown[]): Faits =>
  ({ etat: "ouverte", lu: "2026-11-11T12:04:11.000Z", dernierTick: "2026-11-11T12:04:11.000Z", compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [] }) as unknown as Faits;
const dessinable = (rail: unknown[]): Dessinable => tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(rail)) }] });

async function ouvrir(rail: unknown[]): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  vue.dire("surFaits", { ...dessinable(rail), demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const marques = (vue: Jouee, ticket: number) => (carteDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`)).dessous("span").filter(({ className }) => className.includes("apres")).map(({ textContent }) => textContent);

describe("la carte d'un ticket du rail qui en attend d'autres", () => {
  test("un ticket attendu : « after #42 » ; deux : « after #12, #15 » ; aucun, ou `attend` vide : rien de plus", async () => {
    const vue = await ouvrir([enFile(21, [42]), enFile(23, [12, 15]), enFile(22, []), enFile(24)]);
    assert.deepEqual(marques(vue, 21), ["after #42"]);
    assert.deepEqual(marques(vue, 23), ["after #12, #15"]);
    assert.deepEqual(marques(vue, 22), []);
    assert.deepEqual(marques(vue, 24), []);
  });

  test("un `attend` qui n'est pas une liste de numéros n'est pas lu : la carte ne dit rien qu'elle n'ait lu", async () => {
    const vue = await ouvrir([enFile(21, "#42"), enFile(22, [-1])]);
    assert.deepEqual(marques(vue, 21), []);
    assert.deepEqual(marques(vue, 22), []);
  });
});
