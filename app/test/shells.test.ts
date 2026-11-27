// Les shells persistants du registre : ouverts sur la machine choisie, retenus, ramenés à la
// réouverture de l'app rattachés à leur session, et détruits pour de bon quand le chef les ferme.
// Contre de faux pty d'abord — ce qui est lancé, retenu, oublié —, puis sur un vrai multiplexeur,
// sur un vrai terminal : la commande lancée avant la fermeture tourne toujours, l'historique est là.
// Aucun test n'attend une durée : chacun attend ce que le terminal affiche.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { destroy, scriptOfAttachment, type Target, type Session } from "../src/persistence.ts";
import { openPty as realPty, ptyAvailable } from "../src/pty.ts";
import { reminderRead, memoriesInFile, type Reminder, type Memories } from "../src/memories.ts";
import { openTerminals, type Launch, type Pty, type Terminal } from "../src/terminals.ts";
import { HERE } from "../src/platform.ts";

const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };
const WORKSTATION: Target = { lieu: "poste" };

type FakePty = Launch & { ecrits: string[]; tue: boolean };

function enMemory(departure: Reminder = {}): Memories & { tel(): Reminder } {
  let reminder = structuredClone(departure);
  return { lire: () => structuredClone(reminder), ecrire: (fresh) => void (reminder = structuredClone(fresh)), tel: () => reminder };
}

// Un registre comme l'app en ouvre un à chaque lancement : ses pty sont faux, ses souvenirs ceux qu'on lui donne.
function launch(memories: Memories, destroyed: Session[] = [], rendered: { detruite: true } | { erreur: string } = { detruite: true }, settings: { windows?: boolean } = {}) {
  const launched: FakePty[] = [];
  const states: Terminal[] = [];
  const outputs = new Map<number, string>();
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    souvenirs: memories,
    compte: () => "benoit",
    detruire: (session) => (destroyed.push(session), Promise.resolve(rendered)),
    // Ce que main.ts donne sous Windows (platform.ts) : le `bash` de Git, et aucune session sur ce poste.
    ...(settings.windows === true ? { shell: "C:\\Program Files\\Git\\bin\\bash.exe", argsDuShell: ["--login", "-i"], persistantIci: false } : {}),
    ouvrirPty(launches) {
      const fake: FakePty = { ...launches, ecrits: [], tue: false };
      launched.push(fake);
      return { ecrire: (data) => void fake.ecrits.push(data), redimensionner: () => {}, tuer: () => void (fake.tue = true) };
    },
    surSortie: (id, data) => void outputs.set(id, (outputs.get(id) ?? "") + data),
    surEtat: (terminal) => void states.push(terminal),
  });
  const shells = () => launched.filter(({ commande: command }) => command !== "claude");
  const output = (id: number) => withoutEscapes(outputs.get(id) ?? "");
  return { terminaux: terminals, lances: launched, shells, etats: states, sortie: output };
}

describe("un shell persistant, ouvert sur la machine choisie", () => {
  test("sur ce poste, `sh` crée la session du shell ou s'y rattache — et l'app retient chaque shell", () => {
    const memories = enMemory();
    const { terminaux: terminals, shells } = launch(memories);
    terminals.espace(BRIGADE);

    const first = terminals.ouvrir(BRIGADE, WORKSTATION);
    const second = terminals.ouvrir(BRIGADE, WORKSTATION);

    assert.deepEqual(
      shells().map(({ commande: command, args, dossier: folder }) => [command, args, folder]),
      [
        ["/bin/sh", ["-c", scriptOfAttachment("brigade-brigade-1")], "/projets/brigade"],
        ["/bin/sh", ["-c", scriptOfAttachment("brigade-brigade-2")], "/projets/brigade"],
      ],
    );
    assert.deepEqual([first.titre, second.titre], ["shell 1", "shell 2"]);
    assert.equal(first.note, `persistent shell on ${HERE}, in /projets/brigade — session \`brigade-brigade-1\`: closing the app only detaches from it, closing this shell destroys it`);
    assert.deepEqual(memories.tel(), {
      brigade: {
        dernier: 2,
        shells: [
          { rang: 1, session: "brigade-brigade-1", cible: WORKSTATION },
          { rang: 2, session: "brigade-brigade-2", cible: WORKSTATION },
        ],
      },
    });
  });

  test("sous Windows, sans `tmux` ni `screen`, le shell de ce poste s'ouvre tel quel et finit avec son terminal : rien n'en est retenu, rien n'est à détruire", async () => {
    const memories = enMemory({ brigade: { dernier: 1, shells: [{ rang: 1, session: "brigade-brigade-1", cible: WORKSTATION }] } });
    const destroyed: Session[] = [];
    const { terminaux: terminals, shells } = launch(memories, destroyed, { detruite: true }, { windows: true });
    // Un souvenir de ce poste ne se rattache à rien : il n'y a pas de session où revenir.
    assert.deepEqual(terminals.espace(BRIGADE).map(({ genre: kind }) => kind), ["second"]);

    const here = terminals.ouvrir(BRIGADE, WORKSTATION);

    assert.deepEqual(
      shells().map(({ commande: command, args, dossier: folder }) => [command, args, folder]),
      [["C:\\Program Files\\Git\\bin\\bash.exe", ["--login", "-i"], "/projets/brigade"]],
    );
    assert.equal(here.note, `shell on ${HERE}, in /projets/brigade — not persistent: neither tmux nor screen runs on Windows, this shell ends with its terminal`);
    // Le même bandeau que celui d'un shell persistant de ce poste : où l'on est, avec quel compte.
    assert.equal(here.bandeau, `${HERE} · benoit`);
    assert.deepEqual(memories.tel().brigade?.shells.map(({ cible: target }) => target), [WORKSTATION]);
    assert.deepEqual(await terminals.fermerShell(here.id), { ferme: true });
    assert.deepEqual(destroyed, []);
  });

  test("le shell qu'un geste ouvre pour y écrire sa commande reste un shell de ce poste, qui finit avec l'app : il n'est pas retenu", () => {
    const memories = enMemory();
    const { terminaux: terminals, shells } = launch(memories);
    terminals.espace(BRIGADE);

    const action = terminals.shell(BRIGADE, "git -C /projets/brigade pull");

    assert.deepEqual(shells().map(({ commande: command, args }) => [command, ...args]), [["/bin/zsh", "-l"]]);
    assert.equal(action.titre, "shell 1");
    assert.deepEqual(memories.tel(), {});
    // Le rang reste pris : le shell persistant suivant ne porte pas le même titre.
    assert.equal(terminals.ouvrir(BRIGADE, WORKSTATION).titre, "shell 2");
  });
});

describe("fermer l'app, puis la rouvrir : les shells persistants reviennent", () => {
  test("rouvert, l'espace du projet ramène chaque shell, rattaché à sa session, sous le même titre — et un shell neuf prend le rang suivant", () => {
    const memories = enMemory();
    const before = launch(memories);
    before.terminaux.espace(BRIGADE);
    before.terminaux.ouvrir(BRIGADE, WORKSTATION);
    before.terminaux.ouvrir(BRIGADE, WORKSTATION);
    const commands = before.shells().map(({ commande: command, args }) => [command, ...args]);

    // Fermer l'app tue ses terminaux — les clients des sessions, pas les sessions —, et n'oublie rien.
    before.terminaux.fermer();
    assert.ok(before.shells().every(({ tue: kills }) => kills));
    const retained = memories.tel();

    const after = launch(memories);
    assert.deepEqual(after.lances, [], "rien n'est lancé avant que l'espace du projet ne s'ouvre");
    const space = after.terminaux.espace(BRIGADE);

    assert.deepEqual(space.map(({ genre: kind, titre: title }) => [kind, title]), [["second", "Second"], ["shell", "shell 1"], ["shell", "shell 2"]]);
    assert.deepEqual(after.shells().map(({ commande: command, args }) => [command, ...args]), commands);
    assert.match(space[1]?.note ?? "", new RegExp(`^persistent shell, reattached on ${HERE}, in /projets/brigade — session \`brigade-brigade-1\``));
    assert.deepEqual(memories.tel(), retained);
    // Rouvrir l'espace ne les relance pas une seconde fois.
    after.terminaux.espace(BRIGADE);
    assert.equal(after.shells().length, 2);
    assert.equal(after.terminaux.ouvrir(BRIGADE, WORKSTATION).titre, "shell 3");
  });

  test("seul le projet ouvert ramène ses shells : ceux d'un autre attendent son espace", () => {
    const memories = enMemory({ parade: { dernier: 1, shells: [{ rang: 1, session: "brigade-parade-1", cible: WORKSTATION }] } });
    const { terminaux: terminals, shells } = launch(memories);

    assert.deepEqual(terminals.espace(BRIGADE).map(({ genre: kind }) => kind), ["second"]);
    assert.deepEqual(shells(), []);
    terminals.espace({ nom: "parade", dossier: "/projets/parade" });
    assert.deepEqual(shells().map(({ args }) => args), [["-c", scriptOfAttachment("brigade-parade-1")]]);
  });
});

describe("fermer un shell pour de bon", () => {
  test("il quitte l'espace, sa session est détruite, et il ne revient plus à la réouverture", async () => {
    const memories = enMemory();
    const destroyed: Session[] = [];
    const { terminaux: terminals, shells, etats: states } = launch(memories, destroyed);
    terminals.espace(BRIGADE);
    const guard = terminals.ouvrir(BRIGADE, WORKSTATION);
    const closes = terminals.ouvrir(BRIGADE, WORKSTATION);

    assert.deepEqual(await terminals.fermerShell(closes.id), { ferme: true });

    assert.deepEqual(destroyed, [{ nom: "brigade-brigade-2", cible: WORKSTATION }]);
    assert.equal(shells()[1]?.tue, true);
    assert.deepEqual(states.map(({ id, arrete: stops }) => [id, stops]), [[closes.id, true]]);
    assert.deepEqual(terminals.espace(BRIGADE).map(({ id }) => id).slice(1), [guard.id]);
    assert.deepEqual(memories.tel().brigade?.shells.map(({ session }) => session), ["brigade-brigade-1"]);

    terminals.fermer();
    const after = launch(memories);
    assert.deepEqual(after.terminaux.espace(BRIGADE).map(({ titre: title }) => title), ["Second", "shell 1"]);
    // Son rang n'est pas rendu : un shell neuf ne retrouve pas sa session.
    assert.equal(after.terminaux.ouvrir(BRIGADE, WORKSTATION).titre, "shell 3");
  });

  test("une session qui n'a pas pu être détruite : le shell est fermé et oublié quand même, et la raison dit où elle reste", async () => {
    const memories = enMemory();
    const { terminaux: terminals } = launch(memories, [], { erreur: "$ tmux kill-session …\n→ exit code 1" });
    terminals.espace(BRIGADE);
    const shell = terminals.ouvrir(BRIGADE, WORKSTATION);

    assert.deepEqual(await terminals.fermerShell(shell.id), {
      refus: `shell 1 is closed, but its session \`brigade-brigade-1\` could not be destroyed on ${HERE}: it is no longer listed, and stays there until it is destroyed — $ tmux kill-session …\n→ exit code 1`,
    });
    assert.deepEqual(memories.tel().brigade?.shells, []);
  });

  test("le second ne se ferme pas ainsi, ni un shell qui n'est plus là", async () => {
    const { terminaux: terminals } = launch(enMemory());
    const [second] = terminals.espace(BRIGADE);
    assert.deepEqual(await terminals.fermerShell(second?.id ?? 0), { refus: "nothing was closed: this shell is no longer open" });
    assert.deepEqual(await terminals.fermerShell(99), { refus: "nothing was closed: this shell is no longer open" });
  });

  test("un shell dont la session finit d'elle-même (le chef y a tapé `exit`) quitte l'espace et l'app l'oublie, quel que soit son code de sortie", () => {
    const memories = enMemory();
    const { terminaux: terminals, shells } = launch(memories, [], { detruite: true });
    terminals.espace(BRIGADE);
    terminals.ouvrir(BRIGADE, WORKSTATION);
    terminals.ouvrir(BRIGADE, WORKSTATION);
    terminals.ouvrir(BRIGADE, WORKSTATION);

    shells()[0]?.surFin(0);
    shells()[1]?.surFin(255);

    assert.deepEqual(terminals.espace(BRIGADE).map(({ genre: kind, titre: title }) => [kind, title]), [["second", "Second"], ["shell", "shell 3"]]);
    assert.deepEqual(memories.tel().brigade?.shells.map(({ session }) => session), ["brigade-brigade-3"]);
  });
});

describe("le fichier des souvenirs", () => {
  const folder = (t: TestContext) => {
    const root = mkdtempSync(join(tmpdir(), "brigade-app-souvenirs-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
  };

  test("ce qui y est écrit se relit tel quel, et le dossier est créé s'il manque", (t) => {
    const path = join(folder(t), "brigade", "shells.json");
    const memories = memoriesInFile(path);
    const reminder: Reminder = { brigade: { dernier: 4, shells: [{ rang: 2, session: "brigade-brigade-2", cible: WORKSTATION }] } };

    assert.deepEqual(memories.lire(), {});
    memories.ecrire(reminder);
    assert.deepEqual(memoriesInFile(path).lire(), reminder);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { projets: reminder });
  });

  test("un fichier abîmé ne bloque rien : il ne ramène aucun shell", (t) => {
    const path = join(folder(t), "shells.json");
    writeFileSync(path, "{ pas du json");
    assert.deepEqual(memoriesInFile(path).lire(), {});
  });

  test("une entrée d'une autre forme est oubliée — dont un shell d'une autre machine, ou une session qui ne se porte pas dans un script", () => {
    const readOne = reminderRead({
      projets: {
        brigade: {
          dernier: 1,
          shells: [
            { rang: 1, session: "brigade-brigade-1", cible: { lieu: "poste" } },
            { rang: 2, session: "brigade-brigade-2", cible: { lieu: "box", nom: "x" } },
            { rang: 3, session: "x'; reboot; '", cible: { lieu: "poste" } },
            { rang: 4, session: "brigade-brigade-4", cible: { lieu: "ailleurs" } },
            { rang: 1, session: "brigade-brigade-1b", cible: { lieu: "poste" } },
            { rang: 6, session: "brigade-brigade-6", cible: { lieu: "poste" } },
          ],
        },
        vide: "rien",
      },
    });
    assert.deepEqual(readOne, {
      // Le dernier rang n'est jamais en deçà d'un shell retenu.
      brigade: { dernier: 6, shells: [{ rang: 1, session: "brigade-brigade-1", cible: WORKSTATION }, { rang: 6, session: "brigade-brigade-6", cible: WORKSTATION }] },
      vide: { dernier: 0, shells: [] },
    });
  });
});

// --- Sur un vrai multiplexeur.

const multiplexer = ["tmux", "screen"].find((tool) => {
  try {
    execFileSync("/bin/sh", ["-c", `command -v ${tool}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
const python = (() => {
  try {
    execFileSync("python3", ["-I", "-c", "import pty"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const SKIPS = multiplexer === undefined ? "ni tmux ni screen sur ce poste" : !ptyAvailable && !python ? `ni node-pty livré compilé pour ${process.platform}-${process.arch}, ni python3` : false;
const HELP_PTY = join(import.meta.dirname, "helpers/pty.py");

// Attend un fait. Le délai n'est qu'une garde, pour qu'un test cassé finisse par le dire.
async function until(condition: () => boolean, what: () => string): Promise<void> {
  const limit = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > limit) throw new Error(`jamais arrivé — ${what()}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const withoutEscapes = (text: string) => text.replace(/\x1b\[[0-9;?>=]*[ -/]*[@-~]|\x1b[()][0-9A-Za-z]|\x1b[=>78DEHMc]|\r/g, "");

// Un vrai terminal pour ce qu'un registre lance, dans l'environnement du test : node-pty là où il
// est livré, l'aide en Python ailleurs. Le second, lui, n'est pas lancé : un faux pty le tient.
function realPtys(env: Record<string, string>, ends: Promise<void>[]) {
  return (launches: Launch): Pty => {
    if (launches.commande === "faux-claude") return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
    const line = ["/usr/bin/env", "-i", ...Object.entries(env).map(([key, value]) => `${key}=${value}`), launches.commande, ...launches.args];
    if (ptyAvailable) {
      let finish = () => {};
      ends.push(new Promise((resolve) => (finish = resolve)));
      return realPty({ ...launches, commande: line[0] ?? "", args: line.slice(1), surFin: (code) => (finish(), launches.surFin(code)) });
    }
    const child = spawn("python3", ["-I", HELP_PTY, ...line], { cwd: launches.dossier, stdio: ["pipe", "pipe", "inherit"] });
    child.stdout.on("data", (data: Buffer) => launches.surSortie(data.toString("utf8")));
    ends.push(new Promise((resolve) => child.on("exit", (code) => (resolve(), launches.surFin(code ?? 0)))));
    return { ecrire: (data) => void child.stdin.write(data), redimensionner: () => {}, tuer: () => void child.kill() };
  };
}

describe(`fermer l'app, la rouvrir : sur ce poste${multiplexer === undefined ? "" : `, par ${multiplexer}`}`, { skip: SKIPS }, () => {
  test("le shell revient rattaché à sa session : la commande lancée avant la fermeture tourne toujours, et l'historique est là — fermé pour de bon, il ne revient plus et sa session n'existe plus", async (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-shells-")));
    const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: root, SHELL: "/bin/sh", TERM: "xterm-256color", TMUX_TMPDIR: root, SCREENDIR: root, LANG: "C" };
    // Un nom de projet à ce test : deux suites de front ne partagent pas une session.
    const project = { nom: `essai-shells-${process.pid}`, dossier: root };
    const memories = memoriesInFile(join(root, "app", "shells.json"));
    const ends: Promise<void>[] = [];
    const openEntries: Session[] = [];
    t.after(async () => {
      for (const session of openEntries) await destroy(session, { env });
      await Promise.all(ends);
      rmSync(root, { recursive: true, force: true });
    });

    const app = () => {
      let output = "";
      const terminals = openTerminals({
        claude: "faux-claude",
        shell: "/bin/sh",
        souvenirs: memories,
        detruire: (session) => destroy(session, { env }),
        ouvrirPty: realPtys(env, ends),
        surSortie: (_, data) => void (output += data),
        surEtat: () => {},
      });
      return { terminaux: terminals, sortie: () => withoutEscapes(output) };
    };

    // Première ouverture : un shell sur ce poste, et une commande qui reste au premier plan —
    // `cat` ne rend ce qu'il reçoit que s'il tourne encore.
    const first = app();
    first.terminaux.espace(project);
    const shell = first.terminaux.ouvrir(project, WORKSTATION);
    const session: Session = { nom: `brigade-${project.nom}-1`, cible: WORKSTATION };
    openEntries.push(session);
    first.terminaux.ecrire(shell.id, "echo AVANT-$((6*7)); cat\r");
    await until(() => first.sortie().includes("AVANT-42"), first.sortie);
    first.terminaux.ecrire(shell.id, "ligne-une\r");
    await until(() => (first.sortie().match(/ligne-une/g) ?? []).length >= 2, first.sortie);
    first.terminaux.fermer();
    await Promise.all(ends);

    // Rouverte : le shell revient de lui-même avec l'espace, et montre ce que la session avait affiché.
    const second = app();
    const [, back] = second.terminaux.espace(project);
    assert.equal(back?.titre, "shell 1");
    await until(() => second.sortie().includes("AVANT-42") && second.sortie().includes("ligne-une"), second.sortie);
    // `cat` est toujours là : il rend ce qui lui est tapé.
    second.terminaux.ecrire(back?.id ?? 0, "apres-retour\r");
    await until(() => (second.sortie().match(/apres-retour/g) ?? []).length >= 2, second.sortie);

    // Fermé pour de bon : sa session est détruite, et la réouverture suivante ne le ramène pas.
    assert.deepEqual(await second.terminaux.fermerShell(back?.id ?? 0), { ferme: true });
    second.terminaux.fermer();
    await Promise.all(ends);
    const exists = () => {
      try {
        execFileSync("/bin/sh", ["-c", `tmux has-session -t =${session.nom} 2>/dev/null || screen -ls 2>/dev/null | grep -q "[.]${session.nom}[[:space:]]"`], { env, stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };
    // `screen -X quit` rend la main avant que la session ait fini de partir : on attend qu'elle soit partie.
    await until(() => !exists(), () => `la session ${session.nom} existe encore sur ce poste`);
    const third = app();
    assert.deepEqual(third.terminaux.espace(project).map(({ genre: kind }) => kind), ["second"]);
  });
});
