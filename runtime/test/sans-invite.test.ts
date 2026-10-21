import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { execFile, envSansInvite, pourWindows, shellsDeGit } from "../src/sans-invite.ts";

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

test("sous Windows, `bash`, `sh` et un script à shebang passent par le bash de Git — un `#!/usr/bin/env node` par le node du runtime, un exécutable tel quel", () => {
  const shells = { bash: "C:\\Program Files\\Git\\bin\\bash.exe", sh: "C:\\Program Files\\Git\\bin\\sh.exe" };
  const premieres: Record<string, string> = { "C:\\t\\faux-claude.sh": "#!/usr/bin/env bash", "C:\\t\\outil": "#!/usr/bin/env node", "C:\\t\\vieux": "#!/bin/sh -e", "C:\\t\\binaire": "MZ\u0090" };
  const lire = (chemin: string) => premieres[chemin] ?? null;
  assert.deepEqual(pourWindows("bash", ["-c", "exit 0"], shells, lire), { commande: shells.bash, args: ["-c", "exit 0"] });
  assert.deepEqual(pourWindows("sh", ["-c", "exit 0"], shells, lire), { commande: shells.sh, args: ["-c", "exit 0"] });
  assert.deepEqual(pourWindows("C:\\t\\faux-claude.sh", ["-p", "x"], shells, lire), { commande: shells.bash, args: ["C:/t/faux-claude.sh", "-p", "x"] });
  assert.deepEqual(pourWindows("C:\\t\\outil", ["a"], shells, lire), { commande: process.execPath, args: ["C:\\t\\outil", "a"] });
  assert.deepEqual(pourWindows("C:\\t\\vieux", [], shells, lire), { commande: shells.sh, args: ["C:/t/vieux"] });
  assert.deepEqual(pourWindows("C:\\t\\binaire", ["x"], shells, lire), { commande: "C:\\t\\binaire", args: ["x"] });
  assert.deepEqual(pourWindows("C:\\t\\claude.exe", ["x"], shells, lire), { commande: "C:\\t\\claude.exe", args: ["x"] });
  assert.deepEqual(pourWindows("git", ["status"], shells, lire), { commande: "git", args: ["status"] });
});

test("sous Windows, le bash de Git est celui qui est à côté de `git`, ou celui que nomme BRIGADE_BASH_BIN", () => {
  assert.deepEqual(shellsDeGit({ BRIGADE_BASH_BIN: "D:\\bash.exe" }), { bash: "D:\\bash.exe", sh: "D:\\bash.exe" });
  // Sur cette machine, `git` est là : ce qu'on trouve à côté de lui, ou les noms nus.
  const trouves = shellsDeGit({ PATH: process.env.PATH }, () => false);
  assert.deepEqual(trouves, { bash: "bash", sh: "bash" });
});

test("`promisify(execFile)` sur la version du module rend `{ stdout, stderr }`, comme celle de Node — et lance sans invite", async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["-p", "process.env.GIT_TERMINAL_PROMPT"]);
  assert.equal(stdout.trim(), "0");
  assert.equal(stderr, "");
});
