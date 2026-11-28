// Les shells persistants : ce que la couche lance sur ce poste, et ce
// que la session devient. Les commandes se lisent ; la persistance s'éprouve sur un
// vrai multiplexeur — `tmux`, ou `screen` à défaut, celui qui est installé —, sur un
// vrai terminal. Chaque test a son répertoire, où vivent les sockets de ses
// sessions et son `HOME` : rien ne touche aux sessions du poste, ni au réglage du chef.
// Aucun test n'attend une durée : chacun attend ce que le terminal affiche.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, statSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import {
  destruction,
  destroy,
  nameOfSession,
  NAME_OF_SESSION,
  attachment,
  SETTINGS_SCREEN,
  SETTINGS_TMUX,
  WITHOUT_MULTIPLEXER,
  scriptOfDestruction,
  scriptOfAttachment,
  scroll,
  type Target,
  type Command,
  type Session,
} from "../src/persistence.ts";
import { openPty, ptyAvailable } from "../src/pty.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const WORKSTATION: Target = { lieu: "poste" };
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

describe("le nom d'une session", () => {
  test("il dit le projet et le rang, et se porte sans guillemets", () => {
    assert.equal(nameOfSession("parade", 3), "brigade-parade-3");
    assert.match(nameOfSession("Mon Projet", 1), NAME_OF_SESSION);
  });

  test("deux projets dont les noms s'écrivent pareil ne partagent pas une session", () => {
    assert.notEqual(nameOfSession("a b", 1), nameOfSession("a-b", 1));
    assert.notEqual(nameOfSession("A-b", 1), nameOfSession("a-b", 1));
    assert.match(nameOfSession("a b", 1), /^brigade-a-b-[0-9a-f]{8}-1$/);
  });

  test("un nom qui ne se porte pas tel quel n'est jamais écrit dans un script", () => {
    assert.throws(() => scriptOfAttachment("x'; rm -rf ~; '"), /lowercase letters, digits and dashes/);
    assert.throws(() => scriptOfDestruction("x y"), /lowercase letters, digits and dashes/);
  });
});

describe("la commande d'un shell persistant", () => {
  test("sur le poste, `sh` lit le script : il crée la session ou s'y rattache", () => {
    const { commande: command, args } = attachment({ nom: "brigade-parade-1", cible: WORKSTATION });
    assert.equal(command, "/bin/sh");
    assert.deepEqual(args, ["-c", scriptOfAttachment("brigade-parade-1")]);
  });

  test("la destruction passe aussi par `sh`, sans terminal", () => {
    const { commande: command, args } = destruction({ nom: "brigade-parade-1", cible: WORKSTATION });
    assert.equal(command, "/bin/sh");
    assert.deepEqual(args, ["-c", scriptOfDestruction("brigade-parade-1")]);
  });

  test("le script se porte entre apostrophes par n'importe quel shell de connexion : il n'en contient aucune", () => {
    assert.ok(!scriptOfAttachment("brigade-parade-1").includes("'"));
    assert.ok(!scriptOfDestruction("brigade-parade-1").includes("'"));
  });
});

// Un faux multiplexeur dans un `PATH` à lui seul : il note ce qu'il reçoit, et dit
// qu'aucune session n'existe — le script en crée donc une, la règle, et s'y rattache.
function plays(t: TestContext, fake: "tmux" | "screen" | "aucun"): { appels: string[]; sortie: string } {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-persistance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const tool of ["grep", "mkdir", "chmod"]) symlinkSync(execFileSync("/bin/sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim(), join(root, tool));
  if (fake !== "aucun") {
    // `has-session`, `screen -ls` : rien n'existe.
    writeFileSync(join(root, fake), `#!/bin/sh\nprintf '${fake} %s\\n' "$*" >> '${root}/appels'\n[ "$1" = -u ] && shift\ncase "$1" in has-session|-ls) exit 1;; esac\nexit 0\n`);
    chmodSync(join(root, fake), 0o755);
  }
  const output = execFileSync("/bin/sh", ["-c", scriptOfAttachment("brigade-essai-1")], { cwd: root, encoding: "utf8", env: { PATH: root, HOME: root, SHELL: "/bin/true" } });
  let calls: string[] = [];
  try {
    calls = readFileSync(join(root, "appels"), "utf8").trimEnd().split("\n");
  } catch {}
  return { appels: calls, sortie: output };
}

describe("la configuration appliquée à la session", () => {
  test("avec `tmux` : ni souris, ni préfixe, ni barre — et rien qui active un mode de copie", { skip: WITHOUT_POSIX }, (t) => {
    const { appels: calls } = plays(t, "tmux");
    const root = calls.find((call) => call.startsWith("tmux -u new-session"))?.match(/-c (\S+)$/)?.[1];
    assert.deepEqual(calls, [
      "tmux -u has-session -t =brigade-essai-1",
      `tmux -u new-session -d -s brigade-essai-1 -c ${root}`,
      "tmux -u set-option -t =brigade-essai-1: mouse off",
      "tmux -u set-option -t =brigade-essai-1: prefix None",
      "tmux -u set-option -t =brigade-essai-1: prefix2 None",
      "tmux -u set-option -t =brigade-essai-1: status off",
      "tmux -u attach-session -t =brigade-essai-1",
    ]);
    assert.deepEqual(SETTINGS_TMUX, ["mouse off", "prefix None", "prefix2 None", "status off"]);
    assert.ok(!calls.some((call) => /mouse on|copy-mode|set-clipboard|mode-keys/.test(call)), calls.join("\n"));
  });

  test("avec `screen`, quand `tmux` manque : aucun suivi de la souris, et Ctrl-A reste au shell", { skip: WITHOUT_POSIX }, (t) => {
    const { appels: calls } = plays(t, "screen");
    // Le réglage est lu depuis un répertoire privé du chef (jamais un nom prévisible de /tmp), qui charge `~/.screenrc` d'abord.
    const screenCreation = calls.find((call) => call.includes("-dmS")) ?? "";
    const rc = screenCreation.match(/-c (\S+) -dmS/)?.[1] ?? "";
    assert.match(rc, /\/\.brigade\/screen\/brigade-essai-1\.screenrc$/);
    assert.equal(statSync(dirname(rc)).mode & 0o777, 0o700);
    assert.equal(readFileSync(rc, "utf8"), "termcapinfo * ti@:te@\n");
    assert.deepEqual(calls, [
      "screen -ls",
      screenCreation,
      "screen -S brigade-essai-1 -X defmousetrack off",
      "screen -S brigade-essai-1 -X mousetrack off",
      "screen -S brigade-essai-1 -X escape ",
      "screen -U -x brigade-essai-1",
    ]);
    assert.deepEqual(SETTINGS_SCREEN, ["defmousetrack off", "mousetrack off", 'escape ""']);
    assert.ok(!calls.some((call) => /mousetrack on|copy/.test(call)), calls.join("\n"));
  });

  test("sans aucun des deux : le shell s'ouvre quand même, et dit qu'il ne survivra pas à son terminal", { skip: WITHOUT_POSIX }, (t) => {
    const { appels: calls, sortie: output } = plays(t, "aucun");
    assert.deepEqual(calls, []);
    assert.equal(output, `${WITHOUT_MULTIPLEXER}\n`);
  });
});

// Le multiplexeur que ce poste a — celui que le script prendra.
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

type Vue = { sortie(): string; ecrire(data: string): void; fermer(): Promise<void> };

// Un vrai terminal, sur la commande d'un shell persistant : node-pty là où il est
// livré, l'aide en Python ailleurs. Son environnement est celui du test, passé par `env`.
function plug(t: TestContext, { commande: command, args }: Command, folder: string, env: Record<string, string>): Vue {
  const line = ["/usr/bin/env", "-i", ...Object.entries(env).map(([key, value]) => `${key}=${value}`), command, ...args];
  let output = "";
  let finished = false;
  if (ptyAvailable) {
    const pty = openPty({ commande: line[0] ?? "", args: line.slice(1), dossier: folder, colonnes: 80, lignes: 24, surSortie: (data) => void (output += data), surFin: () => void (finished = true) });
    const close = async () => {
      if (!finished) pty.tuer();
      await until(() => finished, () => output);
    };
    t.after(close);
    return { sortie: () => output, ecrire: pty.ecrire, fermer: close };
  }
  const child = spawn("python3", ["-I", HELP_PTY, ...line], { cwd: folder, stdio: ["pipe", "pipe", "inherit"] });
  child.stdout.on("data", (data: Buffer) => void (output += data.toString("utf8")));
  child.on("exit", () => void (finished = true));
  const close = async () => {
    if (!finished) child.kill();
    await until(() => finished, () => output);
  };
  t.after(close);
  return { sortie: () => output, ecrire: (data) => void child.stdin.write(data), fermer: close };
}

let trials = 0;

// Ce poste, isolé : les sockets des sessions, le `HOME` et le dossier du test.
function workstation(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-persistance-")));
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: root, SHELL: "/bin/sh", TERM: "xterm-256color", TMUX_TMPDIR: root, SCREENDIR: root, LANG: "C" };
  const session: Session = { nom: nameOfSession(`essai-${process.pid}`, ++trials), cible: WORKSTATION };
  t.after(async () => {
    await destroy(session, { env });
    rmSync(root, { recursive: true, force: true });
  });
  return { racine: root, env, session, ouvrir: () => plug(t, attachment(session), root, env) };
}

describe(`une session persistante sur ce poste${multiplexer === undefined ? "" : `, par ${multiplexer}`}`, { skip: SKIPS, concurrency: 4 }, () => {
  test("fermer le terminal ne fait que s'en détacher : rattaché, la commande lancée avant tourne toujours, et ce qu'elle avait affiché est là", async (t) => {
    const { ouvrir: open } = workstation(t);

    const first = open();
    // `cat` reste au premier plan : il ne rend ce qu'il reçoit que s'il tourne encore.
    first.ecrire("echo AVANT-$((6*7)); cat\r");
    await until(() => withoutEscapes(first.sortie()).includes("AVANT-42"), () => first.sortie());
    first.ecrire("ligne-une\r");
    await until(() => (withoutEscapes(first.sortie()).match(/ligne-une/g) ?? []).length >= 2, () => first.sortie());
    await first.fermer();

    const second = open();
    // L'historique : le terminal rattaché montre ce que la session avait affiché.
    await until(() => withoutEscapes(second.sortie()).includes("AVANT-42") && withoutEscapes(second.sortie()).includes("ligne-une"), () => second.sortie());
    // La commande : `cat` est toujours là, il rend ce qui lui est tapé.
    second.ecrire("apres-retour\r");
    await until(() => (withoutEscapes(second.sortie()).match(/apres-retour/g) ?? []).length >= 2, () => second.sortie());
  });

  test("avec `screen`, le terminal reste sur son écran normal : une sortie plus longue qu'un écran défile dans son historique, que la molette remonte", { skip: multiplexer !== "screen" && "tmux tient la session" }, async (t) => {
    const { ouvrir: open } = workstation(t);

    const view = open();
    view.ecrire("seq 1 100 | sed s/^/ligne-/; echo FIN-$((6*7))\r");
    await until(() => withoutEscapes(view.sortie()).includes("FIN-42"), () => view.sortie());
    // Écran alterné (`?1047`, `?1049`) : xterm.js n'aurait aucun historique à remonter.
    assert.ok(!/\x1b\[\?(1047|1049|47)[hl]/.test(view.sortie()), JSON.stringify(view.sortie()));
    // Ce qui a défilé hors de l'écran de 24 lignes est passé par le terminal : sa première ligne y est.
    assert.ok(withoutEscapes(view.sortie()).includes("ligne-1\n"), view.sortie());
  });

  test("avec `tmux`, la molette remonte l'historique de la session jusqu'à la première ligne d'une sortie plus longue qu'un écran, et la frappe suivante va au shell", { skip: multiplexer !== "tmux" && "screen tient la session" }, async (t) => {
    const { ouvrir: open, session, env } = workstation(t);

    const view = open();
    view.ecrire("seq 1 100 | sed s/^/ligne-/; echo FIN-$((6*7))\r");
    await until(() => withoutEscapes(view.sortie()).includes("FIN-42"), () => view.sortie());
    // La molette : tmux redessine l'écran depuis son historique, jusqu'à la première ligne.
    const before = view.sortie().length;
    await scroll(session, 200, { env });
    await until(() => /ligne-1(?!\d)/.test(withoutEscapes(view.sortie().slice(before))), () => view.sortie().slice(before));
    // Avant une frappe, l'app en sort : ce qui est tapé va au shell, pas au mode de copie.
    await scroll(session, 0, { env });
    view.ecrire("echo APRES-$((6*7))\r");
    await until(() => withoutEscapes(view.sortie()).includes("APRES-42"), () => view.sortie());
  });

  test("détruite, la session n'est plus : le rattachement suivant en crée une neuve, vide", async (t) => {
    const { ouvrir: open, session, env } = workstation(t);

    const first = open();
    first.ecrire("echo ANCIENNE-$((6*7)); cat\r");
    await until(() => withoutEscapes(first.sortie()).includes("ANCIENNE-42"), () => first.sortie());

    assert.deepEqual(await destroy(session, { env }), { detruite: true });
    // Détruite, la session emporte son terminal : il prend fin de lui-même.
    await first.fermer();

    const second = open();
    second.ecrire("echo NEUVE-$((1+1))\r");
    await until(() => withoutEscapes(second.sortie()).includes("NEUVE-2"), () => second.sortie());
    assert.ok(!withoutEscapes(second.sortie()).includes("ANCIENNE-42"), second.sortie());
  });

  test("détruire une session qui n'existe pas n'est pas un échec : il n'y avait rien à détruire", async (t) => {
    const { session, env } = workstation(t);
    assert.deepEqual(await destroy(session, { env }), { detruite: true });
  });
});

describe("la locale d'un shell persistant", () => {
  const locale = (env: Record<string, string>) =>
    execFileSync("/bin/sh", ["-c", `${scriptOfAttachment("brigade-essai-1").split("\nif command")[0]}\nprintf %s "$LANG"`], { encoding: "utf8", env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...env } });

  test("sans locale (app lancée depuis le Dock), le shell reçoit une locale UTF-8", { skip: WITHOUT_POSIX }, () => {
    assert.match(locale({}), /UTF-8$/);
    assert.match(locale({ LANG: "C" }), /UTF-8$/);
  });

  test("une locale UTF-8 du chef n'est pas touchée", { skip: WITHOUT_POSIX }, () => {
    assert.equal(locale({ LANG: "fr_FR.UTF-8" }), "fr_FR.UTF-8");
  });
});
