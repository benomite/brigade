import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { Sortie } from "../../src/appel.ts";
import { dansLePath, OUTILS, principal, verifierLesOutils, type Outil, type OutilVu } from "../../src/second/outils.ts";
import { repertoireTemporaire } from "../outils.ts";

// Un ensemble de fichiers lançables, pour une plateforme qu'on ne joue pas forcément.
const fichiers = (...chemins: string[]) => {
  const tous = new Set(chemins);
  return (chemin: string) => tous.has(chemin);
};

const manquant = (vus: readonly OutilVu[], outil: Outil) => {
  const vu = vus.find(({ tool }) => tool === outil);
  assert.ok(vu !== undefined && !vu.present, `${outil} devrait manquer`);
  return vu;
};

// Une phrase : une ligne, un point final, pas de seconde phrase après un point.
const unePhrase = (texte: string) => {
  assert.match(texte, /^[^\n]+\.$/, texte);
  assert.doesNotMatch(texte, /\.\s+[A-Z]/, texte);
};

test("les quatre outils dans le PATH : le second a tout ce qu'il lui faut, chacun avec son chemin", () => {
  const etat = verifierLesOutils({
    plateforme: "linux",
    env: { PATH: "/usr/local/bin:/usr/bin" },
    maison: "/home/chef",
    existe: fichiers("/usr/local/bin/claude", "/usr/bin/gh", "/usr/bin/git", "/usr/bin/ssh", "/usr/bin/claude"),
  });
  assert.deepEqual(etat, {
    state: "ready",
    tools: [
      { tool: "claude", present: true, path: "/usr/local/bin/claude" },
      { tool: "gh", present: true, path: "/usr/bin/gh" },
      { tool: "git", present: true, path: "/usr/bin/git" },
      { tool: "ssh", present: true, path: "/usr/bin/ssh" },
    ],
  });
});

test("sous Windows, il manque gh et ssh : la vérification les nomme, et dit pour chacun en une phrase comment l'obtenir", () => {
  const etat = verifierLesOutils({
    plateforme: "win32",
    // Un environnement de Windows copié dans un objet : son PATH s'écrit `Path`.
    env: { Path: "C:\\Users\\chef\\AppData\\Roaming\\npm;C:\\Program Files\\Git\\cmd", PATHEXT: ".COM;.EXE;.BAT;.CMD", SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files" },
    maison: "C:\\Users\\chef",
    existe: fichiers("C:\\Users\\chef\\AppData\\Roaming\\npm\\claude.cmd", "C:\\Program Files\\Git\\cmd\\git.exe"),
  });
  assert.equal(etat.state, "missing");
  assert.ok(etat.state === "missing");
  assert.deepEqual(etat.missing, ["gh", "ssh"]);
  assert.equal(etat.reason, "The second needs `gh` and `ssh`, and this PC does not have them.");
  const gh = manquant(etat.tools, "gh");
  assert.match(gh.install, /winget install --id GitHub\.cli/);
  assert.match(gh.reason, /^`gh` is not installed on this PC/);
  const ssh = manquant(etat.tools, "ssh");
  assert.match(ssh.install, /OpenSSH/);
  for (const vu of [gh, ssh]) {
    unePhrase(vu.install);
    unePhrase(vu.reason);
    assert.match(vu.link, /^https:\/\//);
  }
  assert.deepEqual(
    etat.tools.filter((vu) => vu.present),
    [
      { tool: "claude", present: true, path: "C:\\Users\\chef\\AppData\\Roaming\\npm\\claude.cmd" },
      { tool: "git", present: true, path: "C:\\Program Files\\Git\\cmd\\git.exe" },
    ],
  );
});

test("sous Windows, `claude` est le lanceur `.cmd` d'npm, jamais le fichier sans extension posé à côté — et un `.exe` passe avant, comme PATHEXT l'ordonne", () => {
  const npm = "C:\\Users\\chef\\AppData\\Roaming\\npm";
  const env = { PATH: npm, PATHEXT: ".COM;.EXE;.BAT;.CMD" };
  assert.equal(dansLePath("claude", { plateforme: "win32", env, existe: fichiers(`${npm}\\claude`, `${npm}\\claude.cmd`, `${npm}\\claude.ps1`) }), `${npm}\\claude.cmd`);
  assert.equal(dansLePath("claude", { plateforme: "win32", env, existe: fichiers(`${npm}\\claude.cmd`, `${npm}\\claude.exe`) }), `${npm}\\claude.exe`);
  assert.equal(dansLePath("claude", { plateforme: "win32", env, existe: fichiers(`${npm}\\claude`) }), null);
  // Un dossier du PATH écrit entre guillemets.
  assert.equal(dansLePath("gh", { plateforme: "win32", env: { PATH: '"C:\\Program Files\\GitHub CLI"' }, existe: fichiers("C:\\Program Files\\GitHub CLI\\gh.exe") }), "C:\\Program Files\\GitHub CLI\\gh.exe");
});

test("un `claude` installé hors du PATH manque, et la vérification dit où il est et quel dossier ajouter au PATH", () => {
  const etat = verifierLesOutils({
    plateforme: "win32",
    env: { PATH: "C:\\Program Files\\Git\\cmd;C:\\Program Files\\GitHub CLI;C:\\Windows\\System32\\OpenSSH" },
    maison: "C:\\Users\\chef",
    existe: fichiers("C:\\Users\\chef\\.local\\bin\\claude.exe", "C:\\Program Files\\Git\\cmd\\git.exe", "C:\\Program Files\\GitHub CLI\\gh.exe", "C:\\Windows\\System32\\OpenSSH\\ssh.exe"),
  });
  assert.ok(etat.state === "missing");
  assert.deepEqual(etat.missing, ["claude"]);
  const claude = manquant(etat.tools, "claude");
  assert.equal(claude.found, "C:\\Users\\chef\\.local\\bin\\claude.exe");
  assert.equal(claude.install, "Add C:\\Users\\chef\\.local\\bin to your PATH, then restart the app.");
  assert.match(claude.reason, /is installed on this PC, in C:\\Users\\chef\\\.local\\bin, but that folder is not on the PATH/);
  unePhrase(claude.reason);
});

test("rien d'installé : chaque plateforme dit, pour chacun des quatre, une phrase qui l'obtient et la page qui l'explique", () => {
  const attendu: Record<string, RegExp[]> = {
    win32: [/install\.ps1/, /winget install --id GitHub\.cli/, /winget install --id Git\.Git/, /Add-WindowsCapability/],
    darwin: [/install\.sh/, /brew install gh/, /xcode-select --install/, /brew install openssh/],
    linux: [/install\.sh/, /apt install gh/, /apt install git/, /apt install openssh-client/],
  };
  for (const [plateforme, motifs] of Object.entries(attendu)) {
    const etat = verifierLesOutils({ plateforme: plateforme as NodeJS.Platform, env: { PATH: "" }, maison: "/nulle-part", existe: () => false });
    assert.ok(etat.state === "missing", plateforme);
    assert.deepEqual(etat.missing, [...OUTILS], plateforme);
    assert.match(etat.reason, /`claude`, `gh`, `git` and `ssh`/);
    OUTILS.forEach((outil, i) => {
      const vu = manquant(etat.tools, outil);
      assert.match(vu.install, motifs[i] as RegExp, `${plateforme} ${outil}`);
      unePhrase(vu.install);
      unePhrase(vu.reason);
      assert.match(vu.link, /^https:\/\//);
      assert.equal(vu.found, undefined);
    });
  }
});

test("un programme nommé par son chemin tient lieu de l'outil : présent s'il est là, sinon il manque en le disant", () => {
  const options = { plateforme: "linux" as const, env: { PATH: "/usr/bin" }, maison: "/home/chef", existe: fichiers("/usr/bin/gh", "/usr/bin/git", "/usr/bin/ssh", "/opt/faux/claude") };
  const lu = verifierLesOutils({ ...options, programmes: { claude: "/opt/faux/claude" } });
  assert.deepEqual(lu.tools[0], { tool: "claude", present: true, path: "/opt/faux/claude" });
  const absent = verifierLesOutils({ ...options, programmes: { claude: "/opt/absent/claude" } });
  assert.ok(absent.state === "missing");
  assert.match(manquant(absent.tools, "claude").reason, /is set to \/opt\/absent\/claude/);
});

// De vrais fichiers, dans un vrai PATH : ce que la commande lit sur cette machine.
const poserDesOutils = (dossier: string, outils: readonly Outil[]) => {
  for (const outil of outils) {
    const chemin = join(dossier, process.platform === "win32" ? `${outil}.cmd` : outil);
    writeFileSync(chemin, process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n");
    chmodSync(chemin, 0o755);
  }
};

test("la commande, sur un PATH où `git` manque : une ligne JSON qui le nomme, code 1 — et code 0 quand il y est", async (t) => {
  const dossier = repertoireTemporaire(t);
  poserDesOutils(dossier, ["claude", "gh", "ssh"]);
  const lignes: string[] = [];
  const appel = (env: Record<string, string>) => ({ args: [], env: { ...env, PATHEXT: ".COM;.EXE;.BAT;.CMD" }, dire: (ligne: string) => lignes.push(ligne), redire: () => {} });
  const sortie = await Promise.resolve()
    .then(() => principal(appel({ PATH: dossier })))
    .then(
      () => 0,
      (erreur: unknown) => (erreur instanceof Sortie ? erreur.code : -1),
    );
  assert.equal(sortie, 1);
  const etat = JSON.parse(lignes.at(-1) ?? "{}");
  assert.equal(etat.state, "missing");
  assert.deepEqual(etat.missing, ["git"]);
  // Ce qu'elle conseille dépend de cette machine : un `git` hors de ce PATH, mais installé, y est dit trouvé.
  assert.match(manquant(etat.tools, "git").reason, /^`git` is /);

  poserDesOutils(dossier, ["git"]);
  principal(appel({ PATH: `${dossier}${delimiter}${join(dossier, "absent")}` }));
  const pret = JSON.parse(lignes.at(-1) ?? "{}");
  assert.equal(pret.state, "ready");
  assert.deepEqual(
    pret.tools.map((vu: OutilVu) => vu.present && vu.path),
    OUTILS.map((outil) => join(dossier, process.platform === "win32" ? `${outil}.cmd` : outil)),
  );
});
