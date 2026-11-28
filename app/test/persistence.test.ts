// Les shells persistants : ce que la couche lance sur ce poste, et ce
// que la session devient. Les commandes se lisent ; la persistance s'éprouve sur un
// vrai multiplexeur — `tmux`, ou `screen` à défaut, celui qui est installé —, sur un
// vrai terminal. Chaque test a son répertoire, où vivent les sockets de ses
// sessions et son `HOME` : rien ne touche aux sessions du poste, ni au réglage du chef.
// Aucun test n'attend une durée : chacun attend ce que le terminal affiche.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, statSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { destruction, nameOfSession, NAME_OF_SESSION, attachment, SETTINGS_SCREEN, SETTINGS_TMUX, WITHOUT_MULTIPLEXER, scriptOfDestruction, scriptOfAttachment, type Target } from "../src/persistence.ts";
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


type Vue = { sortie(): string; ecrire(data: string): void; fermer(): Promise<void> };


let trials = 0;



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
