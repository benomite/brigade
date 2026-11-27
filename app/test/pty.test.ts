// Le second sur un vrai pty, contre un faux `claude` : ce que le registre ne
// peut pas prouver avec de faux pty — le dossier, le terminal, la reprise.
// Aucun test n'attend une durée : chacun attend ce que le faux `claude` écrit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import { openPty, ptyAvailable } from "../src/pty.ts";
import { ROLE_OF_SECOND } from "../src/second/launch.ts";
import { openTerminals, type Terminal } from "../src/terminals.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

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
    const { ptyDisponible } = await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, "../src/pty.ts")).href)});
    console.log("disponible :", ptyDisponible);`;

  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", load], { encoding: "utf8" }), "disponible : false\n");
});

const SKIPS = ptyAvailable ? false : `node-pty n'est pas livré compilé pour ${process.platform}-${process.arch}`;

// Chaque test a son dossier : ils se jouent de front.
describe("le second sur un vrai pty", { skip: SKIPS, concurrency: 8 }, () => {
  test("sans fil à reprendre, une session neuve s'ouvre dans le dossier du projet, sur un terminal — et la note le dit", { skip: WITHOUT_POSIX }, async (t) => {
    const { projet: project, terminaux: terminals, etats: states, sortie: output } = kitchen(t);

    const [second] = terminals.espace(project);
    assert.ok(second);
    await until(() => output(second.id).includes("sur un terminal"), () => output(second.id));

    assert.match(output(second.id), /No conversation found to continue/);
    assert.ok(output(second.id).includes(`session neuve dans ${project.dossier}`), output(second.id));
    assert.deepEqual(states.map(({ arrete: stops, note }) => [stops, note]), [[false, "new session: `claude --continue` exited with code 1, the thread was not resumed — `claude`, with the second's role in its system prompt"]]);
    // Le rôle est lu par la session neuve, dans le fichier que l'app livre — et rien n'est envoyé comme un message.
    assert.deepEqual(output(second.id).match(/rôle : [^\r\n]*/g), [`rôle : ${FIRST_LINE_OF_ROLE}`]);
    assert.equal(output(second.id).match(/reçu : [^\r\n]*/g), null);
  });

  test("avec un fil dans le dossier, il est repris : aucune session neuve, et la note reste « fil repris »", { skip: WITHOUT_POSIX }, async (t) => {
    const { projet: project, terminaux: terminals, etats: states, sortie: output } = kitchen(t);
    writeFileSync(join(project.dossier, ".fil"), "");

    const [second] = terminals.espace(project);
    assert.ok(second);
    await until(() => output(second.id).includes("sur un terminal"), () => output(second.id));

    assert.ok(output(second.id).includes(`fil repris dans ${project.dossier}`), output(second.id));
    assert.deepEqual(states, []);
    assert.match(second.note, /^thread resumed: /);
  });

  test("ce qui est tapé arrive au second, sa taille suit la vue, et un shell ouvert à côté ne le dérange pas", { skip: WITHOUT_POSIX }, async (t) => {
    const { projet: project, terminaux: terminals, sortie: output } = kitchen(t);
    writeFileSync(join(project.dossier, ".fil"), "");
    const [second] = terminals.espace(project);
    assert.ok(second);
    await until(() => output(second.id).includes("sur un terminal"), () => output(second.id));

    const shell = terminals.shell(project);
    terminals.ecrire(shell.id, "pwd -P; exit\r");
    await until(() => terminals.espace(project).length === 1, () => output(shell.id));
    assert.ok(output(shell.id).includes(project.dossier), output(shell.id));

    terminals.redimensionner(second.id, 132, 43);
    terminals.ecrire(second.id, "!taille\r");
    await until(() => output(second.id).includes("taille : 43 132"), () => output(second.id));
  });

  test("une commande inscrite n'est pas envoyée : le second ne la reçoit qu'à l'Entrée du chef, avec ce qu'il a tapé à la suite", { skip: WITHOUT_POSIX }, async (t) => {
    const { projet: project, terminaux: terminals, sortie: output } = kitchen(t);
    writeFileSync(join(project.dossier, ".fil"), "");
    const [second] = terminals.espace(project);
    assert.ok(second);
    await until(() => output(second.id).includes("sur un terminal"), () => output(second.id));

    terminals.inscrire(project, "!brigade essai garde-fous stop");
    // Le curseur est après : ce que le chef tape s'y ajoute, et c'est son Entrée qui envoie.
    terminals.ecrire(second.id, " # relu\r");
    await until(() => output(second.id).includes("reçu : !brigade"), () => output(second.id));

    // Le rôle, lu au démarrage avec `--continue`, puis une seule ligne, et entière : rien d'autre n'était parti avant.
    assert.deepEqual(output(second.id).match(/rôle : [^\r\n]*/g), [`rôle : ${FIRST_LINE_OF_ROLE}`]);
    assert.deepEqual(output(second.id).match(/reçu : [^\r\n]*/g), ["reçu : !brigade essai garde-fous stop # relu"]);
  });

  test("le second quitté est dit arrêté ; une touche le relance, et il reprend le fil qu'il avait laissé", { skip: WITHOUT_POSIX }, async (t) => {
    const { projet: project, terminaux: terminals, etats: states, sortie: output } = kitchen(t);
    const [second] = terminals.espace(project);
    assert.ok(second);
    await until(() => output(second.id).includes("sur un terminal"), () => output(second.id));

    terminals.ecrire(second.id, "/exit\r");
    await until(() => states.at(-1)?.arrete === true, () => output(second.id));
    assert.equal(states.at(-1)?.note, "the second stopped (code 0) — a keypress restarts it");

    terminals.ecrire(second.id, "\r");
    await until(() => output(second.id).includes(`fil repris dans ${project.dossier}`), () => output(second.id));
    assert.deepEqual([states.at(-1)?.arrete, states.at(-1)?.note], [
      false,
      "thread resumed: `claude --continue`, the latest conversation in this folder — whichever it is, not necessarily a second's; it runs with the second's role in its system prompt",
    ]);
  });
});
