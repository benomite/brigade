// La peau de l'app : une palette tenue en un seul endroit et qui est celle de la maquette, deux
// polices embarquées — Archivo pour l'interface, JetBrains Mono pour ce qui se recopie et ce que
// la box a rendu —, des cartes sur fond sombre. Et ce qu'elle ne touche jamais : le texte relayé
// de la box, posé mot pour mot dans le second, les cinq onglets, « Tous les projets » et l'écran d'ajout.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts) : ni
// Electron, ni navigateur. Ce qui se peint ne s'y voit pas — les règles de vue.css sont lues à part.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import type { Montree } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, type Dessinable } from "../src/faits.ts";
import { entete } from "../src/fiche.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS, type Vu as VuDesGrants } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER, type Vu as VuDuManager } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Pages } from "../src/page.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, jetonsDe, jouerLaVue, type Reponses, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const RACINE = join(import.meta.dirname, "../..");
const VUE = join(RACINE, "app/src/vue");
const MAQUETTES = join(RACINE, "docs/maquettes/app");
const lire = (fichier: string) => readFileSync(join(VUE, fichier), "utf8");
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// Les fichiers de la vue qui se lisent — tout sauf les polices, qui sont des binaires, et leurs licences.
const fichiers = (readdirSync(VUE, { recursive: true }) as string[]).filter((fichier) => /\.(css|js|html|ts)$/.test(fichier)).sort();

// Une feuille de style, règle par règle : ses sélecteurs, ses déclarations. Les feuilles de la
// vue n'ont ni règle imbriquée ni `@media` : une accolade ouvre une règle, la suivante la ferme.
type Regle = { selecteurs: string[]; declarations: Map<string, string> };
function regles(css: string): Regle[] {
  return [...sansCommentaires(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, tete = "", corps = ""]) => ({
    selecteurs: tete.split(",").map((selecteur) => selecteur.trim().replace(/\s+/g, " ")),
    declarations: new Map(
      corps
        .split(";")
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .map((declaration) => [declaration.slice(0, declaration.indexOf(":")).trim(), declaration.slice(declaration.indexOf(":") + 1).trim()]),
    ),
  }));
}

// Une couleur écrite en dur : en hexadécimal, ou par une fonction de couleur.
const COULEUR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/gi;
// Les mots qu'une propriété de couleur accepte ici : aucun n'est un nom de couleur.
const MOTS_SANS_COULEUR = new Set(["none", "transparent", "currentcolor", "inherit", "solid", "dashed", "dotted", "var"]);
const PORTE_UNE_COULEUR = /^(color|background|background-color|border|border-(top|right|bottom|left)|border-(top-|right-|bottom-|left-)?color|outline|outline-color|box-shadow|accent-color|text-decoration-color|caret-color|fill|stroke)$/;

const jetons = jetonsDe(lire("jetons.css"));
const couleurs = new Map([...jetons].filter(([, valeur]) => valeur.startsWith("#")));

describe("la palette : un seul jeu de variables, écrit à un seul endroit", () => {
  test("jetons.css est le seul fichier de la vue où une couleur s'écrit", () => {
    assert.ok(fichiers.includes("jetons.css") && fichiers.includes("vue.css") && fichiers.includes("vue.js") && fichiers.includes("index.html"), fichiers.join(", "));
    for (const fichier of fichiers.filter((nomme) => nomme !== "jetons.css")) {
      const texte = fichier.endsWith(".css") ? sansCommentaires(lire(fichier)) : lire(fichier);
      assert.deepEqual(texte.match(COULEUR) ?? [], [], `${fichier} écrit une couleur en dur`);
    }
    assert.doesNotMatch(lire("index.html"), /\bstyle=|<style\b/, "index.html porte un style à lui");
  });

  test("dans vue.css, une propriété de couleur ne nomme qu'une variable — jamais un nom de couleur", () => {
    for (const { selecteurs, declarations } of regles(lire("vue.css"))) {
      for (const [propriete, valeur] of declarations) {
        if (!PORTE_UNE_COULEUR.test(propriete)) continue;
        // Ce qui reste d'une valeur une fois ôtés ses variables et ses longueurs : des mots.
        const mots = valeur.replace(/var\(--[a-z-]+\)/g, " ").match(/[a-z][a-z-]*/gi) ?? [];
        const noms = mots.filter((mot) => !MOTS_SANS_COULEUR.has(mot.toLowerCase()) && !/^(px|em|%)$/.test(mot));
        assert.deepEqual(noms, [], `${selecteurs.join(", ")} { ${propriete}: ${valeur} }`);
      }
    }
  });

  test("chaque variable que la vue nomme est posée dans jetons.css — ou, pour le ton d'un état, d'après elles", () => {
    const css = sansCommentaires(lire("vue.css"));
    // `--ton` : la couleur d'un mot d'état, posée par vue.css d'après le nom que faits.ts lui donne.
    const locales = new Map([...css.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)].map(([, nom = "", valeur = ""]) => [nom, valeur.trim()]));
    assert.deepEqual([...new Set(locales.keys())], ["--ton"]);
    for (const [, valeur] of css.matchAll(/--ton\s*:\s*([^;]+);/g)) assert.match(valeur ?? "", /^var\(--(vert|jaune|rouge|bleu|gris)\)$/);

    const nommees = [...css.matchAll(/var\((--[a-z-]+)\)/g), ...lire("vue.js").matchAll(/jeton\("(--[a-z-]+)"\)/g)].map(([, nom = ""]) => nom);
    assert.ok(nommees.length > 100, "vue.css ne nomme presque aucune variable");
    for (const nom of new Set(nommees)) assert.ok(jetons.has(nom) || nom === "--ton", `« ${nom} » n'est pas dans jetons.css`);
    // Et aucune n'y dort : ce qui est posé sert.
    for (const nom of jetons.keys()) assert.ok(nommees.includes(nom), `« ${nom} » est dans jetons.css, et rien ne la nomme`);
  });

  test("jetons.css ne pose une couleur qu'une fois, sur la racine, et rien d'autre ne s'y peint", () => {
    const css = sansCommentaires(lire("jetons.css"));
    assert.deepEqual(regles(css).flatMap(({ selecteurs }) => selecteurs), ["@font-face", "@font-face", "@font-face", ":root"]);
    const posees = [...css.matchAll(/(--[a-z-]+)\s*:/g)].map(([, nom = ""]) => nom);
    assert.deepEqual(posees, [...new Set(posees)], "une variable est posée deux fois");
    assert.ok(couleurs.size >= 20, `${couleurs.size} couleurs`);
    assert.equal(jetons.get("color-scheme"), undefined);
    assert.match(css, /color-scheme:\s*dark;/, "le thème est sombre, et lui seul");
  });

  test("le fond de la fenêtre, avant que la vue ne se peigne, est celui de la peau", () => {
    const fond = /backgroundColor: "(#[0-9a-f]{6})"/.exec(readFileSync(join(RACINE, "app/src/main.ts"), "utf8"))?.[1];
    assert.equal(fond, jetons.get("--fond"));
  });

  test("le terminal lit ses couleurs et sa police dans les jetons", async () => {
    const vue = await ouvrirUnEspace();
    const [xterm] = vue.xterms;
    assert.deepEqual(xterm?.options.theme, { background: jetons.get("--terminal"), foreground: jetons.get("--texte-terminal"), cursor: jetons.get("--texte") });
    assert.equal(xterm?.options.fontFamily, jetons.get("--police-mono"));
    // Sa police est chargée avant qu'il ne s'ouvre : il mesure ses cases à l'ouverture.
    assert.deepEqual(vue.polices, [`13px ${jetons.get("--police-mono")}`, `bold 13px ${jetons.get("--police-mono")}`]);
  });
});

describe("la palette est celle de la maquette", () => {
  // Les trois écrans qui font foi : `Commis.dc.html` est au parking (docs/maquettes/app/README.md).
  const maquette = ["Main.dc.html", "Espace.dc.html", "Brigade.dc.html"].map((ecran) => readFileSync(join(MAQUETTES, ecran), "utf8").toLowerCase()).join("\n");

  test("chaque couleur de jetons.css est une couleur que la maquette écrit — aucune n'est inventée", () => {
    for (const [nom, valeur] of couleurs) assert.ok(new RegExp(`${valeur}\\b`).test(maquette), `${nom}: ${valeur} n'est dans aucun des trois écrans de la maquette`);
  });

  test("les rôles sont les siens : le fond, la barre, la carte, le trait, le texte, l'accent, les quatre états", () => {
    // Relus dans la maquette, là où elle les pose.
    assert.match(maquette, /body\{margin:0;background:#121418\}/);
    assert.match(maquette, /\.card\{background:#1a1d22;border:1px solid #2e333b;border-radius:10px\}/);
    assert.match(maquette, /<nav aria-label="espaces" style="[^"]*background: #0e1013; border-right: 1px solid #23272d;/);
    assert.match(maquette, /color: #ece9e3; font-family: 'archivo', system-ui, sans-serif;/);
    assert.match(maquette, /const ok = '#6cc28a', warn = '#e9c46a', bad = '#ee6b5b', acc = '#f2994a', blue = '#7fb2f0'/);
    assert.match(maquette, /\.ticket\{background:#f3efe6;color:#1b1c1e;border-radius:4px;/);
    const roles = { "--fond": "#121418", "--carte": "#1a1d22", "--trait": "#2e333b", "--barre": "#0e1013", "--trait-doux": "#23272d", "--texte": "#ece9e3", "--vert": "#6cc28a", "--jaune": "#e9c46a", "--rouge": "#ee6b5b", "--accent": "#f2994a", "--bleu": "#7fb2f0", "--bon": "#f3efe6", "--bon-encre": "#1b1c1e" };
    for (const [nom, valeur] of Object.entries(roles)) assert.equal(jetons.get(nom), valeur, nom);
    assert.equal(jetons.get("--rayon-carte"), "10px");
    assert.equal(jetons.get("--rayon-bon"), "4px");
  });
});

describe("les polices : Archivo pour l'interface, JetBrains Mono pour ce qui se recopie", () => {
  const css = sansCommentaires(lire("jetons.css"));
  const faces = regles(css).filter(({ selecteurs }) => selecteurs[0] === "@font-face");

  test("elles sont embarquées : chaque police déclarée est un fichier de l'app, à côté de sa licence", () => {
    assert.deepEqual([...new Set(faces.map(({ declarations }) => declarations.get("font-family")))], ['"Archivo"', '"JetBrains Mono"']);
    for (const { declarations } of faces) {
      const [, chemin] = /^url\("(polices\/[a-z-]+\.woff2)"\) format\("woff2"\)$/.exec(declarations.get("src") ?? "") ?? [];
      assert.ok(chemin !== undefined, `une police ne vient pas de polices/ : ${declarations.get("src")}`);
      // Un vrai fichier de police, pas un renvoi.
      assert.equal(readFileSync(join(VUE, chemin)).subarray(0, 4).toString("latin1"), "wOF2", chemin);
    }
    for (const licence of ["OFL-Archivo.txt", "OFL-JetBrainsMono.txt"]) assert.match(readFileSync(join(VUE, "polices", licence), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/, licence);
  });

  test("rien n'est demandé au réseau : ni adresse dans la vue, ni origine ouverte par la page", () => {
    for (const fichier of fichiers.filter((nomme) => /\.(css|html)$/.test(nomme))) {
      const texte = fichier.endsWith(".css") ? sansCommentaires(lire(fichier)) : lire(fichier);
      assert.doesNotMatch(texte, /https?:|@import|(?:href|src)="\/\//, `${fichier} nomme une adresse`);
      for (const [, cible = ""] of texte.matchAll(/url\(\s*["']?([^"')]*)/g)) assert.match(cible, /^polices\//, `${fichier} : url(${cible})`);
    }
    const html = lire("index.html");
    // Ce que la page charge est à côté d'elle, ou dans les dépendances de l'app.
    for (const [, cible = ""] of html.matchAll(/(?:href|src)="([^"]+)"/g)) assert.ok(existsSync(join(VUE, cible)), `index.html charge « ${cible} », qui n'est pas dans l'app`);
    const [, politique = ""] = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) ?? [];
    // Une image ne vient que du process principal, en `data:` : les captures d'une livraison (captures.ts).
    assert.deepEqual(politique.split("; "), ["default-src 'none'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src data:"]);
    // Et le module de la vue ne va rien chercher lui-même.
    assert.doesNotMatch(lire("vue.js"), /\bfetch\(|XMLHttpRequest|WebSocket|EventSource|new FontFace|import\(\s*["'`]https?:/);
  });

  test("l'interface est en Archivo, et vue.css ne nomme aucune autre police que les deux", () => {
    assert.match(jetons.get("--police-interface") ?? "", /^"Archivo", /);
    assert.match(jetons.get("--police-mono") ?? "", /^"JetBrains Mono", /);
    const feuille = regles(lire("vue.css"));
    assert.equal(feuille.find(({ selecteurs }) => selecteurs.join() === "body")?.declarations.get("font-family"), "var(--police-interface)");
    for (const { selecteurs, declarations } of feuille) {
      const police = declarations.get("font-family");
      assert.ok(police === undefined || /^var\(--police-(interface|mono)\)$/.test(police), `${selecteurs.join(", ")} { font-family: ${police} }`);
      // Le raccourci `font` remettrait la police à celle du système : il ne sert qu'à hériter.
      assert.ok([undefined, "inherit"].includes(declarations.get("font")), `${selecteurs.join(", ")} { font: ${declarations.get("font")} }`);
    }
  });

  test("le monospace tient à une règle : `.mono`, `pre`, `code`, et ce qui se saisit pour être recopié", () => {
    const mono = regles(lire("vue.css")).filter(({ declarations }) => declarations.get("font-family") === "var(--police-mono)");
    assert.deepEqual(
      mono.map(({ selecteurs }) => selecteurs),
      [[".mono", "pre", "code", "#projets button", "#formulaire input", "#formulaire select", "#choisi", '#retrait input:not([type="checkbox"])', ".carte dd", "#rail h4 span:last-child", "#rail .bon p"]],
    );
    // Ce que l'app dit elle-même sur plusieurs lignes revient à la police de l'interface.
    const propos = regles(lire("vue.css")).find(({ selecteurs }) => selecteurs.includes("pre.propos"));
    assert.equal(propos?.declarations.get("font-family"), "var(--police-interface)");
  });
});

// Ce que la box rend, avec tout ce qu'une peau pourrait abîmer : une ligne vide puis des blancs
// en tête, des blancs en fin et au milieu d'une ligne, une tabulation, des lignes vides, une ligne
// trop longue pour tenir, ce qui ressemble à du HTML, des caractères hors du latin, une séquence
// de couleur de terminal — et, pour finir, deux espaces puis deux sauts de ligne.
const RELAYE = [
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
const BLOC = "attend     1 décision attend le chef — depuis 2 j\n  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main :   gh pr merge 31\nfin attend";
const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS, rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const REPONSES: Reponses & Required<Pick<Reponses, "demarrage">> = {
  demarrage,
  espace: () => [SECOND],
};

// Les `pre` posés sous un élément : ce que la box a rendu, et — à part — ce que l'app en dit.
const relayes = (ou: Faux) => ou.dessous("pre").filter((pre) => pre.className === "");
const textes = (elements: Faux[]) => elements.map((element) => element.textContent);
const entree = (vue: Awaited<ReturnType<typeof jouerLaVue>>, rang: number): Faux => vue.element("projets").children.at(rang) ?? assert.fail(`pas d'entrée ${rang} dans la barre`);

// L'espace de « parade », ouvert par sa case de la barre : « T », puis elle, puis « + ».
async function ouvrirUnEspace(reponses: Reponses = {}) {
  const vue = await jouerLaVue({ ...REPONSES, ...reponses });
  entree(vue, 1).click();
  await repos();
  assert.equal(vue.element("espace").textContent, PARADE);
  return vue;
}

describe("le texte relayé de la box s'affiche à l'identique, sans troncature ni reformatage", () => {
  test("« Tous les projets » ne relaie rien : ce que la box rend se lit dans l'espace du projet (ci-dessous), mot pour mot", async () => {
    const vue = await jouerLaVue(REPONSES);
    const lecture: Montree = { projet: PARADE, demande: vue.dernier("tous")[0] as number, a: A, attend: BLOC, sorties: [{ commande: "status", texte: RELAYE }] };
    vue.dire("surLecture", lecture, { projet: PARADE, pages: [], aLancer: [], illisibles: [], empeche: [] });
    assert.deepEqual(vue.element("tous").dessous("pre"), []);
    assert.doesNotMatch(vue.element("tous").textContent, /rail {2}3 tickets|attend {5}1 décision/);
  });

  test("dans le second, à droite : ce que le terminal reçoit est ce que le pty a écrit, tel quel", async () => {
    const vue = await ouvrirUnEspace();
    vue.dire("surSortie", SECOND.id, RELAYE);
    vue.dire("surSortie", SECOND.id, "\r\n");

    assert.deepEqual(vue.xterms.map(({ ecrits }) => ecrits), [[RELAYE, "\r\n"]]);
  });

  test("dans les onglets Rail, Cooks, Manager, Grants, Reliability, Closer et Log : la sortie de leur commande, mot pour mot", async () => {
    const vue = await ouvrirUnEspace();
    assert.deepEqual(ONGLETS.map(({ titre }) => titre), ["Rail", "Cooks", "Manager", "Grants", "Reliability", "Closer", "Log"]);

    for (const { id, titre, commande } of ONGLETS) {
      await ouvrirLecture(vue, titre);
      const [projet, demande, numero] = vue.dernier("onglet") as [string, string, number];
      assert.deepEqual([projet, demande], [PARADE, id]);
      // Chaque onglet a sa sortie : la même, avec son nom en tête — rien ne reste de l'onglet d'avant.
      const texte = `${titre}\n${RELAYE}`;
      const lecture: Lecture = { projet: PARADE, demande: numero, a: A, sorties: [{ commande, texte }] };
      vue.dire("surContenu", lecture, undefined, undefined);

      assert.equal(vue.element("contenu").hidden, false, titre);
      assert.deepEqual(textes(relayes(vue.element("lecture-onglet"))), [texte], titre);
    }
  });

  test("dans le panneau de l'espace, sous chaque onglet : `status`, et ce que `ssh` a rendu quand la box n'est pas jointe", async () => {
    const vue = await ouvrirUnEspace();
    const demande = vue.dernier("regarder")[1] as number;
    const pages: Pages = { projet: PARADE, pages: [], aLancer: [], illisibles: ["  serveur illisible   tel quel  "], empeche: [], vide: "aucun serveur" };
    vue.dire("surLecture", { projet: PARADE, demande, a: A, attend: BLOC, sorties: [{ commande: "status", texte: RELAYE }] }, pages);
    assert.deepEqual(textes(relayes(vue.element("lecture"))), [BLOC, RELAYE]);
    // Une ligne de `status` que l'app n'a pas su lire reste entière, elle aussi.
    assert.deepEqual(textes(relayes(vue.element("pages"))), ["  serveur illisible   tel quel  "]);

    // Ce que `ssh` a rendu, puis le code : des blancs en tête et en fin, là aussi.
    const erreur = `${RELAYE}→ code de sortie 255\n  `;
    vue.dire("surLecture", { projet: PARADE, demande, a: A, erreur, atteinte: false, cas: "ssh-en-echec" }, pages);
    // Rien de technique n'est écrit à plat : une ligne, et ce que `ssh` a rendu — mot pour mot — au survol,
    // suivi de ce que l'app en dit.
    assert.equal(vue.element("lecture").dessous("pre").length, 0);
    assert.equal(vue.element("lecture").dessous("p").find((pose) => pose.className === "indisponible")?.textContent, "the station could not be reached?");
    assert.ok(vue.element("lecture").dessous("button").some((pose) => pose.ariaLabel.startsWith(erreur)));
  });

  test("aucune règle de la peau ne coupe, ne cache ni ne récrit un `pre` : ses blancs et ses lignes sont gardés", () => {
    const feuille = regles(lire("vue.css"));
    const dUnPre = (selecteur: string) => /(^|[\s>(])pre\b/.test(selecteur) || selecteur === "#message";
    const base = feuille.find(({ selecteurs }) => selecteurs.includes("pre") && selecteurs.length === 1);
    assert.equal(base?.declarations.get("white-space"), "pre-wrap");

    const INTERDITES = ["text-overflow", "text-transform", "line-clamp", "-webkit-line-clamp", "hyphens", "visibility", "display", "word-break", "text-indent", "word-spacing", "letter-spacing", "font-variant", "direction", "content", "height", "width", "max-width", "opacity", "clip-path"];
    let vus = 0;
    for (const { selecteurs, declarations } of feuille) {
      if (!selecteurs.some(dUnPre)) continue;
      vus++;
      const dit = selecteurs.join(", ");
      for (const propriete of INTERDITES) assert.equal(declarations.get(propriete), undefined, `${dit} { ${propriete} }`);
      assert.ok([undefined, "pre-wrap"].includes(declarations.get("white-space")), `${dit} { white-space: ${declarations.get("white-space")} }`);
      // Un `pre` borné en hauteur défile : rien n'y est caché.
      assert.ok([undefined, "auto"].includes(declarations.get("overflow")), `${dit} { overflow: ${declarations.get("overflow")} }`);
      if (declarations.has("max-height")) assert.equal(declarations.get("overflow"), "auto", dit);
      assert.notEqual(declarations.get("font-size"), "0", dit);
    }
    assert.ok(vus >= 8, `${vus} règles seulement portent sur un \`pre\``);

    // Rien ne se coupe dans toute la peau : pas même le titre d'un ticket, sur la ligne d'un cook.
    const coupe = feuille.filter(({ declarations }) => declarations.has("text-overflow") || declarations.get("overflow") === "hidden" || declarations.has("-webkit-line-clamp") || declarations.has("text-transform"));
    assert.deepEqual(coupe.map(({ selecteurs }) => selecteurs), []);
  });

  test("sur un bon, deux lignes au plus ; ce que la fiche détaille garde ses blancs", async () => {
    const vue = await ouvrirUnEspace();
    vue.dire("surFaits", { ...FAITS, demande: vue.dernier("faits")[0] as number });

    // Sur la carte, deux lignes au plus ; ce que la box a écrit en entier ne s'y relaie plus, et la fiche ne le relaie pas non plus.
    const bons = vue.element("rail").dessous("li").filter((li) => li.className === "bon");
    for (const bon of bons) assert.ok(bon.dessous("p").length <= 2, `#${bon.children[0]?.children[0]?.textContent}`);
    assert.deepEqual(textes(vue.element("rail").dessous("p").filter((p) => p.className === "ligne")), []);
    const regle = regles(lire("vue.css")).find(({ selecteurs }) => selecteurs.includes("#fiche .details p") && selecteurs.length === 1);
    assert.equal(regle?.declarations.get("white-space"), "pre-wrap");
  });
});

// Ce que `faits` donne à dessiner d'un projet, prêt à poser (faits.ts) : deux cooks, un rail.
const FAITS: Dessinable = {
  projet: PARADE,
  demande: 0,
  a: A,
  tableau: {
    etat: "ouverte",
    ton: "vert",
    arretee: false,
    tick: "dernier tick il y a 12 s",
    compteurs: [
      { libelle: "rail", nombre: 9 },
      { libelle: "au travail", nombre: 2 },
      { libelle: "à la pass", nombre: 1 },
      { libelle: "t'attend", nombre: 1 },
      { libelle: "livrés 24 h", nombre: 11 },
    ],
    cooks: { enCours: [{ ticket: 218, titre: "Formulaire devis multi-étapes", station: "box/claude-opus" }], vide: "aucun cook en cours" },
    evenement: "il y a 2 min · pass verte sur #216",
    rail: {
      colonnes: [
        { nom: "Sur le rail", ton: "gris", compte: "1", cartes: [{ ticket: 222, etat: "en attente", ton: "gris", titre: "Récapitulatif devis avant envoi", fiche: entete({ titre: "Récapitulatif devis avant envoi" }), ouvrable: true, attendu: false, attend: [], dit: [{ libelle: "depuis", valeur: "3 h 02" }, { libelle: "bloque", valeur: "zone tenue par #218 (app/src)" }], sans: "non communiqué par la file : qui le tient · son bail · ce qu'il brûle" }], vide: "aucun ticket" },
        { nom: "Au travail", ton: "bleu", compte: "1", cartes: [{ ticket: 218, etat: "pris", ton: "bleu", titre: "Formulaire devis multi-étapes", fiche: entete({ titre: "Formulaire devis multi-étapes" }), ouvrable: false, attendu: false, attend: [], dit: [{ libelle: "tient", valeur: "box/claude-opus", exact: true }, { libelle: "depuis", valeur: "12 min" }, { libelle: "bail", valeur: "sans progrès depuis 3 min, bail encore 27 min" }, { libelle: "brûle", valeur: "230 000 tokens au dernier relevé" }], sans: "non communiqué par la file : ce qui le bloque" }], vide: "aucun ticket" },
        { nom: "Pass", ton: "jaune", compte: "0", cartes: [], vide: "aucun ticket" },
        { nom: "T'attend", ton: "rouge", compte: "1", cartes: [{ ticket: 12, etat: "servi", ton: "vert", titre: "Validation SIRET", fiche: entete({ titre: "Validation SIRET" }), ouvrable: true, attendu: true, attend: ["depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main :   gh pr merge 31"], dit: [{ libelle: "depuis", valeur: "2 j" }, { libelle: "cuisiné par", valeur: "box/claude-opus", exact: true }], sans: "non communiqué par la file : qui le tient · son bail · ce qu'il brûle" }], vide: "aucun ticket" },
        { nom: "Livré", ton: "vert", compte: "0", cartes: [], vide: "aucun ticket" },
      ],
      hors: [{ ticket: 86, etat: "un mot inconnu", titre: "Hors colonnes", fiche: entete({ titre: "Hors colonnes" }), ouvrable: false, attendu: false, attend: [], dit: [], sans: "non communiqué par `facts`, et pas lu par l'app dans ce que `status` écrit de ce ticket, relayé dessous tel quel : qui le tient · depuis quand · son bail · ce qu'il brûle · ce qui le bloque", relais: "un mot inconnu  -  depuis 5 min  (ce que la box en dit)  Hors colonnes" }],
      attendLu: A,
      railLu: A,
    },
  },
};
const PAGES: Pages = { projet: PARADE, pages: [{ ticket: 470, worktree: "470-2a033691", port: 20470, etat: "sert", route: "/rail", ecran: null, enCours: false }], aLancer: [], illisibles: [], empeche: [], rappel: "rien ne s'y valide" };
const MANAGER: VuDuManager = {
  projet: PARADE,
  demande: 0,
  a: A,
  interrupteur: { allume: true, mot: "ALLUMÉ", ton: "vert", depuis: A, par: "benoit", dit: "il trie le backlog" },
  decisions: { lignes: [{ a: A, ticket: 301, dit: "découpée en trois tickets" }], illisibles: [] },
  ecartees: { lignes: [{ a: A, ticket: 302, motif: "porte blocked-on-human" }], illisibles: [] },
};
const GRANTS_VUS: VuDesGrants = {
  projet: PARADE,
  demande: 0,
  a: A,
  grants: [
    {
      action: "merge",
      commandable: true,
      actif: true,
      mot: "ACTIF",
      ton: "vert",
      limites: [],
      dit: "",
      usages: { lignes: [{ a: A, ticket: 216, action: "merge", base: "v2", pr: "https://github.com/benomite/brigade/pull/231", commit: "9691d64", verdict: "verdict n° 14", suite: "mergée" }], illisibles: [] },
    },
  ],
  interdits: { lignes: [], illisibles: [] },
  illisibles: [],
};

describe("la fenêtre se réduit sans que rien ne se casse", () => {
  const feuille = regles(lire("vue.css"));
  const regle = (selecteur: string) => feuille.find(({ selecteurs }) => selecteurs.length === 1 && selecteurs[0] === selecteur)?.declarations ?? assert.fail(`pas de règle « ${selecteur} »`);

  test("la fenêtre a un plancher, qui est la moitié de sa largeur d'ouverture", () => {
    const main = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    const ouverture = Number(/width: (\d+),/.exec(main)?.[1]);
    const plancher = Number(/minWidth: (\d+),/.exec(main)?.[1]);
    assert.ok(ouverture > 0 && plancher > 0, "ni largeur d'ouverture ni plancher");
    assert.equal(plancher, ouverture / 2);
  });

  test("à cette largeur, ce qui ne tient pas défile ou passe à la ligne : rien ne déborde sans accès", () => {
    // Les onglets et les colonnes du rail défilent ; la colonne centrale peut se rétrécir.
    assert.equal(regle("#onglets").get("overflow-x"), "auto");
    assert.equal(regle("#onglets").get("min-width"), "0");
    assert.equal(regle("#rail .colonnes").get("overflow-x"), "auto");
    assert.equal(regle("main").get("min-width"), "0");
    // Le nom du projet, en entier, passe à la ligne plutôt que de pousser les onglets.
    assert.equal(regle("#espace").get("flex-shrink"), undefined);
    assert.equal(regle("#espace").get("white-space"), undefined);
    assert.equal(regle("#espace").get("overflow-wrap"), "anywhere");
    // Le bandeau du fichier est dans le flux : il ne recouvre pas le bas d'un écran qui défile.
    assert.notEqual(regle("#relecture").get("position"), "fixed");
    // Ce qui est posé par-dessus reste dans la fenêtre et défile s'il est long.
    assert.equal(regle("#avis").get("overflow-y"), "auto");
    for (const selecteur of ["#tous", "#ajout", "#rail", "#contenu"]) assert.equal(regle(selecteur).get("overflow-y"), "auto", selecteur);
    // Aucune largeur ou hauteur fixe ne dépasse le plancher.
    for (const { selecteurs, declarations } of feuille) {
      for (const propriete of ["width", "min-width", "max-width"]) {
        const px = /^(\d+)px$/.exec(declarations.get(propriete) ?? "")?.[1];
        if (px !== undefined) assert.ok(Number(px) <= 640, `${selecteurs.join(", ")} { ${propriete}: ${px}px }`);
      }
    }
  });

  test("une sortie longue, d'un seul mot comme de dix mille lignes, s'affiche entière dans chaque écran", async () => {
    const mot = `x${"0123456789".repeat(400)}`;
    const longue = [mot, ...Array.from({ length: 10000 }, (_, i) => `  ligne ${i}   avec    des blancs  `), mot].join("\n");
    const vue = await ouvrirUnEspace();
    const demande = vue.dernier("regarder")[1] as number;
    vue.dire("surLecture", { projet: PARADE, demande, a: A, attend: longue, sorties: [{ commande: "status", texte: longue }] }, { projet: PARADE, pages: [], aLancer: [], illisibles: [longue], empeche: [] });
    assert.deepEqual(textes(relayes(vue.element("lecture"))), [longue, longue]);
    assert.deepEqual(textes(relayes(vue.element("pages"))), [longue]);

    for (const { titre, commande } of ONGLETS) {
      await ouvrirLecture(vue, titre);
      const numero = (vue.dernier("onglet") as [string, string, number])[2];
      vue.dire("surContenu", { projet: PARADE, demande: numero, a: A, sorties: [{ commande, texte: longue }] }, undefined, undefined);
      assert.deepEqual(textes(relayes(vue.element("lecture-onglet"))), [longue], titre);
    }
  });
});

describe("le monospace est une information, pas un style", () => {
  // Tout ce qui est posé dans la fenêtre, une fois l'espace ouvert, ses faits et ses pages lus.
  async function toutPose(onglet: string, manager?: VuDuManager, grants?: VuDesGrants): Promise<Faux[]> {
    const vue = await ouvrirUnEspace();
    vue.dire("surFaits", { ...FAITS, demande: vue.dernier("faits")[0] as number });
    vue.dire("surLecture", { projet: PARADE, demande: vue.dernier("regarder")[1] as number, a: A, attend: BLOC, sorties: [{ commande: "status", texte: RELAYE }] }, PAGES);
    await ouvrirLecture(vue, onglet);
    const numero = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { projet: PARADE, demande: numero, a: A, sorties: [{ commande: "x", texte: RELAYE }] }, manager === undefined ? undefined : { ...manager, demande: numero }, grants === undefined ? undefined : { ...grants, demande: numero });
    return vue.poses();
  }
  const mono = (element: Faux) => element.className.split(" ").includes("mono");
  const portant = (poses: Faux[], texte: string) => poses.filter((element) => element.textContent === texte && element.children.length === 0);

  test("un numéro de ticket est en monospace partout où il se pose : la carte, le rail, les pages, le manager, les grants", async () => {
    const poses = [...(await toutPose("Rail")), ...(await toutPose("Manager", MANAGER)), ...(await toutPose("Grants", undefined, GRANTS_VUS))];

    // Le cook de la carte et son ticket du rail, les bons, la page servie, une décision, un écart, un usage.
    for (const numero of ["#218", "#222", "#12", "#86", "#470", "#301", "#302", "#216"]) {
      const trouves = portant(poses, numero);
      assert.ok(trouves.length > 0, `${numero} n'est posé nulle part`);
      for (const pose of trouves) assert.ok(mono(pose), `${numero} est posé hors du monospace, dans <${pose.balise} class="${pose.className}">`);
    }
    assert.equal(portant(poses, "#218").length >= 2, true, "le ticket du cook est sur sa carte et sur le rail");
    // Et aucun numéro seul n'est posé ailleurs que dans le monospace.
    for (const pose of poses) if (/^#\d+$/.test(pose.textContent) && pose.children.length === 0) assert.ok(mono(pose), pose.textContent);
  });

  test("un identifiant de run et un port aussi — et la phrase qui les porte reste la même", async () => {
    const poses = await toutPose("Rail");

    for (const exact of ["470-2a033691", "20470", "box/claude-opus"]) {
      const trouves = portant(poses, exact);
      assert.ok(trouves.length > 0, `${exact} n'est posé nulle part`);
      for (const pose of trouves) assert.ok(mono(pose), exact);
    }
    assert.ok(poses.some((pose) => pose.textContent === "470-2a033691 · port 20470 · sert"), "la ligne du serveur a changé");
    const usage = (await toutPose("Grants", undefined, GRANTS_VUS)).filter((pose) => pose.textContent === "https://github.com/benomite/brigade/pull/231 · 9691d64 · verdict n° 14");
    assert.equal(usage.length, 1, "la ligne de l'usage a changé");
    assert.deepEqual(usage[0]?.children.map((pose) => [pose.textContent, mono(pose)]), [["https://github.com/benomite/brigade/pull/231", true], ["9691d64", true]]);
  });

  test("le nom du projet, qui est son identifiant sur la box, et la commande qu'un bouton écrira", async () => {
    const [nom] = (await toutPose("Rail")).filter((pose) => pose.id === "espace");
    assert.ok(nom !== undefined && mono(nom) && nom.textContent === PARADE);

    // Les boutons qui écrivent une commande à compléter sont dans l'onglet de ce qu'ils changent, à côté
    // des gestes collés à l'état — accorder, révoquer.
    const poses = await toutPose("Grants", undefined, GRANTS_VUS);
    const boutons = poses.filter((pose) => pose.balise === "button" && pose.parentElement?.className === "gestes");
    assert.ok(boutons.length > 0 && boutons.every((pose) => !mono(pose)), "un bouton de geste est en monospace");
    // Un bouton qui écrit une commande à compléter dit son geste en mots : la commande n'est affichée nulle part.
    const complets = poses.filter((pose) => pose.balise === "button" && pose.parentElement?.className === "action");
    assert.deepEqual(complets.map(({ textContent }) => textContent), BOUTONS.filter(({ ou }) => ou === "grants").map(({ libelle }) => `${libelle}…`));
    for (const { commande } of BOUTONS) assert.ok(!poses.some((pose) => pose.textContent.includes(commande.trim())), commande);
  });

  test("ce qui se lit ne l'est pas : un titre, un mot d'état, un libellé, ce que l'app dit elle-même", async () => {
    const poses = [...(await toutPose("Manager", MANAGER)), ...(await toutPose("Rail"))];

    for (const lu of ["Formulaire devis multi-étapes", "Validation SIRET", "pris", "en attente", "un mot inconnu", "ouverte", "ALLUMÉ", "Sur le rail", "T'attend", "au travail", "découpée en trois tickets", "Rail", "Manager", "second · claude"]) {
      const trouves = portant(poses, lu);
      assert.ok(trouves.length > 0, `« ${lu} » n'est posé nulle part`);
      for (const pose of trouves) assert.ok(!mono(pose) && pose.balise !== "pre" && pose.balise !== "code", `« ${lu} » est en monospace`);
    }
    // Sur plusieurs lignes, les mots de l'app sont à part de ceux de la box : jamais dans un `pre` nu.
    const vue = await jouerLaVue({ ...REPONSES, demarrage: () => ({ ...demarrage(), configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }) }) });
    // Sur l'accueil, un projet sans box se dit en une ligne ; ce qu'elle suppose du fichier est au survol.
    vue.dire("surAccueil", { projets: [{ nom: PARADE, ton: "gris", dit: "no station: nothing is read", survol: "its entry in the projects file does not say where its station is" }], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } });
    const sansBox = vue.element("tous").dessous("button").find((pose) => pose.className === "ligne");
    assert.equal(sansBox?.textContent, `${PARADE}no station: nothing is read›`);
    assert.equal(sansBox?.title, "its entry in the projects file does not say where its station is");
    assert.equal(vue.element("tous").dessous("pre").length, 0);
  });
});

describe("la carte d'un ticket servi : l'écran à regarder, sa phrase, la mention « déduit », et le bouton seulement s'il y a quelque chose à voir", () => {
  const PHRASE = "#591 : le rail a maintenant deux colonnes, TODO et WAITING";
  const DEDUIT = "écran déduit des fichiers touchés, pas déclaré par le cook";
  const servie = (page: Partial<Pages["pages"][number]>): Pages["pages"][number] => ({ ticket: 12, worktree: "12-2a033691", port: 20012, etat: "écoute", route: "/rail", ecran: null, enCours: false, ...page });
  // La carte du ticket #12 — sur le rail, dans « T'attend » —, ses faits et ses pages lus : ce qui y est posé de sa page.
  async function carte(pages: Pick<Pages, "pages" | "aLancer">) {
    const vue = await ouvrirUnEspace({ ouvrirPage: () => undefined });
    vue.dire("surFaits", { ...FAITS, demande: vue.dernier("faits")[0] as number });
    vue.dire("surLecture", { projet: PARADE, demande: vue.dernier("regarder")[1] as number, a: A, attend: BLOC, sorties: [{ commande: "status", texte: RELAYE }] }, { projet: PARADE, illisibles: [], empeche: [], ...pages });
    await ouvrirLecture(vue, "Rail");
    const [posee, ...autres] = vue.poses().filter((pose) => pose.className === "servie");
    assert.ok(posee !== undefined && autres.length === 0, "une seule page posée");
    const bon = vue.poses().find((pose) => pose.className.split(" ").includes("bon") && pose.dessous("div").includes(posee));
    assert.ok(bon?.textContent.includes("Validation SIRET"), "la page n'est pas sur la carte de son ticket");
    return { vue, posee, boutons: posee.dessous("button"), textes: posee.dessous("p").concat(posee.dessous("small")).map((pose) => pose.textContent) };
  }

  test("un écran déclaré, avec sa page : la phrase du cook, l'écran, et le bouton qui ouvre cette page — sans mention « déduit »", async () => {
    const { vue, boutons, textes } = await carte({ pages: [servie({ ecran: { nom: "/rail", phrase: PHRASE, deduit: null } })], aLancer: [] });

    assert.ok(textes.includes(PHRASE), textes.join(" | "));
    assert.ok(textes.includes("screen to look at: /rail"), textes.join(" | "));
    assert.ok(!textes.some((texte) => texte.includes("déduit")));
    assert.deepEqual(boutons.map((pose) => [pose.textContent, pose.disabled]), [["see it in my browser", false]]);
    boutons[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirPage"), [PARADE, "12-2a033691"]);
  });

  test("un écran déduit des fichiers touchés : la carte le dit, mot pour mot", async () => {
    const { textes, boutons } = await carte({ pages: [servie({ ecran: { nom: "/rail", phrase: null, deduit: DEDUIT } })], aLancer: [] });

    assert.ok(textes.includes(DEDUIT), textes.join(" | "));
    assert.equal(boutons.length, 1);
  });

  test("sans écran, pas de bouton — ce que `status` écrit à sa place se lit", async () => {
    const sansPage = "aucune page à ouvrir : la livraison ne dit aucun écran, et n'en touche aucun que le projet déclare";
    const { boutons, textes } = await carte({ pages: [servie({ route: null, sansPage })], aLancer: [] });

    assert.deepEqual(boutons, []);
    assert.ok(textes.includes(sansPage), textes.join(" | "));
    assert.ok(!textes.some((texte) => texte.startsWith("screen to look at")));
  });

  test("une app Electron : pas de bouton, et la carte dit comment voir l'écran", async () => {
    const comment = "pas de page dans un navigateur : lancer l'app sur le worktree de la livraison, `cd '/etat/12-2a033691' && npm --prefix app start`, puis y ouvrir l'écran « la carte »";
    const { boutons, textes } = await carte({ pages: [], aLancer: [{ ticket: 12, worktree: "12-2a033691", commentLeVoir: comment, ecran: { nom: "la carte", phrase: PHRASE, deduit: null } }] });

    assert.deepEqual(boutons, []);
    assert.ok(textes.includes(`how to see it: ${comment}`), textes.join(" | "));
    assert.ok(textes.includes(PHRASE));
  });
});

describe("rien de ce qui est au parking n'apparaît", () => {
  // docs/maquettes/app/README.md, « Ce qui est dessiné mais ne doit pas être construit ». Les cook
  // profiles et le carnet en sont sortis avec l'épique #1033, qui les construit.
  const PARKING = /codex|openweight|preprod|mac\/chrome|chrome-connect|revue-humaine|accès-prod|depuis ton mac|toutes les brigades|expire dans|<progress|<meter|progressbar|jauge|\bcommis\b|thème clair|prefers-color-scheme|light-dark\(/i;

  test("ni dans les fichiers de la vue, ni dans ce qu'elle pose", async () => {
    for (const fichier of fichiers) assert.doesNotMatch(lire(fichier), PARKING, fichier);
    // Le README nomme bien ce que ce test cherche : la liste n'est pas la sienne propre.
    const parking = readFileSync(join(MAQUETTES, "README.md"), "utf8");
    for (const dessine of ["box/codex", "mac/chrome", "chrome-connecté", "revue-humaine", "accès-prod", "depuis ton Mac", "en preprod", "toutes les brigades", "jauge chiffrée", "expire dans 2 j"]) assert.ok(parking.includes(dessine), `le README des maquettes ne nomme plus « ${dessine} »`);

    const vue = await ouvrirUnEspace();
    vue.dire("surFaits", { ...FAITS, demande: vue.dernier("faits")[0] as number });
    for (const pose of vue.poses()) assert.doesNotMatch(pose.textContent, PARKING, `<${pose.balise} id="${pose.id}">`);
    // Un compteur est un nombre, posé tel quel : ni barre, ni pourcentage.
    assert.deepEqual(textes(vue.element("carte").dessous("dd")), ["9", "2", "1", "1", "11"]);
  });

  test("un seul thème, sombre : ni thème clair, ni réglage de thème", () => {
    for (const fichier of fichiers) assert.doesNotMatch(lire(fichier), /@media|color-scheme:(?!\s*dark;)|data-theme|matchMedia/, fichier);
  });
});

describe("le cadre est fait de cartes, sur fond sombre", () => {
  test("une seule règle fait la carte, et tout ce qui se lit d'un bloc la porte : les cinq onglets, « Tous les projets », l'ajout, le choix de la cuisine", () => {
    const feuille = regles(lire("vue.css"));
    const carte = feuille.find(({ declarations }) => declarations.get("background") === "var(--carte)" && declarations.get("border-radius") === "var(--rayon-carte)" && declarations.get("position") === undefined);
    assert.deepEqual(carte?.selecteurs, [".carte", "#service", "#retrait", "#provenance", "#arreter-cuisine", "#couleurs", "#ordinaires", "#pages", "#manager", "#grants", "#code", "#tous .liste", "#formulaire", "#stations-du-projet .confiance"]);
    assert.equal(carte?.declarations.get("border"), "1px solid var(--trait)");
    assert.equal(feuille.find(({ selecteurs }) => selecteurs.join() === "body")?.declarations.get("background"), "var(--fond)");
    // Les colonnes du rail, les bons, le bloc de ce qui attend, la sortie relayée : chacun son cadre.
    for (const [selecteur, fond] of [["#rail .colonne", "var(--bandeau)"], ["#rail .bon", "var(--bon)"], [".attend", "var(--attend)"], ["pre", "var(--terminal)"]] as const) {
      const regle = feuille.find(({ selecteurs }) => selecteurs.length === 1 && selecteurs[0] === selecteur);
      assert.equal(regle?.declarations.get("background"), fond, selecteur);
      assert.match(regle?.declarations.get("border-radius") ?? "", /^var\(--rayon-(carte|bouton|bon)\)$/, selecteur);
    }
  });

  test("chaque sélecteur de la peau vise un élément que la page ou la vue pose", () => {
    const html = lire("index.html");
    // La vue, ses briques, et les blocs de ses onglets (cost/…) : tout module de la vue qui pose un élément.
    const source = fichiers.filter((fichier) => fichier.endsWith(".js")).map(lire).join("\n");
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g), ...source.matchAll(/\.id = "([^"]+)"/g)].map(([, id = ""]) => id));
    const classes = new Set([...html.matchAll(/\bclass="([^"]+)"/g), ...source.matchAll(/className = "([^"]+)"/g), ...source.matchAll(/classList\.toggle\("([^"]+)"/g)].flatMap(([, noms = ""]) => noms.split(" ")));
    for (const { selecteurs } of regles(lire("vue.css"))) {
      for (const selecteur of selecteurs) {
        for (const [, id = ""] of selecteur.matchAll(/#([a-z-]+)/g)) assert.ok(ids.has(id), `${selecteur} : aucun élément « #${id} »`);
        for (const [, classe = ""] of selecteur.matchAll(/\.([a-z-]+)/g)) assert.ok(classes.has(classe), `${selecteur} : aucune classe « .${classe} »`);
      }
    }
  });
});
