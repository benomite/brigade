// Le bouton de l'app (vue/components/button, ticket 2916) : une seule famille — recommandé, secondaire, discret,
// danger —, 32 px de haut sur l'ordinateur, 44 px à la largeur d'un téléphone et au premier lancement, le recommandé
// rempli de l'accent. Sa peau est dans sa feuille à lui : aucune autre feuille de la vue ne dessine un bouton.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { button, KINDS, kindOfButton } from "../../../src/vue/components/button/button.js";
import { Fake, tokensOf } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const read = (file: string) => readFileSync(join(VUE, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const SHEET = read("components/button/button.css");

// Les déclarations d'une règle de la feuille du bouton, par son sélecteur exact (dans `@media`, la première trouvée
// après lui).
function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `pas de règle « ${selector} »`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return new Map(
    body
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => [declaration.slice(0, declaration.indexOf(":")).trim(), declaration.slice(declaration.indexOf(":") + 1).trim()]),
  );
}

describe("le bouton", () => {
  test("une sorte par bouton, secondaire par défaut ; seul le recommandé porte la classe `recommande`", () => {
    for (const kind of KINDS) {
      const created = button(doc, "Run the closing pass", () => {}, { sorte: kind }) as Fake;
      assert.equal(created.balise, "button");
      assert.equal(created.dataset.bouton, kind);
      assert.equal(created.className, kind === "recommande" ? "recommande" : "");
    }
    assert.equal((button(doc, "Add a station", () => {}) as Fake).dataset.bouton, "secondaire");
  });

  test("son libellé, son type et son geste au clic ; un `submit` sans geste laisse son formulaire l'écouter", () => {
    const clics: string[] = [];
    const created = button(doc, "Cancel", () => clics.push("cancel"), { sorte: "discret" }) as Fake & { type?: string };
    assert.equal(created.textContent, "Cancel");
    assert.equal(created.type, "button");
    created.click();
    assert.deepEqual(clics, ["cancel"]);
    const submits = button(doc, "add", undefined, { sorte: "recommande", type: "submit" }) as Fake & { type?: string };
    assert.equal(submits.type, "submit");
    submits.click();
    assert.deepEqual(clics, ["cancel"]);
  });

  test("le grand se dit par `data-taille` ; un bouton ordinaire n'en porte pas", () => {
    assert.equal((button(doc, "Sign in with GitHub", () => {}, { sorte: "recommande", grand: true }) as Fake).dataset.taille, "grand");
    assert.equal((button(doc, "Add a station", () => {}) as Fake).dataset.taille, undefined);
  });

  test("coupé, son libellé tient dans un `span` sur une ligne, entier au survol et pour un lecteur d'écran ; sinon, rien de tout ça", () => {
    const long = "Keep the current behaviour and document it in the README, then open a follow-up ticket for the migration";
    const cut = button(doc, long, () => {}, { sorte: "recommande", coupe: true }) as Fake;
    assert.equal(cut.textContent, long);
    assert.deepEqual([cut.title, cut.ariaLabel], [long, long]);
    assert.deepEqual(cut.dessous("span").map((span) => [span.className, span.textContent]), [["coupe", long]]);
    const whole = button(doc, "Cancel", () => {}) as Fake;
    assert.deepEqual([whole.title, whole.ariaLabel, whole.dessous("span").length], ["", "", 0]);
  });

  test("un bouton posé change de sorte : il devient le recommandé, ou cesse de l'être", () => {
    const created = button(doc, "keep it on box", () => {}) as Fake;
    kindOfButton(created, "recommande");
    assert.deepEqual([created.dataset.bouton, created.className], ["recommande", "recommande"]);
    kindOfButton(created, "danger");
    assert.deepEqual([created.dataset.bouton, created.className], ["danger", ""]);
  });
});

describe("sa feuille", () => {
  test("32 px de haut sur l'ordinateur ; 44 px quand il est grand, sous un écran qui les veut grands, et à la largeur d'un téléphone", () => {
    assert.equal(declarations(SHEET, "[data-bouton]").get("min-height"), "32px");
    assert.equal(declarations(SHEET, '[data-bouton][data-taille="grand"],\n[data-boutons="grands"] [data-bouton]').get("min-height"), "44px");
    // Le même seuil que la page étroite de la vue (ECRAN_ETROIT, vue.js).
    const threshold = /const SCREEN_NARROW = "([^"]+)"/.exec(readFileSync(join(VUE, "vue.js"), "utf8"))?.[1];
    assert.equal(threshold, "(max-width: 720px)");
    const narrow = SHEET.slice(SHEET.indexOf(`@media ${threshold}`));
    assert.ok(narrow.length < SHEET.length, "pas de page étroite dans la feuille du bouton");
    assert.equal(declarations(narrow, "[data-bouton]").get("min-height"), "44px");
  });

  test("un libellé coupé reste sur une ligne, d'une ellipse", () => {
    const cut = declarations(SHEET, "[data-bouton] > .coupe");
    assert.equal(cut.get("white-space"), "nowrap");
    assert.equal(cut.get("overflow"), "hidden");
    assert.equal(cut.get("text-overflow"), "ellipsis");
  });

  test("le recommandé est rempli de l'accent, son texte sur le fond", () => {
    const recommended = declarations(SHEET, '[data-bouton="recommande"]');
    assert.equal(recommended.get("background"), "var(--accent)");
    assert.equal(recommended.get("border-color"), "var(--accent)");
    assert.equal(recommended.get("color"), "var(--fond)");
  });

  test("elle ne nomme que des jetons posés dans tokens.css", () => {
    const tokens = tokensOf(readFileSync(join(VUE, "tokens.css"), "utf8"));
    const named = [...SHEET.matchAll(/var\((--[a-z-]+)\)/g)].map(([, name = ""]) => name);
    assert.ok(named.length > 5);
    for (const name of named) assert.ok(tokens.has(name), name);
  });

  test("la page la charge avant la peau, qu'une règle d'écran (`.mono`) la précise sans la redessiner", () => {
    const page = readFileSync(join(VUE, "index.html"), "utf8");
    const sheet = page.indexOf('href="components/button/button.css"');
    assert.ok(sheet > page.indexOf('href="tokens.css"') && sheet < page.indexOf('href="vue.css"'));
  });

  test("une règle d'écran qui vise un bouton le place, et ne le dessine pas — sauf ce qui n'est pas un bouton de la famille", () => {
    // Ce qui est un `<button>` sans être un bouton de la famille, et garde sa forme : la remise à zéro de la page, les
    // cases de la barre, les onglets, les pastilles de couleur, et un numéro de ticket qui ouvre son issue — la rangée
    // d'un ticket `fire`, un `#N` dans la phrase d'un bon. Rien d'autre : un geste, un lien vers une page, un chiffre qui
    // déplie sa liste ou une position d'autonomie est un bouton de la famille.
    const others = /^(button(:focus-visible)?|#projets button.*|#(onglets-du-projet|terminaux) button.*|#couleurs button\.teinte.*|#rail \.feu li button|\.bon p\.ligne-carte button\.lien-de-ligne)$/;
    const drawing = /^(padding(-\w+)?|font(-size|-weight)?|line-height|color|background(-color)?|border(-[\w-]+)?|min-height|height|opacity|box-shadow)$/;
    // Toutes les feuilles de la vue, sous-dossiers compris, sauf celle du bouton et les jetons.
    const sheets = (readdirSync(VUE, { recursive: true }) as string[]).filter((file) => file.endsWith(".css") && !file.endsWith("button.css") && file !== "tokens.css");
    assert.ok(["vue.css", join("autonomy", "autonomy.css"), join("settings-humans", "humans.css")].every((file) => sheets.includes(file)), sheets.join(", "));
    for (const file of sheets) {
      for (const [, head = "", body = ""] of read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = head.split(/,(?![^(]*\))/).map((selector) => selector.trim().replace(/\s+/g, " ")).filter((selector) => /\bbutton\b/.test(selector) && !others.test(selector));
        if (selectors.length === 0) continue;
        const draws = body.split(";").map((declaration) => declaration.slice(0, declaration.indexOf(":")).trim()).filter((property) => drawing.test(property));
        assert.deepEqual(draws, [], `${file} : ${selectors.join(", ")}`);
      }
    }
  });

  test("aucune autre feuille de la vue ne dessine un bouton de la famille, ni le recommandé", () => {
    const sheets = (readdirSync(VUE, { recursive: true }) as string[]).filter((file) => file.endsWith(".css") && !file.endsWith("button.css") && file !== "tokens.css");
    assert.ok(sheets.includes("vue.css"), sheets.join(", "));
    for (const file of sheets) assert.doesNotMatch(read(file), /\.recommande\b|\[data-bouton|\[data-oui\]|\[data-arret\]/, file);
  });
});
