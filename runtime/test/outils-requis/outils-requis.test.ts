// Les outils requis (#4059) : le chemin choisi pour chacun, selon la machine, et ce qu'une machine simulée en a.
import { test } from "node:test";
import assert from "node:assert/strict";
import { choisirInstallation, OUTILS_REQUIS } from "../../src/outils-requis/outils-requis.ts";
import { lireLaMachine, outilsManquants, reussitPourDeBon } from "../../src/outils-requis/machine.ts";

const fichiers = (...chemins: string[]) => {
  const tous = new Set(chemins);
  return (chemin: string) => tous.has(chemin);
};

test("chaque outil, sur chaque plateforme, a une page d'installation officielle en https, jamais Homebrew — et rien ne se lance", () => {
  for (const plateforme of ["darwin", "win32", "linux"] as const) {
    for (const presents of [[], ["winget", "brew"]]) {
      for (const outil of OUTILS_REQUIS) {
        const choix = choisirInstallation(outil, { plateforme, presents });
        assert.deepEqual(Object.keys(choix).sort(), ["lien", "texte"], `${plateforme} ${outil}`);
        assert.match(choix.lien, /^https:\/\//, `${plateforme} ${outil}`);
        assert.doesNotMatch(JSON.stringify(choix), /brew/i, `${plateforme} ${outil}`);
      }
    }
  }
  assert.equal(choisirInstallation("claude", { plateforme: "darwin", presents: [] }).lien, "https://code.claude.com/docs/en/setup");
  assert.equal(choisirInstallation("git", { plateforme: "win32", presents: [] }).lien, "https://git-scm.com/download/win");
  assert.equal(choisirInstallation("gh", { plateforme: "darwin", presents: [] }).lien, "https://cli.github.com");
  assert.equal(choisirInstallation("gh", { plateforme: "linux", presents: [] }).lien, "https://github.com/cli/cli#installation");
});

test("sous Windows, winget n'est cité que s'il est sur le PC", () => {
  assert.doesNotMatch(choisirInstallation("gh", { plateforme: "win32", presents: [] }).texte, /winget/);
  assert.match(choisirInstallation("gh", { plateforme: "win32", presents: ["winget"] }).texte, /winget install --id GitHub\.cli/);
});

test("une commande lancée pour de bon réussit à son code 0 ; un autre code, ou un programme absent, compte pour un échec", () => {
  assert.equal(reussitPourDeBon(process.execPath, ["-e", "process.exit(0)"]), true);
  assert.equal(reussitPourDeBon(process.execPath, ["-e", "process.exit(3)"]), false);
  assert.equal(reussitPourDeBon("/nulle/part/xcode-select", ["-p"]), false);
});

test("sur un Mac sans les outils de développement, le /usr/bin/git du système ne compte pas : git manque", () => {
  const options = { plateforme: "darwin" as const, env: { PATH: "/usr/bin:/usr/local/bin" }, maison: "/Users/chef", existe: fichiers("/usr/bin/git", "/usr/local/bin/gh") };
  const sans = lireLaMachine({ ...options, reussit: () => false });
  assert.deepEqual(sans.presents, ["gh"]);
  assert.deepEqual(outilsManquants(sans).map(({ outil }) => outil), ["git", "claude"]);
  const avec = lireLaMachine({ ...options, reussit: (programme, args) => programme === "xcode-select" && args[0] === "-p" });
  assert.deepEqual(avec.presents, ["outils-developpeur", "git", "gh"]);
  // Un git venu d'ailleurs compte, même sans les outils d'Apple.
  const autre = lireLaMachine({ ...options, env: { PATH: "/usr/local/bin:/usr/bin" }, existe: fichiers("/usr/local/bin/git"), reussit: () => false });
  assert.deepEqual(autre.presents, ["git"]);
});

test("sous Windows, winget se lit dans le PATH, et un outil posé par son installeur hors du PATH est rendu avec son dossier", () => {
  const machine = lireLaMachine({
    plateforme: "win32",
    env: { Path: "C:\\Users\\chef\\AppData\\Local\\Microsoft\\WindowsApps", PATHEXT: ".EXE", ProgramFiles: "C:\\Program Files" },
    maison: "C:\\Users\\chef",
    existe: fichiers("C:\\Users\\chef\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe", "C:\\Program Files\\GitHub CLI\\gh.exe"),
    reussit: () => true,
  });
  assert.deepEqual(machine.presents, ["winget"]);
  assert.deepEqual(machine.horsDuPath, { gh: "C:\\Program Files\\GitHub CLI" });
  const manquants = outilsManquants(machine, ["gh", "claude"]);
  assert.deepEqual(manquants.map(({ outil }) => outil), ["gh", "claude"]);
  assert.equal(manquants[0]?.installation.lien, "https://cli.github.com");
});

test("tout présent : rien ne manque", () => {
  assert.deepEqual(outilsManquants({ plateforme: "darwin", presents: ["git", "gh", "claude"] }), []);
});
