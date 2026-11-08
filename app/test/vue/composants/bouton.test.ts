// Le bouton de l'app (vue/composants/bouton, ticket 2916) : une seule famille — recommandé, secondaire, discret,
// danger —, 32 px de haut sur l'ordinateur, 44 px à la largeur d'un téléphone et au premier lancement, le recommandé
// rempli de l'accent. Sa peau est dans sa feuille à lui : aucune autre feuille de la vue ne dessine un bouton.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { bouton, SORTES, sorteDuBouton } from "../../../src/vue/composants/bouton/bouton.js";
import { Faux, jetonsDe } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const lire = (fichier: string) => readFileSync(join(VUE, fichier), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const FEUILLE = lire("composants/bouton/bouton.css");

// Les déclarations d'une règle de la feuille du bouton, par son sélecteur exact (dans `@media`, la première trouvée
// après lui).
function declarations(css: string, selecteur: string): Map<string, string> {
  const debut = css.indexOf(`${selecteur} {`);
  assert.ok(debut >= 0, `pas de règle « ${selecteur} »`);
  const corps = css.slice(css.indexOf("{", debut) + 1, css.indexOf("}", debut));
  return new Map(
    corps
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => [declaration.slice(0, declaration.indexOf(":")).trim(), declaration.slice(declaration.indexOf(":") + 1).trim()]),
  );
}

describe("le bouton", () => {
  test("une sorte par bouton, secondaire par défaut ; seul le recommandé porte la classe `recommande`", () => {
    for (const sorte of SORTES) {
      const cree = bouton(doc, "Run the closing pass", () => {}, { sorte }) as Faux;
      assert.equal(cree.balise, "button");
      assert.equal(cree.dataset.bouton, sorte);
      assert.equal(cree.className, sorte === "recommande" ? "recommande" : "");
    }
    assert.equal((bouton(doc, "Add a station", () => {}) as Faux).dataset.bouton, "secondaire");
  });

  test("son libellé, son type et son geste au clic ; un `submit` sans geste laisse son formulaire l'écouter", () => {
    const clics: string[] = [];
    const cree = bouton(doc, "Cancel", () => clics.push("cancel"), { sorte: "discret" }) as Faux & { type?: string };
    assert.equal(cree.textContent, "Cancel");
    assert.equal(cree.type, "button");
    cree.click();
    assert.deepEqual(clics, ["cancel"]);
    const soumet = bouton(doc, "add", undefined, { sorte: "recommande", type: "submit" }) as Faux & { type?: string };
    assert.equal(soumet.type, "submit");
    soumet.click();
    assert.deepEqual(clics, ["cancel"]);
  });

  test("le grand se dit par `data-taille` ; un bouton ordinaire n'en porte pas", () => {
    assert.equal((bouton(doc, "Sign in with GitHub", () => {}, { sorte: "recommande", grand: true }) as Faux).dataset.taille, "grand");
    assert.equal((bouton(doc, "Add a station", () => {}) as Faux).dataset.taille, undefined);
  });

  test("coupé, son libellé tient dans un `span` sur une ligne, entier au survol et pour un lecteur d'écran ; sinon, rien de tout ça", () => {
    const long = "Keep the current behaviour and document it in the README, then open a follow-up ticket for the migration";
    const coupe = bouton(doc, long, () => {}, { sorte: "recommande", coupe: true }) as Faux;
    assert.equal(coupe.textContent, long);
    assert.deepEqual([coupe.title, coupe.ariaLabel], [long, long]);
    assert.deepEqual(coupe.dessous("span").map((span) => [span.className, span.textContent]), [["coupe", long]]);
    const entier = bouton(doc, "Cancel", () => {}) as Faux;
    assert.deepEqual([entier.title, entier.ariaLabel, entier.dessous("span").length], ["", "", 0]);
  });

  test("un bouton posé change de sorte : il devient le recommandé, ou cesse de l'être", () => {
    const cree = bouton(doc, "keep it on box", () => {}) as Faux;
    sorteDuBouton(cree, "recommande");
    assert.deepEqual([cree.dataset.bouton, cree.className], ["recommande", "recommande"]);
    sorteDuBouton(cree, "danger");
    assert.deepEqual([cree.dataset.bouton, cree.className], ["danger", ""]);
  });
});

describe("sa feuille", () => {
  test("32 px de haut sur l'ordinateur ; 44 px quand il est grand, sous un écran qui les veut grands, et à la largeur d'un téléphone", () => {
    assert.equal(declarations(FEUILLE, "[data-bouton]").get("min-height"), "32px");
    assert.equal(declarations(FEUILLE, '[data-bouton][data-taille="grand"],\n[data-boutons="grands"] [data-bouton]').get("min-height"), "44px");
    // Le même seuil que la page étroite de la vue (ECRAN_ETROIT, vue.js).
    const seuil = /const ECRAN_ETROIT = "([^"]+)"/.exec(readFileSync(join(VUE, "vue.js"), "utf8"))?.[1];
    assert.equal(seuil, "(max-width: 720px)");
    const etroit = FEUILLE.slice(FEUILLE.indexOf(`@media ${seuil}`));
    assert.ok(etroit.length < FEUILLE.length, "pas de page étroite dans la feuille du bouton");
    assert.equal(declarations(etroit, "[data-bouton]").get("min-height"), "44px");
  });

  test("un libellé coupé reste sur une ligne, d'une ellipse", () => {
    const coupe = declarations(FEUILLE, "[data-bouton] > .coupe");
    assert.equal(coupe.get("white-space"), "nowrap");
    assert.equal(coupe.get("overflow"), "hidden");
    assert.equal(coupe.get("text-overflow"), "ellipsis");
  });

  test("le recommandé est rempli de l'accent, son texte sur le fond", () => {
    const recommande = declarations(FEUILLE, '[data-bouton="recommande"]');
    assert.equal(recommande.get("background"), "var(--accent)");
    assert.equal(recommande.get("border-color"), "var(--accent)");
    assert.equal(recommande.get("color"), "var(--fond)");
  });

  test("elle ne nomme que des jetons posés dans jetons.css", () => {
    const jetons = jetonsDe(readFileSync(join(VUE, "jetons.css"), "utf8"));
    const nommes = [...FEUILLE.matchAll(/var\((--[a-z-]+)\)/g)].map(([, nom = ""]) => nom);
    assert.ok(nommes.length > 5);
    for (const nom of nommes) assert.ok(jetons.has(nom), nom);
  });

  test("la page la charge avant la peau, qu'une règle d'écran (`.mono`) la précise sans la redessiner", () => {
    const page = readFileSync(join(VUE, "index.html"), "utf8");
    const feuille = page.indexOf('href="composants/bouton/bouton.css"');
    assert.ok(feuille > page.indexOf('href="jetons.css"') && feuille < page.indexOf('href="vue.css"'));
  });

  test("une règle d'écran qui vise un bouton le place, et ne le dessine pas — sauf ce qui n'est pas un bouton de la famille", () => {
    // Ce qui est un `<button>` sans être un bouton de la famille, et garde sa forme : la remise à zéro de la page, les
    // cases de la barre, les onglets, les pastilles de couleur, et un numéro de ticket qui ouvre son issue — la rangée
    // d'un ticket `fire`, un `#N` dans la phrase d'un bon. Rien d'autre : un geste, un lien vers une page, un chiffre qui
    // déplie sa liste ou une position d'autonomie est un bouton de la famille.
    const autres = /^(button(:focus-visible)?|#projets button.*|#(onglets-du-projet|terminaux) button.*|#couleurs button\.teinte.*|#rail \.feu li button|#rail \.bon p\.ligne-carte button\.lien-de-ligne)$/;
    const dessin = /^(padding(-\w+)?|font(-size|-weight)?|line-height|color|background(-color)?|border(-[\w-]+)?|min-height|height|opacity|box-shadow)$/;
    // Toutes les feuilles de la vue, sous-dossiers compris, sauf celle du bouton et les jetons.
    const feuilles = (readdirSync(VUE, { recursive: true }) as string[]).filter((fichier) => fichier.endsWith(".css") && !fichier.endsWith("bouton.css") && fichier !== "jetons.css");
    assert.ok(["vue.css", join("autonomie", "autonomie.css"), join("settings-humans", "humains.css")].every((fichier) => feuilles.includes(fichier)), feuilles.join(", "));
    for (const fichier of feuilles) {
      for (const [, tete = "", corps = ""] of lire(fichier).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selecteurs = tete.split(/,(?![^(]*\))/).map((selecteur) => selecteur.trim().replace(/\s+/g, " ")).filter((selecteur) => /\bbutton\b/.test(selecteur) && !autres.test(selecteur));
        if (selecteurs.length === 0) continue;
        const dessine = corps.split(";").map((declaration) => declaration.slice(0, declaration.indexOf(":")).trim()).filter((propriete) => dessin.test(propriete));
        assert.deepEqual(dessine, [], `${fichier} : ${selecteurs.join(", ")}`);
      }
    }
  });

  test("aucune autre feuille de la vue ne dessine un bouton de la famille, ni le recommandé", () => {
    const feuilles = (readdirSync(VUE, { recursive: true }) as string[]).filter((fichier) => fichier.endsWith(".css") && !fichier.endsWith("bouton.css") && fichier !== "jetons.css");
    assert.ok(feuilles.includes("vue.css"), feuilles.join(", "));
    for (const fichier of feuilles) assert.doesNotMatch(lire(fichier), /\.recommande\b|\[data-bouton|\[data-oui\]|\[data-arret\]/, fichier);
  });
});
