// Le sigle d'un projet dans la barre (ticket 1983) : trois signes au plus, tirés des noms de l'app — deux projets
// n'ont jamais le même —, ou écrits par le chef dans le fichier des projets, depuis ses réglages. La case l'écrit en
// grand, sur une ligne, jamais coupé ; son nom entier est au survol, et en tête de son espace.
// Le fichier est un vrai fichier écrit par le test ; la vue est jouée telle qu'elle est, devant un faux document
// (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { changeAcronym, EXAMPLE, readConfiguration, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER } from "../src/facts.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { refusalOfAcronym, ACRONYM_MAX, acronyms } from "../src/acronym.ts";
import { followConfiguration } from "../src/tracking.ts";
import type { Terminal } from "../src/terminals.ts";
import { type Fake, type Played, tokensOf, playTheVue, openRead, repos } from "./helpers/false-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
// Les cinq projets du chef, tels que sa barre les montrait (#1512, #1983).
const OF_CHEF = ["brigade", "mirrorscreen", "mirrorlab", "escale", "calculus-workspace"];
const pulled = (names: string[]) => Object.fromEntries(acronyms(names.map((name) => ({ nom: name }))));
const length = (acronym: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(acronym)].length;

describe("le sigle tiré des noms", () => {
  test("les cinq projets du chef : mirrorscreen et mirrorlab se lisent MS et ML, d'un coup d'œil", () => {
    assert.deepEqual(pulled(OF_CHEF), { brigade: "BR", mirrorscreen: "MS", mirrorlab: "ML", escale: "ES", "calculus-workspace": "CW" });
  });

  test("un nom de plusieurs mots donne ses initiales, trois au plus ; un mot seul, sa première lettre et sa deuxième", () => {
    assert.deepEqual(pulled(["my-kitchen-2", "brigade-site", "a-b-c-d", "parade", "mirrorLab"]), { "my-kitchen-2": "MK2", "brigade-site": "BS", "a-b-c-d": "ABC", parade: "PA", mirrorLab: "ML" });
  });

  test("un mot seul se sépare des noms qui commencent comme lui là où ils cessent de lui ressembler", () => {
    assert.deepEqual(pulled(["parade", "pastry"]), { parade: "PR", pastry: "PS" });
    // Un nom qui est le début d'un autre garde sa deuxième lettre ; l'autre prend celle où il le dépasse.
    assert.deepEqual(pulled(["mirror", "mirrorlab"]), { mirror: "MI", mirrorlab: "ML" });
    assert.deepEqual(pulled(["brigade", "brigade-site"]), { brigade: "BR", "brigade-site": "BS" });
  });

  test("ranger la barre ne change aucun sigle : l'ordre des projets n'y fait rien", () => {
    const names = ["mirrorscreen", "mirrorlab", "mirror", "mi", "m", "brigade", "brigade-site", "b-s"];
    assert.deepEqual(pulled([...names].reverse()), pulled(names));
    assert.deepEqual(pulled([...names.slice(3), ...names.slice(0, 3)]), pulled(names));
  });

  test(`deux projets n'ont jamais le même sigle, et aucun n'a plus de ${ACRONYM_MAX} signes — même quand les noms se ressemblent tous`, () => {
    const lookalike = [
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
    const renderedOnes = Object.values(pulled(lookalike));
    assert.equal(renderedOnes.length, lookalike.length);
    assert.equal(new Set(renderedOnes.map((acronym) => acronym.toUpperCase())).size, renderedOnes.length, renderedOnes.join(" "));
    for (const acronym of renderedOnes) assert.ok(length(acronym) >= 1 && length(acronym) <= ACRONYM_MAX, acronym);
  });

  test("celui que le chef a écrit passe avant tout sigle tiré, qui l'évite — sans changer les autres cases", () => {
    // ML écrit pour brigade : mirrorlab, qui l'aurait tiré, en prend un autre.
    const withML = Object.fromEntries(acronyms([{ nom: "brigade", sigle: "ML" }, { nom: "mirrorscreen" }, { nom: "mirrorlab" }]));
    assert.equal(withML.brigade, "ML");
    assert.equal(withML.mirrorscreen, "MS");
    assert.notEqual(withML.mirrorlab?.toUpperCase(), "ML");
    // LAB écrit pour mirrorlab : mirrorscreen garde MS, la casse comptant pour rien.
    assert.deepEqual(Object.fromEntries(acronyms([{ nom: "mirrorscreen" }, { nom: "mirrorlab", sigle: "lab" }, { nom: "lab" }])), { mirrorlab: "lab", mirrorscreen: "MS", lab: "LA" });
  });
});

describe("le sigle écrit", () => {
  test(`trois signes au plus, sans blanc — un emoji compte pour un`, () => {
    for (const slip of ["M", "ML", "LAB", " ml ", "🚀", "A🚀B"]) assert.equal(refusalOfAcronym(slip), undefined, slip);
    assert.equal(refusalOfAcronym("LABO"), "“sigle” is 4 characters long: 3 at most");
    assert.equal(refusalOfAcronym("M L"), "“sigle” holds a space: 3 characters at most, on one line");
    assert.equal(refusalOfAcronym("  "), "“sigle” is empty — remove it, and the app derives one from the name");
    assert.equal(refusalOfAcronym(12), "“sigle” must be a string — the short label of its tile, 3 characters at most");
  });
});

function file(t: TestContext, content: unknown): { racine: string; chemin: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "app.json");
  writeFileSync(path, JSON.stringify(content));
  return { racine: root, chemin: path };
}
const readOne = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { projets: Record<string, unknown>[] };

describe("le sigle dans le fichier des projets", () => {
  test("un projet qui en porte un le garde à la lecture ; un sigle mal écrit refuse le fichier en le disant", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/", sigle: " Ab " }] });
    assert.deepEqual(readConfiguration(path).projets, [{ nom: "a", dossier: "/", sigle: "Ab" }]);

    writeFileSync(path, JSON.stringify({ projets: [{ nom: "a", dossier: root, sigle: "ABCD" }] }));
    assert.equal(readConfiguration(path).refus, "project #1 (a): “sigle” is 4 characters long: 3 at most");
  });

  test("un sigle se change, se retire — celui-là, et rien d'autre du fichier", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/", couleurs: { onglet: "#f2994a" } }, { nom: "b", dossier: "/", sigle: "BB" }] });

    assert.equal(changeAcronym(path, "a", "LAB", root), undefined);
    assert.deepEqual(readOne(path).projets, [{ nom: "a", dossier: "/", couleurs: { onglet: "#f2994a" }, sigle: "LAB" }, { nom: "b", dossier: "/", sigle: "BB" }]);
    assert.equal(changeAcronym(path, "b", null, root), undefined);
    assert.deepEqual(readOne(path).projets[1], { nom: "b", dossier: "/" });

    const before = readFileSync(path, "utf8");
    assert.equal(changeAcronym(path, "b", null, root), undefined, "rien à retirer : rien n'est écrit");
    assert.equal(changeAcronym(path, "z", "Z", root), "“z” is not in this file: nothing was changed there");
    assert.equal(changeAcronym(path, "b", "LABO", root), "nothing was written: “sigle” is 4 characters long: 3 at most");
    assert.equal(changeAcronym(path, "b", "lab", root), "nothing was written: “LAB” is already the label of a");
    assert.equal(readFileSync(path, "utf8"), before);
  });

  test("suivi, le fichier dit tout de suite le sigle écrit, et la barre le prend", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "mirrorscreen", dossier: "/" }, { nom: "mirrorlab", dossier: "/" }] });
    const tracked = followConfiguration({ chemin: path, maison: root, surChangement: () => {} });
    t.after(() => tracked.fermer());
    assert.deepEqual(forTheBar(tracked.configuration()).projets.map(({ etiquette: label }) => label), ["MS", "ML"]);

    assert.equal(tracked.changerSigle("mirrorlab", "LAB"), undefined);
    assert.deepEqual(forTheBar(tracked.configuration()).projets.map(({ etiquette: label }) => label), ["MS", "LAB"]);
    assert.equal(tracked.changerSigle("mirrorlab", null), undefined);
    assert.deepEqual(forTheBar(tracked.configuration()).projets.map(({ etiquette: label }) => label), ["MS", "ML"]);
  });
});

describe("le sigle dans la vue", () => {
  const SECOND: Terminal = { id: 1, projet: "mirrorlab", genre: "second", titre: "second · claude", note: "", arrete: false };
  const projects = (acronymOfLab?: string): Project[] => OF_CHEF.map((name) => ({ nom: name, dossier: `/tmp/${name}`, ...(name === "mirrorlab" && acronymOfLab !== undefined ? { sigle: acronymOfLab } : {}) }));

  const play = (poses: Project[], changeAcronym?: (project: string, acronym: string | null) => string | undefined) =>
    playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: poses }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: {},
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [SECOND],
      ...(changeAcronym === undefined ? {} : { changerSigle: changeAcronym }),
    });
  // Les cases des projets : entre « Tous les projets », en tête, et « + », au pied.
  const casesOfProjects = (vue: Played): Fake[] => vue.element("projets").children.filter(({ id }) => !id.startsWith("entree-"));
  const caseOf = (vue: Played, name: string): Fake => casesOfProjects(vue).find(({ title }) => title.split(" — ")[0] === name) ?? assert.fail(`pas de case pour ${name}`);
  const written = (theCase: Fake) => theCase.dessous("span").filter(({ className }) => className === "sigle-de-case").map(({ textContent }) => textContent);
  const line = (vue: Played): Fake => vue.element("sigle").children.find(({ className }) => className === "reglage") ?? assert.fail("pas de ligne de sigle");
  const openSettings = async (vue: Played, name: string) => {
    caseOf(vue, name).click();
    await repos();
    await openRead(vue, "Settings");
  };

  test("chaque case écrit le sigle de son projet ; son nom entier est au survol, et en tête de son espace une fois ouvert", async () => {
    const vue = await play(projects());
    assert.deepEqual(casesOfProjects(vue).map(written), [["BR"], ["MS"], ["ML"], ["ES"], ["CW"]]);
    assert.deepEqual(casesOfProjects(vue).map(({ title }) => title.split(" — ")[0]), OF_CHEF);
    // Sa couleur et sa pastille restent les siennes.
    assert.equal(caseOf(vue, "mirrorlab").dessous("span").filter(({ className }) => className === "pastille").length, 1);

    caseOf(vue, "mirrorlab").click();
    await repos();
    assert.equal(vue.element("espace").textContent, "mirrorlab");
  });

  test("dans Settings, sous toi, le sigle se lit — tiré de son nom — et s'écrit : il part dès que le champ change, vidé il est retiré", async () => {
    const vue = await play(projects(), () => undefined);
    await openSettings(vue, "mirrorlab");
    assert.equal(vue.element("sigle").hidden, false);
    assert.equal(line(vue).dataset.cle, "sigle");
    assert.match(line(vue).textContent, /^Label in the bar.*ML · from its name/);
    const field = line(vue).dessous("input")[0] ?? assert.fail("pas de champ");
    assert.equal(field.value, "");
    assert.equal(field.placeholder, "ML");
    assert.deepEqual(line(vue).dessous("button").map(({ textContent }) => textContent), [], "rien à rendre : il est déjà celui de son nom");

    field.value = "LAB";
    field.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerSigle"), ["mirrorlab", "LAB"]);
    field.value = "  ";
    field.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerSigle"), ["mirrorlab", null]);
  });

  test("le fichier a pris le sigle écrit : la case le prend tout de suite, la ligne le dit tien, et « back to its name » le retire", async () => {
    const vue = await play(projects(), () => undefined);
    await openSettings(vue, "mirrorlab");
    vue.dire("surConfiguration", forTheBar({ chemin: "/tmp/app.json", projets: projects("LAB") }, () => true), []);
    await repos();
    assert.deepEqual(casesOfProjects(vue).map(written), [["BR"], ["MS"], ["LAB"], ["ES"], ["CW"]]);
    assert.match(line(vue).textContent, /LAB · yours/);
    assert.equal(line(vue).dessous("input")[0]?.value, "LAB");

    const back = line(vue).dessous("button").find(({ textContent }) => textContent === "back to its name") ?? assert.fail("pas de retour au nom");
    back.click();
    await repos();
    assert.deepEqual(vue.dernier("changerSigle"), ["mirrorlab", null]);
  });

  test("un sigle refusé le dit sous sa ligne", async () => {
    const vue = await play(projects(), () => "nothing was written: “sigle” is 4 characters long: 3 at most");
    await openSettings(vue, "mirrorlab");
    const field = line(vue).dessous("input")[0] ?? assert.fail("pas de champ");
    field.value = "LABO";
    field.declencher("change");
    await repos();
    assert.deepEqual(
      line(vue).dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent),
      ["nothing was written: “sigle” is 4 characters long: 3 at most"],
    );
  });

  test("la case l'écrit en grand, sur une ligne, sans rien qui le coupe ; la barre ne s'élargit pas", () => {
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = /#projets \.sigle-de-case\s*\{([^}]*)\}/.exec(css)?.[1] ?? assert.fail("pas de règle pour le sigle");
    // Sa taille est un jeton de l'échelle (#2909) : sa valeur est lue dans jetons.css.
    const token = /font-size:\s*var\((--[a-z-]+)\)/.exec(rule)?.[1] ?? assert.fail("la taille du sigle n'est pas un jeton");
    const size = Number(/^(\d+)px$/.exec(tokensOf(readFileSync(join(VUE, "tokens.css"), "utf8")).get(token) ?? "")?.[1]);
    assert.ok(size >= 16, `${size}px : à peine plus grand que les 10px du nom coupé d'avant`);
    assert.match(rule, /white-space:\s*nowrap/);
    assert.doesNotMatch(rule, /overflow|text-overflow|line-clamp/);
    assert.doesNotMatch(css, /nom-de-case/);
    assert.match(css, /#projets \{\s*flex: 0 0 64px;/);
  });
});
