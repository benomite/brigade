// La fenêtre rechargée (Cmd+R, #3159) : les pty sont au process principal, la vue repart de zéro. Elle se rouvre sur
// l'écran où le chef était, retrouve chaque second ouvert avec ce qu'il avait écrit, sans en relancer aucun — et celui
// qui ne tourne plus revient quand même, en le disant, avec de quoi le reprendre. Le registre des terminaux est le vrai,
// devant de faux pty ; la vue est jouée deux fois de suite sur le même stockage de session (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";

import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { openTerminals, HELD, type Launch } from "../src/terminals.ts";
import { FakeStorage, type Played, playTheVue, repos } from "./helpers/false-vue.ts";

const PROJECTS = [
  { nom: "parade", dossier: "/tmp/parade" },
  { nom: "fanfare", dossier: "/tmp/fanfare" },
];
const NOT_ATTACHED = "the second was not running when the window reloaded: it could not be reattached — resume it";

type FakePty = Launch & { tue: boolean };

// Le process principal : le vrai registre, de faux pty, et ce qu'il dit à la vue affichée — celle d'avant le
// rechargement, puis celle d'après.
function principal() {
  const launched: FakePty[] = [];
  let shownEntry: Played | undefined;
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(launch) {
      const fake: FakePty = { ...launch, tue: false };
      launched.push(fake);
      return { ecrire: () => {}, redimensionner: () => {}, tuer: () => void (fake.tue = true) };
    },
    surSortie: (id, data) => shownEntry?.dire("surSortie", id, data),
    surEtat: (terminal) => shownEntry?.dire("surEtat", terminal),
  });
  const project = (name: string) => {
    const finds = PROJECTS.find((candidate) => candidate.nom === name);
    assert.ok(finds, `pas de projet ${name}`);
    return finds;
  };
  const startup = () => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: PROJECTS }, () => true),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: {},
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    });
  // Une fenêtre : sa vue, jouée sur le stockage de session de la fenêtre.
  async function window(session: FakeStorage): Promise<Played> {
    shownEntry = undefined;
    const vue = await playTheVue(
      {
        demarrage: startup,
        espace: (name) => terminals.espace(project(name)),
        terminauxOuverts: () => terminals.ouverts(),
        ecrire: (id, data) => terminals.ecrire(id, data),
      },
      { session },
    );
    shownEntry = vue;
    return vue;
  }
  // Le pty du second d'un projet, le dernier lancé.
  const ptyOf = (name: string): FakePty => {
    const fake = launched.findLast(({ dossier: folder }) => folder === project(name).dossier);
    assert.ok(fake, `aucun pty lancé pour ${name}`);
    return fake;
  };
  return { terminaux: terminals, lances: launched, fenetre: window, ptyDe: ptyOf, demarrage: startup };
}

// Un clic sur le projet, dans la barre — la première case est « Tous les projets ».
async function openTheProject(vue: Played, name: string): Promise<void> {
  const rank = PROJECTS.findIndex((candidate) => candidate.nom === name) + 1;
  vue.element("projets").children[rank]?.click();
  await repos();
}

// Ce qu'a reçu le terminal de la vue qui a reçu ce texte.
const xtermWhoA = (vue: Played, text: string) => vue.xterms.find(({ ecrits: writtenOnes }) => writtenOnes.join("").includes(text));

describe("la fenêtre rechargée (#3159)", () => {
  test("la vue se rouvre sur le projet ouvert, chaque second retrouve ce qu'il avait écrit, et rien n'est relancé", async () => {
    const { lances: launched, fenetre: window, ptyDe: ptyOf } = principal();
    const session = new FakeStorage();
    const before = await window(session);
    await openTheProject(before, "parade");
    await openTheProject(before, "fanfare");
    ptyOf("parade").surSortie("parade: the plan is ready\r\n");
    ptyOf("fanfare").surSortie("fanfare: writing the answer, part 1");
    assert.equal(launched.length, 2);

    const after = await window(session);

    // Le même écran : le projet fanfare, son entrée marquée dans la barre, son espace demandé — sans rien lancer.
    assert.equal(after.element("projets").children[2]?.ariaCurrent, "true");
    assert.equal(after.element("projets").children[0]?.ariaCurrent, "false");
    assert.deepEqual(after.dernier("espace"), ["fanfare"]);
    assert.equal(launched.length, 2, "aucun second n'est lancé deux fois");
    assert.ok(launched.every(({ tue: kills }) => !kills), "aucun second n'est arrêté");
    // Chaque second, celui du projet montré comme l'autre, a retrouvé son onglet et ce qu'il avait écrit.
    assert.ok(xtermWhoA(after, "parade: the plan is ready"));
    const fanfare = xtermWhoA(after, "fanfare: writing the answer, part 1");
    assert.ok(fanfare);
    // La réponse en cours d'écriture continue, à la suite, dans le même terminal — une seule fois.
    ptyOf("fanfare").surSortie(", part 2");
    assert.equal(fanfare.ecrits.join(""), "fanfare: writing the answer, part 1, part 2");
    assert.equal(after.xterms.filter(({ ecrits: writtenOnes }) => writtenOnes.join("").includes("part 1")).length, 1);
  });

  test("un second qui ne tourne plus revient quand même : une ligne le dit, et « resume » le reprend sur son fil", async () => {
    const { lances: launched, fenetre: window, ptyDe: ptyOf } = principal();
    const session = new FakeStorage();
    const before = await window(session);
    await openTheProject(before, "parade");
    ptyOf("parade").surSortie("parade: earlier conversation\r\n");
    ptyOf("parade").surFin(0);

    const after = await window(session);

    const note = after.element("note-second");
    assert.equal(note.textContent, `${NOT_ATTACHED} resume`);
    assert.ok(xtermWhoA(after, "parade: earlier conversation"), "son onglet garde ce qu'il avait écrit");
    const resume = note.dessous("button").find(({ textContent }) => textContent === "resume");
    assert.ok(resume);
    resume.click();
    await repos();
    assert.equal(launched.length, 2);
    assert.deepEqual(launched[1]?.args.slice(0, 1), ["--continue"]);
    assert.deepEqual(note.dessous("button"), [], "repris, le second n'a plus de bouton");
    assert.match(note.textContent, /^thread resumed/);
  });

  test("les terminaux ouverts illisibles : la vue s'ouvre quand même, sur son écran, et le second revient avec son projet", async () => {
    const { terminaux: terminals, lances: launched } = principal();
    terminals.espace(PROJECTS[0] as (typeof PROJECTS)[number]);
    const session = new FakeStorage();
    session.setItem("brigade.ecran", JSON.stringify({ projet: "parade" }));

    const vue = await playTheVue({ demarrage: principal().demarrage, espace: () => terminals.espace(PROJECTS[0] as (typeof PROJECTS)[number]), terminauxOuverts: () => Promise.reject(new Error("ipc")) }, { session });

    assert.equal(vue.element("projets").children[1]?.ariaCurrent, "true");
    assert.equal(launched.length, 1, "le second n'est pas relancé");
    assert.equal(vue.xterms.length, 1);
  });

  test("relancée, l'app s'ouvre sur l'accueil ; un écran retenu illisible, ou dont le projet a quitté le fichier, aussi", async () => {
    for (const retained of [undefined, "{pas du json", JSON.stringify({ projet: "retire" })]) {
      const session = new FakeStorage();
      if (retained !== undefined) session.setItem("brigade.ecran", retained);
      const vue = await principal().fenetre(session);
      assert.equal(vue.element("projets").children[0]?.ariaCurrent, "true", String(retained));
      assert.equal(vue.appels.filter(({ geste: action }) => action === "espace").length, 0);
    }
  });
});

describe("ce que le registre rend à une vue rechargée (#3159)", () => {
  const registry = () => {
    const launched: Launch[] = [];
    const terminals = openTerminals({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty: (launch) => (launched.push(launch), { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} }),
      surSortie: () => {},
      surEtat: () => {},
    });
    return { terminaux: terminals, lances: launched };
  };

  test("chaque terminal ouvert, de chaque projet, tel quel : un second qui tourne n'est ni relancé ni annoté", () => {
    const { terminaux: terminals, lances: launched } = registry();
    const [parade] = terminals.espace(PROJECTS[0] as (typeof PROJECTS)[number]);
    terminals.espace(PROJECTS[1] as (typeof PROJECTS)[number]);
    launched[0]?.surSortie("bonjour");

    const openOnes = terminals.ouverts();

    assert.deepEqual(
      openOnes.map(({ terminal, ecrit: written }) => [terminal.projet, terminal.genre, terminal.arrete, terminal.aReprendre, written]),
      [
        ["parade", "second", false, undefined, "bonjour"],
        ["fanfare", "second", false, undefined, ""],
      ],
    );
    assert.equal(openOnes[0]?.terminal.note, parade?.note);
    assert.equal(launched.length, 2);
  });

  test("ce qu'il garde est borné : la fin, à partir d'un début de ligne", () => {
    const { terminaux: terminals, lances: launched } = registry();
    terminals.espace(PROJECTS[0] as (typeof PROJECTS)[number]);
    const line = `${"x".repeat(999)}\n`;
    for (let rank = 0; rank < (3 * HELD) / line.length; rank++) launched[0]?.surSortie(line);
    launched[0]?.surSortie("la fin");

    const { ecrit: written } = terminals.ouverts()[0] ?? { ecrit: "" };

    assert.ok(written.length <= HELD);
    assert.ok(written.startsWith("x".repeat(999)));
    assert.ok(written.endsWith(`${line}la fin`));
  });
});
