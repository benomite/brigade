// Ce qui change d'un ordinateur à l'autre (plateforme.ts) : le nom de ce poste à l'écran, le shell
// qu'il ouvre, s'il y tient une session, et l'arrêt d'un process et de ce qu'il a lancé. Chaque
// plateforme est nommée : le test dit la même chose sur un Mac, sous Linux et sous Windows.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { arreterLArbre, BASH_DE_GIT, enGroupe, nomDuPoste, persistantSur, shellDuPoste } from "../src/plateforme.ts";

const WINDOWS = { ProgramW6432: "C:\\Program Files", ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\chef\\AppData\\Local" };

describe("ce poste, d'une plateforme à l'autre", () => {
  test("son nom à l'écran : « this Mac », « this PC » sous Windows, « this computer » ailleurs", () => {
    assert.equal(nomDuPoste("darwin"), "this Mac");
    assert.equal(nomDuPoste("win32"), "this PC");
    assert.equal(nomDuPoste("linux"), "this computer");
  });

  test("sur un Mac ou un Linux, son shell est celui du chef, en shell de connexion — `zsh` sur un Mac qui n'en dit rien", () => {
    assert.deepEqual(shellDuPoste("darwin", { SHELL: "/opt/homebrew/bin/fish" }), { commande: "/opt/homebrew/bin/fish", args: ["-l"] });
    assert.deepEqual(shellDuPoste("darwin", {}), { commande: "/bin/zsh", args: ["-l"] });
    assert.deepEqual(shellDuPoste("linux", {}), { commande: "/bin/sh", args: ["-l"] });
  });

  test("sous Windows, le `bash` de Git — celui que `claude` prend, le sien d'abord —, sinon PowerShell", () => {
    const bash = join("C:\\Program Files", "Git", "bin", "bash.exe");
    assert.deepEqual(shellDuPoste("win32", WINDOWS, (chemin) => chemin === bash), { commande: bash, args: ["--login", "-i"] });
    assert.deepEqual(shellDuPoste("win32", { ...WINDOWS, CLAUDE_CODE_GIT_BASH_PATH: "D:\\Git\\bin\\bash.exe" }, () => true), { commande: "D:\\Git\\bin\\bash.exe", args: ["--login", "-i"] });
    assert.deepEqual(shellDuPoste("win32", WINDOWS, () => false), { commande: "powershell.exe", args: ["-NoLogo"] });
    // `SHELL` ne dit rien sous Windows : un `bash` de Git lancé d'un terminal l'aurait posé.
    assert.deepEqual(shellDuPoste("win32", { ...WINDOWS, SHELL: "/usr/bin/bash" }, () => false), { commande: "powershell.exe", args: ["-NoLogo"] });
    assert.equal(BASH_DE_GIT(WINDOWS).at(-1), join("C:\\Users\\chef\\AppData\\Local", "Programs", "Git", "bin", "bash.exe"));
  });

  test("une session persistante sur ce poste, et un process chef de son groupe : partout sauf sous Windows", () => {
    for (const plateforme of ["darwin", "linux"]) {
      assert.equal(persistantSur(plateforme), true, plateforme);
      assert.equal(enGroupe(plateforme), true, plateforme);
    }
    assert.equal(persistantSur("win32"), false);
    assert.equal(enGroupe("win32"), false);
  });

  test("arrêter un process et ce qu'il a lancé : son groupe reçoit le signal ; un groupe déjà parti n'est pas une erreur", () => {
    const recus: [number, NodeJS.Signals][] = [];
    arreterLArbre(4242, "SIGTERM", "darwin", (pid, signal) => void recus.push([pid, signal]));
    assert.deepEqual(recus, [[-4242, "SIGTERM"]]);
    assert.doesNotThrow(() =>
      arreterLArbre(4242, "SIGKILL", "linux", () => {
        throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
      }),
    );
  });

  test("aucun chemin de l'app n'est réservé au Mac hors d'ici : chaque module reçoit d'ici ce qui dépend de la plateforme", () => {
    const src = join(import.meta.dirname, "../src");
    const surMac = readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter((fichier) => /\.(ts|js|cjs)$/.test(fichier))
      .filter((fichier) => /["'`]darwin["'`]/.test(readFileSync(join(src, fichier), "utf8")));
    assert.deepEqual(surMac.sort(), ["plateforme.ts"]);
  });
});
