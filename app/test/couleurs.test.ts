// Chaque projet a sa couleur d'onglet et sa couleur d'accent : tirées quand il entre dans le
// fichier des projets — ajouté depuis l'app, ou déclaré avant que les couleurs existent —, écrites
// dans ce fichier, réglables depuis l'app. L'onglet teint sa case dans la barre, l'accent son
// espace ; les couleurs d'état de la peau n'en dépendent jamais.
// Le fichier est un vrai fichier écrit par le test ; la vue est jouée telle qu'elle est, devant un
// faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { ajouterProjet, changerCouleur, colorerProjets, EXEMPLE, lireConfiguration, type Projet } from "../src/config.ts";
import { choix, couleursLues, PALETTE, ROLES, tirer } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { suivreConfiguration } from "../src/suivi.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jetonsDe, jouerLaVue, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const VALEURS = PALETTE.map(({ valeur }) => valeur);
// Un hasard qui rend toujours la même chose : c'est la palette qui doit écarter ce qui est pris.
const toujours = (tire: number) => () => tire;

function fichier(t: TestContext, contenu: unknown): { racine: string; chemin: string } {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, JSON.stringify(contenu));
  return { racine, chemin };
}
const lu = (chemin: string) => JSON.parse(readFileSync(chemin, "utf8")) as { projets: { nom: string; couleurs?: Record<string, string> }[] };

describe("la palette", () => {
  test("aucune couleur de projet n'est une couleur d'état de la peau : une alerte se lit pareil partout", () => {
    const jetons = jetonsDe(readFileSync(join(VUE, "jetons.css"), "utf8"));
    const etats = ["--vert", "--jaune", "--rouge", "--rouge-clair", "--bleu", "--gris"].map((nom) => jetons.get(nom));
    assert.ok(etats.every((valeur) => valeur?.startsWith("#")), etats.join());
    for (const valeur of VALEURS) assert.ok(!etats.includes(valeur), `${valeur} est une couleur d'état`);
    assert.equal(new Set(VALEURS).size, VALEURS.length, "une couleur est deux fois dans la palette");
    assert.equal(new Set(PALETTE.map(({ nom }) => nom)).size, PALETTE.length, "un nom est deux fois dans la palette");
    for (const valeur of VALEURS) assert.match(valeur, /^#[0-9a-f]{6}$/);
  });

  test("un tirage écarte ce que les autres projets portent, tant que la palette n'est pas épuisée", () => {
    const prises: string[] = [];
    for (let rang = 0; rang < PALETTE.length; rang++) prises.push(tirer(prises, toujours(0)));
    assert.deepEqual([...prises].sort(), [...VALEURS].sort());
    // Épuisée : l'une des moins portées — ici, toutes le sont une fois, sauf la dernière tirée deux fois.
    const encore = tirer([...prises, VALEURS[0]], toujours(0));
    assert.notEqual(encore, VALEURS[0]);
    // Le hasard choisit parmi les libres, jusqu'au bout de la liste.
    assert.equal(tirer([], toujours(0.999999)), VALEURS.at(-1));
    assert.equal(tirer([VALEURS[0]?.toUpperCase()], toujours(0)), VALEURS[1], "une couleur écrite en capitales est la même");
  });

  test("le fichier dit une couleur en `#rrggbb` ; ce qui n'en est pas une est refusé, et dit", () => {
    assert.equal(couleursLues(undefined), undefined);
    assert.equal(couleursLues({}), undefined);
    assert.deepEqual(couleursLues({ onglet: "#A98CF2" }), { onglet: "#a98cf2" });
    assert.deepEqual(couleursLues({ onglet: "#a98cf2", accent: "#4fc7b5", autre: "gardé ailleurs" }), { onglet: "#a98cf2", accent: "#4fc7b5" });
    assert.match(String(couleursLues("violet")), /^“couleurs” must be an object/);
    assert.match(String(couleursLues({ accent: "violet" })), /“accent” must be a color written `#rrggbb` — “violet” is not one/);
    assert.match(String(couleursLues({ onglet: "#fff" })), /“onglet” must be a color/);
  });

  test("la vue nomme un rôle et une couleur de la palette : rien d'autre ne s'écrit depuis elle", () => {
    assert.deepEqual(choix("onglet", "purple"), { role: "onglet", valeur: "#a98cf2" });
    assert.deepEqual(choix("accent", "orange"), { role: "accent", valeur: "#f2994a" });
    assert.match((choix("fond", "violet") as { refus: string }).refus, /^“fond” is not a project color: onglet or accent/);
    assert.match((choix("onglet", "#123456") as { refus: string }).refus, /^“#123456” is not in the palette/);
  });
});

describe("les couleurs dans le fichier des projets", () => {
  test("un projet qui les porte les garde à la lecture ; une couleur mal écrite refuse le fichier en le disant", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/", couleurs: { onglet: "#A98CF2", accent: "#4fc7b5" } }] });
    assert.deepEqual(lireConfiguration(chemin).projets, [{ nom: "a", dossier: "/", couleurs: { onglet: "#a98cf2", accent: "#4fc7b5" } }]);

    writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "a", dossier: racine, couleurs: { onglet: "rouge" } }] }));
    assert.equal(lireConfiguration(chemin).refus, "project #1 (a): “couleurs”: “onglet” must be a color written `#rrggbb` — “rouge” is not one");
  });

  test("les projets déclarés avant les couleurs en reçoivent, une chacun, toutes différentes — et le reste du fichier ne bouge pas", (t) => {
    const { racine, chemin } = fichier(t, { note: "à moi", hotes: ["box"], projets: [{ nom: "a", dossier: "/", hote: "box" }, { nom: "b", dossier: "/" }, { nom: "c", dossier: "/", couleurs: { onglet: VALEURS[0], inconnue: "gardée" } }] });

    assert.equal(colorerProjets(chemin, racine, toujours(0)), undefined);

    const ecrit = lu(chemin);
    assert.deepEqual({ ...ecrit, projets: ecrit.projets.map(({ couleurs, ...reste }) => reste) }, { note: "à moi", hotes: ["box"], projets: [{ nom: "a", dossier: "/", hote: "box" }, { nom: "b", dossier: "/" }, { nom: "c", dossier: "/" }] });
    // Celle qui y était n'a pas changé, ni ce que l'app n'y lit pas.
    assert.equal(ecrit.projets[2]?.couleurs?.onglet, VALEURS[0]);
    assert.equal(ecrit.projets[2]?.couleurs?.inconnue, "gardée");
    for (const role of ROLES) {
      const portees = ecrit.projets.map(({ couleurs }) => couleurs?.[role]);
      assert.ok(portees.every((valeur) => VALEURS.includes(valeur ?? "")), `${role} : ${portees.join()}`);
      assert.equal(new Set(portees).size, portees.length, `${role} : deux projets portent la même — ${portees.join()}`);
    }
    // Elles restent : c'est le fichier qui les tient, relu comme au lancement suivant.
    assert.deepEqual(
      lireConfiguration(chemin).projets.map(({ couleurs }) => couleurs),
      ecrit.projets.map(({ couleurs }) => ({ onglet: couleurs?.onglet, accent: couleurs?.accent })),
    );
  });

  test("rien ne manque : rien n'est écrit — et un fichier que l'app n'a pas compris n'est pas touché", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/", couleurs: { onglet: VALEURS[1], accent: VALEURS[2] } }] });
    const avant = readFileSync(chemin, "utf8");
    const date = statSync(chemin).mtimeMs;
    assert.equal(colorerProjets(chemin, racine), undefined);
    assert.equal(readFileSync(chemin, "utf8"), avant);
    assert.equal(statSync(chemin).mtimeMs, date);

    writeFileSync(chemin, '{ "projets": [');
    assert.match(colorerProjets(chemin, racine) ?? "", /^the app does not write into a file it has not understood — unreadable JSON/);
    assert.equal(readFileSync(chemin, "utf8"), '{ "projets": [');
  });

  test("deux projets ajoutés l'un après l'autre n'ont pas la même couleur, tant que la palette n'est pas épuisée", (t) => {
    const { racine, chemin } = fichier(t, { projets: [] });
    for (const [rang, nom] of PALETTE.map((_, rang) => `p${rang}`).entries()) {
      assert.equal(ajouterProjet(chemin, { nom, dossier: racine }), undefined);
      // Le même hasard à chaque ajout : c'est ce que les autres portent qui l'écarte.
      assert.equal(colorerProjets(chemin, racine, toujours(0.5)), undefined);
      const projets = lu(chemin).projets;
      assert.equal(projets.length, rang + 1);
      for (const role of ROLES) assert.equal(new Set(projets.map(({ couleurs }) => couleurs?.[role])).size, rang + 1, `${role}, au ${rang + 1}e projet`);
    }
  });

  test("une couleur se change : celle-là, et rien d'autre du fichier", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/", couleurs: { onglet: VALEURS[1], accent: VALEURS[2] } }, { nom: "b", dossier: "/" }] });

    assert.equal(changerCouleur(chemin, "a", "accent", "#D77EE0", racine), undefined);
    assert.deepEqual(lu(chemin).projets, [{ nom: "a", dossier: "/", couleurs: { onglet: VALEURS[1], accent: "#d77ee0" } }, { nom: "b", dossier: "/" }]);
    assert.equal(changerCouleur(chemin, "b", "onglet", VALEURS[3] ?? "", racine), undefined);
    assert.deepEqual(lu(chemin).projets[1], { nom: "b", dossier: "/", couleurs: { onglet: VALEURS[3] } });

    const avant = readFileSync(chemin, "utf8");
    assert.equal(changerCouleur(chemin, "z", "onglet", VALEURS[0] ?? "", racine), "“z” is not in this file: nothing was changed there");
    assert.equal(changerCouleur(chemin, "a", "onglet", "violet", racine), "“violet” is not a color written as `#rrggbb`");
    assert.equal(readFileSync(chemin, "utf8"), avant);
  });

  test("suivi, le fichier dit tout de suite les couleurs tirées et changées", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/" }] });
    const dits: Projet[][] = [];
    const suivie = suivreConfiguration({ chemin, maison: racine, surChangement: (configuration) => void dits.push(configuration.projets) });
    t.after(() => suivie.fermer());
    assert.equal(suivie.configuration().projets[0]?.couleurs, undefined);

    assert.equal(suivie.colorer(toujours(0)), undefined);
    assert.deepEqual(suivie.configuration().projets[0]?.couleurs, { onglet: VALEURS[0], accent: VALEURS[0] });
    assert.deepEqual(dits.at(-1)?.[0]?.couleurs, { onglet: VALEURS[0], accent: VALEURS[0] });

    assert.equal(suivie.changerCouleur("a", "onglet", VALEURS[4] ?? ""), undefined);
    assert.deepEqual(suivie.configuration().projets[0]?.couleurs, { onglet: VALEURS[4], accent: VALEURS[0] });
    // Plus rien ne manque : le suivi n'écrit plus rien.
    const avant = readFileSync(chemin, "utf8");
    assert.equal(suivie.colorer(), undefined);
    assert.equal(readFileSync(chemin, "utf8"), avant);
  });
});

describe("les couleurs dans la vue", () => {
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" }, couleurs: { onglet: "#a98cf2", accent: "#4fc7b5" } };
  const FANFARE: Projet = { nom: "fanfare", dossier: "/tmp/fanfare", box: { hote: "box" }, couleurs: { onglet: "#f28cbf", accent: "#d9b98a" } };
  const NUE: Projet = { nom: "nue", dossier: "/tmp/nue" };
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

  const jouer = (projets: Projet[], colorer?: (projet: string, role: string, couleur: string) => string | undefined) =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets, hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [SECOND],
      ...(colorer === undefined ? {} : { colorer }),
    });
  // La case de la barre : « T », puis les projets dans l'ordre du fichier, puis « + ».
  const caseDe = (vue: Jouee, rang: number): Faux => vue.element("projets").children.at(rang) ?? assert.fail(`pas d'entrée ${rang}`);
  const accent = () => (globalThis as unknown as { document: { documentElement: Faux } }).document.documentElement.style.getPropertyValue("--accent");
  const pastilles = (vue: Jouee, rangee: number) => (vue.element("couleurs").children.filter(({ className }) => className === "rangee")[rangee] ?? assert.fail(`pas de rangée ${rangee}`)).dessous("button");

  test("dans la barre, chaque case porte la couleur d'onglet de son projet — celle d'un projet qui n'en a pas reste celle de la peau", async () => {
    const vue = await jouer([PARADE, FANFARE, NUE]);
    assert.deepEqual(
      [1, 2, 3].map((rang) => [caseDe(vue, rang).classList.contains("teinte"), caseDe(vue, rang).style.getPropertyValue("--teinte")]),
      [
        [true, "#a98cf2"],
        [true, "#f28cbf"],
        [false, ""],
      ],
    );
  });

  test("l'espace d'un projet porte son accent, à la place de celui de la peau ; « Tous les projets » reprend celui de la peau", async () => {
    const vue = await jouer([PARADE, FANFARE, NUE]);
    assert.equal(accent(), "");
    caseDe(vue, 1).click();
    await repos();
    assert.equal(accent(), "#4fc7b5");
    caseDe(vue, 2).click();
    await repos();
    assert.equal(accent(), "#d9b98a");
    caseDe(vue, 3).click();
    await repos();
    assert.equal(accent(), "", "un projet sans couleur a l'accent de la peau");
    caseDe(vue, 0).click();
    await repos();
    assert.equal(accent(), "");
  });

  test("sous Paramètres, les couleurs se choisissent dans la palette, et le choix se voit dès que le fichier l'a pris", async () => {
    const vue = await jouer([PARADE, FANFARE], () => undefined);
    caseDe(vue, 1).click();
    await repos();
    await ouvrirLecture(vue, "General");
    const couleurs = vue.element("couleurs");
    assert.equal(couleurs.hidden, false);
    for (const [rangee, portee] of [[0, "purple"], [1, "turquoise"]] as const) {
      const poses = pastilles(vue, rangee);
      assert.deepEqual(poses.map(({ style }) => style.getPropertyValue("--teinte")), VALEURS);
      assert.deepEqual(poses.filter(({ ariaPressed }) => ariaPressed === "true").map(({ title }) => title.split(": ")[1]), [portee]);
    }

    (pastilles(vue, 0).find(({ title }) => title.endsWith(": pink")) ?? assert.fail("no pink")).click();
    await repos();
    assert.deepEqual(vue.dernier("colorer"), ["parade", "onglet", "pink"]);
    (pastilles(vue, 1).find(({ title }) => title.endsWith(": orange")) ?? assert.fail("pas d'orange")).click();
    await repos();
    assert.deepEqual(vue.dernier("colorer"), ["parade", "accent", "orange"]);

    // Le fichier l'a pris : la case et l'espace changent tout de suite.
    const repeinte = { ...PARADE, couleurs: { onglet: "#f28cbf", accent: "#f2994a" } };
    vue.dire("surConfiguration", pourLaBarre({ chemin: "/tmp/app.json", projets: [repeinte, FANFARE], hotes: ["box"] }), []);
    await repos();
    assert.equal(caseDe(vue, 1).style.getPropertyValue("--teinte"), "#f28cbf");
    assert.equal(accent(), "#f2994a");
    assert.deepEqual(pastilles(vue, 0).filter(({ ariaPressed }) => ariaPressed === "true").map(({ title }) => title), ["Tab, in the bar: pink"]);
  });

  test("un choix refusé le dit sous les couleurs ; une couleur écrite à la main hors de la palette se montre, sans geste", async () => {
    const vue = await jouer([{ ...PARADE, couleurs: { onglet: "#123456" } }], () => "ce fichier n'a pas pu être écrit : EACCES");
    caseDe(vue, 1).click();
    await repos();
    await ouvrirLecture(vue, "General");
    const propre = pastilles(vue, 0).at(-1);
    assert.equal(propre?.style.getPropertyValue("--teinte"), "#123456");
    assert.equal(propre?.ariaPressed, "true");
    assert.equal(propre?.disabled, true);
    assert.equal(pastilles(vue, 0).length, PALETTE.length + 1);
    assert.equal(pastilles(vue, 1).length, PALETTE.length);

    pastilles(vue, 1)[0]?.click();
    await repos();
    assert.ok(vue.element("couleurs").dessous("p").some(({ textContent, className }) => className === "refus" && textContent === "ce fichier n'a pas pu être écrit : EACCES"));
  });

  test("la vue ne pose que deux variables — l'accent et la teinte d'un projet — et aucune règle d'état ne les nomme", () => {
    const source = readFileSync(join(VUE, "vue.js"), "utf8");
    assert.deepEqual([...new Set([...source.matchAll(/(?:setProperty|removeProperty)\("(--[a-z-]+)"/g)].map(([, nom]) => nom))].sort(), ["--accent", "--teinte"]);
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, tete = "", corps = ""] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/data-ton|\.pastille|data-etat|data-verdict|\.refus|\.alerte/.test(tete)) continue;
      assert.doesNotMatch(corps, /var\(--(accent|teinte)\)/, `${tete.trim()} nomme une couleur de projet`);
    }
  });
});
