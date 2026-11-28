// La fenêtre rechargée (Cmd+R, #3159) : les pty sont au process principal, la vue repart de zéro. Elle se rouvre sur
// l'écran où le chef était, retrouve chaque second ouvert avec ce qu'il avait écrit, sans en relancer aucun — et celui
// qui ne tourne plus revient quand même, en le disant, avec de quoi le reprendre. Le registre des terminaux est le vrai,
// devant de faux pty ; la vue est jouée deux fois de suite sur le même stockage de session (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { openTerminals, HELD, type Launch } from "../src/terminals.ts";
import { type Played, repos } from "./helpers/false-vue.ts";

const PROJECTS = [
  { nom: "parade", dossier: "/tmp/parade" },
  { nom: "fanfare", dossier: "/tmp/fanfare" },
];
const NOT_ATTACHED = "the second was not running when the window reloaded: it could not be reattached — resume it";

type FakePty = Launch & { tue: boolean };


// Un clic sur le projet, dans la barre — la première case est « Tous les projets ».
async function openTheProject(vue: Played, name: string): Promise<void> {
  const rank = PROJECTS.findIndex((candidate) => candidate.nom === name) + 1;
  vue.element("projets").children[rank]?.click();
  await repos();
}

// Ce qu'a reçu le terminal de la vue qui a reçu ce texte.
const xtermWhoA = (vue: Played, text: string) => vue.xterms.find(({ ecrits: writtenOnes }) => writtenOnes.join("").includes(text));

describe("la fenêtre rechargée (#3159)", () => {



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
