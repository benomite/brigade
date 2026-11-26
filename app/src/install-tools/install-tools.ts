// L'installation d'un clic de `gh` et de `claude` depuis l'écran de l'outil manquant (#4350, épique #4348). Git n'est
// jamais installé par l'app : son écran reste celui de #4059. Rien ne part au lancement ni en fond : un téléchargement,
// une commande d'installation, ne partent que d'`installer(outil)`, que seul le clic du chef appelle.
//   - gh : l'archive de la dernière version du GitHub CLI, prise sur ses releases officielles (github.com/cli/cli),
//     posée dans un dossier du compte (`dossier`) — ni Homebrew, ni droit d'administrateur. `<dossier>/bin` passe en tête
//     du PATH de l'app (`env`), puis `gh --version` y est lancé : il répond, c'est fait.
//   - claude : le chemin officiel. Un `npm` qui répond dans le PATH de l'app : `npm install -g @anthropic-ai/claude-code`.
//     Sans lui, l'installeur natif (`curl -fsSL https://claude.ai/install.sh | bash`, sous Windows `irm
//     https://claude.ai/install.ps1 | iex`), qui pose `claude` dans `~/.local/bin` : ce dossier passe en tête du PATH de
//     l'app. Puis `claude --version` : il répond, c'est fait.
// Chaque outil a sa machine d'états : idle, installing, done, failed — failed avec sa raison, jamais un installing qui
// reste. Une plateforme que l'app ne sait pas servir n'installe rien (`possible` faux) : l'écran le dit.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, posix, win32 } from "node:path";
import { estUnMac } from "../plateforme.ts";

export type OutilInstallable = "gh" | "claude";
export type Phase = "idle" | "installing" | "done" | "failed";
export type EtatDInstallation = { phase: Phase; raison?: string };
export type Lancement = { code: number; sortie: string };
export type Lancer = (commande: string, args: string[], options: { env: Record<string, string | undefined> }) => Promise<Lancement>;

export type OptionsDInstallation = {
  plateforme: NodeJS.Platform;
  arch?: string;
  // L'environnement de l'app, celui de tout ce qu'elle lance : son PATH reçoit le dossier de l'outil posé.
  env: Record<string, string | undefined>;
  // Le dossier du compte où `gh` est posé — `<dossier>/bin/gh`.
  dossier: string;
  // Prend l'archive officielle de `url` et la défait dans `dossier`. Lève quand elle ne vient pas.
  telecharger: (url: string, dossier: string) => Promise<void>;
  lancer?: Lancer;
  maison?: string;
  rendre: () => void;
};

// Les releases officielles du GitHub CLI. `{version}` est la dernière, que `telechargerPourDeBon` lit à l'adresse
// `latest` : l'archive porte son numéro dans son nom.
export const RELEASES_GH = "https://github.com/cli/cli/releases";
export const CLAUDE_NPM = ["install", "-g", "@anthropic-ai/claude-code"];
export const CLAUDE_NATIF_POSIX = "curl -fsSL https://claude.ai/install.sh | bash";
export const CLAUDE_NATIF_WINDOWS = "irm https://claude.ai/install.ps1 | iex";

// L'archive de gh pour cette machine, comme ses releases la nomment — ou rien : l'app ne sait pas l'installer ici.
export function archiveDeGh(plateforme: NodeJS.Platform, arch: string): string | undefined {
  const processeur = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : undefined;
  if (processeur === undefined) return undefined;
  if (estUnMac(plateforme)) return `macOS_${processeur}.zip`;
  if (plateforme === "win32") return `windows_${processeur}.zip`;
  if (plateforme === "linux") return `linux_${processeur}.tar.gz`;
  return undefined;
}

// Le dossier de `bin` posé en tête du PATH de `env` — une fois. Sous Windows, le PATH se nomme souvent `Path`.
export function enTeteDuPath(env: Record<string, string | undefined>, dossier: string, plateforme: NodeJS.Platform): void {
  const cle = Object.keys(env).find((nom) => nom.toUpperCase() === "PATH") ?? "PATH";
  const separateur = plateforme === "win32" ? ";" : ":";
  const dossiers = (env[cle] ?? "").split(separateur).filter((morceau) => morceau !== "" && morceau !== dossier);
  env[cle] = [dossier, ...dossiers].join(separateur);
}

const chemins = (plateforme: NodeJS.Platform) => (plateforme === "win32" ? win32 : posix);
export const binDeGh = (dossier: string, plateforme: NodeJS.Platform) => chemins(plateforme).join(dossier, "bin");

// Au lancement de l'app, un `gh` qu'elle a déjà posé reprend sa place en tête de son PATH. Rien n'est lu en ligne.
export function rattacherGhPose(env: Record<string, string | undefined>, dossier: string, plateforme: NodeJS.Platform): boolean {
  const bin = binDeGh(dossier, plateforme);
  if (!existsSync(chemins(plateforme).join(bin, plateforme === "win32" ? "gh.exe" : "gh"))) return false;
  enTeteDuPath(env, bin, plateforme);
  return true;
}

// Ce qui est lancé pour une commande : sous Windows, `npm` est un `npm.cmd`, que seul `cmd.exe` lance. Aucune fenêtre ne
// s'ouvre, et une installation qui ne finit pas s'arrête au bout de dix minutes.
export function commandeDe(commande: string, args: string[], plateforme: NodeJS.Platform) {
  const viaCmd = plateforme === "win32" && commande === "npm";
  return { programme: viaCmd ? "cmd.exe" : commande, args: viaCmd ? ["/d", "/s", "/c", "npm", ...args] : args, options: { windowsHide: true, timeout: 10 * 60_000, maxBuffer: 8 * 1024 * 1024 } };
}

// Une commande lancée pour de bon, dans l'environnement donné : son code et ce qu'elle a dit.
export const lancerPourDeBon: Lancer = (commande, args, { env }) =>
  new Promise((rendre) => {
    const lancee = commandeDe(commande, args, process.platform);
    execFile(lancee.programme, lancee.args, { ...lancee.options, env: env as NodeJS.ProcessEnv }, (erreur, stdout, stderr) => {
      const sortie = `${stdout}${stderr}`.trim();
      if (erreur === null) return rendre({ code: 0, sortie });
      rendre({ code: typeof erreur.code === "number" ? erreur.code : 1, sortie: sortie === "" ? erreur.message : sortie });
    });
  });

const dernieresLignes = (texte: string) => texte.trim().split(/\r?\n/).slice(-3).join(" ");
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function tenirInstallation(options: OptionsDInstallation) {
  const { plateforme, env } = options;
  const arch = options.arch ?? process.arch;
  const lancer = options.lancer ?? lancerPourDeBon;
  const etats: Record<OutilInstallable, EtatDInstallation> = { gh: { phase: "idle" }, claude: { phase: "idle" } };
  const enCours: Partial<Record<OutilInstallable, Promise<void>>> = {};

  function possible(outil: string): boolean {
    if (outil === "gh") return archiveDeGh(plateforme, arch) !== undefined;
    if (outil === "claude") return estUnMac(plateforme) || plateforme === "linux" || plateforme === "win32";
    return false;
  }

  function poser(outil: OutilInstallable, etat: EtatDInstallation) {
    etats[outil] = etat;
    options.rendre();
  }

  async function installerGh(): Promise<string | undefined> {
    const archive = archiveDeGh(plateforme, arch);
    if (archive === undefined) return `the app cannot install the GitHub CLI on ${plateforme} ${arch}`;
    await options.telecharger(`${RELEASES_GH}/download/v{version}/gh_{version}_${archive}`, options.dossier);
    const bin = binDeGh(options.dossier, plateforme);
    enTeteDuPath(env, bin, plateforme);
    const verifie = await lancer("gh", ["--version"], { env });
    if (verifie.code !== 0) return `gh was put in ${bin} but \`gh --version\` does not answer: ${dernieresLignes(verifie.sortie)}`;
    return undefined;
  }

  async function installerClaude(): Promise<string | undefined> {
    const npm = await lancer("npm", ["--version"], { env });
    const installe =
      npm.code === 0
        ? await lancer("npm", CLAUDE_NPM, { env })
        : plateforme === "win32"
          ? await lancer("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", CLAUDE_NATIF_WINDOWS], { env })
          : await lancer("bash", ["-c", CLAUDE_NATIF_POSIX], { env });
    if (installe.code !== 0) return `the install of Claude Code failed: ${dernieresLignes(installe.sortie)}`;
    // L'installeur natif pose `claude` dans `~/.local/bin`, que le PATH de l'app n'a pas toujours.
    if (npm.code !== 0) enTeteDuPath(env, chemins(plateforme).join(options.maison ?? homedir(), ".local", "bin"), plateforme);
    const verifie = await lancer("claude", ["--version"], { env });
    if (verifie.code !== 0) return `Claude Code was installed but \`claude --version\` does not answer: ${dernieresLignes(verifie.sortie)}`;
    return undefined;
  }

  async function installer(outil: OutilInstallable): Promise<void> {
    const deja = enCours[outil];
    if (deja !== undefined) return deja;
    if (!possible(outil)) return poser(outil, { phase: "failed", raison: `the app cannot install ${outil} on this computer` });
    const fini = (async () => {
      poser(outil, { phase: "installing" });
      let raison: string | undefined;
      try {
        raison = await (outil === "gh" ? installerGh() : installerClaude());
      } catch (erreur) {
        raison = message(erreur);
      }
      poser(outil, raison === undefined ? { phase: "done" } : { phase: "failed", raison });
    })();
    enCours[outil] = fini;
    try {
      await fini;
    } finally {
      delete enCours[outil];
    }
  }

  return { possible, etat: (outil: OutilInstallable): EtatDInstallation => etats[outil], installer };
}

// Ce que le process principal en dit à la vue : chaque outil qui manque, avec `installable` — l'app sait-elle
// l'installer ici —, et l'installation d'un outil que la vue nomme, rendue à sa fin : done, ou failed et sa raison.
export function pourLaVue(installation: ReturnType<typeof tenirInstallation>) {
  return {
    installables: <T extends { outil: string }>(manquants: T[]) => manquants.map((manque) => ({ ...manque, installable: installation.possible(manque.outil) })),
    async installer(outil: unknown): Promise<EtatDInstallation> {
      if (outil !== "gh" && outil !== "claude") return { phase: "failed", raison: "the app installs only gh and claude" };
      await installation.installer(outil);
      return installation.etat(outil);
    },
  };
}

// Le vrai téléchargement de gh : la dernière version lue à l'adresse `latest` des releases (sa redirection nomme
// l'étiquette), l'archive prise, défaite à côté de `dossier`, puis mise à sa place — un essai raté ne laisse pas un
// `gh` à moitié posé. Défaite par `tar`, que macOS, Windows 10 et 11 et Linux livrent, et qui lit le zip comme le tar.gz.
export async function telechargerPourDeBon(url: string, dossier: string): Promise<void> {
  let adresse = url;
  if (adresse.includes("{version}")) {
    const latest = await fetch(`${RELEASES_GH}/latest`, { redirect: "manual" });
    const etiquette = /\/tag\/v([^/?#]+)/.exec(latest.headers.get("location") ?? "")?.[1];
    if (etiquette === undefined) throw new Error(`the latest GitHub CLI release could not be read (HTTP ${latest.status})`);
    adresse = adresse.replaceAll("{version}", etiquette);
  }
  const reponse = await fetch(adresse);
  if (!reponse.ok) throw new Error(`download failed: HTTP ${reponse.status} on ${adresse}`);
  const travail = `${dossier}.part`;
  rmSync(travail, { recursive: true, force: true });
  mkdirSync(travail, { recursive: true });
  const fichier = join(tmpdir(), `brigade-gh-${process.pid}-${basename(new URL(adresse).pathname)}`);
  writeFileSync(fichier, Buffer.from(await reponse.arrayBuffer()));
  try {
    const defait = await lancerPourDeBon("tar", ["-xf", fichier, "-C", travail], { env: process.env });
    if (defait.code !== 0) throw new Error(`the archive could not be unpacked: ${dernieresLignes(defait.sortie)}`);
    // L'archive porte `bin/gh` à sa racine, ou sous un dossier à son nom.
    const racine = existsSync(join(travail, "bin")) ? travail : readdirSync(travail).map((nom) => join(travail, nom)).find((sous) => existsSync(join(sous, "bin")));
    if (racine === undefined) throw new Error("the archive holds no bin/gh");
    rmSync(dossier, { recursive: true, force: true });
    mkdirSync(dirname(dossier), { recursive: true });
    renameSync(racine, dossier);
  } finally {
    rmSync(fichier);
    rmSync(travail, { recursive: true, force: true });
  }
}
