// Les shells persistants : ce que la couche lance sur ce poste, et ce
// que la session devient. Les commandes se lisent ; la persistance s'éprouve sur un
// vrai multiplexeur — `tmux`, ou `screen` à défaut, celui qui est installé —, sur un
// vrai terminal. Chaque test a son répertoire, où vivent les sockets de ses
// sessions et son `HOME` : rien ne touche aux sessions du poste, ni au réglage du chef.
// Aucun test n'attend une durée : chacun attend ce que le terminal affiche.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import {
  destruction,
  detruire,
  nomDeSession,
  NOM_DE_SESSION,
  rattachement,
  REGLAGES_SCREEN,
  REGLAGES_TMUX,
  SANS_MULTIPLEXEUR,
  scriptDeDestruction,
  scriptDeRattachement,
  type Cible,
  type Commande,
  type Session,
} from "../src/persistance.ts";
import { ouvrirPty, ptyDisponible } from "../src/pty.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const POSTE: Cible = { lieu: "poste" };
const AIDE_PTY = join(import.meta.dirname, "aides/pty.py");

// Attend un fait. Le délai n'est qu'une garde, pour qu'un test cassé finisse par le dire.
async function jusqua(condition: () => boolean, quoi: () => string): Promise<void> {
  const limite = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > limite) throw new Error(`jamais arrivé — ${quoi()}`);
    await new Promise((resoudre) => setTimeout(resoudre, 5));
  }
}

const sansEchappements = (texte: string) => texte.replace(/\x1b\[[0-9;?>=]*[ -/]*[@-~]|\x1b[()][0-9A-Za-z]|\x1b[=>78DEHMc]|\r/g, "");

describe("le nom d'une session", () => {
  test("il dit le projet et le rang, et se porte sans guillemets", () => {
    assert.equal(nomDeSession("parade", 3), "brigade-parade-3");
    assert.match(nomDeSession("Mon Projet", 1), NOM_DE_SESSION);
  });

  test("deux projets dont les noms s'écrivent pareil ne partagent pas une session", () => {
    assert.notEqual(nomDeSession("a b", 1), nomDeSession("a-b", 1));
    assert.notEqual(nomDeSession("A-b", 1), nomDeSession("a-b", 1));
    assert.match(nomDeSession("a b", 1), /^brigade-a-b-[0-9a-f]{8}-1$/);
  });

  test("un nom qui ne se porte pas tel quel n'est jamais écrit dans un script", () => {
    assert.throws(() => scriptDeRattachement("x'; rm -rf ~; '"), /lowercase letters, digits and dashes/);
    assert.throws(() => scriptDeDestruction("x y"), /lowercase letters, digits and dashes/);
  });
});

describe("la commande d'un shell persistant", () => {
  test("sur le poste, `sh` lit le script : il crée la session ou s'y rattache", () => {
    const { commande, args } = rattachement({ nom: "brigade-parade-1", cible: POSTE });
    assert.equal(commande, "/bin/sh");
    assert.deepEqual(args, ["-c", scriptDeRattachement("brigade-parade-1")]);
  });

  test("la destruction passe aussi par `sh`, sans terminal", () => {
    const { commande, args } = destruction({ nom: "brigade-parade-1", cible: POSTE });
    assert.equal(commande, "/bin/sh");
    assert.deepEqual(args, ["-c", scriptDeDestruction("brigade-parade-1")]);
  });

  test("le script se porte entre apostrophes par n'importe quel shell de connexion : il n'en contient aucune", () => {
    assert.ok(!scriptDeRattachement("brigade-parade-1").includes("'"));
    assert.ok(!scriptDeDestruction("brigade-parade-1").includes("'"));
  });
});

// Un faux multiplexeur dans un `PATH` à lui seul : il note ce qu'il reçoit, et dit
// qu'aucune session n'existe — le script en crée donc une, la règle, et s'y rattache.
function joue(t: TestContext, faux: "tmux" | "screen" | "aucun"): { appels: string[]; sortie: string } {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-persistance-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  symlinkSync(execFileSync("/bin/sh", ["-c", "command -v grep"], { encoding: "utf8" }).trim(), join(racine, "grep"));
  if (faux !== "aucun") {
    // `has-session`, `screen -ls` : rien n'existe.
    writeFileSync(join(racine, faux), `#!/bin/sh\nprintf '${faux} %s\\n' "$*" >> '${racine}/appels'\ncase "$1" in has-session|-ls) exit 1;; esac\nexit 0\n`);
    chmodSync(join(racine, faux), 0o755);
  }
  const sortie = execFileSync("/bin/sh", ["-c", scriptDeRattachement("brigade-essai-1")], { cwd: racine, encoding: "utf8", env: { PATH: racine, HOME: racine, SHELL: "/bin/true" } });
  let appels: string[] = [];
  try {
    appels = readFileSync(join(racine, "appels"), "utf8").trimEnd().split("\n");
  } catch {}
  return { appels, sortie };
}

describe("la configuration appliquée à la session", () => {
  test("avec `tmux` : ni souris, ni préfixe, ni barre — et rien qui active un mode de copie", { skip: SANS_POSIX }, (t) => {
    const { appels } = joue(t, "tmux");
    const racine = appels.find((appel) => appel.startsWith("tmux new-session"))?.match(/-c (\S+)$/)?.[1];
    assert.deepEqual(appels, [
      "tmux has-session -t =brigade-essai-1",
      `tmux new-session -d -s brigade-essai-1 -c ${racine}`,
      "tmux set-option -t =brigade-essai-1 mouse off",
      "tmux set-option -t =brigade-essai-1 prefix None",
      "tmux set-option -t =brigade-essai-1 prefix2 None",
      "tmux set-option -t =brigade-essai-1 status off",
      "tmux attach-session -t =brigade-essai-1",
    ]);
    assert.deepEqual(REGLAGES_TMUX, ["mouse off", "prefix None", "prefix2 None", "status off"]);
    assert.ok(!appels.some((appel) => /mouse on|copy-mode|set-clipboard|mode-keys/.test(appel)), appels.join("\n"));
  });

  test("avec `screen`, quand `tmux` manque : aucun suivi de la souris, et Ctrl-A reste au shell", { skip: SANS_POSIX }, (t) => {
    const { appels } = joue(t, "screen");
    assert.deepEqual(appels, [
      "screen -ls",
      "screen -dmS brigade-essai-1",
      "screen -S brigade-essai-1 -X defmousetrack off",
      "screen -S brigade-essai-1 -X mousetrack off",
      "screen -S brigade-essai-1 -X escape ",
      "screen -x brigade-essai-1",
    ]);
    assert.deepEqual(REGLAGES_SCREEN, ["defmousetrack off", "mousetrack off", 'escape ""']);
    assert.ok(!appels.some((appel) => /mousetrack on|copy/.test(appel)), appels.join("\n"));
  });

  test("sans aucun des deux : le shell s'ouvre quand même, et dit qu'il ne survivra pas à son terminal", { skip: SANS_POSIX }, (t) => {
    const { appels, sortie } = joue(t, "aucun");
    assert.deepEqual(appels, []);
    assert.equal(sortie, `${SANS_MULTIPLEXEUR}\n`);
  });
});

// Le multiplexeur que ce poste a — celui que le script prendra.
const multiplexeur = ["tmux", "screen"].find((outil) => {
  try {
    execFileSync("/bin/sh", ["-c", `command -v ${outil}`], { stdio: "ignore" });
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

const SAUTE = multiplexeur === undefined ? "ni tmux ni screen sur ce poste" : !ptyDisponible && !python ? `ni node-pty livré compilé pour ${process.platform}-${process.arch}, ni python3` : false;

type Vue = { sortie(): string; ecrire(donnees: string): void; fermer(): Promise<void> };

// Un vrai terminal, sur la commande d'un shell persistant : node-pty là où il est
// livré, l'aide en Python ailleurs. Son environnement est celui du test, passé par `env`.
function brancher(t: TestContext, { commande, args }: Commande, dossier: string, env: Record<string, string>): Vue {
  const ligne = ["/usr/bin/env", "-i", ...Object.entries(env).map(([cle, valeur]) => `${cle}=${valeur}`), commande, ...args];
  let sortie = "";
  let fini = false;
  if (ptyDisponible) {
    const pty = ouvrirPty({ commande: ligne[0] ?? "", args: ligne.slice(1), dossier, colonnes: 80, lignes: 24, surSortie: (donnees) => void (sortie += donnees), surFin: () => void (fini = true) });
    const fermer = async () => {
      if (!fini) pty.tuer();
      await jusqua(() => fini, () => sortie);
    };
    t.after(fermer);
    return { sortie: () => sortie, ecrire: pty.ecrire, fermer };
  }
  const enfant = spawn("python3", ["-I", AIDE_PTY, ...ligne], { cwd: dossier, stdio: ["pipe", "pipe", "inherit"] });
  enfant.stdout.on("data", (donnees: Buffer) => void (sortie += donnees.toString("utf8")));
  enfant.on("exit", () => void (fini = true));
  const fermer = async () => {
    if (!fini) enfant.kill();
    await jusqua(() => fini, () => sortie);
  };
  t.after(fermer);
  return { sortie: () => sortie, ecrire: (donnees) => void enfant.stdin.write(donnees), fermer };
}

let essais = 0;

// Ce poste, isolé : les sockets des sessions, le `HOME` et le dossier du test.
function poste(t: TestContext) {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-persistance-")));
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: racine, SHELL: "/bin/sh", TERM: "xterm-256color", TMUX_TMPDIR: racine, SCREENDIR: racine, LANG: "C" };
  const session: Session = { nom: nomDeSession(`essai-${process.pid}`, ++essais), cible: POSTE };
  t.after(async () => {
    await detruire(session, { env });
    rmSync(racine, { recursive: true, force: true });
  });
  return { racine, env, session, ouvrir: () => brancher(t, rattachement(session), racine, env) };
}

describe(`une session persistante sur ce poste${multiplexeur === undefined ? "" : `, par ${multiplexeur}`}`, { skip: SAUTE, concurrency: 4 }, () => {
  test("fermer le terminal ne fait que s'en détacher : rattaché, la commande lancée avant tourne toujours, et ce qu'elle avait affiché est là", async (t) => {
    const { ouvrir } = poste(t);

    const premier = ouvrir();
    // `cat` reste au premier plan : il ne rend ce qu'il reçoit que s'il tourne encore.
    premier.ecrire("echo AVANT-$((6*7)); cat\r");
    await jusqua(() => sansEchappements(premier.sortie()).includes("AVANT-42"), () => premier.sortie());
    premier.ecrire("ligne-une\r");
    await jusqua(() => (sansEchappements(premier.sortie()).match(/ligne-une/g) ?? []).length >= 2, () => premier.sortie());
    await premier.fermer();

    const second = ouvrir();
    // L'historique : le terminal rattaché montre ce que la session avait affiché.
    await jusqua(() => sansEchappements(second.sortie()).includes("AVANT-42") && sansEchappements(second.sortie()).includes("ligne-une"), () => second.sortie());
    // La commande : `cat` est toujours là, il rend ce qui lui est tapé.
    second.ecrire("apres-retour\r");
    await jusqua(() => (sansEchappements(second.sortie()).match(/apres-retour/g) ?? []).length >= 2, () => second.sortie());
  });

  test("détruite, la session n'est plus : le rattachement suivant en crée une neuve, vide", async (t) => {
    const { ouvrir, session, env } = poste(t);

    const premier = ouvrir();
    premier.ecrire("echo ANCIENNE-$((6*7)); cat\r");
    await jusqua(() => sansEchappements(premier.sortie()).includes("ANCIENNE-42"), () => premier.sortie());

    assert.deepEqual(await detruire(session, { env }), { detruite: true });
    // Détruite, la session emporte son terminal : il prend fin de lui-même.
    await premier.fermer();

    const second = ouvrir();
    second.ecrire("echo NEUVE-$((1+1))\r");
    await jusqua(() => sansEchappements(second.sortie()).includes("NEUVE-2"), () => second.sortie());
    assert.ok(!sansEchappements(second.sortie()).includes("ANCIENNE-42"), second.sortie());
  });

  test("détruire une session qui n'existe pas n'est pas un échec : il n'y avait rien à détruire", async (t) => {
    const { session, env } = poste(t);
    assert.deepEqual(await detruire(session, { env }), { detruite: true });
  });
});
