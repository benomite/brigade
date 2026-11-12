// Une seule liste des projets d'une station (#3402) : ce que l'app ajoute ou
// retire par `projets-servis.ts` est ce que la station cuisine. Ses cuisines
// (`station/station.ts`) ouvrent un projet ajouté et ferment un projet retiré à
// leur relecture suivante ; son service GitHub seul (`servir.ts`) lit la même
// liste, et ne sert pas une seconde fois ce que ses cuisines servent. Un projet
// de l'ancienne liste (`projets-servis.json`) est cuisiné de même.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import type { Cuisine, OptionsCuisine } from "../../src/station/cuisine.ts";
import { ouvrirStation } from "../../src/station/station.ts";
import { ajouterProjetServi, cheminDeLAncienneListe, retirerProjetServi } from "../../src/station-ordinateur/projets-servis.ts";
import { ouvrirLeService } from "../../src/station-ordinateur/servir.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

// Une station dont chaque cuisine est un témoin : le dépôt qu'on lui a donné, et comment elle a été arrêtée.
function station(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const cuisines: Array<{ projet: string; depot: string; arrets: string[] }> = [];
  const ouvrir = (env: Record<string, string | undefined>, _options: OptionsCuisine): Cuisine => {
    const cuisine = { projet: env.BRIGADE_PROJECT ?? "", depot: env.BRIGADE_GITHUB_REPO ?? "", arrets: [] as string[] };
    cuisines.push(cuisine);
    return { projet: cuisine.projet, repertoireEtat: env.BRIGADE_STATE_DIR ?? "", arreter: (motif) => void cuisine.arrets.push(motif) };
  };
  // Aucune relecture ne vient d'une minuterie : le test relit quand il veut.
  const servie = ouvrirStation({ racine, env: {}, dire: () => {}, ouvrir, relectureMs: 3_600_000, portes: null });
  aArreter(t, () => servie.arreter("fin du test"));
  // Le service GitHub seul de l'ordinateur, sur la même liste ; chaque tour qu'il ouvrirait est compté.
  const tours: string[] = [];
  const service = ouvrirLeService({
    racine,
    station: "mac/claude",
    env: {},
    maison: racine,
    gh: "gh",
    claude: "claude",
    dire: () => {},
    dejaServis: () => Object.values(servie.depots()),
    cloner: async () => assert.fail("a project its kitchen serves is not cloned again"),
    ouvrirLeTour: ({ depot }) => {
      tours.push(depot);
      return { refus: "not in this test" };
    },
  });
  t.after(() => service.arreter());
  return { racine, cuisines, servie, service, tours };
}

test("a project added to the station's list is cooked by its kitchen, and a project removed is no longer cooked", async (t) => {
  const { racine, cuisines, servie, service, tours } = station(t);
  assert.deepEqual(servie.projets(), []);

  assert.deepEqual(ajouterProjetServi(racine, "acme/shop"), ["acme/shop"]);
  servie.relire();
  assert.deepEqual(servie.projets(), ["shop"]);
  assert.deepEqual(servie.depots(), { shop: "acme/shop" });
  assert.deepEqual(cuisines.map(({ depot, arrets }) => ({ depot, arrets })), [{ depot: "acme/shop", arrets: [] }]);
  // Le service GitHub seul lit la même liste : sa cuisine le sert, il ne le sert pas une seconde fois.
  await service.tourner();
  assert.deepEqual(tours, []);

  assert.deepEqual(retirerProjetServi(racine, "acme/shop"), []);
  servie.relire();
  assert.deepEqual(servie.projets(), []);
  assert.deepEqual(cuisines.map(({ depot, arrets }) => ({ depot, arrets })), [{ depot: "acme/shop", arrets: ["removed"] }]);
  await service.tourner();
  assert.deepEqual(tours, []);
});

test("a project of the old projets-servis.json list is cooked by the station's kitchen once the list is read", async (t) => {
  const { racine, servie } = station(t);
  writeFileSync(cheminDeLAncienneListe(racine), JSON.stringify({ brigade: "projets-servis", format: 1, depots: ["acme/shop"] }));
  // Ce que la station lit au démarrage, et l'app à chaque lecture : l'ancienne liste y passe.
  ajouterProjetServi(racine, "acme/widgets");
  servie.relire();
  assert.deepEqual(servie.depots(), { shop: "acme/shop", widgets: "acme/widgets" });
});
