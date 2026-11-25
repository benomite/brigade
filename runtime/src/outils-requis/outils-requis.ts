// Les trois outils que l'app ne livre pas (#4059, épique #4054) : `gh` (la connexion à GitHub, `gh auth login --web`),
// `git` (le clone d'un projet) et `claude` (les cooks, le second, le login Max). L'app n'installe aucun des trois
// (#4266) : elle vérifie qu'ils sont là, et pour chacun qui manque renvoie à sa page d'installation officielle.
//
// `choisirInstallation(outil, machine)` ne lit rien : `machine` dit la plateforme et les commandes présentes (`winget`,
// `outils-developpeur`, `gh`, `git`, `claude`…). Il rend `{ texte, lien }` : le pas, en une phrase — ce que le second
// dit —, et la page officielle qui l'explique, que l'écran de l'outil manquant ouvre.
// Homebrew n'est jamais proposé : un Mac nu ne l'a pas. `winget`, livré avec Windows 10 et 11 mais parfois absent,
// n'est cité que s'il est là.
//
// La lecture de la machine, et des outils qui manquent, est dans `machine.ts`.

export const OUTILS_REQUIS = ["git", "gh", "claude"] as const;
export type OutilRequis = (typeof OUTILS_REQUIS)[number];

export type Machine = { plateforme: NodeJS.Platform; presents: readonly string[] };

// `texte` : le pas, en une phrase. `lien` : la page d'installation officielle de l'outil.
export type Installation = { texte: string; lien: string };

// Le nom du produit, que l'écran dit : le nom du binaire n'est que dans le détail.
export const NOMS: Record<OutilRequis, string> = { gh: "the GitHub CLI", git: "Git", claude: "Claude Code" };

const CLAUDE_SETUP = "https://code.claude.com/docs/en/setup";
const GH_PAGE = "https://cli.github.com";

const pas = (texte: string, lien: string): Installation => ({ texte, lien });

function surMac(outil: OutilRequis): Installation {
  if (outil === "claude") return pas("Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.", CLAUDE_SETUP);
  if (outil === "git") return pas("Install Git with Apple's command line developer tools: run `xcode-select --install` in a terminal, then follow the installer macOS opens.", "https://git-scm.com/download/mac");
  return pas("Install the GitHub CLI with its macOS installer: on its latest release, download the file ending in `macOS_universal.pkg` and open it.", GH_PAGE);
}

function surWindows(outil: OutilRequis, presents: readonly string[]): Installation {
  if (outil === "claude") return pas("Install Claude Code with its official installer: run `irm https://claude.ai/install.ps1 | iex` in PowerShell.", CLAUDE_SETUP);
  const winget = presents.includes("winget");
  if (outil === "git") {
    if (winget) return pas("Install Git for Windows, which brings Git Bash: run `winget install --id Git.Git -e --source winget` in a terminal.", "https://git-scm.com/download/win");
    return pas("Install Git for Windows, which brings Git Bash: download its installer from git-scm.com and open it.", "https://git-scm.com/download/win");
  }
  if (winget) return pas("Install the GitHub CLI: run `winget install --id GitHub.cli -e --source winget` in a terminal.", GH_PAGE);
  return pas("Install the GitHub CLI with its Windows installer: on its latest release, download the file ending in `windows_amd64.msi` and open it.", GH_PAGE);
}

function ailleurs(outil: OutilRequis): Installation {
  if (outil === "claude") return pas("Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.", CLAUDE_SETUP);
  if (outil === "git") return pas("Install Git with your distribution's package manager, as its download page says.", "https://git-scm.com/download/linux");
  return pas("Install the GitHub CLI with your distribution's package manager, as its installation page says.", "https://github.com/cli/cli#installation");
}

// La page de l'outil sur cette machine, et le pas qui l'obtient.
export function choisirInstallation(outil: OutilRequis, machine: Machine): Installation {
  if (machine.plateforme === "darwin") return surMac(outil);
  if (machine.plateforme === "win32") return surWindows(outil, machine.presents);
  return ailleurs(outil);
}
