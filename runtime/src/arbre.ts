// L'arbre d'un process : lui, et tout ce qu'il a lancé. Arrêter un cook, c'est
// arrêter son arbre entier — rien ne survit à celui qui l'a lancé.
//
// Sous macOS et Linux, l'arbre est le groupe de process : lancé détaché, le
// cook en est le chef, et un signal au groupe (`kill(-pid)`) atteint tout ce
// qu'il a lancé, même après sa mort. SIGTERM laisse sa grâce, SIGKILL n'en
// laisse aucune.
//
// Sous Windows, il n'y a ni groupe ni signal : `process.kill` y tue un seul
// process, sur-le-champ, et laisse ses enfants. L'arbre s'y lit dans la table
// des process (`Win32_Process`, lue par PowerShell), de parent en enfant.
// Windows garde le pid du parent d'un process même après la mort de ce parent :
// les enfants d'un cook déjà sorti s'y retrouvent donc aussi. Chacun est tué sur
// le champ — SIGTERM y vaut SIGKILL, il n'y a pas de grâce —, et le tour
// recommence tant qu'il trouve un vivant : un enfant lancé pendant qu'on tuait
// son parent est pris au tour suivant. Ce que l'arbre ne rattrape pas : le
// petit-enfant dont le parent est mort avant l'arrêt — son lien vers la racine
// est perdu avec ce parent.
//
// La table se lit même quand PowerShell sort en erreur : un process qui meurt
// pendant que `Get-CimInstance` parcourt la table peut y laisser une erreur, et
// le reste de la table est bon. Une lecture qui ne rend aucune ligne se refait
// au tour suivant : sinon une seule lecture ratée, sous la charge, laisse vivre
// tout l'arbre d'un cook sorti (#2829). Elle ne se refait pas quand PowerShell
// manque ou a déjà mis tout son délai : le tour suivant ne ferait pas mieux.
//
// Un pid se reprend. Un process né avant `depuis` (le lancement de la racine)
// n'est pas de l'arbre, ni celui né avant son parent : son parent n'est pas
// celui qu'il croit.
import { execFile, execFileSync } from "./sans-invite.ts";

export type OptionsArbre = {
  // L'instant (ms depuis l'époque) où la racine a été lancée.
  depuis?: number;
  // Pour les tests : la plateforme qu'on simule.
  plateforme?: NodeJS.Platform;
};

// Une ligne de la table des process de Windows. `ne` : l'heure de création, en
// ms depuis l'époque, 0 si Windows ne la dit pas.
export type Processus = { pid: number; parent: number; ne: number };

// L'heure de création de Windows et celle de Node ne se lisent pas à la même
// horloge : une seconde de marge.
const MARGE_MS = 1000;
// Les tours au plus : un arbre qui renaît encore après eux n'est plus un arbre
// qu'on arrête, c'est une fuite qu'on ne rattrapera pas ici.
const TOURS = 5;
const DELAI_DE_LA_TABLE_MS = 60_000;

export const POWERSHELL = "powershell.exe";
// La table, une ligne par process : `pid parent création`. Du texte et des
// chiffres, que rien ne déforme d'une version de PowerShell à l'autre.
export const SCRIPT_DE_LA_TABLE =
  "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $(if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }) }";
// `-EncodedCommand` : le script passe tel quel, sans les règles de guillemets
// de la ligne de commande de Windows.
const ARGS_DE_LA_TABLE = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(SCRIPT_DE_LA_TABLE, "utf16le").toString("base64")];
const OPTIONS_DE_LA_TABLE = { encoding: "utf8" as const, windowsHide: true, timeout: DELAI_DE_LA_TABLE_MS, maxBuffer: 16 << 20 };

export function lireTable(texte: string): Processus[] {
  const table: Processus[] = [];
  for (const ligne of texte.split(/\r?\n/)) {
    const lu = /^(\d+) (\d+) (\d+)$/.exec(ligne.trim());
    if (lu) table.push({ pid: Number(lu[1]), parent: Number(lu[2]), ne: Number(lu[3]) });
  }
  return table;
}

// Les pids vivants de l'arbre de `racine` dans `table`, la racine d'abord si elle
// vit encore. `soi` (le process qui lit) n'en est jamais.
export function arbreDe(table: Processus[], racine: number, depuis?: number, soi = process.pid): number[] {
  const borne = depuis === undefined ? null : depuis - MARGE_MS;
  const parPid = new Map(table.map((p) => [p.pid, p]));
  const tete = parPid.get(racine);
  // La racine vit, mais est née avant son lancement : ce pid n'est plus le sien.
  if (tete && borne !== null && tete.ne < borne) return [];
  const arbre = new Set([racine]);
  for (let ajoutes = 1; ajoutes > 0; ) {
    ajoutes = 0;
    for (const p of table) {
      if (arbre.has(p.pid) || !arbre.has(p.parent) || p.pid === soi) continue;
      if (borne !== null && p.ne < borne) continue;
      const parent = parPid.get(p.parent);
      if (parent && p.ne < parent.ne) continue;
      arbre.add(p.pid);
      ajoutes += 1;
    }
  }
  return [...arbre].filter((pid) => parPid.has(pid));
}

// Ce que rend une lecture de la table : son texte, ou pourquoi il manque —
// `ratee` se retente, `perdue` (PowerShell absent, délai épuisé) non.
type Lecture = string | "ratee" | "perdue";

// Tue ce que la table dit vivant de l'arbre. Rend faux quand il n'y a plus de
// tour à faire : personne de vivant, ou une table qu'on ne lira pas.
function unTour(lecture: Lecture, racine: number, depuis: number | undefined, premier: boolean): boolean {
  if (lecture === "ratee" || lecture === "perdue") {
    // La table ne se lit pas : la racine, au moins, ne survit pas à l'arrêt.
    if (premier) tuer(racine);
    return lecture === "ratee";
  }
  const texte = lecture;
  const vivants = arbreDe(lireTable(texte), racine, depuis);
  for (const pid of vivants) tuer(pid);
  return vivants.length > 0;
}

function tuer(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Déjà mort, ou plus à nous.
  }
}

type ErreurDeLecture = { code?: string | number | null; killed?: boolean; signal?: NodeJS.Signals | string | null; stdout?: unknown };

// Une sortie qui porte au moins une ligne de la table se lit, erreur ou pas.
function lecture(erreur: ErreurDeLecture | null, sortie: unknown): Lecture {
  const texte = typeof sortie === "string" ? sortie : Buffer.isBuffer(sortie) ? sortie.toString("utf8") : "";
  if (!erreur || lireTable(texte).length > 0) return texte;
  // PowerShell absent, ou tué au bout de son délai.
  if (erreur.code === "ENOENT" || erreur.code === "ETIMEDOUT" || erreur.killed || erreur.signal) return "perdue";
  return "ratee";
}

function lireLaTable(): Promise<Lecture> {
  return new Promise((rendre) => {
    execFile(POWERSHELL, ARGS_DE_LA_TABLE, OPTIONS_DE_LA_TABLE, (erreur, sortie) => rendre(lecture(erreur, sortie)));
  });
}

function lireLaTableSync(): Lecture {
  try {
    return execFileSync(POWERSHELL, ARGS_DE_LA_TABLE, { ...OPTIONS_DE_LA_TABLE, stdio: ["ignore", "pipe", "ignore"] });
  } catch (erreur) {
    return lecture(erreur as ErreurDeLecture, (erreur as ErreurDeLecture).stdout);
  }
}

const valide = (pid: number) => Number.isSafeInteger(pid) && pid > 0;

// Sous macOS et Linux : le signal au groupe, sur-le-champ.
function signalerLeGroupe(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Le groupe n'existe plus : il n'y a plus personne à arrêter.
  }
}

// Envoie `signal` à l'arbre de `pid`. La promesse se tient une fois l'arbre
// tué, et ne rejette jamais : un arbre qui n'existe plus n'a plus personne à
// arrêter. Sous macOS et Linux, le signal est parti avant que l'appel rende la
// main.
export async function signalerLArbre(pid: number, signal: NodeJS.Signals, options: OptionsArbre = {}): Promise<void> {
  if (!valide(pid)) return;
  if ((options.plateforme ?? process.platform) !== "win32") return signalerLeGroupe(pid, signal);
  for (let tour = 0; tour < TOURS; tour++) {
    if (!unTour(await lireLaTable(), pid, options.depuis, tour === 0)) return;
  }
}

// La même chose, d'un seul geste : pour celui qui s'en va et ne pourra pas
// attendre — le runtime qui abandonne ses cooks.
export function signalerLArbreSync(pid: number, signal: NodeJS.Signals, options: OptionsArbre = {}): void {
  if (!valide(pid)) return;
  if ((options.plateforme ?? process.platform) !== "win32") return signalerLeGroupe(pid, signal);
  for (let tour = 0; tour < TOURS; tour++) {
    if (!unTour(lireLaTableSync(), pid, options.depuis, tour === 0)) return;
  }
}
