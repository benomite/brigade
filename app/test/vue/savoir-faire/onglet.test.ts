// L'onglet Know-how dans la vue jouée telle qu'elle est (#4241), par le vrai pont (la source passe au faux pont de
// fausse-vue.ts) : chaque ouverture relit les entrées, même changées ailleurs ; le rail se nomme « The know-how » ;
// l'onglet est retenu d'un lancement à l'autre comme Rail et Stations, et un onglet retenu inconnu rouvre Rail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { FauxStockage, jouerLaVue, repos, type Faux, type Jouee } from "../../aides/fausse-vue.ts";

// Les tests partagent les modules de la vue, et ce que l'onglet garde par projet : chacun a ses projets.
const demarrage = (noms: string[]) => () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: noms.map((nom) => ({ nom, dossier: `/tmp/${nom}` })) }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
type Entree = { id: string; text: string; ticket: number };

// La vue, et le savoir-faire que le runtime rendrait : `entrees` se change entre deux lectures.
async function jouer(noms: string[], stockage?: FauxStockage) {
  const etat = { entrees: [{ id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 }] as Entree[] };
  const vue = await jouerLaVue({ demarrage: demarrage(noms), espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], lireLeSavoirFaire: () => ({ entries: structuredClone(etat.entrees) }) } as never, { stockage });
  return { vue, etat };
}
async function ouvrirLeProjet(vue: Jouee, rang = 1) {
  (vue.element("projets").children.at(rang) ?? assert.fail("pas d'entrée")).click();
  await repos();
}
const onglets = (vue: Jouee): Faux[] => vue.element("onglets-du-projet").children;
const onglet = (vue: Jouee, titre: string): Faux => onglets(vue).find((o) => o.textContent.trim() === titre) ?? assert.fail(`pas d'onglet « ${titre} »`);
const choisi = (vue: Jouee) => onglets(vue).filter((o) => o.ariaSelected === "true").map((o) => o.textContent);
const lu = (vue: Jouee) => [...vue.element("rail").descendants()].filter((n) => n.className === "entree").map((n) => n.textContent);
async function cliquer(vue: Jouee, titre: string) {
  onglet(vue, titre).click();
  await repos();
}

test("each opening of Know-how reads the entries again through the bridge, even changed elsewhere; the rail is named for it", async () => {
  const { vue, etat } = await jouer(["parade"]);
  await ouvrirLeProjet(vue);
  assert.equal(vue.element("rail").ariaLabel, "The rail");
  await cliquer(vue, "Know-how");
  assert.deepEqual(choisi(vue), ["Know-how"]);
  assert.equal(vue.element("rail").ariaLabel, "The know-how");
  assert.deepEqual(lu(vue), ["Run the typecheck before pushing.from #4001editremove"]);
  await cliquer(vue, "Rail");
  etat.entrees = [{ id: "L1", text: "Typecheck, then push.", ticket: 4001 }, { id: "L3", text: "Fakes live in test/aides.", ticket: 4003 }];
  await cliquer(vue, "Know-how");
  assert.deepEqual(lu(vue), ["Typecheck, then push.from #4001editremove", "Fakes live in test/aides.from #4003editremove"]);
  assert.deepEqual(vue.appels.filter(({ geste }) => geste === "lireLeSavoirFaire").map(({ args }) => args), [["parade"], ["parade"]]);
});

test("Know-how is remembered from one launch to the next like Rail and Stations; an unknown remembered tab opens on Rail", async () => {
  const stockage = new FauxStockage();
  stockage.setItem("brigade.onglets-des-projets", JSON.stringify({ relance: "savoir-faire", autre: "cooks" }));
  const { vue } = await jouer(["relance", "autre"], stockage);
  await ouvrirLeProjet(vue);
  assert.deepEqual(choisi(vue), ["Know-how"]);
  assert.deepEqual(lu(vue), ["Run the typecheck before pushing.from #4001editremove"]);
  await ouvrirLeProjet(vue, 2);
  assert.deepEqual(choisi(vue), ["Rail"]);
});
