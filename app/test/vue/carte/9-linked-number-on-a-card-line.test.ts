// #4076 (garde de la ligne de carte) ; ex-critère 2 : une carte taken dont le cook travaille dit ce qu'il fait (#3923), et ne dit jamais « no activity yet » quand sa fiche dit qu'il cuit.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
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
import { activitesPubliees, type ActiviteDuCook } from "../../../src/tableau/lecture.ts";
import { carteDuTicket, jouerLaVue, repos, type Jouee } from "../../aides/fausse-vue.ts";

const A = "2026-11-23T15:45:00.000Z";
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
const STATION = "parade-box/claude";
// What a GitHub-only project gives (#4076): the rail line names the station but carries no `activite`, while the cook's own
// activity (what its detail reads) says it is writing.
const carte = (ticket: number, etat: string) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, station: STATION, activite: null });
const cook = (ticket: number): ActiviteDuCook => ({
  ticket,
  titre: `Ticket ${ticket}`,
  run: `${ticket}-aa`,
  station: STATION,
  lanceLe: "2026-11-23T15:44:00.000Z",
  finiLe: null,
  fin: null,
  maintenant: { fait: "writing", faitEn: "writing", cible: "app/src/bon.ts", depuis: "2026-11-23T15:44:40.000Z" },
  etapes: [],
  tours: 3,
  tokens: 1000,
  pr: null,
});

async function ouvrir(rail: ReturnType<typeof carte>[], cooks: ActiviteDuCook[]): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ouvrirPrDuCook: () => true } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("no project entry")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  const faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [{ ticket: 4070, titre: "Ticket 4070", url: "https://github.com/chef/parade/issues/4070", miseDeCote: { label: "blocked-on-human", raison: "merge PR #2326 by hand", liens: [{ numero: 2326, url: "https://github.com/chef/parade/issues/2326" }] } }] };
  const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  vue.dire("surActivites", activitesPubliees("parade", { lu: true, depot: "chef/parade", luLe: A, cuisine: { rubriques: [] }, faits: {}, file: [], bilans: [], lignesDuRail: [], activites: cooks }));
  await repos();
  return vue;
}

test("a line of a card that names a linked #N keeps that number clickable once the card's own line goes through the working-cook rewrite", async () => {
  const vue = await ouvrir([carte(4070, "pris")], []);
  const bon = carteDuTicket(vue, 4070) ?? assert.fail("no card #4070");
  assert.match(bon.textContent, /merge PR #2326 by hand/);
  assert.match(bon.textContent, /parade-box/, bon.textContent);
  assert.ok(bon.dessous("button").some((pose) => pose.className === "lien-de-ligne mono" && pose.textContent === "#2326"), bon.textContent);
});
