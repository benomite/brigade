// La fenêtre rechargée (Cmd+R, #3159) : les pty sont au process principal, la vue repart de zéro. Elle se rouvre sur
// l'écran où le chef était, retrouve chaque second ouvert avec ce qu'il avait écrit, sans en relancer aucun — et celui
// qui ne tourne plus revient quand même, en le disant, avec de quoi le reprendre. Le registre des terminaux est le vrai,
// devant de faux pty ; la vue est jouée deux fois de suite sur le même stockage de session (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ouvrirTerminaux, RETENU, type Lancement } from "../src/terminaux.ts";
import { FauxStockage, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const PROJETS = [
  { nom: "parade", dossier: "/tmp/parade" },
  { nom: "fanfare", dossier: "/tmp/fanfare" },
];
const NON_RATTACHE = "the second was not running when the window reloaded: it could not be reattached — resume it";

type FauxPty = Lancement & { tue: boolean };

// Le process principal : le vrai registre, de faux pty, et ce qu'il dit à la vue affichée — celle d'avant le
// rechargement, puis celle d'après.
function principal() {
  const lances: FauxPty[] = [];
  let affichee: Jouee | undefined;
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(lancement) {
      const faux: FauxPty = { ...lancement, tue: false };
      lances.push(faux);
      return { ecrire: () => {}, redimensionner: () => {}, tuer: () => void (faux.tue = true) };
    },
    surSortie: (id, donnees) => affichee?.dire("surSortie", id, donnees),
    surEtat: (terminal) => affichee?.dire("surEtat", terminal),
  });
  const projet = (nom: string) => {
    const trouve = PROJETS.find((candidat) => candidat.nom === nom);
    assert.ok(trouve, `pas de projet ${nom}`);
    return trouve;
  };
  const demarrage = () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS }, () => true),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
  });
  // Une fenêtre : sa vue, jouée sur le stockage de session de la fenêtre.
  async function fenetre(session: FauxStockage): Promise<Jouee> {
    affichee = undefined;
    const vue = await jouerLaVue(
      {
        demarrage,
        espace: (nom) => terminaux.espace(projet(nom)),
        terminauxOuverts: () => terminaux.ouverts(),
        ecrire: (id, donnees) => terminaux.ecrire(id, donnees),
      },
      { session },
    );
    affichee = vue;
    return vue;
  }
  // Le pty du second d'un projet, le dernier lancé.
  const ptyDe = (nom: string): FauxPty => {
    const faux = lances.findLast(({ dossier }) => dossier === projet(nom).dossier);
    assert.ok(faux, `aucun pty lancé pour ${nom}`);
    return faux;
  };
  return { terminaux, lances, fenetre, ptyDe, demarrage };
}

// Un clic sur le projet, dans la barre — la première case est « Tous les projets ».
async function ouvrirLeProjet(vue: Jouee, nom: string): Promise<void> {
  const rang = PROJETS.findIndex((candidat) => candidat.nom === nom) + 1;
  vue.element("projets").children[rang]?.click();
  await repos();
}

// Ce qu'a reçu le terminal de la vue qui a reçu ce texte.
const xtermQuiA = (vue: Jouee, texte: string) => vue.xterms.find(({ ecrits }) => ecrits.join("").includes(texte));

describe("la fenêtre rechargée (#3159)", () => {
  test("la vue se rouvre sur le projet ouvert, chaque second retrouve ce qu'il avait écrit, et rien n'est relancé", async () => {
    const { lances, fenetre, ptyDe } = principal();
    const session = new FauxStockage();
    const avant = await fenetre(session);
    await ouvrirLeProjet(avant, "parade");
    await ouvrirLeProjet(avant, "fanfare");
    ptyDe("parade").surSortie("parade: the plan is ready\r\n");
    ptyDe("fanfare").surSortie("fanfare: writing the answer, part 1");
    assert.equal(lances.length, 2);

    const apres = await fenetre(session);

    // Le même écran : le projet fanfare, son entrée marquée dans la barre, son espace demandé — sans rien lancer.
    assert.equal(apres.element("projets").children[2]?.ariaCurrent, "true");
    assert.equal(apres.element("projets").children[0]?.ariaCurrent, "false");
    assert.deepEqual(apres.dernier("espace"), ["fanfare"]);
    assert.equal(lances.length, 2, "aucun second n'est lancé deux fois");
    assert.ok(lances.every(({ tue }) => !tue), "aucun second n'est arrêté");
    // Chaque second, celui du projet montré comme l'autre, a retrouvé son onglet et ce qu'il avait écrit.
    assert.ok(xtermQuiA(apres, "parade: the plan is ready"));
    const fanfare = xtermQuiA(apres, "fanfare: writing the answer, part 1");
    assert.ok(fanfare);
    // La réponse en cours d'écriture continue, à la suite, dans le même terminal — une seule fois.
    ptyDe("fanfare").surSortie(", part 2");
    assert.equal(fanfare.ecrits.join(""), "fanfare: writing the answer, part 1, part 2");
    assert.equal(apres.xterms.filter(({ ecrits }) => ecrits.join("").includes("part 1")).length, 1);
  });

  test("un second qui ne tourne plus revient quand même : une ligne le dit, et « resume » le reprend sur son fil", async () => {
    const { lances, fenetre, ptyDe } = principal();
    const session = new FauxStockage();
    const avant = await fenetre(session);
    await ouvrirLeProjet(avant, "parade");
    ptyDe("parade").surSortie("parade: earlier conversation\r\n");
    ptyDe("parade").surFin(0);

    const apres = await fenetre(session);

    const note = apres.element("note-second");
    assert.equal(note.textContent, `${NON_RATTACHE} resume`);
    assert.ok(xtermQuiA(apres, "parade: earlier conversation"), "son onglet garde ce qu'il avait écrit");
    const reprendre = note.dessous("button").find(({ textContent }) => textContent === "resume");
    assert.ok(reprendre);
    reprendre.click();
    await repos();
    assert.equal(lances.length, 2);
    assert.deepEqual(lances[1]?.args.slice(0, 1), ["--continue"]);
    assert.deepEqual(note.dessous("button"), [], "repris, le second n'a plus de bouton");
    assert.match(note.textContent, /^thread resumed/);
  });

  test("les terminaux ouverts illisibles : la vue s'ouvre quand même, sur son écran, et le second revient avec son projet", async () => {
    const { terminaux, lances } = principal();
    terminaux.espace(PROJETS[0] as (typeof PROJETS)[number]);
    const session = new FauxStockage();
    session.setItem("brigade.ecran", JSON.stringify({ projet: "parade" }));

    const vue = await jouerLaVue({ demarrage: principal().demarrage, espace: () => terminaux.espace(PROJETS[0] as (typeof PROJETS)[number]), terminauxOuverts: () => Promise.reject(new Error("ipc")) }, { session });

    assert.equal(vue.element("projets").children[1]?.ariaCurrent, "true");
    assert.equal(lances.length, 1, "le second n'est pas relancé");
    assert.equal(vue.xterms.length, 1);
  });

  test("relancée, l'app s'ouvre sur l'accueil ; un écran retenu illisible, ou dont le projet a quitté le fichier, aussi", async () => {
    for (const retenu of [undefined, "{pas du json", JSON.stringify({ projet: "retire" })]) {
      const session = new FauxStockage();
      if (retenu !== undefined) session.setItem("brigade.ecran", retenu);
      const vue = await principal().fenetre(session);
      assert.equal(vue.element("projets").children[0]?.ariaCurrent, "true", String(retenu));
      assert.equal(vue.appels.filter(({ geste }) => geste === "espace").length, 0);
    }
  });
});

describe("ce que le registre rend à une vue rechargée (#3159)", () => {
  const registre = () => {
    const lances: Lancement[] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty: (lancement) => (lances.push(lancement), { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} }),
      surSortie: () => {},
      surEtat: () => {},
    });
    return { terminaux, lances };
  };

  test("chaque terminal ouvert, de chaque projet, tel quel : un second qui tourne n'est ni relancé ni annoté", () => {
    const { terminaux, lances } = registre();
    const [parade] = terminaux.espace(PROJETS[0] as (typeof PROJETS)[number]);
    terminaux.espace(PROJETS[1] as (typeof PROJETS)[number]);
    lances[0]?.surSortie("bonjour");

    const ouverts = terminaux.ouverts();

    assert.deepEqual(
      ouverts.map(({ terminal, ecrit }) => [terminal.projet, terminal.genre, terminal.arrete, terminal.aReprendre, ecrit]),
      [
        ["parade", "second", false, undefined, "bonjour"],
        ["fanfare", "second", false, undefined, ""],
      ],
    );
    assert.equal(ouverts[0]?.terminal.note, parade?.note);
    assert.equal(lances.length, 2);
  });

  test("ce qu'il garde est borné : la fin, à partir d'un début de ligne", () => {
    const { terminaux, lances } = registre();
    terminaux.espace(PROJETS[0] as (typeof PROJETS)[number]);
    const ligne = `${"x".repeat(999)}\n`;
    for (let rang = 0; rang < (3 * RETENU) / ligne.length; rang++) lances[0]?.surSortie(ligne);
    lances[0]?.surSortie("la fin");

    const { ecrit } = terminaux.ouverts()[0] ?? { ecrit: "" };

    assert.ok(ecrit.length <= RETENU);
    assert.ok(ecrit.startsWith("x".repeat(999)));
    assert.ok(ecrit.endsWith(`${ligne}la fin`));
  });
});
