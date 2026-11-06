// Les dossiers et la porte réseau de la station de cet ordinateur, tels que le chef les change sur sa page (#2644,
// épique 2497) : un fichier de cette machine, à côté du fichier de l'app, jamais dans un dépôt. Il ne garde que ce que le
// chef a changé — un dossier, les hôtes qu'il ouvre en plus du socle et de ce que le dépôt déclare ; le reste se lit
// là où la station le calcule. Le fichier est relu à chaque lecture : ce qui est écrit se montre au rechargement.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

export type Reglages = { clones: string; worktrees: string; bac: "on" | "off"; hotes: { hote: string; origine: string; ajoute: boolean }[] };
export type Changement = { clones?: string; worktrees?: string; hotes?: string[] };
export type Refus = { refus: string; detail?: string };
type Gardes = { clones?: string; worktrees?: string; hotes?: string[] };

export const SOCLE = [
  { hote: "anthropic.com", origine: "Anthropic — the model, through the Max connection" },
  { hote: "claude.ai", origine: "Anthropic — the model, through the Max connection" },
  { hote: "github.com", origine: "GitHub — the repository, the issues, the archives" },
  { hote: "githubusercontent.com", origine: "GitHub — the repository, the issues, the archives" },
];
export const OUVERT_PAR_LE_CHEF = "opened by you on this machine";
const HOTE = /^(\*\.)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?)(:[1-9][0-9]{0,4})?$/;

function lireGardes(fichier: string): Gardes {
  try {
    const lu = JSON.parse(readFileSync(fichier, "utf8"));
    return typeof lu === "object" && lu !== null && !Array.isArray(lu) ? lu : {};
  } catch {
    return {};
  }
}

export function lireReglagesDeLaStation(fichier: string, calcules: { clone: string; worktrees: string }, sansBac = false): Reglages {
  const gardes = lireGardes(fichier);
  const ajoutes = Array.isArray(gardes.hotes) ? gardes.hotes.filter((h): h is string => typeof h === "string") : [];
  return {
    clones: gardes.clones ?? calcules.clone,
    worktrees: gardes.worktrees ?? calcules.worktrees,
    bac: sansBac ? "off" : "on",
    hotes: [...SOCLE.map((h) => ({ ...h, ajoute: false })), ...ajoutes.filter((h) => !SOCLE.some((s) => s.hote === h)).map((hote) => ({ hote, origine: OUVERT_PAR_LE_CHEF, ajoute: true }))],
  };
}

export function ecrireReglagesDeLaStation(fichier: string, changement: Changement): { fait: string } | Refus {
  const gardes = lireGardes(fichier);
  for (const cle of ["clones", "worktrees"] as const) {
    const valeur = changement[cle];
    if (valeur === undefined) continue;
    if (typeof valeur !== "string" || !isAbsolute(valeur)) return { refus: `the ${cle} folder must be an absolute path`, detail: `“${String(valeur)}” is not one` };
    gardes[cle] = valeur;
  }
  if (changement.hotes !== undefined) {
    const propres: string[] = [];
    for (const brute of changement.hotes) {
      const hote = String(brute).trim().toLowerCase();
      if (!HOTE.test(hote)) return { refus: "not a host", detail: `“${hote}”: expected a name (registry.npmjs.org), \`*.\` in front for its subdomains, \`:port\` behind for a port other than 443 and 80` };
      if (!propres.includes(hote)) propres.push(hote);
    }
    gardes.hotes = propres;
  }
  try {
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(`${fichier}.tmp`, JSON.stringify(gardes, null, 2));
    renameSync(`${fichier}.tmp`, fichier);
  } catch (erreur) {
    return { refus: "nothing was changed", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  return { fait: "saved on this machine" };
}
