import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { citerArgument, envSansInvite, execFile, execFileSync, interpreteDuShebang, lancementSousWindows, ligneDeCmd, shellsDeGit, type OutilsWindows } from "../src/sans-invite.ts";
import { repertoireTemporaire } from "./outils.ts";
import { windowsOnly } from "./support/plateforme.ts";

const SRC = join(import.meta.dirname, "..", "src");

const sources = (dossier = SRC): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? sources(join(dossier, entree.name)) : entree.name.endsWith(".ts") ? [join(dossier, entree.name)] : []));

test("l'environnement sans invite coupe les questions de git, de gh et de ssh — sans écraser un réglage de l'appelant", () => {
  const env = envSansInvite({ PATH: "/bin" });
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GH_PROMPT_DISABLED, "1");
  assert.equal(env.GIT_ASKPASS, "false");
  assert.match(env.GIT_SSH_COMMAND ?? "", /BatchMode=yes/);
  assert.equal(env.PATH, "/bin");
  assert.equal(envSansInvite({ GIT_ASKPASS: "/mon/askpass" }).GIT_ASKPASS, "/mon/askpass");
});

test("un git fetch contre un dépôt qui réclame des identifiants échoue vite, avec sa raison, sans attendre l'entrée", async () => {
  const serveur = createServer((_, reponse) => {
    reponse.writeHead(401, { "WWW-Authenticate": 'Basic realm="depot"' }).end();
  });
  await new Promise<void>((resolu) => serveur.listen(0, "127.0.0.1", resolu));
  try {
    const { port } = serveur.address() as { port: number };
    const debut = Date.now();
    // Le `env` de l'appelant n'a aucun réglage de prompt : c'est le module partagé qui le pose.
    const erreur = await new Promise<Error & { stderr?: string }>((resolu, rejeter) => {
      const enfant = execFile("git", ["fetch", `http://127.0.0.1:${port}/depot.git`], { env: { PATH: process.env.PATH, HOME: "/nonexistent", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, timeout: 60_000 }, (e, _, stderr) =>
        e ? resolu(Object.assign(e, { stderr })) : rejeter(new Error("le fetch aurait dû échouer")),
      );
      // Un git qui attendrait une réponse sur son entrée resterait ici bloqué : on la laisse ouverte.
      enfant.stdin?.on("error", () => {});
    });
    assert.match(erreur.stderr ?? "", /could not read Username/);
    assert.ok(Date.now() - debut < 30_000, "l'échec doit venir en secondes");
  } finally {
    serveur.close();
  }
});

test("`runtime/src` : aucun lancement de process ne contourne l'environnement sans invite", () => {
  for (const fichier of sources()) {
    const nom = relative(SRC, fichier);
    const code = readFileSync(fichier, "utf8")
      .split("\n")
      .filter((ligne) => !ligne.trimStart().startsWith("//"))
      .join("\n");
    if (nom === "sans-invite.ts") continue;
    assert.doesNotMatch(code, /node:child_process/, `${nom} lance ses process lui-même`);
    assert.doesNotMatch(code, /require\(\s*["'](node:)?child_process["']\s*\)|import\(\s*["'](node:)?child_process["']\s*\)/, nom);
    assert.doesNotMatch(code, /process\.binding\(/, nom);
  }
});

test("`promisify(execFile)` sur la version du module rend `{ stdout, stderr }`, comme celle de Node — et lance sans invite", async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["-p", "process.env.GIT_TERMINAL_PROMPT"]);
  assert.equal(stdout.trim(), "0");
  assert.equal(stderr, "");
});

// --- Le lancement sous Windows ----------------------------------------------
//
// Ce qui se décide se prouve partout ; ce qui ne se joue que sous Windows — un
// vrai `.cmd`, un vrai script à shebang — se joue sur le job Windows.

const SHELLS = { bash: "C:\\Program Files\\Git\\bin\\bash.exe", sh: "C:\\Program Files\\Git\\bin\\sh.exe" };
const PREMIERES: Record<string, string> = {
  "C:\\Users\\Jean Dupont\\faux cook.ts": "#!/usr/bin/env node",
  "C:\\t\\outil": "#!/usr/bin/env -S node --no-warnings",
  "C:\\t\\faux-claude.sh": "#!/usr/bin/env bash",
  "C:\\t\\vieux": "#!/bin/sh -e",
  "C:\\t\\script.py": "#!/usr/bin/env python3",
  "C:\\t\\binaire": "MZ\u0090",
};
const OUTILS: OutilsWindows = {
  node: "C:\\Program Files\\nodejs\\node.exe",
  cmd: "C:\\Windows\\system32\\cmd.exe",
  shells: () => SHELLS,
  premiereLigne: (chemin) => PREMIERES[chemin] ?? null,
};
const sousWindows = (commande: string, args: string[] = ["-p", "x"]) => lancementSousWindows(commande, args, OUTILS);

test("sous Windows, un exécutable, ou un nom que le PATH résoudra, se lance tel quel", () => {
  assert.deepEqual(sousWindows("C:\\Program Files\\Claude\\claude.exe"), { commande: "C:\\Program Files\\Claude\\claude.exe", args: ["-p", "x"], tels: false });
  assert.deepEqual(sousWindows("git", ["status"]), { commande: "git", args: ["status"], tels: false });
  assert.deepEqual(sousWindows("C:\\t\\OUTIL.COM", []), { commande: "C:\\t\\OUTIL.COM", args: [], tels: false });
  // Ni shebang, ni fichier : Windows dira lui-même ce qu'il en pense.
  assert.deepEqual(sousWindows("C:\\t\\binaire"), { commande: "C:\\t\\binaire", args: ["-p", "x"], tels: false });
  assert.deepEqual(sousWindows("C:\\t\\absent"), { commande: "C:\\t\\absent", args: ["-p", "x"], tels: false });
});

test("sous Windows, un script à shebang part par son interprète : `node` est celui du runtime, `bash` et `sh` ceux de Git, tout autre son nom", () => {
  assert.deepEqual(sousWindows("C:\\Users\\Jean Dupont\\faux cook.ts"), { commande: OUTILS.node, args: ["C:\\Users\\Jean Dupont\\faux cook.ts", "-p", "x"], tels: false });
  assert.deepEqual(sousWindows("C:\\t\\outil", ["a"]), { commande: OUTILS.node, args: ["--no-warnings", "C:\\t\\outil", "a"], tels: false });
  // Le bash de Git lit le chemin du script écrit avec des barres obliques.
  assert.deepEqual(sousWindows("C:\\t\\faux-claude.sh"), { commande: SHELLS.bash, args: ["C:/t/faux-claude.sh", "-p", "x"], tels: false });
  assert.deepEqual(sousWindows("C:\\t\\vieux", []), { commande: SHELLS.sh, args: ["-e", "C:/t/vieux"], tels: false });
  assert.deepEqual(sousWindows("C:\\t\\script.py", []), { commande: "python3", args: ["C:\\t\\script.py"], tels: false });
  // `bash` et `sh` eux-mêmes : ceux de Git, pas celui de WSL.
  assert.deepEqual(sousWindows("bash", ["-c", "exit 0"]), { commande: SHELLS.bash, args: ["-c", "exit 0"], tels: false });
  assert.deepEqual(sousWindows("/bin/sh", ["-c", "exit 0"]), { commande: SHELLS.sh, args: ["-c", "exit 0"], tels: false });
});

test("la ligne de shebang nomme son interprète, passé `env`, ses options et ses variables", () => {
  assert.deepEqual(interpreteDuShebang("#!/usr/bin/env node"), { nom: "node", args: [] });
  assert.deepEqual(interpreteDuShebang("#! /usr/bin/env -S NODE_OPTIONS=x node --no-warnings"), { nom: "node", args: ["--no-warnings"] });
  assert.deepEqual(interpreteDuShebang("#!/bin/bash -eu"), { nom: "bash", args: ["-eu"] });
  assert.deepEqual(interpreteDuShebang("#!C:\\Python\\python.exe"), { nom: "python", args: [] });
  assert.equal(interpreteDuShebang("#!"), null);
  assert.equal(interpreteDuShebang("#!/usr/bin/env"), null);
  assert.equal(interpreteDuShebang("MZ"), null);
});

test("le bash et le sh de Git se trouvent à côté de `git`, ou se cherchent dans le PATH", () => {
  // Les chemins se forment avec le séparateur de la plateforme : `\` sous Windows.
  const [bash, sh] = [join("/c/Program Files/Git", "bin", "bash.exe"), join("/c/Program Files/Git", "usr", "bin", "sh.exe")];
  assert.deepEqual(shellsDeGit("/c/Program Files/Git/mingw64/libexec/git-core", (chemin) => chemin === bash || chemin === sh), { bash, sh });
  assert.deepEqual(shellsDeGit("/c/Git/mingw64/libexec/git-core", () => false), { bash: "bash", sh: "bash" });
  assert.deepEqual(shellsDeGit(null), { bash: "bash", sh: "sh" });
});

// Ce que la bibliothèque C de Windows relit d'une ligne de commande — ses règles
// pour un argument entre guillemets : `2n` contre-obliques et un guillemet font
// `n` contre-obliques et ouvrent ou ferment la citation, `2n+1` font `n`
// contre-obliques et un guillemet ; les autres contre-obliques sont ce qu'elles
// sont.
function relireLaLigne(ligne: string): string[] {
  const args: string[] = [];
  let courant: string | null = null;
  let cite = false;
  for (let i = 0; i < ligne.length; i++) {
    const caractere = ligne[i];
    if (caractere === "\\") {
      let n = 0;
      while (ligne[i + n] === "\\") n += 1;
      if (ligne[i + n] === '"') {
        courant = (courant ?? "") + "\\".repeat(Math.floor(n / 2));
        if (n % 2 === 1) courant += '"';
        else cite = !cite;
        i += n;
      } else {
        courant = (courant ?? "") + "\\".repeat(n);
        i += n - 1;
      }
    } else if (caractere === '"') {
      courant ??= "";
      cite = !cite;
    } else if (caractere === " " && !cite) {
      if (courant !== null) args.push(courant);
      courant = null;
    } else {
      courant = (courant ?? "") + caractere;
    }
  }
  if (courant !== null) args.push(courant);
  return args;
}

// Ce qui se dit difficilement sur une ligne de commande de Windows.
const DIFFICILES = ["a b", "", "C:\\dossier avec espaces\\", "\\\\serveur\\partage", 'il dit "bonjour"', 'a\\"b', "a\\\\", "a&b|c", "%PATH%", "^chapeau", "!bang!", "(entre parenthèses)", "point;virgule,virgule", "<moins>plus", "*?", "Bash(gh pr merge:*)", "« ticket » — #14"];

test("un argument cité se relit tel quel, quoi qu'il porte : espaces, guillemets, contre-obliques en fin", () => {
  assert.equal(citerArgument("a b"), '"a b"');
  assert.equal(citerArgument(""), '""');
  assert.equal(citerArgument("C:\\dossier\\"), '"C:\\dossier\\\\"');
  assert.equal(citerArgument('dit "oui"'), '"dit \\"oui\\""');
  for (const argument of DIFFICILES) assert.deepEqual(relireLaLigne(citerArgument(argument)), [argument], argument);
  assert.deepEqual(relireLaLigne(DIFFICILES.map(citerArgument).join(" ")), DIFFICILES);
});

test("un `.cmd` part par `cmd.exe`, sa ligne écrite pour lui : tout y est échappé, deux fois pour ce que le fichier relit — et une consigne sur plusieurs lignes est refusée en le disant", () => {
  const lance = sousWindows("C:\\Program Files\\Outil\\outil.cmd", ["a b", "&"]);
  assert.deepEqual(lance, { commande: OUTILS.cmd, args: ["/d", "/s", "/c", '"C:\\Program^ Files\\Outil\\outil.cmd ^^^"a^^^ b^^^" ^^^"^^^&^^^""'], tels: true });
  assert.equal(sousWindows("C:\\t\\VIEUX.BAT", []).commande, OUTILS.cmd);
  // `cmd.exe` retire un `^` à sa lecture de la ligne, le fichier de commandes un autre en relisant
  // ses arguments : il reste chaque argument cité, que le programme relit tel quel.
  const lire = (texte: string) => texte.replace(/\^(.)/g, "$1");
  for (const argument of DIFFICILES) {
    const [, ecrit = ""] = ligneDeCmd("x.cmd", [argument]).split(/ (.*)/s);
    assert.equal(lire(lire(ecrit)), citerArgument(argument), argument);
  }
  assert.throws(() => sousWindows("C:\\npm\\claude.cmd", ["-p", "ligne 1\nligne 2"]), /C:\\npm\\claude\.cmd.*receives no argument that spans several lines.*claude\.exe/);
});

// Un programme qui rend ses arguments, en JSON.
function rendreSesArguments(t: TestContext): { dossier: string; script: string } {
  const dossier = join(repertoireTemporaire(t), "dossier avec espaces");
  mkdirSync(dossier);
  const script = join(dossier, "rend ses arguments.mjs");
  writeFileSync(script, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  return { dossier, script };
}

const SOUS_WINDOWS = windowsOnly("launches a real .cmd and a real shebang script, as Windows does");

test("sous Windows, un `.cmd` rangé sous un chemin à espaces reçoit chaque argument tel quel, et refuse une consigne sur plusieurs lignes", { skip: SOUS_WINDOWS }, (t) => {
  const { dossier, script } = rendreSesArguments(t);
  const lanceur = join(dossier, "lanceur du cook.cmd");
  writeFileSync(lanceur, `@"${process.execPath}" "${script}" %*\r\n`);
  assert.deepEqual(JSON.parse(execFileSync(lanceur, DIFFICILES, { encoding: "utf8" })), DIFFICILES);
  assert.throws(() => execFileSync(lanceur, ["-p", "ligne 1\nligne 2"], { encoding: "utf8" }), /spans several lines/);
});

test("sous Windows, un script à shebang rangé sous un chemin à espaces part par son interprète, et reçoit chaque argument tel quel — une consigne sur plusieurs lignes comprise", { skip: SOUS_WINDOWS }, (t) => {
  const { script } = rendreSesArguments(t);
  const args = [...DIFFICILES, "ligne 1\nligne 2\n"];
  assert.deepEqual(JSON.parse(execFileSync(script, args, { encoding: "utf8" })), args);
});
