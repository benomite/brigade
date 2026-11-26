// Le sigle d'un projet dans la barre (ticket 1983) : trois signes au plus, tirés des noms de l'app — deux projets
// n'ont jamais le même —, ou écrits par le chef dans le fichier des projets, depuis ses réglages. La case l'écrit en
// grand, sur une ligne, jamais coupé ; son nom entier est au survol, et en tête de son espace.
// Le fichier est un vrai fichier écrit par le test ; la vue est jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { changerSigle, EXEMPLE, lireConfiguration, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { refusalDuSigle, SIGLE_MAX, sigles } from "../src/sigle.ts";
import { suivreConfiguration } from "../src/suivi.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, tokensOf, jouerLaVue, ouvrirRead, repos } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
// Les cinq projets du chef, tels que sa barre les montrait (#1512, #1983).
const DU_CHEF = ["brigade", "mirrorscreen", "mirrorlab", "escale", "calculus-workspace"];
const tires = (noms: string[]) => Object.fromEntries(sigles(noms.map((name) => ({ nom: name }))));
const longueur = (sigle: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(sigle)].length;

describe("le sigle tiré des noms", () => {
  test("les cinq projets du chef : mirrorscreen et mirrorlab se lisent MS et ML, d'un coup d'œil", () => {
    assert.deepEqual(tires(DU_CHEF), { brigade: "BR", mirrorscreen: "MS", mirrorlab: "ML", escale: "ES", "calculus-workspace": "CW" });
  });

  test("un nom de plusieurs mots donne ses initiales, trois au plus ; un mot seul, sa première lettre et sa deuxième", () => {
    assert.deepEqual(tires(["my-kitchen-2", "brigade-site", "a-b-c-d", "parade", "mirrorLab"]), { "my-kitchen-2": "MK2", "brigade-site": "BS", "a-b-c-d": "ABC", parade: "PA", mirrorLab: "ML" });
  });

  test("un mot seul se sépare des noms qui commencent comme lui là où ils cessent de lui ressembler", () => {
    assert.deepEqual(tires(["parade", "pastry"]), { parade: "PR", pastry: "PS" });
    // Un nom qui est le début d'un autre garde sa deuxième lettre ; l'autre prend celle où il le dépasse.
    assert.deepEqual(tires(["mirror", "mirrorlab"]), { mirror: "MI", mirrorlab: "ML" });
    assert.deepEqual(tires(["brigade", "brigade-site"]), { brigade: "BR", "brigade-site": "BS" });
  });

  test("ranger la barre ne change aucun sigle : l'ordre des projets n'y fait rien", () => {
    const noms = ["mirrorscreen", "mirrorlab", "mirror", "mi", "m", "brigade", "brigade-site", "b-s"];
    assert.deepEqual(tires([...noms].reverse()), tires(noms));
    assert.deepEqual(tires([...noms.slice(3), ...noms.slice(0, 3)]), tires(noms));
  });

  test(`deux projets n'ont jamais le même sigle, et aucun n'a plus de ${SIGLE_MAX} signes — même quand les noms se ressemblent tous`, () => {
    const ressemblants = [
      ...Array.from({ length: 40 }, (_, n) => `mirror${String.fromCharCode(97 + (n % 26))}${n}`),
      ...Array.from({ length: 30 }, (_, n) => `a-${n}`),
      "a",
      "a-",
      "a--",
      "Ä",
      "ß",
      "!!!",
      "calcul",
      "calculus",
      "calculus-workspace",
      "calculus-work-space",
    ];
    const rendus = Object.values(tires(ressemblants));
    assert.equal(rendus.length, ressemblants.length);
    assert.equal(new Set(rendus.map((sigle) => sigle.toUpperCase())).size, rendus.length, rendus.join(" "));
    for (const sigle of rendus) assert.ok(longueur(sigle) >= 1 && longueur(sigle) <= SIGLE_MAX, sigle);
  });

  test("celui que le chef a écrit passe avant tout sigle tiré, qui l'évite — sans changer les autres cases", () => {
    // ML écrit pour brigade : mirrorlab, qui l'aurait tiré, en prend un autre.
    const avecML = Object.fromEntries(sigles([{ nom: "brigade", sigle: "ML" }, { nom: "mirrorscreen" }, { nom: "mirrorlab" }]));
    assert.equal(avecML.brigade, "ML");
    assert.equal(avecML.mirrorscreen, "MS");
    assert.notEqual(avecML.mirrorlab?.toUpperCase(), "ML");
    // LAB écrit pour mirrorlab : mirrorscreen garde MS, la casse comptant pour rien.
    assert.deepEqual(Object.fromEntries(sigles([{ nom: "mirrorscreen" }, { nom: "mirrorlab", sigle: "lab" }, { nom: "lab" }])), { mirrorlab: "lab", mirrorscreen: "MS", lab: "LA" });
  });
});

describe("le sigle écrit", () => {
  test(`trois signes au plus, sans blanc — un emoji compte pour un`, () => {
    for (const slip of ["M", "ML", "LAB", " ml ", "🚀", "A🚀B"]) assert.equal(refusalDuSigle(slip), undefined, slip);
    assert.equal(refusalDuSigle("LABO"), "“sigle” is 4 characters long: 3 at most");
    assert.equal(refusalDuSigle("M L"), "“sigle” holds a space: 3 characters at most, on one line");
    assert.equal(refusalDuSigle("  "), "“sigle” is empty — remove it, and the app derives one from the name");
    assert.equal(refusalDuSigle(12), "“sigle” must be a string — the short label of its tile, 3 characters at most");
  });
});

function fichier(t: TestContext, contenu: unknown): { racine: string; chemin: string } {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, JSON.stringify(contenu));
  return { racine, chemin };
}
const lu = (chemin: string) => JSON.parse(readFileSync(chemin, "utf8")) as { projets: Record<string, unknown>[] };

describe("le sigle dans le fichier des projets", () => {
  test("un projet qui en porte un le garde à la lecture ; un sigle mal écrit refuse le fichier en le disant", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/", sigle: " Ab " }] });
    assert.deepEqual(lireConfiguration(chemin).projets, [{ nom: "a", dossier: "/", sigle: "Ab" }]);

    writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "a", dossier: racine, sigle: "ABCD" }] }));
    assert.equal(lireConfiguration(chemin).refus, "project #1 (a): “sigle” is 4 characters long: 3 at most");
  });

  test("un sigle se change, se retire — celui-là, et rien d'autre du fichier", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/", couleurs: { onglet: "#f2994a" } }, { nom: "b", dossier: "/", sigle: "BB" }] });

    assert.equal(changerSigle(chemin, "a", "LAB", racine), undefined);
    assert.deepEqual(lu(chemin).projets, [{ nom: "a", dossier: "/", couleurs: { onglet: "#f2994a" }, sigle: "LAB" }, { nom: "b", dossier: "/", sigle: "BB" }]);
    assert.equal(changerSigle(chemin, "b", null, racine), undefined);
    assert.deepEqual(lu(chemin).projets[1], { nom: "b", dossier: "/" });

    const avant = readFileSync(chemin, "utf8");
    assert.equal(changerSigle(chemin, "b", null, racine), undefined, "rien à retirer : rien n'est écrit");
    assert.equal(changerSigle(chemin, "z", "Z", racine), "“z” is not in this file: nothing was changed there");
    assert.equal(changerSigle(chemin, "b", "LABO", racine), "nothing was written: “sigle” is 4 characters long: 3 at most");
    assert.equal(changerSigle(chemin, "b", "lab", racine), "nothing was written: “LAB” is already the label of a");
    assert.equal(readFileSync(chemin, "utf8"), avant);
  });

  test("suivi, le fichier dit tout de suite le sigle écrit, et la barre le prend", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "mirrorscreen", dossier: "/" }, { nom: "mirrorlab", dossier: "/" }] });
    const suivie = suivreConfiguration({ chemin, maison: racine, surChangement: () => {} });
    t.after(() => suivie.fermer());
    assert.deepEqual(pourLaBar(suivie.configuration()).projets.map(({ etiquette }) => etiquette), ["MS", "ML"]);

    assert.equal(suivie.changerSigle("mirrorlab", "LAB"), undefined);
    assert.deepEqual(pourLaBar(suivie.configuration()).projets.map(({ etiquette }) => etiquette), ["MS", "LAB"]);
    assert.equal(suivie.changerSigle("mirrorlab", null), undefined);
    assert.deepEqual(pourLaBar(suivie.configuration()).projets.map(({ etiquette }) => etiquette), ["MS", "ML"]);
  });
});

describe("le sigle dans la vue", () => {
  const SECOND: Terminal = { id: 1, projet: "mirrorlab", genre: "second", titre: "second · claude", note: "", arrete: false };
  const projects = (sigleDeLab?: string): Project[] => DU_CHEF.map((name) => ({ nom: name, dossier: `/tmp/${name}`, ...(name === "mirrorlab" && sigleDeLab !== undefined ? { sigle: sigleDeLab } : {}) }));

  const jouer = (poses: Project[], changerSigle?: (project: string, sigle: string | null) => string | undefined) =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: poses }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [SECOND],
      ...(changerSigle === undefined ? {} : { changerSigle }),
    });
  // Les cases des projets : entre « Tous les projets », en tête, et « + », au pied.
  const casesDesProjects = (vue: Jouee): Faux[] => vue.element("projets").children.filter(({ id }) => !id.startsWith("entree-"));
  const caseDe = (vue: Jouee, name: string): Faux => casesDesProjects(vue).find(({ title }) => title.split(" — ")[0] === name) ?? assert.fail(`pas de case pour ${name}`);
  const ecrit = (cas: Faux) => cas.dessous("span").filter(({ className }) => className === "sigle-de-case").map(({ textContent }) => textContent);
  const line = (vue: Jouee): Faux => vue.element("sigle").children.find(({ className }) => className === "reglage") ?? assert.fail("pas de ligne de sigle");
  const ouvrirSettings = async (vue: Jouee, name: string) => {
    caseDe(vue, name).click();
    await repos();
    await ouvrirRead(vue, "Settings");
  };

  test("chaque case écrit le sigle de son projet ; son nom entier est au survol, et en tête de son espace une fois ouvert", async () => {
    const vue = await jouer(projects());
    assert.deepEqual(casesDesProjects(vue).map(ecrit), [["BR"], ["MS"], ["ML"], ["ES"], ["CW"]]);
    assert.deepEqual(casesDesProjects(vue).map(({ title }) => title.split(" — ")[0]), DU_CHEF);
    // Sa couleur et sa pastille restent les siennes.
    assert.equal(caseDe(vue, "mirrorlab").dessous("span").filter(({ className }) => className === "pastille").length, 1);

    caseDe(vue, "mirrorlab").click();
    await repos();
    assert.equal(vue.element("espace").textContent, "mirrorlab");
  });

  test("dans Settings, sous toi, le sigle se lit — tiré de son nom — et s'écrit : il part dès que le champ change, vidé il est retiré", async () => {
    const vue = await jouer(projects(), () => undefined);
    await ouvrirSettings(vue, "mirrorlab");
    assert.equal(vue.element("sigle").hidden, false);
    assert.equal(line(vue).dataset.cle, "sigle");
    assert.match(line(vue).textContent, /^Label in the bar.*ML · from its name/);
    const champ = line(vue).dessous("input")[0] ?? assert.fail("pas de champ");
    assert.equal(champ.value, "");
    assert.equal(champ.placeholder, "ML");
    assert.deepEqual(line(vue).dessous("button").map(({ textContent }) => textContent), [], "rien à rendre : il est déjà celui de son nom");

    champ.value = "LAB";
    champ.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerSigle"), ["mirrorlab", "LAB"]);
    champ.value = "  ";
    champ.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerSigle"), ["mirrorlab", null]);
  });

  test("le fichier a pris le sigle écrit : la case le prend tout de suite, la ligne le dit tien, et « back to its name » le retire", async () => {
    const vue = await jouer(projects(), () => undefined);
    await ouvrirSettings(vue, "mirrorlab");
    vue.dire("surConfiguration", pourLaBar({ chemin: "/tmp/app.json", projets: projects("LAB") }, () => true), []);
    await repos();
    assert.deepEqual(casesDesProjects(vue).map(ecrit), [["BR"], ["MS"], ["LAB"], ["ES"], ["CW"]]);
    assert.match(line(vue).textContent, /LAB · yours/);
    assert.equal(line(vue).dessous("input")[0]?.value, "LAB");

    const retour = line(vue).dessous("button").find(({ textContent }) => textContent === "back to its name") ?? assert.fail("pas de retour au nom");
    retour.click();
    await repos();
    assert.deepEqual(vue.dernier("changerSigle"), ["mirrorlab", null]);
  });

  test("un sigle refusé le dit sous sa ligne", async () => {
    const vue = await jouer(projects(), () => "nothing was written: “sigle” is 4 characters long: 3 at most");
    await ouvrirSettings(vue, "mirrorlab");
    const champ = line(vue).dessous("input")[0] ?? assert.fail("pas de champ");
    champ.value = "LABO";
    champ.declencher("change");
    await repos();
    assert.deepEqual(
      line(vue).dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent),
      ["nothing was written: “sigle” is 4 characters long: 3 at most"],
    );
  });

  test("la case l'écrit en grand, sur une ligne, sans rien qui le coupe ; la barre ne s'élargit pas", () => {
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const regle = /#projets \.sigle-de-case\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour le sigle");
    // Sa taille est un jeton de l'échelle (#2909) : sa valeur est lue dans jetons.css.
    const jeton = /font-size:\s*var\((--[a-z-]+)\)/.exec(regle)?.[1] ?? assert.fail("la taille du sigle n'est pas un jeton");
    const taille = Number(/^(\d+)px$/.exec(tokensOf(readFileSync(join(VUE, "tokens.css"), "utf8")).get(jeton) ?? "")?.[1]);
    assert.ok(taille >= 16, `${taille}px : à peine plus grand que les 10px du nom coupé d'avant`);
    assert.match(regle, /white-space:\s*nowrap/);
    assert.doesNotMatch(regle, /overflow|text-overflow|line-clamp/);
    assert.doesNotMatch(css, /nom-de-case/);
    assert.match(css, /#projets \{\s*flex: 0 0 64px;/);
  });
});
