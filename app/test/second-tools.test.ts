// Le second part comme le runtime le dit (#1433), et l'onglet Second n'est jamais muet (#1435) : sans `claude`, il ne
// part pas, et dit pourquoi en une phrase, chaque outil qui manque nommé avec ce qui l'obtient ; sans `gh`, il part, et
// le dit à côté ; un lancement refusé se dit aussi. Les plans sont ceux du runtime même (`planDuSecond`), sur un poste
// dont les fichiers sont simulés : ce que l'app relaie est ce qu'elle recevra.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { planDuSecond } from "../../runtime/src/second/lancement.ts";
import { ouvrirTerminaux, type Launch, type Terminal } from "../src/terminaux.ts";

const PROJECT = { nom: "brigade", dossier: import.meta.dirname };
const fichiers = (...presents: string[]) => (chemin: string) => presents.includes(chemin);
const LINUX = { plateforme: "linux" as const, env: { PATH: "/usr/bin" }, maison: "/home/chef" };

function registry(existe: (chemin: string) => boolean, ouvrir?: (launch: Launch) => void) {
  const lances: Launch[] = [];
  const states: Terminal[] = [];
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty: (launch) => {
      ouvrir?.(launch);
      lances.push(launch);
      return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: (terminal) => void states.push(terminal),
    planDuSecond: (dossier, args) => planDuSecond({ ...LINUX, existe: plan.existe, folder: dossier, args }),
  });
  const plan = { existe };
  return { terminaux, lances, etats: states, plan };
}
const secondDe = (terminaux: Terminal[]) => terminaux.find(({ genre }) => genre === "second") ?? assert.fail("pas de second");

describe("l'onglet Second dit pourquoi le second ne part pas, et ce qui lui manque", () => {
  test("sans `claude` : rien n'est lancé, la note dit pourquoi, chaque outil absent est nommé avec ce qui l'obtient", () => {
    const { terminaux, lances } = registry(fichiers("/usr/bin/git"));
    const second = secondDe(terminaux.espace(PROJECT));

    assert.equal(lances.length, 0);
    assert.equal(second.arrete, true);
    assert.equal(second.note, "The second cannot start: Claude Code is missing on this computer.");
    assert.deepEqual(
      second.empeche?.tools.map(({ tool }) => tool),
      ["claude", "gh"],
    );
    const claude = second.empeche?.tools[0];
    assert.match(claude?.install ?? "", /^Install Claude Code by running `curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash` in a terminal/);
    assert.equal(claude?.link, "https://code.claude.com/docs/en/setup");
    // Seules les pages nommées s'ouvrent depuis la colonne.
    assert.deepEqual([...terminaux.pagesDesOutils()].sort(), ["https://code.claude.com/docs/en/setup", "https://github.com/cli/cli#installation"]);
  });

  test("« try again », les outils installés : le plan est refait, le second part, et la colonne n'en dit plus rien", () => {
    const { terminaux, lances, plan, etats: states } = registry(fichiers());
    const second = secondDe(terminaux.espace(PROJECT));
    assert.ok(second.empeche !== undefined);

    plan.existe = fichiers("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git");
    terminaux.ecrire(second.id, "");

    assert.equal(lances.length, 1);
    assert.equal(lances[0]?.commande, "/usr/bin/claude");
    const repris = states.at(-1) ?? assert.fail("aucun état rendu");
    assert.equal(repris.arrete, false);
    assert.equal(repris.empeche, undefined);
    assert.equal(repris.manque, undefined);
    assert.deepEqual([...terminaux.pagesDesOutils()], []);
  });

  test("sans `gh` : le second part, et dit à côté ce qui échouera, avec ce qui obtient `gh`", () => {
    const { terminaux, lances } = registry(fichiers("/usr/bin/claude", "/usr/bin/git"));
    const second = secondDe(terminaux.espace(PROJECT));

    assert.equal(lances.length, 1);
    assert.equal(second.empeche, undefined);
    assert.match(second.manque?.reason ?? "", /^The second starts, but the GitHub CLI is missing on this computer/);
    assert.deepEqual(second.manque?.tools.map(({ tool }) => tool), ["gh"]);
  });

  test("un lancement refusé — le pty ne s'ouvre pas — se dit en une phrase : jamais un onglet muet", () => {
    const { terminaux } = registry(fichiers("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git"), () => {
      throw new Error("posix_spawnp failed.");
    });
    const second = secondDe(terminaux.espace(PROJECT));

    assert.equal(second.arrete, true);
    assert.equal(second.note, "The second cannot start: launching /usr/bin/claude failed (posix_spawnp failed).");
    assert.deepEqual(second.empeche, { reason: second.note, tools: [] });
  });
});
