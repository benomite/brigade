// Le plus gros consommateur d'une machine saturée (#4090) : ce qui tient le
// disque ou le processeur quand la station cesse de prendre des tickets, pour
// que le chef n'ait plus à mesurer la machine à la main.
//   - Le disque : seulement ce que brigade laisse — le répertoire d'état de
//     chaque projet de la machine (`espace/`, `brigade/`, les frères du sien),
//     le temporaire de la station et le cache npm. Jamais tout le disque.
//   - Le processeur : le processus qui en prend le plus.
// Une mesure qui échoue, expire, un outil qui manque (Windows n'a ni `du` ni
// `ps`) : personne n'est nommé, et la saturation se dit comme avant. Rien ici
// ne lève.
import { readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Ressource } from "./events/station.ts";
import { spawnSync } from "./sans-invite.ts";

type Consommateur = { name: string; amount: string };

// Ce que les gardes de la station appellent quand la machine manque d'une ressource.
export type LireConsommateur = (resource: Ressource) => Consommateur | null;

// Les lectures, injectables : les tests rendent leurs sorties sans rien lancer.
// `repertoires` : les répertoires de brigade à mesurer ; `du` : la sortie de
// `du -sk` sur eux ; `ps` : une ligne `pid pcpu comm` par processus. Une
// lecture qui ne rend rien de lisible rend null.
type Lectures = { repertoires: () => string[]; du: (repertoires: string[]) => string | null; ps: () => string | null };

// Une mesure qui traîne lâche au bout de ce délai : elle ne retient pas la prise.
const MESURE_MS = 5_000;

const KO_PAR_GO = 1024 * 1024;

// Le répertoire d'état de chaque projet de la machine — ils sont frères —, le
// temporaire de la station et le cache npm.
function repertoiresDeBrigade(repertoireEtat: string, env: Record<string, string | undefined>): string[] {
  const parent = dirname(repertoireEtat);
  let projets: string[] = [repertoireEtat];
  try {
    projets = readdirSync(parent, { withFileTypes: true }).filter((entree) => entree.isDirectory()).map((entree) => join(parent, entree.name));
  } catch {
    // Un parent qui ne se lit pas : le seul répertoire de la station se mesure.
  }
  return [...new Set([...projets, env.TMPDIR || tmpdir(), env.npm_config_cache || join(env.HOME || homedir(), ".npm")])];
}

// `du` dit ce qu'il a pu mesurer même quand un répertoire lui est fermé : sa
// sortie se lit quel que soit son code. Un outil absent ou une mesure qui
// expire — sa sortie serait partielle — ne se lit pas.
const MESURE: { encoding: "utf8"; timeout: number; stdio: ("ignore" | "pipe")[] } = { encoding: "utf8", timeout: MESURE_MS, stdio: ["ignore", "pipe", "ignore"] };
const sortie = ({ stdout, error }: { stdout: string | null; error?: Error }): string | null => (error === undefined ? stdout : null);

// Les vraies lectures, sur la machine de la station et dans l'environnement de son projet.
export function lectures(repertoireEtat: string, env: Record<string, string | undefined>): Lectures {
  return {
    repertoires: () => repertoiresDeBrigade(repertoireEtat, env),
    du: (repertoires) => sortie(spawnSync("du", ["-sk", "--", ...repertoires], MESURE)),
    ps: () => sortie(spawnSync("ps", ["-Ao", "pid=,pcpu=,comm="], MESURE)),
  };
}

const taille = (ko: number): string => (ko >= KO_PAR_GO ? `${(ko / KO_PAR_GO).toFixed(1)} GB` : `${Math.round(ko / 1024)} MB`);

// Le plus gros des répertoires que `du` a mesurés.
function plusGrosRepertoire(sortie: string): Consommateur | null {
  let gros: { chemin: string; ko: number } | null = null;
  for (const ligne of sortie.split(/\r?\n/)) {
    const trouve = /^(\d+)\s+(.+)$/.exec(ligne);
    if (trouve === null) continue;
    const ko = Number(trouve[1]);
    if (gros === null || ko > gros.ko) gros = { chemin: trouve[2] as string, ko };
  }
  return gros === null ? null : { name: `${basename(gros.chemin)}/`, amount: taille(gros.ko) };
}

// Le processus qui prend le plus de processeur.
function plusGrosProcessus(sortie: string): Consommateur | null {
  let gros: { pid: string; pcpu: number; nom: string } | null = null;
  for (const ligne of sortie.split(/\r?\n/)) {
    const trouve = /^\s*(\d+)\s+(\d+(?:\.\d+)?)\s+(\S.*?)\s*$/.exec(ligne);
    if (trouve === null) continue;
    const pcpu = Number(trouve[2]);
    if (gros === null || pcpu > gros.pcpu) gros = { pid: trouve[1] as string, pcpu, nom: trouve[3] as string };
  }
  return gros === null ? null : { name: `${gros.nom} (pid ${gros.pid})`, amount: `${gros.pcpu}% CPU` };
}

export function lireConsommateur(lu: Lectures): LireConsommateur {
  return (resource) => {
    try {
      if (resource === "disk") {
        const du = lu.du(lu.repertoires());
        return du === null ? null : plusGrosRepertoire(du);
      }
      if (resource === "cpu") {
        const ps = lu.ps();
        return ps === null ? null : plusGrosProcessus(ps);
      }
    } catch {
      // Une lecture qui échoue ne nomme personne : la saturation se dit sans lui.
    }
    return null;
  };
}
