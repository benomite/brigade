// Les outils dont le second a besoin sur l'ordinateur du chef (#1433) : `claude`
// — le second est une session de Claude Code —, `gh`, `git` et `ssh`, que ses
// commandes et l'app lancent par leur nom. Sur un PC neuf, il en manque souvent
// un, et l'onglet du second ne doit pas rester vide sans dire lequel.
//
// Un outil est présent quand un dossier du PATH le porte — sous Windows, sous
// l'une des extensions de `PATHEXT` (`claude.cmd` pour un `claude` installé par
// npm, `claude.exe` pour celui de l'installateur), jamais le fichier sans
// extension qu'npm pose à côté, que Windows ne sait pas lancer. Un outil qui
// n'est pas dans le PATH mais là où son installateur le pose (le `claude.exe`
// de `~\.local\bin`, le `gh` de `Program Files`) manque quand même : les
// commandes qui l'appellent par son nom ne le trouveront pas. Il est dit trouvé
// là, avec le dossier à ajouter au PATH.
//
// La vérification rend toujours l'un de deux états, et ne lève pas :
//   - `ready` : les quatre sont là — `tools`, chacun son `tool` et son `path` ;
//   - `missing` : `missing`, les noms de ceux qui manquent, `reason`, une phrase
//     qui les nomme, et dans `tools`, pour chacun d'eux, `reason` — pourquoi le
//     second en a besoin —, `install`, une phrase qui dit comment l'obtenir sur
//     cette plateforme (une commande, puis relancer l'app), `link`, la page qui
//     l'explique, et `found` quand il est installé hors du PATH.
//
// L'app l'importe (`verifierLesOutils`), ou lance la commande :
//
//   node runtime/src/second/outils.ts
//
// qui rend cet état en une ligne JSON — code 0 quand les quatre sont là, 1 sinon.
// `BRIGADE_CLAUDE_BIN`, `BRIGADE_GH_BIN`, `BRIGADE_GIT_BIN` et `BRIGADE_SSH_BIN`
// nomment les programmes qui en tiennent lieu.
import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";

export const OUTILS = ["claude", "gh", "git", "ssh"] as const;
export type Outil = (typeof OUTILS)[number];

export type OutilVu =
  | { tool: Outil; present: true; path: string }
  | { tool: Outil; present: false; reason: string; install: string; link: string; found?: string };

export type OutilsDuSecond = { state: "ready"; tools: OutilVu[] } | { state: "missing"; missing: Outil[]; reason: string; tools: OutilVu[] };

export type OptionsDesOutils = {
  plateforme?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  // Le dossier du compte, là où les installateurs posent `claude`.
  maison?: string;
  // Un fichier que ce compte peut lancer est-il à ce chemin ?
  existe?: (chemin: string) => boolean;
  // Le programme qui tient lieu d'un outil : un nom cherché dans le PATH, ou un
  // chemin — ce que nomment `BRIGADE_CLAUDE_BIN`, `BRIGADE_GH_BIN`,
  // `BRIGADE_GIT_BIN` et `BRIGADE_SSH_BIN`. Par défaut, le nom de l'outil.
  programmes?: Partial<Record<Outil, string>>;
};

// Les programmes que l'environnement nomme pour les outils.
export function programmesDe(env: Record<string, string | undefined>): Partial<Record<Outil, string>> {
  const programmes: Partial<Record<Outil, string>> = {};
  for (const outil of OUTILS) {
    const programme = env[`BRIGADE_${outil.toUpperCase()}_BIN`];
    if (programme !== undefined && programme !== "") programmes[outil] = programme;
  }
  return programmes;
}

const lancable = (plateforme: NodeJS.Platform) => (chemin: string) => {
  try {
    if (!statSync(chemin).isFile()) return false;
    if (plateforme !== "win32") accessSync(chemin, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// Une variable de Windows, quelle que soit la casse de son nom : un environnement
// copié dans un objet ne l'ignore plus, et le PATH y est souvent `Path`.
export function variable(env: Record<string, string | undefined>, nom: string, plateforme: NodeJS.Platform): string | undefined {
  if (plateforme !== "win32") return env[nom];
  const cle = Object.keys(env).find((cle) => cle.toUpperCase() === nom.toUpperCase());
  return cle === undefined ? undefined : env[cle];
}

// Les chemins où chercher `nom` dans ce dossier : sous Windows, une extension de
// `PATHEXT` après l'autre, dans son ordre.
function candidats(dossier: string, nom: string, plateforme: NodeJS.Platform, env: Record<string, string | undefined>): string[] {
  if (plateforme !== "win32") return [posix.join(dossier, nom)];
  const extensions = (variable(env, "PATHEXT", plateforme) || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter((extension) => extension.startsWith("."));
  return extensions.map((extension) => win32.join(dossier, `${nom}${extension.toLowerCase()}`));
}

// Le chemin de l'outil que le PATH donne, comme le shell le trouverait : le
// premier dossier qui le porte. Null : aucun.
export function dansLePath(nom: string, options: OptionsDesOutils = {}): string | null {
  const plateforme = options.plateforme ?? process.platform;
  const env = options.env ?? process.env;
  const existe = options.existe ?? lancable(plateforme);
  const separateur = plateforme === "win32" ? ";" : ":";
  const dossiers = (variable(env, "PATH", plateforme) ?? "").split(separateur).map((dossier) => dossier.trim().replace(/^"(.*)"$/, "$1")).filter((dossier) => dossier !== "");
  for (const dossier of dossiers) {
    const trouve = candidats(dossier, nom, plateforme, env).find(existe);
    if (trouve !== undefined) return trouve;
  }
  return null;
}

// Là où l'installateur de chaque outil le pose, quand le PATH ne le dit pas.
function ouLInstallateurLePose(outil: Outil, plateforme: NodeJS.Platform, env: Record<string, string | undefined>, maison: string): string[] {
  if (plateforme === "win32") {
    const sous = (nom: string, ...suite: string[]) => {
      const racine = variable(env, nom, plateforme);
      return racine === undefined || racine === "" ? [] : [win32.join(racine, ...suite)];
    };
    const parOutil: Record<Outil, string[]> = {
      claude: [win32.join(maison, ".local", "bin", "claude.exe"), ...sous("APPDATA", "npm", "claude.cmd")],
      gh: [...sous("ProgramFiles", "GitHub CLI", "gh.exe"), ...sous("LOCALAPPDATA", "Programs", "GitHub CLI", "gh.exe")],
      git: [...sous("ProgramFiles", "Git", "cmd", "git.exe"), ...sous("LOCALAPPDATA", "Programs", "Git", "cmd", "git.exe")],
      ssh: sous("SystemRoot", "System32", "OpenSSH", "ssh.exe"),
    };
    return parOutil[outil];
  }
  const dossiers = [posix.join(maison, ".local", "bin"), ...(plateforme === "darwin" ? ["/opt/homebrew/bin"] : []), "/usr/local/bin", "/usr/bin"];
  return dossiers.map((dossier) => posix.join(dossier, outil));
}

// Pourquoi le second a besoin de chacun.
function besoin(outil: Outil, plateforme: NodeJS.Platform): string {
  const parOutil: Record<Outil, string> = {
    claude: "the second is a Claude Code session",
    gh: "brigade reads your stations, their rails and your repositories on GitHub through it",
    git: plateforme === "win32" ? "a project's local copy is a git clone, and Claude Code runs its commands in the Git Bash that comes with Git for Windows" : "a project's local copy is a git clone",
    ssh: "the shells and the rail of a project that cooks on a box reach that box through it",
  };
  return parOutil[outil];
}

const RELANCER = "then restart the app";

// Comment obtenir chacun, sur cette plateforme : une phrase, et la page qui l'explique.
function commentLObtenir(outil: Outil, plateforme: NodeJS.Platform): { install: string; link: string } {
  if (plateforme === "win32") {
    const parOutil: Record<Outil, { install: string; link: string }> = {
      claude: { install: `Install Claude Code by running \`irm https://claude.ai/install.ps1 | iex\` in PowerShell, ${RELANCER}.`, link: "https://code.claude.com/docs/en/setup" },
      gh: { install: `Install the GitHub CLI by running \`winget install --id GitHub.cli\` in a terminal, ${RELANCER}.`, link: "https://cli.github.com" },
      git: { install: `Install Git for Windows, which brings Git Bash, by running \`winget install --id Git.Git\` in a terminal, ${RELANCER}.`, link: "https://git-scm.com/download/win" },
      ssh: {
        install: `Turn on the OpenSSH client in Settings › System › Optional features, or run \`Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0\` in an administrator PowerShell, ${RELANCER}.`,
        link: "https://learn.microsoft.com/windows-server/administration/openssh/openssh_install_firstuse",
      },
    };
    return parOutil[outil];
  }
  if (plateforme === "darwin") {
    const parOutil: Record<Outil, { install: string; link: string }> = {
      claude: { install: `Install Claude Code by running \`curl -fsSL https://claude.ai/install.sh | bash\` in a terminal, ${RELANCER}.`, link: "https://code.claude.com/docs/en/setup" },
      gh: { install: `Install the GitHub CLI by running \`brew install gh\` in a terminal, ${RELANCER}.`, link: "https://cli.github.com" },
      git: { install: `Install git with Apple's command line tools by running \`xcode-select --install\` in a terminal, ${RELANCER}.`, link: "https://git-scm.com/download/mac" },
      ssh: { install: `Install the OpenSSH client by running \`brew install openssh\` in a terminal, ${RELANCER}.`, link: "https://www.openssh.com" },
    };
    return parOutil[outil];
  }
  const parOutil: Record<Outil, { install: string; link: string }> = {
    claude: { install: `Install Claude Code by running \`curl -fsSL https://claude.ai/install.sh | bash\` in a terminal, ${RELANCER}.`, link: "https://code.claude.com/docs/en/setup" },
    gh: { install: `Install the GitHub CLI with your distribution's package manager (\`sudo apt install gh\` on Debian or Ubuntu), ${RELANCER}.`, link: "https://github.com/cli/cli#installation" },
    git: { install: `Install git with your distribution's package manager (\`sudo apt install git\` on Debian or Ubuntu), ${RELANCER}.`, link: "https://git-scm.com/download/linux" },
    ssh: { install: `Install the OpenSSH client with your distribution's package manager (\`sudo apt install openssh-client\` on Debian or Ubuntu), ${RELANCER}.`, link: "https://www.openssh.com" },
  };
  return parOutil[outil];
}

// Le nom de cet ordinateur, tel que les phrases le disent.
export const poste = (plateforme: NodeJS.Platform): string => (plateforme === "win32" ? "this PC" : plateforme === "darwin" ? "this Mac" : "this computer");

// Une liste de noms, dite en anglais : « gh », « gh and ssh », « gh, git and ssh ».
export const enListe = (noms: readonly string[]): string => (noms.length <= 1 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")} and ${noms.at(-1)}`);

// Ce que cet ordinateur dit d'un outil.
export function voirLOutil(outil: Outil, options: OptionsDesOutils = {}): OutilVu {
  const plateforme = options.plateforme ?? process.platform;
  const env = options.env ?? process.env;
  const existe = options.existe ?? lancable(plateforme);
  const { install, link } = commentLObtenir(outil, plateforme);
  const ici = poste(plateforme);
  const programme = options.programmes?.[outil] ?? outil;
  // Un chemin est pris tel quel : c'est lui, ou rien.
  if (/[\\/]/.test(programme)) {
    if (existe(programme)) return { tool: outil, present: true, path: programme };
    return { tool: outil, present: false, reason: `\`${outil}\` is set to ${programme}, which is not a program ${ici} can run, and ${besoin(outil, plateforme)}.`, install, link };
  }
  const chemin = dansLePath(programme, { plateforme, env, existe });
  if (chemin !== null) return { tool: outil, present: true, path: chemin };
  const found = ouLInstallateurLePose(outil, plateforme, env, options.maison ?? homedir()).find(existe);
  if (found !== undefined) {
    const dossier = (plateforme === "win32" ? win32 : posix).dirname(found);
    return {
      tool: outil,
      present: false,
      reason: `\`${outil}\` is installed on ${ici}, in ${dossier}, but that folder is not on the PATH, so nothing that calls \`${outil}\` by its name finds it — and ${besoin(outil, plateforme)}.`,
      install: `Add ${dossier} to your PATH, ${RELANCER}.`,
      link,
      found,
    };
  }
  return { tool: outil, present: false, reason: `\`${outil}\` is not installed on ${ici}, and ${besoin(outil, plateforme)}.`, install, link };
}

// Les quatre outils du second, vus d'ici. Ne lève pas.
export function verifierLesOutils(options: OptionsDesOutils = {}): OutilsDuSecond {
  const plateforme = options.plateforme ?? process.platform;
  const tools = OUTILS.map((outil) => voirLOutil(outil, options));
  const missing = tools.filter((vu) => !vu.present).map((vu) => vu.tool);
  if (missing.length === 0) return { state: "ready", tools };
  const noms = enListe(missing.map((outil) => `\`${outil}\``));
  return { state: "missing", missing, reason: `The second needs ${noms}, and ${poste(plateforme)} does not have ${missing.length === 1 ? "it" : "them"}.`, tools };
}

export function principal(appel: Appel): void {
  if (appel.args.length > 0) {
    appel.redire("usage: node runtime/src/second/outils.ts");
    throw new Sortie(2);
  }
  const etat = verifierLesOutils({ env: appel.env, programmes: programmesDe(appel.env) });
  appel.dire(JSON.stringify(etat));
  if (etat.state !== "ready") throw new Sortie(1);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
