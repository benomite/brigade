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
import { ajouterProjet, changerCouleur, colorerProjets, EXEMPLE, lireConfiguration, type Projet } from "../src/config.ts";
import { choix, couleursLues, DISTINCTES, ecart, ecartLab, ETATS, PALETTE, PROCHES, proches, ROLES, tirer } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
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

// La luminance relative d'une couleur `#rrggbb`, et le contraste de deux (WCAG 2) : de quoi dire
// qu'une teinte se lit sur le fond sombre, et sous le texte foncé d'une case choisie.
const luminance = (couleur: string) => {
  const [r = 0, v = 0, b = 0] = [1, 3, 5].map((rang) => Number.parseInt(couleur.slice(rang, rang + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
};
const contraste = (une: string, autre: string) => {
  const [claire, sombre] = [luminance(une), luminance(autre)].sort((a, b) => b - a) as [number, number];
  return (claire + 0.05) / (sombre + 0.05);
};

describe("la palette", () => {
  const jetons = jetonsDe(readFileSync(join(VUE, "jetons.css"), "utf8"));

  test("l'écart est celui de CIEDE2000 : les paires de référence de Sharma, Wu et Dalal (2005), à 10⁻⁴ près", () => {
    const paires: [[number, number, number], [number, number, number], number][] = [
      [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
      [[50, 0, 0], [50, -1, 2], 2.3669],
      [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
      [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
      [[50, 2.5, 0], [73, 25, -18], 27.1492],
      [[50, 2.5, 0], [61, -5, 29], 22.8977],
      [[50, 2.5, 0], [56, -27, -3], 31.903],
      [[50, 2.5, 0], [58, 24, 15], 19.4535],
      [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
      [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
      [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
    ];
    for (const [une, autre, attendu] of paires) {
      assert.equal(Number(ecartLab(une, autre).toFixed(4)), attendu, `${une} — ${autre}`);
      assert.equal(Number(ecartLab(autre, une).toFixed(4)), attendu, `${autre} — ${une}`);
    }
    assert.equal(ecart("#A98CF2", "#a98cf2"), 0);
  });

  test("les couleurs d'état mesurées sont celles de la peau, et le fond est celui de l'app", () => {
    const parNom: Record<string, string> = { green: "--vert", yellow: "--jaune", red: "--rouge", blue: "--bleu", gray: "--gris" };
    assert.deepEqual(
      ETATS.map(({ nom, valeur }) => [nom, valeur]),
      Object.entries(parNom).map(([nom, jeton]) => [nom, jetons.get(jeton)]),
    );
    assert.equal(jetons.get("--fond"), "#121418");
  });

  test(`au moins seize teintes, deux à deux à ΔE ≥ ${DISTINCTES}, et chacune à ΔE ≥ ${DISTINCTES} de chaque couleur d'état`, () => {
    assert.ok(PALETTE.length >= 16, `${PALETTE.length} teintes`);
    const trop: string[] = [];
    for (const [rang, une] of PALETTE.entries()) {
      for (const autre of PALETTE.slice(rang + 1)) if (ecart(une.valeur, autre.valeur) < DISTINCTES) trop.push(`${une.nom} — ${autre.nom} : ${ecart(une.valeur, autre.valeur).toFixed(1)}`);
      for (const etat of ETATS) if (ecart(une.valeur, etat.valeur) < DISTINCTES) trop.push(`${une.nom} — ${etat.nom} (état) : ${ecart(une.valeur, etat.valeur).toFixed(1)}`);
    }
    assert.deepEqual(trop, []);
  });

  test("chaque teinte se lit sur le fond sombre de la peau, et sous le texte foncé d'une case choisie", () => {
    const fond = jetons.get("--fond") ?? assert.fail("pas de --fond");
    for (const { nom, valeur } of PALETTE) assert.ok(contraste(valeur, fond) >= 4.5, `${nom} : ${contraste(valeur, fond).toFixed(2)}`);
  });

  test("aucune couleur de projet n'est une couleur d'état de la peau : une alerte se lit pareil partout", () => {
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

  test("la vue nomme un rôle, et une couleur de la palette par son nom ou une couleur libre `#rrggbb` : rien d'autre ne s'écrit depuis elle", () => {
    assert.deepEqual(choix("onglet", "purple"), { role: "onglet", valeur: "#a98cf2" });
    assert.deepEqual(choix("accent", "orange"), { role: "accent", valeur: "#f2994a" });
    assert.deepEqual(choix("onglet", "#12AB56"), { role: "onglet", valeur: "#12ab56" });
    assert.match((choix("fond", "violet") as { refus: string }).refus, /^“fond” is not a project color: onglet or accent/);
    assert.match((choix("onglet", "violet") as { refus: string }).refus, /^“violet” is neither in the palette \(orange, .*\) nor a color written `#rrggbb`/);
    assert.match((choix("onglet", "#fff") as { refus: string }).refus, /^“#fff” is neither in the palette/);
  });

  test(`une couleur libre à ΔE < ${PROCHES} d'une couleur d'état ou de celle d'un autre projet se le voit dire, en nommant laquelle — et reste`, () => {
    const fanfare = { nom: "fanfare", couleurs: { onglet: "#3c5a8f", accent: "#f2994a" } };
    // Près du vert d'état, sur l'onglet ; près de l'onglet de fanfare, sur l'accent.
    const parade = { nom: "parade", couleurs: { onglet: "#70c08c", accent: "#3e5d92" } };
    assert.ok(ecart("#70c08c", "#6cc28a") < PROCHES && ecart("#3e5d92", "#3c5a8f") < PROCHES);
    assert.deepEqual(proches(parade, [parade, fanfare]), { onglet: "close to green, a state color — kept anyway", accent: "close to the tab of fanfare — kept anyway" });
    // La plus proche est nommée : le jaune, plutôt que l'accent d'un autre un peu plus loin.
    const jaune = { nom: "parade", couleurs: { onglet: "#e8c56c" } };
    assert.deepEqual(proches(jaune, [jaune, { nom: "cantine", couleurs: { accent: "#e5c070" } }]), { onglet: "close to yellow, a state color — kept anyway" });
    // Loin de tout : rien à dire. Une teinte de la palette n'en dit rien, même portée par un autre.
    assert.equal(proches({ nom: "parade", couleurs: { onglet: "#123456", accent: "#ffffff" } }, [fanfare]), undefined);
    assert.equal(proches({ nom: "parade", couleurs: { onglet: "#f2994a" } }, [fanfare]), undefined);
    // Ses propres couleurs ne comptent pas : un projet n'est pas trop près de lui-même.
    assert.equal(proches({ nom: "fanfare", couleurs: { onglet: "#3c5a8f", accent: "#3e5d92" } }, [fanfare]), undefined);
    assert.equal(proches({ nom: "nue" }, [fanfare]), undefined);
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
    const { racine, chemin } = fichier(t, { note: "à moi", projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }, { nom: "c", dossier: "/", couleurs: { onglet: VALEURS[0], inconnue: "gardée" } }] });

    assert.equal(colorerProjets(chemin, racine, toujours(0)), undefined);

    const ecrit = lu(chemin);
    assert.deepEqual({ ...ecrit, projets: ecrit.projets.map(({ couleurs, ...reste }) => reste) }, { note: "à moi", projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }, { nom: "c", dossier: "/" }] });
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

  test("un nouveau projet reçoit une teinte de la palette qu'aucun projet ne porte, dans aucun rôle, tant qu'il en reste une", (t) => {
    // Quinze teintes déjà portées, en onglet ou en accent : il n'en reste qu'une.
    const portees = VALEURS.slice(0, 15);
    const projets = Array.from({ length: 8 }, (_, rang) => ({ nom: `p${rang}`, dossier: "/", couleurs: { onglet: portees[rang * 2] ?? portees[0], accent: portees[rang * 2 + 1] ?? portees[0] } }));
    const { racine, chemin } = fichier(t, { projets: [...projets, { nom: "neuf", dossier: "/" }] });
    for (const hasard of [0, 0.5, 0.999999]) {
      writeFileSync(chemin, JSON.stringify({ projets: [...projets, { nom: "neuf", dossier: "/" }] }));
      assert.equal(colorerProjets(chemin, racine, toujours(hasard)), undefined);
      assert.deepEqual(lu(chemin).projets.at(-1)?.couleurs, { onglet: VALEURS[15], accent: VALEURS[15] }, `hasard ${hasard}`);
    }
    // Toutes portées : l'une des moins portées.
    writeFileSync(chemin, JSON.stringify({ projets: [...projets, { nom: "seize", dossier: "/", couleurs: { onglet: VALEURS[15], accent: VALEURS[15] } }, { nom: "neuf", dossier: "/" }] }));
    assert.equal(colorerProjets(chemin, racine, toujours(0)), undefined);
    const tiree = lu(chemin).projets.at(-1)?.couleurs?.onglet ?? "";
    assert.ok(VALEURS.includes(tiree) && tiree !== VALEURS[15], tiree);
  });

  test("les couleurs déjà choisies restent, même hors de la nouvelle palette — tirer celles qui manquent n'y touche pas", (t) => {
    // Celles de l'ancienne palette à sept teintes (turquoise, sand, indigo, orchid) et une écrite à la main.
    const anciennes = [
      { nom: "a", dossier: "/", couleurs: { onglet: "#4fc7b5", accent: "#d9b98a" } },
      { nom: "b", dossier: "/", couleurs: { onglet: "#8a84f0", accent: "#d77ee0" } },
      { nom: "c", dossier: "/", couleurs: { onglet: "#123456" } },
    ];
    const { racine, chemin } = fichier(t, { projets: anciennes });
    assert.equal(colorerProjets(chemin, racine, toujours(0)), undefined);
    const ecrits = lu(chemin).projets;
    assert.deepEqual(ecrits.slice(0, 2), anciennes.slice(0, 2));
    assert.equal(ecrits[2]?.couleurs?.onglet, "#123456");
    assert.equal(ecrits[2]?.couleurs?.accent, VALEURS[0]);
    assert.deepEqual(lireConfiguration(chemin).projets.map(({ couleurs }) => couleurs?.onglet), ["#4fc7b5", "#8a84f0", "#123456"]);
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
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", couleurs: { onglet: "#a98cf2", accent: "#25c0c5" } };
  const FANFARE: Projet = { nom: "fanfare", dossier: "/tmp/fanfare", couleurs: { onglet: "#f28cbf", accent: "#d9b98a" } };
  const NUE: Projet = { nom: "nue", dossier: "/tmp/nue" };
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

  const jouer = (projets: Projet[], colorer?: (projet: string, role: string, couleur: string) => string | undefined) =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
  // Une ligne de réglage par rôle (#1700) : son nom, sa couleur, puis la palette — ses seuls boutons.
  const pastilles = (vue: Jouee, rangee: number) => (vue.element("couleurs").children.filter(({ className }) => className === "reglage")[rangee] ?? assert.fail(`pas de rangée ${rangee}`)).dessous("button");
  const dits = (vue: Jouee) => vue.element("couleurs").dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent);

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
    assert.equal(accent(), "#25c0c5");
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

  test("dans Settings, sous toi, les couleurs se choisissent dans la palette, et le choix se voit dès que le fichier l'a pris", async () => {
    const vue = await jouer([PARADE, FANFARE], () => undefined);
    caseDe(vue, 1).click();
    await repos();
    await ouvrirLecture(vue, "Settings");
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
    vue.dire("surConfiguration", pourLaBarre({ chemin: "/tmp/app.json", projets: [repeinte, FANFARE] }, () => true), []);
    await repos();
    assert.equal(caseDe(vue, 1).style.getPropertyValue("--teinte"), "#f28cbf");
    assert.equal(accent(), "#f2994a");
    assert.deepEqual(pastilles(vue, 0).filter(({ ariaPressed }) => ariaPressed === "true").map(({ title }) => title), ["tab, in the bar: pink"]);
  });

  test("un choix refusé le dit sous les couleurs ; une couleur libre se montre au bout de la palette, pressée, sans geste", async () => {
    const vue = await jouer([{ ...PARADE, couleurs: { onglet: "#123456" } }], () => "ce fichier n'a pas pu être écrit : EACCES");
    caseDe(vue, 1).click();
    await repos();
    await ouvrirLecture(vue, "Settings");
    const propre = pastilles(vue, 0).at(-1);
    assert.equal(propre?.style.getPropertyValue("--teinte"), "#123456");
    assert.equal(propre?.title, "tab, in the bar: #123456, your own color");
    assert.equal(propre?.ariaPressed, "true");
    assert.equal(propre?.disabled, true);
    assert.equal(pastilles(vue, 0).length, PALETTE.length + 1);
    assert.equal(pastilles(vue, 1).length, PALETTE.length);

    pastilles(vue, 1)[0]?.click();
    await repos();
    assert.deepEqual(dits(vue), ["ce fichier n'a pas pu être écrit : EACCES"]);
  });

  test("une couleur libre se choisit au sélecteur, au bout de chaque rangée : elle part telle quelle, `#rrggbb`", async () => {
    const vue = await jouer([PARADE, FANFARE], () => undefined);
    caseDe(vue, 1).click();
    await repos();
    await ouvrirLecture(vue, "Settings");
    const libres = vue.element("couleurs").dessous("input");
    assert.deepEqual(libres.map(({ type, title, value }) => [type, title, value]), [
      ["color", "tab, in the bar: another color…", "#a98cf2"],
      ["color", "accent, in the space: another color…", "#25c0c5"],
    ]);
    assert.deepEqual(vue.element("couleurs").dessous("label").map(({ textContent }) => textContent), ["other…", "other…"]);
    const [onglet, accentLibre] = libres;
    if (onglet === undefined || accentLibre === undefined) assert.fail("pas de sélecteur");
    onglet.value = "#70c08c";
    onglet.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("colorer"), ["parade", "onglet", "#70c08c"]);
    accentLibre.value = "#123456";
    accentLibre.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("colorer"), ["parade", "accent", "#123456"]);
  });

  test("trop proche d'une couleur d'état ou d'un autre projet, une couleur libre reste, et une ligne sous sa rangée dit laquelle", async () => {
    // Le vert d'état à ΔE 1 sur l'onglet, l'onglet de fanfare à ΔE 1 sur l'accent.
    const proche = { ...PARADE, couleurs: { onglet: "#70c08c", accent: "#f08dbe" } };
    const vue = await jouer([proche, FANFARE], () => undefined);
    caseDe(vue, 1).click();
    await repos();
    await ouvrirLecture(vue, "Settings");
    // Chaque avertissement sous la ligne de son rôle.
    assert.deepEqual(
      vue.element("couleurs").children.map((ligne) => ligne.dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent)),
      [["tab, in the bar: close to green, a state color — kept anyway"], ["accent, in the space: close to the tab of fanfare — kept anyway"]],
    );
    // Gardée : pressée au bout de sa rangée, et sur la case de la barre.
    assert.equal(pastilles(vue, 0).at(-1)?.ariaPressed, "true");
    assert.equal(caseDe(vue, 1).style.getPropertyValue("--teinte"), "#70c08c");

    // Une teinte de la palette choisie à sa place : plus rien à dire.
    vue.dire("surConfiguration", pourLaBarre({ chemin: "/tmp/app.json", projets: [{ ...proche, couleurs: { onglet: "#a98cf2", accent: "#f08dbe" } }, FANFARE] }, () => true), []);
    await repos();
    assert.deepEqual(dits(vue), ["accent, in the space: close to the tab of fanfare — kept anyway"]);
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
