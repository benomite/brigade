// Le second part comme le runtime le dit (#1433), et l'onglet Second n'est jamais muet (#1435) : sans `claude`, il ne
// part pas, et dit pourquoi en une phrase, chaque outil qui manque nommé avec ce qui l'obtient ; sans `gh`, il part, et
// le dit à côté ; un lancement refusé se dit aussi. Les plans sont ceux du runtime même (`planDuSecond`), sur un poste
// dont les fichiers sont simulés : ce que l'app relaie est ce qu'elle recevra.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { planDuSecond } from "../../runtime/src/second/lancement.ts";
import { openTerminals, type Launch, type Terminal } from "../src/terminals.ts";

const PROJECT = { nom: "brigade", dossier: import.meta.dirname };
const files = (...presents: string[]) => (path: string) => presents.includes(path);
const LINUX = { plateforme: "linux" as const, env: { PATH: "/usr/bin" }, maison: "/home/chef" };

function registry(exists: (path: string) => boolean, open?: (launch: Launch) => void) {
  const launched: Launch[] = [];
  const states: Terminal[] = [];
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty: (launch) => {
      open?.(launch);
      launched.push(launch);
      return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: (terminal) => void states.push(terminal),
    planDuSecond: (folder, args) => planDuSecond({ ...LINUX, existe: plan.existe, folder: folder, args }),
  });
  const plan = { existe: exists };
  return { terminaux: terminals, lances: launched, etats: states, plan };
}
const secondOf = (terminals: Terminal[]) => terminals.find(({ genre: kind }) => kind === "second") ?? assert.fail("pas de second");

describe("l'onglet Second dit pourquoi le second ne part pas, et ce qui lui manque", () => {
  test("sans `claude` : rien n'est lancé, la note dit pourquoi, chaque outil absent est nommé avec ce qui l'obtient", () => {
    const { terminaux: terminals, lances: launched } = registry(files("/usr/bin/git"));
    const second = secondOf(terminals.espace(PROJECT));

    assert.equal(launched.length, 0);
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
    assert.deepEqual([...terminals.pagesDesOutils()].sort(), ["https://code.claude.com/docs/en/setup", "https://github.com/cli/cli#installation"]);
  });

  test("« try again », les outils installés : le plan est refait, le second part, et la colonne n'en dit plus rien", () => {
    const { terminaux: terminals, lances: launched, plan, etats: states } = registry(files());
    const second = secondOf(terminals.espace(PROJECT));
    assert.ok(second.empeche !== undefined);

    plan.existe = files("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git");
    terminals.ecrire(second.id, "");

    assert.equal(launched.length, 1);
    assert.equal(launched[0]?.commande, "/usr/bin/claude");
    const resumed = states.at(-1) ?? assert.fail("aucun état rendu");
    assert.equal(resumed.arrete, false);
    assert.equal(resumed.empeche, undefined);
    assert.equal(resumed.manque, undefined);
    assert.deepEqual([...terminals.pagesDesOutils()], []);
  });

  test("sans `gh` : le second part, et dit à côté ce qui échouera, avec ce qui obtient `gh`", () => {
    const { terminaux: terminals, lances: launched } = registry(files("/usr/bin/claude", "/usr/bin/git"));
    const second = secondOf(terminals.espace(PROJECT));

    assert.equal(launched.length, 1);
    assert.equal(second.empeche, undefined);
    assert.match(second.manque?.reason ?? "", /^The second starts, but the GitHub CLI is missing on this computer/);
    assert.deepEqual(second.manque?.tools.map(({ tool }) => tool), ["gh"]);
  });

  test("un lancement refusé — le pty ne s'ouvre pas — se dit en une phrase : jamais un onglet muet", () => {
    const { terminaux: terminals } = registry(files("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git"), () => {
      throw new Error("posix_spawnp failed.");
    });
    const second = secondOf(terminals.espace(PROJECT));

    assert.equal(second.arrete, true);
    assert.equal(second.note, "The second cannot start: launching /usr/bin/claude failed (posix_spawnp failed).");
    assert.deepEqual(second.empeche, { reason: second.note, tools: [] });
  });
});
