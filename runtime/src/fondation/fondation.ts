// Les gates d'un projet neuf, tant que son ticket de fondation n'est pas servi
// (#3188, épique #3183). `/brigade:init` prépare un dépôt sans code (#3186) : il
// dépose le ticket de fondation — labellisé `foundation`, titré « Lay the
// project's foundation with <stack> » — qui apporte le code et ses tests, et il
// note que les gates n'ont encore rien à jouer par une ligne des bindings de
// `CLAUDE.md` (`commands/init.md`, étape 5) :
//
//   - **Gates provisoires** : until #<n> ("Lay the project's foundation with <stack>") is merged — …
//
// Des gates ne jouent rien quand leur `gates.sh` ne lance aucune commande — rien
// que des commentaires, `set`, `cd`, des affectations, `:`, `true` ou un `exit`
// —, ou quand cette ligne les dit provisoires. Elles ne disent alors jamais
// vert : elles rendent « nothing checked », et pourquoi, et rien ne se merge sur
// elles. Tant qu'un ticket labellisé `foundation` est ouvert, seule sa propre
// livraison passe : elle apporte les vraies gates, que la station joue sur sa
// branche, et la relecture la juge sur ses propres critères. Le ticket de
// fondation fermé, des gates qui lancent une commande sont les vraies, ligne
// oubliée ou non ; un `gates.sh` sans commande, lui, ne juge jamais rien.
//
// Branché sur les gates que joue la station (`brigade-github.ts`) : celles de
// la tête d'une PR, avant son merge, et celles de la base, qui prouvent un
// ticket déjà servi (#3146). Une PR externe n'est jamais mergée par la cuisine
// (#2933) : ses gates ne passent pas par ici.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCRIPT_GATES } from "../gates.ts";
import type { Issue } from "../github.ts";

export const LABEL_FONDATION = "foundation";
export const RIEN_VERIFIE = "nothing checked";

const LIGNE = /^\s*-\s*\*\*Gates provisoires\*\*\s*:/m;

// Les lignes d'un script qui ne lancent rien. Au moindre doute — un `&&`, un
// `;`, un tube, une commande précédée d'une affectation —, la ligne compte
// comme une commande : des gates jouées à tort se jugent, une livraison
// retenue à tort ne se merge pas.
const MOT = `(?:"[^"]*"|'[^']*'|[^\\s"';&|]+)`;
const SANS_EFFET = [
  new RegExp(`^set(?:\\s+[-+][A-Za-z]+)*(?:\\s+[a-z]+)?$`),
  new RegExp(`^cd(?:\\s+${MOT})?$`),
  new RegExp(`^(?::|true)(?:\\s+${MOT})*$`),
  new RegExp(`^(?:(?:export|readonly|local|declare)\\s+)?[A-Za-z_][A-Za-z0-9_]*=${MOT}?$`),
];
const SORTIE = /^exit(?:\s+\S+)?$/;

// Ce script lance-t-il une commande avant de sortir ?
export function lanceUneCommande(script: string): boolean {
  for (const brute of script.split("\n")) {
    const ligne = brute.replace(/(^|\s)#.*$/, "").trim();
    if (ligne === "" || SANS_EFFET.some((motif) => motif.test(ligne))) continue;
    return !SORTIE.test(ligne);
  }
  return false;
}

// Ce `CLAUDE.md` dit-il les gates provisoires ?
export const ditProvisoires = (claudeMd: string) => LIGNE.test(claudeMd);

// Les tickets labellisés `foundation` du dépôt, ouverts ou fermés.
export type LireFondations = () => Promise<Pick<Issue, "number" | "labels" | "state">[]>;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Pourquoi les gates de ce worktree ne peuvent pas juger la livraison de
// `ticket`, en une phrase qui commence par « nothing checked » quand elles ne
// jouent rien ; null : elles sont les vraies, qu'on les joue. Ne lève pas : un
// fichier illisible ou des tickets que GitHub ne rend pas ne se tranchent pas
// ici — ils se disent, et rien ne se merge. GitHub n'est lu que si les gates
// ne jouent rien.
export async function gatesQuiNeJugentPas(worktree: string, ticket: Pick<Issue, "labels">, lireFondations: LireFondations): Promise<string | null> {
  let script: string;
  try {
    script = readFileSync(join(worktree, SCRIPT_GATES), "utf8");
  } catch (erreur) {
    return `the \`${SCRIPT_GATES}\` of the delivery could not be read to know whether it runs a test command: ${message(erreur)}`;
  }
  let claudeMd = "";
  try {
    claudeMd = readFileSync(join(worktree, "CLAUDE.md"), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") return `the \`CLAUDE.md\` of the delivery could not be read to know whether its gates are provisional: ${message(erreur)}`;
  }
  const sansCommande = !lanceUneCommande(script);
  if (!sansCommande && !ditProvisoires(claudeMd)) return null;
  const aucuneCommande = `${RIEN_VERIFIE} — the gates run no test command: \`${SCRIPT_GATES}\` runs nothing, and gates that run nothing never pass a delivery`;
  if (ticket.labels.includes(LABEL_FONDATION)) return sansCommande ? aucuneCommande : null;
  let fondations: Pick<Issue, "number" | "labels" | "state">[];
  try {
    fondations = (await lireFondations()).filter((issue) => issue.labels.includes(LABEL_FONDATION));
  } catch (erreur) {
    return `the tickets labelled \`${LABEL_FONDATION}\` could not be read on GitHub to know whether the gates run anything: ${message(erreur)}`;
  }
  const attendue = fondations.find((issue) => issue.state === "open");
  const seule = `no delivery but the \`${LABEL_FONDATION}\` ticket's is merged on them`;
  if (attendue !== undefined) return `${RIEN_VERIFIE} — the gates run nothing until the foundation ticket #${attendue.number} is merged: ${seule}`;
  if (sansCommande) return aucuneCommande;
  if (fondations.length === 0) return `${RIEN_VERIFIE} — the gates run nothing until a ticket labelled \`${LABEL_FONDATION}\` is filed and merged (the \`Gates provisoires\` binding of \`CLAUDE.md\`): ${seule}`;
  return null;
}
