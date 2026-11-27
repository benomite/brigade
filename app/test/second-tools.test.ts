// L'onglet Second n'est jamais muet (#1435) : un lancement refusé se dit en une phrase.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { openTerminals, type Launch, type Terminal } from "../src/terminals.ts";

const PROJECT = { nom: "brigade", dossier: import.meta.dirname };

function registry(open?: (launch: Launch) => void) {
  const launched: Launch[] = [];
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty: (launch) => {
      open?.(launch);
      launched.push(launch);
      return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: () => {},
    // Le second est prêt à partir : `claude` est là.
    planDuSecond: (folder, args) => ({ state: "ready", launch: { command: "/usr/bin/claude", args: [...args], verbatim: false, folder, env: {} }, missing: [], tools: [] }),
  });
  return { terminaux: terminals, lances: launched };
}
const secondOf = (terminals: Terminal[]) => terminals.find(({ genre: kind }) => kind === "second") ?? assert.fail("pas de second");

describe("l'onglet Second dit pourquoi le second ne part pas", () => {
  test("un lancement refusé — le pty ne s'ouvre pas — se dit en une phrase : jamais un onglet muet", () => {
    const { terminaux: terminals } = registry(() => {
      throw new Error("posix_spawnp failed.");
    });
    const second = secondOf(terminals.espace(PROJECT));

    assert.equal(second.arrete, true);
    assert.equal(second.note, "The second cannot start: launching /usr/bin/claude failed (posix_spawnp failed).");
    assert.deepEqual(second.empeche, { reason: second.note, tools: [] });
  });
});
