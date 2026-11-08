// Le chef par défaut (#2928) : le compte GitHub que les cartes de TODO
// mentionnent, et que `status` dit avec sa source.
//
//   - `declared`   : `chef`, dans `.claude/brigade/projet.json`, relu à chaque fois ;
//   - `repo owner` : sinon, le propriétaire du dépôt, quand c'est une personne ;
//   - `set up by`  : sinon — le dépôt est à une organisation —, l'auteur de la
//                    PR de `/brigade:init`, celle qui a posé les gates.
//
// Sans aucun des trois, il n'y a pas de chef, et la raison est dite : rien
// n'est deviné. Ce qui vient de GitHub se garde une heure ; un échec de GitHub
// garde le dernier chef résolu, et se dit une fois.
//
// La cuisine écrit le chef résolu dans le répertoire d'état (`chef.json`) ;
// `status`, qui ne parle pas à GitHub, le relit.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GitHub } from "../github.ts";
import type { CauseReveil, Runtime } from "../runtime.ts";

export type SourceDuChef = "declared" | "repo owner" | "set up by";
export type ChefResolu = { login: string; source: SourceDuChef } | { login: null; reason: string };
export type GitHubDuChef = Pick<GitHub, "proprietaire" | "auteurDeLInit">;

export const FICHIER_DU_CHEF = "chef.json";
const SOURCES: readonly string[] = ["declared", "repo owner", "set up by"] satisfies SourceDuChef[];
const GARDE_MS = 3_600_000;
const SANS_CHEF = "set `chef` to the chef's GitHub login in `.claude/brigade/projet.json`";

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le chef que GitHub donne, sans réglage : le propriétaire, ou l'auteur de l'init.
export async function chefDeGitHub(github: GitHubDuChef): Promise<ChefResolu> {
  if (github.proprietaire === undefined) return { login: null, reason: `no \`chef\` declared, and this GitHub client cannot read the repo owner: ${SANS_CHEF}` };
  const proprietaire = await github.proprietaire();
  if (!proprietaire.organisation) return { login: proprietaire.login, source: "repo owner" };
  const auteur = (await github.auteurDeLInit?.()) ?? null;
  if (auteur !== null && auteur !== "") return { login: auteur, source: "set up by" };
  return { login: null, reason: `no \`chef\` declared, the repo belongs to the organization ${proprietaire.login}, and no merged \`/brigade:init\` PR was found: ${SANS_CHEF}` };
}

// Le chef, dans l'ordre : déclaré, puis ce que GitHub en dit.
export async function resoudreLeChef(declare: string | null | undefined, github: GitHubDuChef): Promise<ChefResolu> {
  const nomme = declare?.trim();
  if (nomme) return { login: nomme, source: "declared" };
  return chefDeGitHub(github);
}

export type OptionsDuChef = {
  github: GitHubDuChef;
  // `chef` tel que les réglages du projet le portent, relu à chaque fois.
  declare: () => string | null | undefined;
  // Où le chef résolu s'écrit, pour `status`.
  repertoireEtat: string;
  avertir?: (ligne: string) => void;
  maintenant?: () => number;
};

// Le résolveur d'une cuisine : `resoudre` ne lève jamais, il rend le chef ou
// la raison de son absence, et l'écrit quand il change.
export function resolveurDuChef(options: OptionsDuChef) {
  const avertir = options.avertir ?? ((ligne: string) => console.error(ligne));
  const maintenant = options.maintenant ?? Date.now;
  const dits = new Set<string>();
  const direUneFois = (ligne: string) => {
    if (dits.has(ligne)) return;
    dits.add(ligne);
    avertir(ligne);
  };
  let garde: { resolu: ChefResolu; a: number } | null = null;
  let enVol: Promise<ChefResolu> | null = null;
  let ecrit = "";

  const deGitHub = (): Promise<ChefResolu> => {
    if (garde !== null && maintenant() - garde.a < GARDE_MS) return Promise.resolve(garde.resolu);
    enVol ??= chefDeGitHub(options.github)
      .then((resolu) => {
        garde = { resolu, a: maintenant() };
        return resolu;
      })
      .catch((erreur): ChefResolu => {
        direUneFois(`brigade : the chef is not resolved from GitHub — ${message(erreur)}`);
        return garde?.resolu ?? { login: null, reason: `no \`chef\` declared, and GitHub did not answer: ${message(erreur)}` };
      })
      .finally(() => {
        enVol = null;
      });
    return enVol;
  };

  const resoudre = async (): Promise<ChefResolu> => {
    let resolu: ChefResolu;
    try {
      const nomme = options.declare()?.trim();
      resolu = nomme ? { login: nomme, source: "declared" } : await deGitHub();
    } catch (erreur) {
      resolu = { login: null, reason: `the project settings do not read: ${message(erreur)}` };
    }
    const texte = JSON.stringify(resolu);
    if (texte !== ecrit) {
      try {
        noterLeChef(options.repertoireEtat, resolu);
        ecrit = texte;
      } catch (erreur) {
        direUneFois(`brigade : the resolved chef is not written for \`status\` — ${message(erreur)}`);
      }
    }
    return resolu;
  };
  return { resoudre };
}

export function noterLeChef(repertoireEtat: string, resolu: ChefResolu): void {
  const chemin = join(repertoireEtat, FICHIER_DU_CHEF);
  mkdirSync(repertoireEtat, { recursive: true });
  writeFileSync(`${chemin}.tmp`, JSON.stringify(resolu));
  renameSync(`${chemin}.tmp`, chemin);
}

// Ce que la cuisine a écrit : le chef, sa raison d'absence, rien encore
// (`absent`), ou un fichier qui ne se lit pas (`illisible`).
export type ChefLu = ChefResolu | { absent: true } | { illisible: string };

export function lireLeChef(repertoireEtat: string | undefined): ChefLu {
  if (!repertoireEtat) return { absent: true };
  let brut: string;
  try {
    brut = readFileSync(join(repertoireEtat, FICHIER_DU_CHEF), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return { absent: true };
    return { illisible: message(erreur) };
  }
  try {
    const lu = JSON.parse(brut) as Record<string, unknown> | null;
    if (typeof lu?.login === "string" && lu.login !== "" && typeof lu.source === "string" && SOURCES.includes(lu.source)) return { login: lu.login, source: lu.source as SourceDuChef };
    if (lu?.login === null && typeof lu.reason === "string") return { login: null, reason: lu.reason };
  } catch {}
  return { illisible: `${FICHIER_DU_CHEF} is not a resolved chef` };
}

// La ligne de `status`.
export function direLeChef(lu: ChefLu): string {
  const tete = "chef".padEnd(11);
  if ("absent" in lu) return `${tete} not resolved yet — the kitchen resolves it when it runs`;
  if ("illisible" in lu) return `${tete} unreadable — ${lu.illisible}`;
  if (lu.login === null) return `${tete} none resolved — ${lu.reason}`;
  return `${tete} ${lu.login} (${lu.source})`;
}

// Branche le résolveur au runtime : une résolution d'emblée, puis à chaque
// tick, pour que `status` dise le chef même sans carte à mentionner. Rend le
// chef résolu, pour la mention des cartes de TODO.
export function brancherLeChef(runtime: Runtime, options: OptionsDuChef): { chef: () => Promise<string | null> } {
  const resolveur = resolveurDuChef(options);
  const resoudre = (cause: CauseReveil) => {
    if (cause === "tick") void resolveur.resoudre();
  };
  resoudre("tick");
  runtime.surReveil(resoudre);
  return { chef: async () => (await resolveur.resoudre()).login };
}
