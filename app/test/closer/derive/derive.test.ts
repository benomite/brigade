// Proposer un nettoyage quand la dérive franchit son seuil (vue/closer/derive/derive.js, #993) : la
// partie closer porte une phrase et un bouton qui mènent à la confirmation du lancement — jamais à une
// demande. Le module est lu seul, puis la vue jouée telle qu'elle est (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import type { Lecture } from "../../../src/box.ts";
import type { Rendu } from "../../../src/closer-lancement.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { lireDerive, poserDerive, PROPOSER, PROPOSITION } from "../../../src/vue/closer/derive/derive.js";
import { LANCER, OUI, REPOS } from "../../../src/vue/closer/lancement/lancement.js";
import { COMMANDE } from "../../../src/vue/closer/section.js";
import { Faux, jouerLaVue, ouvrirLecture, repos } from "../../aides/fausse-vue.ts";
import { APERCU, DEMANDES, lue } from "../lancement/donnees.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-19T12:00:00.000Z";
const FRANCHIE = { declared: true, crossed: true, crossings: [{ measure: "ratio", observed: 3.2, limit: 3, text: "added / removed over the last 100 merges: 3.2 for a threshold of 3" }] };
const PAS_FRANCHIE = { declared: true, crossed: false, crossings: [] };
const avec = (drift: unknown, request: unknown = DEMANDES.none) => ({ ...lue(request), drift });

describe("la proposition, lue seule", () => {
  test("franchie : une phrase, le bouton qui mène au lancement, ce qui a franchi au survol", () => {
    const derive = lireDerive(avec(FRANCHIE)) ?? assert.fail("pas de dérive lue");
    let appels = 0;
    const racine = new Faux("div");
    racine.append(...poserDerive(doc, derive, DEMANDES.none, REPOS, () => void appels++));
    assert.equal(racine.dessous("p")[0]?.textContent, PROPOSITION);
    const bouton = racine.dessous("button").find(({ textContent }) => textContent === PROPOSER) ?? assert.fail("pas de bouton");
    bouton.click();
    assert.equal(appels, 1);
    assert.match(racine.dessous("button").find(({ className }) => className === "aide")?.ariaLabel ?? "", /3\.2 for a threshold of 3/);
  });

  test("pas franchie, ou pas dite : rien n'est proposé", () => {
    assert.equal(lireDerive(avec(PAS_FRANCHIE)), undefined);
    assert.equal(lireDerive(avec({ declared: false, crossed: false, crossings: [] })), undefined);
    const { drift: _, ...sansDerive } = avec(FRANCHIE);
    assert.equal(lireDerive(sansDerive), undefined);
    assert.deepEqual(poserDerive(doc, undefined, DEMANDES.none, REPOS, () => {}), []);
  });

  test("une demande qui attend ou qui court, ou un geste en route : la proposition s'efface", () => {
    const derive = lireDerive(avec(FRANCHIE));
    for (const demande of [DEMANDES.waiting, DEMANDES.running]) assert.deepEqual(poserDerive(doc, derive, demande, REPOS, () => {}), [], demande.state);
    assert.deepEqual(poserDerive(doc, derive, DEMANDES.none, { etape: "apercu" }, () => {}), []);
    assert.deepEqual(poserDerive(doc, derive, DEMANDES.none, { etape: "confirmer", apercu: APERCU }, () => {}), []);
    assert.equal(poserDerive(doc, derive, DEMANDES.done, REPOS, () => {}).length, 1);
  });
});

// --- La vue jouée ----------------------------------------------------------------------

const lecture = (objet: unknown, demande: number): Lecture => ({ projet: "parade", demande, a: A, sorties: [{ commande: COMMANDE, texte: `${JSON.stringify(objet)}\n` }] });

async function ouvrir(closer: (action: string) => Rendu | undefined) {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
    closer: (_projet, action) => closer(action),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
  await repos();
  await ouvrirLecture(vue, "Cooks");
  const page = vue.element("closer-du-projet");
  const demande = () => (vue.dernier("onglet") as [string, string, number])[2];
  const dire = async (objet: unknown) => {
    vue.dire("surContenu", lecture(objet, demande()), undefined, undefined);
    await repos();
  };
  const place = () => page.children.find(({ className }) => className === "closer-lancement") ?? assert.fail("pas de place du lancement");
  const gestes = () => vue.appels.filter(({ geste }) => geste === "closer").map(({ args }) => args);
  const cliquer = async (texte: string) => {
    (place().dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de « ${texte} »`)).click();
    await repos();
  };
  return { place, gestes, cliquer, dire };
}

describe("la proposition, dans la partie closer du projet", () => {
  test("seuil franchi : la proposition est là, et la page chargée ou relue ne demande rien", async () => {
    const { place, gestes, dire } = await ouvrir(() => assert.fail("la page ne devait rien envoyer à la box"));
    await dire(avec(FRANCHIE));
    assert.ok(place().dessous("p").some(({ textContent }) => textContent === PROPOSITION));
    await dire(avec(FRANCHIE));
    await dire(avec(FRANCHIE));
    assert.deepEqual(gestes(), []);
  });

  test("seuil non franchi : pas de proposition", async () => {
    const { place, dire } = await ouvrir(() => undefined);
    await dire(avec(PAS_FRANCHIE));
    assert.ok(!place().dessous("p").some(({ textContent }) => textContent === PROPOSITION));
    assert.ok(place().dessous("button").some(({ textContent }) => textContent === LANCER));
  });

  test("la suivre ouvre la confirmation du lancement : seul l'aperçu part, la demande attend le « oui »", async () => {
    const { place, gestes, cliquer, dire } = await ouvrir((action) =>
      action === "apercu" ? { apercu: APERCU } : action === "lancer" ? { demandee: { outcome: "requested", waits: null, text: "closing pass requested" } } : undefined,
    );
    await dire(avec(FRANCHIE));
    await cliquer(PROPOSER);
    assert.deepEqual(gestes(), [["parade", "apercu"]]);
    const confirmation = place().dessous("section")[0] ?? assert.fail("pas de confirmation");
    assert.match(confirmation.textContent, /500,000 tokens at most/);
    // Aucune demande n'existe tant que le chef n'a pas confirmé, et la proposition s'est effacée.
    assert.ok(!gestes().some(([, action]) => action === "lancer"));
    assert.ok(!place().dessous("p").some(({ textContent }) => textContent === PROPOSITION));
    await cliquer(OUI);
    assert.deepEqual(gestes(), [["parade", "apercu"], ["parade", "lancer", true]]);
  });

  test("une demande déjà en attente : la proposition ne s'ajoute pas à son état", async () => {
    const { place, dire } = await ouvrir(() => undefined);
    await dire(avec(FRANCHIE, DEMANDES.waiting));
    assert.ok(!place().dessous("p").some(({ textContent }) => textContent === PROPOSITION));
  });
});
