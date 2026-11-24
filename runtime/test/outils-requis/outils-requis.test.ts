// Les outils requis (#4059) : le chemin choisi pour chacun, selon la machine, et ce qu'une machine simulée en a.
import { test } from "node:test";
import assert from "node:assert/strict";
import { choisirInstallation, OUTILS_REQUIS } from "../../src/outils-requis/outils-requis.ts";
import { lireLaMachine, outilsManquants, reussitPourDeBon } from "../../src/outils-requis/machine.ts";

const fichiers = (...chemins: string[]) => {
  const tous = new Set(chemins);
  return (chemin: string) => tous.has(chemin);
};

test("sur un Mac nu, Claude Code s'installe par son script, Git par l'installeur d'Apple, le GitHub CLI par son paquet — rien de Homebrew", () => {
  const mac = { plateforme: "darwin" as const, presents: [] };
  const claude = choisirInstallation("claude", mac);
  assert.equal(claude.moyen, "commande");
  assert.deepEqual(claude.commande, { argv: ["/bin/bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"], installeEnFinissant: true });
  const git = choisirInstallation("git", mac);
  assert.deepEqual(git.commande, { argv: ["xcode-select", "--install"], installeEnFinissant: false });
  const gh = choisirInstallation("gh", mac);
  assert.equal(gh.moyen, "installateur");
  assert.equal(gh.commande, undefined);
  assert.match(gh.texte, /macOS_universal\.pkg/);
  assert.equal(gh.lien, "https://github.com/cli/cli/releases/latest");
  // Homebrew présent ne change rien : le chemin qui s'en passe reste le même.
  assert.deepEqual(choisirInstallation("gh", { plateforme: "darwin", presents: ["brew"] }), gh);
});

test("sous Windows, winget installe Git et le GitHub CLI quand il est là ; sans lui, leurs installeurs ; Claude Code par PowerShell", () => {
  const nu = { plateforme: "win32" as const, presents: [] };
  const avecWinget = { plateforme: "win32" as const, presents: ["winget"] };
  const choisis = Object.fromEntries(OUTILS_REQUIS.map((outil) => [outil, [choisirInstallation(outil, nu).moyen, choisirInstallation(outil, avecWinget).moyen]]));
  assert.deepEqual(choisis, { git: ["installateur", "commande"], gh: ["installateur", "commande"], claude: ["commande", "commande"] });
  assert.equal(choisirInstallation("gh", avecWinget).commande?.argv.slice(0, 4).join(" "), "winget install --id GitHub.cli");
  assert.equal(choisirInstallation("git", avecWinget).commande?.argv.slice(0, 4).join(" "), "winget install --id Git.Git");
  assert.match(choisirInstallation("gh", nu).texte, /windows_amd64\.msi/);
  assert.equal(choisirInstallation("git", nu).lien, "https://git-scm.com/download/win");
  assert.equal(choisirInstallation("claude", nu).commande?.argv[0], "powershell");
  for (const outil of OUTILS_REQUIS) assert.deepEqual(choisirInstallation(outil, nu).exige, []);
});

test("ailleurs, Claude Code par son script, Git et le GitHub CLI par la page qui les explique", () => {
  const linux = { plateforme: "linux" as const, presents: [] };
  assert.equal(choisirInstallation("claude", linux).moyen, "commande");
  assert.equal(choisirInstallation("git", linux).moyen, "page");
  assert.equal(choisirInstallation("gh", linux).moyen, "page");
  assert.equal(choisirInstallation("git", linux).lien, "https://git-scm.com/download/linux");
  assert.equal(choisirInstallation("gh", linux).lien, "https://github.com/cli/cli#installation");
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
  assert.equal(manquants[0]?.installation.moyen, "commande");
  // Sans winget, le GitHub CLI se prend par son installeur.
  const nu = lireLaMachine({ plateforme: "win32", env: { Path: "" }, maison: "C:\\Users\\chef", existe: () => false });
  assert.deepEqual(nu.presents, []);
  assert.equal(outilsManquants(nu, ["gh"])[0]?.installation.moyen, "installateur");
});

test("tout présent : rien ne manque", () => {
  assert.deepEqual(outilsManquants({ plateforme: "darwin", presents: ["git", "gh", "claude"] }), []);
});
