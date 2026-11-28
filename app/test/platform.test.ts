// Ce qui change d'un ordinateur à l'autre (platform.ts) : le nom de ce poste à l'écran, le shell
// qu'il ouvre, s'il y tient une session, et l'arrêt d'un process et de ce qu'il a lancé. Chaque
// plateforme est nommée : le test dit la même chose sur un Mac, sous Linux et sous Windows.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { BASH_OF_GIT, nameOfWorkstation, shellOfWorkstation } from "../src/platform.ts";

const WINDOWS = { ProgramW6432: "C:\\Program Files", ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\chef\\AppData\\Local" };

describe("ce poste, d'une plateforme à l'autre", () => {
  test("son nom à l'écran : « this computer » sur toutes les plateformes (le lexique de l'app)", () => {
    assert.equal(nameOfWorkstation(), "this computer");
  });

  test("sur un Mac ou un Linux, son shell est celui du chef, en shell de connexion — `zsh` sur un Mac qui n'en dit rien", () => {
    assert.deepEqual(shellOfWorkstation("darwin", { SHELL: "/opt/homebrew/bin/fish" }), { commande: "/opt/homebrew/bin/fish", args: ["-l"] });
    assert.deepEqual(shellOfWorkstation("darwin", {}), { commande: "/bin/zsh", args: ["-l"] });
    assert.deepEqual(shellOfWorkstation("linux", {}), { commande: "/bin/sh", args: ["-l"] });
  });

  test("sous Windows, le `bash` de Git — celui que `claude` prend, le sien d'abord —, sinon PowerShell", () => {
    const bash = join("C:\\Program Files", "Git", "bin", "bash.exe");
    assert.deepEqual(shellOfWorkstation("win32", WINDOWS, (path) => path === bash), { commande: bash, args: ["--login", "-i"] });
    assert.deepEqual(shellOfWorkstation("win32", { ...WINDOWS, CLAUDE_CODE_GIT_BASH_PATH: "D:\\Git\\bin\\bash.exe" }, () => true), { commande: "D:\\Git\\bin\\bash.exe", args: ["--login", "-i"] });
    assert.deepEqual(shellOfWorkstation("win32", WINDOWS, () => false), { commande: "powershell.exe", args: ["-NoLogo"] });
    // `SHELL` ne dit rien sous Windows : un `bash` de Git lancé d'un terminal l'aurait posé.
    assert.deepEqual(shellOfWorkstation("win32", { ...WINDOWS, SHELL: "/usr/bin/bash" }, () => false), { commande: "powershell.exe", args: ["-NoLogo"] });
    assert.equal(BASH_OF_GIT(WINDOWS).at(-1), join("C:\\Users\\chef\\AppData\\Local", "Programs", "Git", "bin", "bash.exe"));
  });



  test("aucun chemin de l'app n'est réservé au Mac hors d'ici : chaque module reçoit d'ici ce qui dépend de la plateforme", () => {
    const src = join(import.meta.dirname, "../src");
    const onMac = readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(ts|js|cjs)$/.test(file))
      .filter((file) => /["'`]darwin["'`]/.test(readFileSync(join(src, file), "utf8")));
    assert.deepEqual(onMac.sort(), ["platform.ts"]);
  });
});
