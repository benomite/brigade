// #3924 : le bandeau de la cuisine arrêtée dans la vue telle qu'elle est (vue.js, devant un faux document) — en tête du rail,
// au-dessus de la ligne d'état ; il part à la lecture suivante qui ne porte plus l'arrêt, sans rechargement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { jouerLaVue, repos, type Jouee } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-11-20T12:00:00.000Z";
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

// Deux tickets en file, rien de pris ni en pass ; `arretCuisine` tel que la lecture du rail le pose (arret-du-rail.ts).
const ARRETEE = {
  etat: "ouverte",
  lu: "2026-11-20T11:59:50.000Z",
  dernierTick: "2026-11-20T11:59:40.000Z",
  compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: "https://github.com/chef/parade/issues/22", activite: null },
  ],
  cooks: [],
  attend: [],
  arretCuisine: { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue/" }, since: "2026-11-20T08:30:00.000Z" },
};
// La lecture suivante : #21 est pris, l'arrêt n'est plus dans `facts`.
const { arretCuisine: _, ...sansArret } = ARRETEE;
const REPARTIE = { ...sansArret, compteurs: { ...ARRETEE.compteurs, auTravail: 1 }, rail: [{ ...ARRETEE.rail[0], etat: "pris" }, ARRETEE.rail[1]] };

function recevoir(vue: Jouee, faits: unknown) {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits as Faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}

test("the kitchen stopped: the rail opens with the STOPPED notice, above the status line; the next reading with a card taken removes it", async () => {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("no project entry")).click();
  await repos();
  recevoir(vue, ARRETEE);
  const rail = vue.element("rail");
  const tete = rail.children[0] ?? assert.fail("nothing at the head of the rail");
  assert.equal(tete.className, "hote-bandeau-arret");
  // Son geste, sur le rail (#4238) : ouvrir le ticket gelé.
  assert.equal(tete.textContent, "STOPPEDThe kitchen is stopped since 08:30 UTC: frozen ticket #30 holds the file zone app/src/vue/.open #30");
  recevoir(vue, REPARTIE);
  assert.equal(rail.dessous("p").filter(({ className }) => className.split(" ").includes("bandeau-arret")).length, 0);
  assert.equal(rail.textContent.includes("kitchen is stopped"), false);
});
