// Le second sur un vrai pty, contre un faux `claude` : ce que le registre ne
// peut pas prouver avec de faux pty — le dossier, le terminal, la reprise.
// Aucun test n'attend une durée : chacun attend ce que le faux `claude` écrit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import { openPty } from "../src/pty.ts";
import { ROLE_OF_SECOND } from "../src/second/launch.ts";
import { openTerminals, type Terminal } from "../src/terminals.ts";

const FAKE_CLAUDE = join(import.meta.dirname, "helpers/fake-claude.sh");
// Ce que le faux `claude` dit du rôle qu'il lit : la première ligne du fichier livré avec l'app.
const FIRST_LINE_OF_ROLE = readFileSync(ROLE_OF_SECOND, "utf8").split("\n")[0];

function kitchen(t: TestContext) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  const outputs = new Map<number, string>();
  const states: Terminal[] = [];
  const terminals = openTerminals({
    ouvrirPty: openPty,
    claude: FAKE_CLAUDE,
    shell: "/bin/sh",
    surSortie: (id, data) => void outputs.set(id, (outputs.get(id) ?? "") + data),
    surEtat: (terminal) => void states.push(terminal),
  });
  t.after(() => {
    terminals.fermer();
    rmSync(folder, { recursive: true, force: true });
  });
  return { projet: { nom: "essai", dossier: folder }, terminaux: terminals, etats: states, sortie: (id: number) => outputs.get(id) ?? "" };
}

// Attend un fait. Le délai n'est qu'une garde, pour qu'un test cassé finisse par le dire.
async function until(condition: () => boolean, what: () => string): Promise<void> {
  const limit = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > limit) throw new Error(`jamais arrivé — ${what()}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// Sur la box (Linux), node-pty n'a pas de binaire : son chargement lève. Les
// tests ci-dessous y sont sautés — encore faut-il que ce fichier s'y charge.
test("là où node-pty n'est pas livré compilé, le module du pty se charge quand même, et dit le pty indisponible", () => {
  const load = `Object.defineProperty(process, "platform", { value: "linux" });
    const { ptyAvailable } = await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, "../src/pty.ts")).href)});
    console.log("disponible :", ptyAvailable);`;

  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", load], { encoding: "utf8" }), "disponible : false\n");
});


