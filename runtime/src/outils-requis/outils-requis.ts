// Les trois outils que l'app ne livre pas (#4059, épique #4054) : `gh` (la connexion à GitHub, `gh auth login --web`),
// `git` (le clone d'un projet) et `claude` (les cooks, le second, le login Max). Sur un ordinateur neuf il en manque
// souvent un, et le nouveau venu n'a pas forcément Homebrew : ce module choisit, pour chacun, le chemin d'installation
// le plus court qui marche sur cette machine telle qu'elle est.
//
// `choisirInstallation(outil, machine)` ne lit rien : `machine` dit la plateforme et les commandes présentes (`winget`,
// `outils-developpeur` pour l'installeur des outils de développement d'Apple, `gh`, `git`, `claude`…). Il rend
// `{ moyen, texte, lien, exige }` et, quand l'app peut la lancer elle-même, la `commande` :
//   - `moyen` : `commande` (une ligne que l'app lance, et que le chef peut copier), `installateur` (un installeur à
//     télécharger et ouvrir, depuis `lien`) ou `page` (la page qui l'explique) ;
//   - `texte` : le pas, en une phrase, ce que l'écran montre ;
//   - `exige` : les outils, hors ceux du système (shell, curl, PowerShell, navigateur), dont ce chemin a besoin — vide
//     pour chaque chemin choisi : on ne propose jamais un outil que le nouveau n'a pas.
// Homebrew n'est jamais proposé : un Mac nu ne l'a pas, et chaque outil a un chemin qui s'en passe. `winget`, livré avec
// Windows 10 et 11 mais parfois absent, n'est proposé que s'il est là.
//
// La lecture de la machine, et des outils qui manquent, est dans `machine.ts`.

export const OUTILS_REQUIS = ["git", "gh", "claude"] as const;
export type OutilRequis = (typeof OUTILS_REQUIS)[number];

export type Machine = { plateforme: NodeJS.Platform; presents: readonly string[] };

// `moyen` : `commande`, `installateur` ou `page` (en tête). `installeEnFinissant` : la commande finie, l'outil est là —
// sinon elle ouvre un installeur qui continue sans elle.
export type Installation = {
  moyen: string;
  texte: string;
  lien: string;
  exige: string[];
  commande?: { argv: string[]; installeEnFinissant: boolean };
};

// Le nom du produit, que l'écran dit : le nom du binaire n'est que dans le détail.
export const NOMS: Record<OutilRequis, string> = { gh: "the GitHub CLI", git: "Git", claude: "Claude Code" };

const CLAUDE_SETUP = "https://code.claude.com/docs/en/setup";
const GH_VERSIONS = "https://github.com/cli/cli/releases/latest";

const lancee = (texte: string, lien: string, argv: string[], installeEnFinissant = true): Installation => ({ moyen: "commande", texte, lien, exige: [], commande: { argv, installeEnFinissant } });
const telechargee = (texte: string, lien: string): Installation => ({ moyen: "installateur", texte, lien, exige: [] });

function surMac(outil: OutilRequis): Installation {
  if (outil === "claude") return lancee("Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.", CLAUDE_SETUP, ["/bin/bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"]);
  if (outil === "git") return lancee("Install Git with Apple's command line developer tools: run `xcode-select --install` in a terminal, then follow the installer macOS opens.", "https://git-scm.com/download/mac", ["xcode-select", "--install"], false);
  return telechargee("Install the GitHub CLI with its macOS installer: on its latest release, download the file ending in `macOS_universal.pkg` and open it.", GH_VERSIONS);
}

function surWindows(outil: OutilRequis, presents: readonly string[]): Installation {
  if (outil === "claude") return lancee("Install Claude Code with its official installer: run `irm https://claude.ai/install.ps1 | iex` in PowerShell.", CLAUDE_SETUP, ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"]);
  const winget = presents.includes("winget");
  if (outil === "git") {
    if (winget) return lancee("Install Git for Windows, which brings Git Bash: run `winget install --id Git.Git -e --source winget` in a terminal.", "https://git-scm.com/download/win", ["winget", "install", "--id", "Git.Git", "-e", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements"]);
    return telechargee("Install Git for Windows, which brings Git Bash: download its installer from git-scm.com and open it.", "https://git-scm.com/download/win");
  }
  if (winget) return lancee("Install the GitHub CLI: run `winget install --id GitHub.cli -e --source winget` in a terminal.", "https://cli.github.com", ["winget", "install", "--id", "GitHub.cli", "-e", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements"]);
  return telechargee("Install the GitHub CLI with its Windows installer: on its latest release, download the file ending in `windows_amd64.msi` and open it.", GH_VERSIONS);
}

function ailleurs(outil: OutilRequis): Installation {
  if (outil === "claude") return lancee("Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.", CLAUDE_SETUP, ["/bin/sh", "-c", "curl -fsSL https://claude.ai/install.sh | bash"]);
  if (outil === "git") return { moyen: "page", texte: "Install Git with your distribution's package manager, as its download page says.", lien: "https://git-scm.com/download/linux", exige: [] };
  return { moyen: "page", texte: "Install the GitHub CLI with your distribution's package manager, as its installation page says.", lien: "https://github.com/cli/cli#installation", exige: [] };
}

// Le chemin le plus court qui marche sur cette machine, sans un outil qu'elle n'a pas.
export function choisirInstallation(outil: OutilRequis, machine: Machine): Installation {
  if (machine.plateforme === "darwin") return surMac(outil);
  if (machine.plateforme === "win32") return surWindows(outil, machine.presents);
  return ailleurs(outil);
}
