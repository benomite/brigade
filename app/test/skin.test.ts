// La peau de l'app : une palette tenue en un seul endroit et qui est celle de la maquette, deux
// polices embarquées — Archivo pour l'interface, JetBrains Mono pour ce qui se recopie et ce que
// la box a rendu —, des cartes sur fond sombre. Et ce qu'elle ne touche jamais : le texte relayé
// de la box, posé mot pour mot dans le second, les cinq onglets, « Tous les projets » et l'écran d'ajout.
// La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts) : ni
// Electron, ni navigateur. Ce qui se peint ne s'y voit pas — les règles de vue.css sont lues à part.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Terminal } from "../src/terminals.ts";
import { type Fake, tokensOf, playTheVue } from "./helpers/false-vue.ts";

const ROOT = join(import.meta.dirname, "../..");
const VUE = join(ROOT, "app/src/vue");
const MOCKUPS = join(ROOT, "docs/maquettes/app");
const read = (file: string) => readFileSync(join(VUE, file), "utf8");
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
// Comments of a .js/.ts/.html file: a string is skipped whole, so a `//` inside "https://…" opens no comment.
const withoutCodeComments = (code: string) =>
  code.replace(/("(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->/g, (_, text?: string) => text ?? "");
const withoutAnyComments = (file: string, text: string) => (file.endsWith(".css") ? withoutComments(text) : withoutCodeComments(text));

// Les fichiers de la vue qui se lisent — tout sauf les polices, qui sont des binaires, et leurs licences.
const files = (readdirSync(VUE, { recursive: true }) as string[]).filter((file) => /\.(css|js|html|ts)$/.test(file)).sort();

// Une feuille de style, règle par règle : ses sélecteurs, ses déclarations. Les feuilles de la
// vue n'ont ni règle imbriquée ni `@media` : une accolade ouvre une règle, la suivante la ferme.
type Rule = { selecteurs: string[]; declarations: Map<string, string> };
function rules(css: string): Rule[] {
  return [...withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, head = "", body = ""]) => ({
    selecteurs: head.split(",").map((selector) => selector.trim().replace(/\s+/g, " ")),
    declarations: new Map(
      body
        .split(";")
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .map((declaration) => [declaration.slice(0, declaration.indexOf(":")).trim(), declaration.slice(declaration.indexOf(":") + 1).trim()]),
    ),
  }));
}

// Une couleur écrite en dur : en hexadécimal, ou par une fonction de couleur.
const COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/gi;
// Les mots qu'une propriété de couleur accepte ici : aucun n'est un nom de couleur.
const WORDS_WITHOUT_COLOR = new Set(["none", "transparent", "currentcolor", "inherit", "solid", "dashed", "dotted", "var"]);
const SETS_A_COLOR = /^(color|background|background-color|border|border-(top|right|bottom|left)|border-(top-|right-|bottom-|left-)?color|outline|outline-color|box-shadow|accent-color|text-decoration-color|caret-color|fill|stroke)$/;

const tokens = tokensOf(read("tokens.css"));
const colors = new Map([...tokens].filter(([, value]) => value.startsWith("#")));

describe("la palette : un seul jeu de variables, écrit à un seul endroit", () => {
  test("tokens.css est le seul fichier de la vue où une couleur s'écrit", () => {
    assert.ok(files.includes("tokens.css") && files.includes("vue.css") && files.includes("vue.js") && files.includes("index.html"), files.join(", "));
    for (const file of files.filter((named) => named !== "tokens.css")) {
      assert.deepEqual(withoutAnyComments(file, read(file)).match(COLOR) ?? [], [], `${file} écrit une couleur en dur`);
    }
    assert.doesNotMatch(read("index.html"), /\bstyle=|<style\b/, "index.html porte un style à lui");
  });

  test("un numéro de ticket (#4743, tout en hexadécimal) dans un commentaire n'est pas une couleur, dans le code si", () => {
    const commented = "// ticket #4743\n/* ticket #4743 */\nconst url = \"https://x.fr/a\"; // #4743\n";
    assert.deepEqual(withoutAnyComments("vue.js", commented).match(COLOR) ?? [], []);
    assert.deepEqual(withoutAnyComments("index.html", "<!-- ticket #4743 --><p></p>").match(COLOR) ?? [], []);
    assert.deepEqual(withoutAnyComments("vue.js", "const c = '#4743'; // #4743").match(COLOR), ["#4743"]);
    assert.deepEqual(withoutAnyComments("vue.js", "const u = 'http://x'; const c = '#abc';").match(COLOR), ["#abc"]);
  });

  test("dans vue.css, une propriété de couleur ne nomme qu'une variable — jamais un nom de couleur", () => {
    for (const { selecteurs: selectors, declarations } of rules(read("vue.css"))) {
      for (const [property, value] of declarations) {
        if (!SETS_A_COLOR.test(property)) continue;
        // Ce qui reste d'une valeur une fois ôtés ses variables et ses longueurs : des mots.
        const words = value.replace(/var\(--[a-z0-9-]+\)/g, " ").match(/[a-z][a-z-]*/gi) ?? [];
        const names = words.filter((word) => !WORDS_WITHOUT_COLOR.has(word.toLowerCase()) && !/^(px|em|%)$/.test(word));
        assert.deepEqual(names, [], `${selectors.join(", ")} { ${property}: ${value} }`);
      }
    }
  });

  test("chaque variable que la vue nomme est posée dans tokens.css — ou, pour le ton d'un état, d'après elles", () => {
    const css = withoutComments(read("vue.css"));
    // `--ton` : la couleur d'un mot d'état, posée par la pastille (components/pill) d'après le nom que facts.ts lui donne ;
    // vue.css n'en pose aucune.
    const pill = withoutComments(read("components/pill/pill.css"));
    assert.deepEqual([...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name = ""]) => name), []);
    assert.deepEqual([...new Set([...pill.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(([, name = ""]) => name))], ["--ton"]);
    for (const [, value] of pill.matchAll(/--ton\s*:\s*([^;]+);/g)) assert.match(value ?? "", /^var\(--(vert|jaune|rouge|bleu|gris|orange)\)$/);

    const slipAndCard = withoutComments(read("components/slip/slip.css")) + withoutComments(read("components/card-wait/card-wait.css"));
    const named = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g), ...slipAndCard.matchAll(/var\((--[a-z0-9-]+)\)/g), ...pill.matchAll(/var\((--[a-z0-9-]+)\)/g), ...read("vue.js").matchAll(/jeton\("(--[a-z0-9-]+)"\)/g)].map(([, name = ""]) => name);
    assert.ok(named.length > 100, "vue.css ne nomme presque aucune variable");
    for (const name of new Set(named)) assert.ok(tokens.has(name) || name === "--ton", `« ${name} » n'est pas dans tokens.css`);
    // Et aucune n'y dort : ce qui est posé sert.
    for (const name of tokens.keys()) assert.ok(named.includes(name), `« ${name} » est dans tokens.css, et rien ne la nomme`);
  });

  test("tokens.css ne pose une couleur qu'une fois, sur la racine, et rien d'autre ne s'y peint", () => {
    const css = withoutComments(read("tokens.css"));
    assert.deepEqual(rules(css).flatMap(({ selecteurs: selectors }) => selectors), ["@font-face", "@font-face", "@font-face", ":root"]);
    const setEntries = [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(([, name = ""]) => name);
    assert.deepEqual(setEntries, [...new Set(setEntries)], "une variable est posée deux fois");
    assert.ok(colors.size >= 20, `${colors.size} couleurs`);
    assert.equal(tokens.get("color-scheme"), undefined);
    assert.match(css, /color-scheme:\s*dark;/, "le thème est sombre, et lui seul");
  });

  test("le fond de la fenêtre, avant que la vue ne se peigne, est celui de la peau", () => {
    const background = /backgroundColor: "(#[0-9a-f]{6})"/.exec(readFileSync(join(ROOT, "app/src/main.ts"), "utf8"))?.[1];
    assert.equal(background, tokens.get("--fond"));
  });

});

describe("la palette est celle de la maquette", () => {
  // Les six planches du 2026-11-08 (#2907) font foi : docs/maquettes/app/README.md.
  const mockup = readdirSync(MOCKUPS).filter((f) => f.endsWith(".dc.html")).map((planche) => readFileSync(join(MOCKUPS, planche), "utf8").toLowerCase()).join("\n");
  // Les jetons que les planches n'écrivent pas : un jeton de l'ancienne maquette qu'elles n'ont pas repris (#2909), et l'accent hors projet, un blanc cassé que la maquette ne dessine pas (#3780).
  const OUTSIDE_MOCKUP = new Set(["--attend-trait-doux", "--accent"]);

  test("chaque couleur de tokens.css est une couleur que la maquette écrit — aucune n'est inventée", () => {
    for (const [name, value] of colors) if (!OUTSIDE_MOCKUP.has(name)) assert.ok(new RegExp(`${value}\\b`).test(mockup), `${name}: ${value} n'est dans aucune planche de la maquette`);
  });

  test("les rôles sont les siens : le fond, la barre, la carte, le trait, le texte, l'accent, les quatre états", () => {
    // Relus dans les planches, là où elles les posent.
    // L'accent hors projet (#3780) est un blanc cassé que la maquette n'écrit pas : l'orange y était celui des projets.
    assert.match(mockup, /body\{margin:0;background:#121418\}/);
    assert.match(mockup, /color: #ece9e3; font-family: archivo, system-ui, sans-serif/);
    assert.match(mockup, /background: #f3efe6; color: #1b1c1e; border-radius: 4px;/);
    const roles = { "--fond": "#121418", "--carte": "#1a1d22", "--trait": "#2e333b", "--barre": "#0e1013", "--trait-doux": "#23272d", "--texte": "#ece9e3", "--vert": "#6cc28a", "--jaune": "#e9c46a", "--rouge": "#ee6b5b", "--accent": "#ece6dc", "--bleu": "#7fb2f0", "--bon": "#f3efe6", "--bon-encre": "#1b1c1e" };
    for (const [name, value] of Object.entries(roles)) assert.equal(tokens.get(name), value, name);
    assert.equal(tokens.get("--rayon-carte"), "10px");
    assert.equal(tokens.get("--rayon-bon"), "4px");
  });
});

describe("les polices : Archivo pour l'interface, JetBrains Mono pour ce qui se recopie", () => {
  const css = withoutComments(read("tokens.css"));
  const faces = rules(css).filter(({ selecteurs: selectors }) => selectors[0] === "@font-face");

  test("elles sont embarquées : chaque police déclarée est un fichier de l'app, à côté de sa licence", () => {
    assert.deepEqual([...new Set(faces.map(({ declarations }) => declarations.get("font-family")))], ['"Archivo"', '"JetBrains Mono"']);
    for (const { declarations } of faces) {
      const [, path] = /^url\("(fonts\/[a-z-]+\.woff2)"\) format\("woff2"\)$/.exec(declarations.get("src") ?? "") ?? [];
      assert.ok(path !== undefined, `une police ne vient pas de fonts/ : ${declarations.get("src")}`);
      // Un vrai fichier de police, pas un renvoi.
      assert.equal(readFileSync(join(VUE, path)).subarray(0, 4).toString("latin1"), "wOF2", path);
    }
    for (const licence of ["OFL-Archivo.txt", "OFL-JetBrainsMono.txt"]) assert.match(readFileSync(join(VUE, "fonts", licence), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/, licence);
  });

  test("rien n'est demandé au réseau : ni adresse dans la vue, ni origine ouverte par la page", () => {
    for (const file of files.filter((named) => /\.(css|html)$/.test(named))) {
      const text = file.endsWith(".css") ? withoutComments(read(file)) : read(file);
      assert.doesNotMatch(text, /https?:|@import|(?:href|src)="\/\//, `${file} nomme une adresse`);
      for (const [, target = ""] of text.matchAll(/url\(\s*["']?([^"')]*)/g)) assert.match(target, /^fonts\//, `${file} : url(${target})`);
    }
    const html = read("index.html");
    // Ce que la page charge est à côté d'elle, ou dans les dépendances de l'app.
    for (const [, target = ""] of html.matchAll(/(?:href|src)="([^"]+)"/g)) assert.ok(existsSync(join(VUE, target)), `index.html charge « ${target} », qui n'est pas dans l'app`);
    const [, politique = ""] = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) ?? [];
    // Une image ne vient que du process principal, en `data:`. Aucune demande
    // ne part de la page : l'onglet Agents passe par le pont (ticket 4569).
    assert.deepEqual(politique.split("; "), ["default-src 'none'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src data:"]);
    // Et le module de la vue ne va rien chercher lui-même.
    assert.doesNotMatch(read("vue.js"), /\bfetch\(|XMLHttpRequest|WebSocket|EventSource|new FontFace|import\(\s*["'`]https?:/);
  });

  test("l'interface est en Archivo, et vue.css ne nomme aucune autre police que les deux", () => {
    assert.match(tokens.get("--police-interface") ?? "", /^"Archivo", /);
    assert.match(tokens.get("--police-mono") ?? "", /^"JetBrains Mono", /);
    const sheet = rules(read("vue.css"));
    assert.equal(sheet.find(({ selecteurs: selectors }) => selectors.join() === "body")?.declarations.get("font-family"), "var(--police-interface)");
    for (const { selecteurs: selectors, declarations } of sheet) {
      const police = declarations.get("font-family");
      assert.ok(police === undefined || /^var\(--police-(interface|mono)\)$/.test(police), `${selectors.join(", ")} { font-family: ${police} }`);
      // Le raccourci `font` remettrait la police à celle du système : il ne sert qu'à hériter.
      assert.ok([undefined, "inherit"].includes(declarations.get("font")), `${selectors.join(", ")} { font: ${declarations.get("font")} }`);
    }
  });

  test("le monospace tient à une règle : `.mono`, `pre`, `code`, et ce qui se saisit pour être recopié", () => {
    const mono = rules(read("vue.css")).filter(({ declarations }) => declarations.get("font-family") === "var(--police-mono)");
    assert.deepEqual(
      mono.map(({ selecteurs: selectors }) => selectors),
      [[".mono", "pre", "code", "#projets button", ".carte dd", "#rail h4 > span:last-child", ".ajout-d-un-projet .depot button"]],
    );
    // Le bon porte la sienne, dans sa feuille : `.bon p`, les phrases d'un ticket que la box écrit.
    assert.deepEqual(rules(read("components/slip/slip.css")).filter(({ declarations }) => declarations.get("font-family") === "var(--police-mono)").map(({ selecteurs: selectors }) => selectors), [[".bon p"]]);
    // Ce que l'app dit elle-même sur plusieurs lignes revient à la police de l'interface.
    const propos = rules(read("vue.css")).find(({ selecteurs: selectors }) => selectors.includes("pre.propos"));
    assert.equal(propos?.declarations.get("font-family"), "var(--police-interface)");
  });
});

// Ce que la box rend, avec tout ce qu'une peau pourrait abîmer : une ligne vide puis des blancs
// en tête, des blancs en fin et au milieu d'une ligne, une tabulation, des lignes vides, une ligne
// trop longue pour tenir, ce qui ressemble à du HTML, des caractères hors du latin, une séquence
// de couleur de terminal — et, pour finir, deux espaces puis deux sauts de ligne.
const RELAYS = [
  "",
  "  rail  3 tickets — 1 pris, 2 en attente",
  "  #12   pris        depuis 2 h 04   box/claude-opus",
  "\tune tabulation, puis    quatre espaces, puis deux en fin de ligne  ",
  "",
  "",
  `une ligne trop longue ${"x".repeat(900)} jusqu'au bout`,
  "<b>pas du HTML</b> &amp; `des accents` — « é à ç œ » → ✓ ▸ │ 日本",
  "\u001b[32mune couleur de terminal, telle quelle\u001b[0m",
  "   une dernière ligne, puis deux espaces et deux sauts de ligne  ",
  "",
  "",
].join("\n");
const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };

const texts = (elements: Fake[]) => elements.map((element) => element.textContent);
const entry = (vue: Awaited<ReturnType<typeof playTheVue>>, rank: number): Fake => vue.element("projets").children.at(rank) ?? assert.fail(`pas d'entrée ${rank} dans la barre`);


describe("le texte relayé de la box s'affiche à l'identique, sans troncature ni reformatage", () => {


  test("aucune règle de la peau ne coupe, ne cache ni ne récrit un `pre` : ses blancs et ses lignes sont gardés", () => {
    const sheet = rules(read("vue.css"));
    const ofAPre = (selector: string) => /(^|[\s>(])pre\b/.test(selector) || selector === "#message";
    const base = sheet.find(({ selecteurs: selectors }) => selectors.includes("pre") && selectors.length === 1);
    assert.equal(base?.declarations.get("white-space"), "pre-wrap");

    const INTERDITES = ["text-overflow", "text-transform", "line-clamp", "-webkit-line-clamp", "hyphens", "visibility", "display", "word-break", "text-indent", "word-spacing", "letter-spacing", "font-variant", "direction", "content", "height", "width", "max-width", "opacity", "clip-path"];
    let seenOnes = 0;
    for (const { selecteurs: selectors, declarations } of sheet) {
      if (!selectors.some(ofAPre)) continue;
      seenOnes++;
      const said = selectors.join(", ");
      for (const property of INTERDITES) assert.equal(declarations.get(property), undefined, `${said} { ${property} }`);
      assert.ok([undefined, "pre-wrap"].includes(declarations.get("white-space")), `${said} { white-space: ${declarations.get("white-space")} }`);
      // Un `pre` borné en hauteur défile : rien n'y est caché.
      assert.ok([undefined, "auto"].includes(declarations.get("overflow")), `${said} { overflow: ${declarations.get("overflow")} }`);
      if (declarations.has("max-height")) assert.equal(declarations.get("overflow"), "auto", said);
      assert.notEqual(declarations.get("font-size"), "0", said);
    }
    assert.ok(seenOnes >= 7, `${seenOnes} règles seulement portent sur un \`pre\``);

    // Rien ne se coupe dans toute la peau : pas même le titre d'un ticket, sur la ligne d'un cook — ni le sigle d'un
    // projet dans sa case de la barre (#1983), qui y tient entier.
    const cut = sheet.filter(({ declarations }) => declarations.has("text-overflow") || declarations.get("overflow") === "hidden" || declarations.has("-webkit-line-clamp") || declarations.has("text-transform"));
    assert.deepEqual(cut.map(({ selecteurs: selectors }) => selectors), []);
  });

});


describe("la fenêtre se réduit sans que rien ne se casse", () => {
  const sheet = rules(read("vue.css"));
  const rule = (selector: string) => sheet.find(({ selecteurs: selectors }) => selectors.length === 1 && selectors[0] === selector)?.declarations ?? assert.fail(`pas de règle « ${selector} »`);

  test("la fenêtre a un plancher, qui est la moitié de sa largeur d'ouverture", () => {
    const main = readFileSync(join(ROOT, "app/src/main.ts"), "utf8");
    const opening = Number(/width: (\d+),/.exec(main)?.[1]);
    const floor = Number(/minWidth: (\d+),/.exec(main)?.[1]);
    assert.ok(opening > 0 && floor > 0, "ni largeur d'ouverture ni plancher");
    assert.equal(floor, opening / 2);
  });

  test("à cette largeur, ce qui ne tient pas défile ou passe à la ligne : rien ne déborde sans accès", () => {
    // Les onglets et les colonnes du rail défilent ; la colonne centrale peut se rétrécir.
    assert.equal(rule("#terminaux").get("overflow-x"), "auto");
    assert.equal(rule("#terminaux").get("min-width"), "0");
    assert.equal(rule("#rail .colonnes").get("overflow-x"), "auto");
    assert.equal(rule("main").get("min-width"), "0");
    // Le nom du projet, en entier, passe à la ligne plutôt que de pousser les onglets.
    assert.equal(rule("#espace").get("flex-shrink"), undefined);
    assert.equal(rule("#espace").get("white-space"), undefined);
    assert.equal(rule("#espace").get("overflow-wrap"), "anywhere");
    // Le bandeau du fichier est dans le flux : il ne recouvre pas le bas d'un écran qui défile.
    assert.notEqual(rule("#relecture").get("position"), "fixed");
    // Ce qui est posé par-dessus reste dans la fenêtre et défile s'il est long.
    assert.equal(rule("#avis").get("overflow-y"), "auto");
    for (const selector of ["#tous", "#ajout", "#rail", "#contenu"]) assert.equal(rule(selector).get("overflow-y"), "auto", selector);
    // Aucune largeur ou hauteur fixe ne dépasse le plancher.
    for (const { selecteurs: selectors, declarations } of sheet) {
      for (const property of ["width", "min-width", "max-width"]) {
        const px = /^(\d+)px$/.exec(declarations.get(property) ?? "")?.[1];
        if (px !== undefined) assert.ok(Number(px) <= 640, `${selectors.join(", ")} { ${property}: ${px}px }`);
      }
    }
  });
});


describe("rien de ce qui est au parking n'apparaît", () => {
  // Ce que l'ancienne maquette dessinait sans qu'on le construise ; les planches du 2026-11-08 (#2907)
  // ne le dessinent plus. Les cook profiles et le carnet en sont sortis avec l'épique #1033, qui les construit ; Codex, avec
  // l'épique #3518 (#3746, #3747), qui en fait un moteur d'une station et dit sur la fiche d'une livraison son moteur.
  const PARKING = /openweight|preprod|mac\/chrome|chrome-connect|revue-humaine|accès-prod|depuis ton mac|toutes les brigades|expire dans|<progress|<meter|progressbar|jauge|\bcommis\b|thème clair|prefers-color-scheme|light-dark\(/i;


  test("un seul thème, sombre : ni thème clair, ni réglage de thème", () => {
    // Les seules requêtes admises sont la largeur de la page étroite (#1186), qui change la mise en page, et « reduce
    // motion », qui fige la poêle (#2984) : ni l'une ni l'autre ne change le thème.
    const withoutThePageNarrow = (text: string) => text.replaceAll(/@media \(max-width: \d+px\)/g, "").replaceAll("@media (prefers-reduced-motion: reduce)", "").replaceAll("window.matchMedia?.(SCREEN_NARROW)", "");
    for (const file of files) assert.doesNotMatch(withoutThePageNarrow(read(file)), /@media|color-scheme:(?!\s*dark;)|data-theme|matchMedia|prefers-color-scheme/, file);
  });

  test("la page étroite (#1186) a un seul seuil, le même dans la vue et dans sa peau", () => {
    const threshold = /^const SCREEN_NARROW = "(\(max-width: \d+px\))";$/m.exec(read("vue.js"))?.[1];
    assert.ok(threshold !== undefined, "vue.js nomme le seuil de la page étroite");
    assert.deepEqual([...read("vue.css").matchAll(/@media ([^{]*?)\s*\{/g)].map(([, request]) => request), [threshold]);
  });
});

describe("le cadre est fait de cartes, sur fond sombre", () => {
  test("une seule règle fait la carte, et tout ce qui se lit d'un bloc la porte : les groupes de Settings, « Tous les projets », l'ajout, le choix de la cuisine", () => {
    const sheet = rules(read("vue.css"));
    const card = sheet.find(({ declarations }) => declarations.get("background") === "var(--carte)" && declarations.get("border-radius") === "var(--rayon-carte)" && declarations.get("position") === undefined);
    // Les trois groupes de Settings (#1700) sont des cartes ; leurs réglages, des lignes dedans.
    assert.deepEqual(card?.selecteurs, [".carte", "#etat > .groupe", "#tous .liste", "#stations-du-projet .confiance"]);
    assert.equal(card?.declarations.get("border"), "1px solid var(--trait)");
    assert.equal(sheet.find(({ selecteurs: selectors }) => selectors.join() === "body")?.declarations.get("background"), "var(--fond)");
    // Les colonnes du rail, les bons, le bloc de ce qui attend, la sortie relayée : chacun son cadre.
    for (const [selector, background] of [["#rail .colonne", "var(--bandeau)"], [".bon", "var(--bon)"], [".attend", "var(--attend)"], ["pre", "var(--terminal)"]] as const) {
      const rule = (selector === ".bon" ? rules(read("components/slip/slip.css")) : sheet).find(({ selecteurs: selectors }) => selectors.length === 1 && selectors[0] === selector);
      assert.equal(rule?.declarations.get("background"), background, selector);
      assert.match(rule?.declarations.get("border-radius") ?? "", /^var\(--rayon-(carte|bouton|bon)\)$/, selector);
    }
  });

  test("chaque sélecteur de la peau vise un élément que la page ou la vue pose", () => {
    const html = read("index.html");
    // La vue, ses briques, et les blocs de ses onglets (cost/…) : tout module de la vue qui pose un élément.
    const source = files.filter((file) => file.endsWith(".js")).map(read).join("\n");
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g), ...source.matchAll(/\.id = "([^"]+)"/g)].map(([, id = ""]) => id));
    const classes = new Set([...html.matchAll(/\bclass="([^"]+)"/g), ...source.matchAll(/className = "([^"]+)"/g), ...source.matchAll(/className: "([^"]+)"/g), ...source.matchAll(/\bnode\(\w+, "\w+", "([^"]+)"/g), ...source.matchAll(/classList\.toggle\("([^"]+)"/g)].flatMap(([, names = ""]) => names.split(" ")));
    for (const { selecteurs: selectors } of rules(read("vue.css"))) {
      for (const selector of selectors) {
        for (const [, id = ""] of selector.matchAll(/#([a-z-]+)/g)) assert.ok(ids.has(id), `${selector} : aucun élément « #${id} »`);
        for (const [, classe = ""] of selector.matchAll(/\.([a-z-]+)/g)) assert.ok(classes.has(classe), `${selector} : aucune classe « .${classe} »`);
      }
    }
  });
});

// Les états se lisent sans lire : une forme et une couleur par état, selon la maquette — la
// pastille, la pilule, le point. Chaque forme se lit sans la couleur (niveaux de gris), et le
// libellé de chaque état reste dans le DOM. Rien n'est demandé au runtime : tout vient de ce que
// la box dit déjà (faits). La vue est jouée devant un faux document.
const PILL = withoutComments(read("components/pill/pill.css"));

// Les règles de la feuille qui portent ce sélecteur, déclarations comprises.
const declarationsOf = (selector: string, sheet: string): Map<string, string> => {
  const found = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, head = ""]) => head.split(",").map((s) => s.trim().replace(/\s+/g, " ")).includes(selector));
  assert.ok(found.length > 0, `aucune règle pour ${selector}`);
  return new Map(found.flatMap(([, , body = ""]) => body.split(";").map((d) => d.trim()).filter(Boolean).map((d): [string, string] => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()])));
};
// La silhouette qu'une règle donne à la forme d'une pastille : rond, losange, carré, anneau, triangle.
const silhouette = (declarations: Map<string, string>) => `${declarations.get("border-radius") ?? ""}|${declarations.get("transform") ?? ""}|${declarations.get("clip-path") ?? ""}|${declarations.get("background") ?? ""}`;

describe("la cuisine : une pastille à forme, et son libellé", () => {
});

describe("un ticket qui t'attend", () => {
});

describe("la forme se lit sans la couleur", () => {
  test("chaque forme de pastille a sa règle, et aucune n'en copie une autre", () => {
    const shapes = ["losange", "carre", "anneau", "triangle", "pause"].map((shape) => silhouette(declarationsOf(`.pastille[data-forme="${shape}"]`, PILL)));
    // Le disque est la pastille nue : cercle plein.
    shapes.push(silhouette(declarationsOf(".pastille", PILL)));
    assert.equal(new Set(shapes).size, 6, shapes.join(" ; "));
  });

  test("la vue ne pose une forme que d'un ton de la liste fermée, et ne la déduit de rien d'autre", () => {
    const source = readFileSync(join(VUE, "components/pill/pill.js"), "utf8");
    assert.match(source, /SHAPES = \{ vert: "disque", jaune: "losange", rouge: "carre", bleu: "triangle", gris: "anneau", orange: "pause" \}/);
  });
});
