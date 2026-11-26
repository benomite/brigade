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
import { ouvrirPty, ptyDisponible } from "../src/pty.ts";
import { ROLE_DU_SECOND } from "../src/second/launch.ts";
import { ouvrirTerminaux, type Terminal } from "../src/terminaux.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const FAUX_CLAUDE = join(import.meta.dirname, "aides/faux-claude.sh");
// Ce que le faux `claude` dit du rôle qu'il lit : la première ligne du fichier livré avec l'app.
const FIRST_LINE_DU_ROLE = readFileSync(ROLE_DU_SECOND, "utf8").split("\n")[0];

function kitchen(t: TestContext) {
  const dossier = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  const sorties = new Map<number, string>();
  const states: Terminal[] = [];
  const terminaux = ouvrirTerminaux({
    ouvrirPty,
    claude: FAUX_CLAUDE,
    shell: "/bin/sh",
    surSortie: (id, donnees) => void sorties.set(id, (sorties.get(id) ?? "") + donnees),
    surEtat: (terminal) => void states.push(terminal),
  });
  t.after(() => {
    terminaux.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });
  return { projet: { nom: "essai", dossier }, terminaux, etats: states, sortie: (id: number) => sorties.get(id) ?? "" };
}

// Attend un fait. Le délai n'est qu'une garde, pour qu'un test cassé finisse par le dire.
async function jusqua(condition: () => boolean, quoi: () => string): Promise<void> {
  const limit = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > limit) throw new Error(`jamais arrivé — ${quoi()}`);
    await new Promise((resoudre) => setTimeout(resoudre, 5));
  }
}

// Sur la box (Linux), node-pty n'a pas de binaire : son chargement lève. Les
// tests ci-dessous y sont sautés — encore faut-il que ce fichier s'y charge.
test("là où node-pty n'est pas livré compilé, le module du pty se charge quand même, et dit le pty indisponible", () => {
  const charge = `Object.defineProperty(process, "platform", { value: "linux" });
    const { ptyDisponible } = await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, "../src/pty.ts")).href)});
    console.log("disponible :", ptyDisponible);`;

  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", charge], { encoding: "utf8" }), "disponible : false\n");
});

const SAUTE = ptyDisponible ? false : `node-pty n'est pas livré compilé pour ${process.platform}-${process.arch}`;

// Chaque test a son dossier : ils se jouent de front.
describe("le second sur un vrai pty", { skip: SAUTE, concurrency: 8 }, () => {
  test("sans fil à reprendre, une session neuve s'ouvre dans le dossier du projet, sur un terminal — et la note le dit", { skip: SANS_POSIX }, async (t) => {
    const { projet: project, terminaux, etats: states, sortie } = kitchen(t);

    const [second] = terminaux.espace(project);
    assert.ok(second);
    await jusqua(() => sortie(second.id).includes("sur un terminal"), () => sortie(second.id));

    assert.match(sortie(second.id), /No conversation found to continue/);
    assert.ok(sortie(second.id).includes(`session neuve dans ${project.dossier}`), sortie(second.id));
    assert.deepEqual(states.map(({ arrete, note }) => [arrete, note]), [[false, "new session: `claude --continue` exited with code 1, the thread was not resumed — `claude`, with the second's role in its system prompt"]]);
    // Le rôle est lu par la session neuve, dans le fichier que l'app livre — et rien n'est envoyé comme un message.
    assert.deepEqual(sortie(second.id).match(/rôle : [^\r\n]*/g), [`rôle : ${FIRST_LINE_DU_ROLE}`]);
    assert.equal(sortie(second.id).match(/reçu : [^\r\n]*/g), null);
  });

  test("avec un fil dans le dossier, il est repris : aucune session neuve, et la note reste « fil repris »", { skip: SANS_POSIX }, async (t) => {
    const { projet: project, terminaux, etats: states, sortie } = kitchen(t);
    writeFileSync(join(project.dossier, ".fil"), "");

    const [second] = terminaux.espace(project);
    assert.ok(second);
    await jusqua(() => sortie(second.id).includes("sur un terminal"), () => sortie(second.id));

    assert.ok(sortie(second.id).includes(`fil repris dans ${project.dossier}`), sortie(second.id));
    assert.deepEqual(states, []);
    assert.match(second.note, /^thread resumed: /);
  });

  test("ce qui est tapé arrive au second, sa taille suit la vue, et un shell ouvert à côté ne le dérange pas", { skip: SANS_POSIX }, async (t) => {
    const { projet: project, terminaux, sortie } = kitchen(t);
    writeFileSync(join(project.dossier, ".fil"), "");
    const [second] = terminaux.espace(project);
    assert.ok(second);
    await jusqua(() => sortie(second.id).includes("sur un terminal"), () => sortie(second.id));

    const shell = terminaux.shell(project);
    terminaux.ecrire(shell.id, "pwd -P; exit\r");
    await jusqua(() => terminaux.espace(project).length === 1, () => sortie(shell.id));
    assert.ok(sortie(shell.id).includes(project.dossier), sortie(shell.id));

    terminaux.redimensionner(second.id, 132, 43);
    terminaux.ecrire(second.id, "!taille\r");
    await jusqua(() => sortie(second.id).includes("taille : 43 132"), () => sortie(second.id));
  });

  test("une commande inscrite n'est pas envoyée : le second ne la reçoit qu'à l'Entrée du chef, avec ce qu'il a tapé à la suite", { skip: SANS_POSIX }, async (t) => {
    const { projet: project, terminaux, sortie } = kitchen(t);
    writeFileSync(join(project.dossier, ".fil"), "");
    const [second] = terminaux.espace(project);
    assert.ok(second);
    await jusqua(() => sortie(second.id).includes("sur un terminal"), () => sortie(second.id));

    terminaux.inscrire(project, "!brigade essai garde-fous stop");
    // Le curseur est après : ce que le chef tape s'y ajoute, et c'est son Entrée qui envoie.
    terminaux.ecrire(second.id, " # relu\r");
    await jusqua(() => sortie(second.id).includes("reçu : !brigade"), () => sortie(second.id));

    // Le rôle, lu au démarrage avec `--continue`, puis une seule ligne, et entière : rien d'autre n'était parti avant.
    assert.deepEqual(sortie(second.id).match(/rôle : [^\r\n]*/g), [`rôle : ${FIRST_LINE_DU_ROLE}`]);
    assert.deepEqual(sortie(second.id).match(/reçu : [^\r\n]*/g), ["reçu : !brigade essai garde-fous stop # relu"]);
  });

  test("le second quitté est dit arrêté ; une touche le relance, et il reprend le fil qu'il avait laissé", { skip: SANS_POSIX }, async (t) => {
    const { projet: project, terminaux, etats: states, sortie } = kitchen(t);
    const [second] = terminaux.espace(project);
    assert.ok(second);
    await jusqua(() => sortie(second.id).includes("sur un terminal"), () => sortie(second.id));

    terminaux.ecrire(second.id, "/exit\r");
    await jusqua(() => states.at(-1)?.arrete === true, () => sortie(second.id));
    assert.equal(states.at(-1)?.note, "the second stopped (code 0) — a keypress restarts it");

    terminaux.ecrire(second.id, "\r");
    await jusqua(() => sortie(second.id).includes(`fil repris dans ${project.dossier}`), () => sortie(second.id));
    assert.deepEqual([states.at(-1)?.arrete, states.at(-1)?.note], [
      false,
      "thread resumed: `claude --continue`, the latest conversation in this folder — whichever it is, not necessarily a second's; it runs with the second's role in its system prompt",
    ]);
  });
});
