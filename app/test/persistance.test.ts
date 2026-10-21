// Les shells persistants : ce que la couche lance, sur ce poste ou par `ssh`, et ce
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
  joindre,
  nomDeSession,
  NOM_DE_SESSION,
  rattachement,
  REGLAGES_SCREEN,
  REGLAGES_TMUX,
  SANS_MULTIPLEXEUR,
  scriptDeDestruction,
  scriptDeRattachement,
  sonde,
  VIGILANCE_SSH,
  type Cible,
  type Commande,
  type Session,
} from "../src/persistance.ts";
import { ouvrirPty, ptyDisponible } from "../src/pty.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const POSTE: Cible = { lieu: "poste" };
const BOX: Cible = { lieu: "box", nom: "parade-box", hote: "parade-box" };
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
  const session: Session = { nom: "brigade-parade-1", cible: BOX };

  test("sur le poste, `sh` lit le script : il crée la session ou s'y rattache", () => {
    const { commande, args } = rattachement({ nom: "brigade-parade-1", cible: POSTE });
    assert.equal(commande, "/bin/sh");
    assert.deepEqual(args, ["-c", scriptDeRattachement("brigade-parade-1")]);
  });

  test("vers la box, `ssh` joint `hote` tel que le chef l'a déclaré, et le compte est celui que son `ssh` lui donne — jamais celui du service", () => {
    const { commande, args } = rattachement(session, "/usr/bin/ssh");
    assert.equal(commande, "/usr/bin/ssh");
    assert.deepEqual(args, ["-t", ...VIGILANCE_SSH, "--", "parade-box", `sh -c '${scriptDeRattachement("brigade-parade-1")}'`]);

    // Une destination qui nomme son compte le garde : rien ne s'y ajoute ni ne s'y substitue.
    const avecCompte = rattachement({ ...session, cible: { lieu: "box", nom: "parade-box", hote: "debian@parade-box" } });
    assert.equal(avecCompte.args.at(-2), "debian@parade-box");
    assert.equal(avecCompte.args.filter((arg) => arg.includes("@")).length, 1);

    for (const { args: lus } of [rattachement(session), destruction(session), rattachement({ ...session, cible: { lieu: "station", nom: "mac", hote: "mac.local" } })]) {
      const options = lus.slice(0, lus.indexOf("--"));
      // Ni `-l <compte>`, ni `-o User=…` : le compte n'est jamais choisi par l'app.
      assert.ok(!options.includes("-l"), lus.join(" "));
      assert.ok(!options.some((option) => /^user=/i.test(option)), lus.join(" "));
      // Et une fois sur la box, rien ne change de compte.
      const distante = lus.at(-1) ?? "";
      assert.doesNotMatch(distante, /\b(sudo|su|runuser|doas|pkexec|machinectl)\b/);
      assert.doesNotMatch(distante, /\bbrigade@/);
    }
  });

  test("une connexion morte se lâche au lieu d'attendre : dix secondes pour joindre, trente sans réponse d'une connexion établie", () => {
    assert.deepEqual(VIGILANCE_SSH, ["-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3"]);
  });

  test("la sonde demande à la machine si elle répond, sans terminal, sans rien demander au chef, et n'y lance rien", () => {
    assert.deepEqual(sonde(BOX, "/usr/bin/ssh"), { commande: "/usr/bin/ssh", args: ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "--", "parade-box", "true"] });
    assert.deepEqual(sonde(POSTE), { commande: "/bin/sh", args: ["-c", "true"] });
  });

  test("une machine qui ne répond pas : la sonde rend ce que `ssh` en a dit, sans exception", { skip: SANS_POSIX }, async () => {
    assert.deepEqual(await joindre(POSTE), { joint: true });
    const rendu = await joindre(BOX, { ssh: "/nonexistent/ssh" });
    assert.ok("erreur" in rendu && rendu.erreur.length > 0, JSON.stringify(rendu));
  });

  test("le script se porte entre apostrophes par n'importe quel shell de connexion : il n'en contient aucune", () => {
    assert.ok(!scriptDeRattachement("brigade-parade-1").includes("'"));
    assert.ok(!scriptDeDestruction("brigade-parade-1").includes("'"));
  });

  test("la destruction vers la box ne demande rien : sans terminal, `ssh` échoue plutôt que d'attendre un mot de passe", () => {
    assert.deepEqual(destruction(session, "ssh", 7).args, ["-o", "BatchMode=yes", "-o", "ConnectTimeout=7", "--", "parade-box", `sh -c '${scriptDeDestruction("brigade-parade-1")}'`]);
  });

  test("par un faux `ssh` qui joue la ligne reçue comme le shell de la box : le compte n'est pas changé, et la ligne se lit entière", { skip: SANS_POSIX }, (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-persistance-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    // Il note ses arguments, puis joue le dernier sous le compte qui l'a lancé — celui du chef.
    const ssh = join(racine, "ssh");
    writeFileSync(ssh, `#!/bin/sh\nprintf '%s\\n' "$@" > '${racine}/appel'\nfor dernier; do :; done\nexec /bin/sh -c "$dernier"\n`);
    chmodSync(ssh, 0o755);
    symlinkSync("/bin/sh", join(racine, "sh"));
    // Aucun multiplexeur dans son `PATH` : la destruction n'a rien à détruire, et le dit par son code.
    const { commande, args } = destruction(session, ssh);
    execFileSync(commande, args, { env: { PATH: racine, HOME: racine } });
    assert.deepEqual(readFileSync(join(racine, "appel"), "utf8").trimEnd().split("\n").slice(0, 5), ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "--"]);
    assert.equal(readFileSync(join(racine, "appel"), "utf8").split("\n")[5], "parade-box");
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
