// Le moteur d'une station : ce sur quoi tournent ses cooks (#3744). Le réglage
// `BRIGADE_ENGINE` de la station le dit — sa ligne de projet, ou son
// environnement :
//
// - `claude-subscription` (défaut, réglage absent) : le binaire `claude` sur
//   la connexion Max de la machine, comme avant ;
// - `claude-api-key` : le même binaire, facturé à la clé d'API que la station
//   détient dans ses secrets — la ligne `ANTHROPIC_API_KEY` du fichier que
//   nomme `BRIGADE_SECRETS_FILE` —, relue à chaque lancement ;
// - `codex` : le binaire `codex` (`BRIGADE_CODEX_BIN`, sinon `codex`), sous sa
//   propre connexion, dont le flux est traduit en celui de `claude`
//   (`codex-en-flux.ts`) : la station le lit comme elle lit tout cook.
//
// Le rail ne change pas : le worktree, la branche, la consigne, la poussée et
// la PR sont ceux de la station, quel que soit le moteur. La clé n'est jamais
// écrite ni dite : retenue par `identifiants.ts`, elle est masquée dans tout ce
// que le runtime garde ou publie, et seul le `claude` lancé la reçoit.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Calibrage } from "../calibrage.ts";
import type { Depot } from "../depot.ts";
import { retenirJeton } from "../identifiants.ts";
import { VARIABLE_DU_JETON } from "../jeton-claude.ts";
import { valeurDeLaMachine } from "../secrets.ts";

const VARIABLE_DU_MOTEUR = "BRIGADE_ENGINE";
const MOTEURS = ["claude-subscription", "claude-api-key", "codex"] as const;
export type Moteur = (typeof MOTEURS)[number];
const MOTEUR_PAR_DEFAUT: Moteur = "claude-subscription";
// Le nom de la clé, dans les secrets de la station comme pour `claude`.
const CLE_D_API = "ANTHROPIC_API_KEY";
const BINAIRE_CODEX = "BRIGADE_CODEX_BIN";

export type MoteurDeLaStation = { moteur: "claude-subscription" } | { moteur: "claude-api-key"; secrets: string } | { moteur: "codex"; codex: string };

// La clé, lue à cet instant dans les secrets de la station, et retenue pour
// être masquée partout. Le problème ne cite jamais la valeur.
function lireLaCle(fichier: string): { cle: string } | { probleme: string } {
  const lue = valeurDeLaMachine(fichier, CLE_D_API);
  if ("probleme" in lue) return lue;
  retenirJeton(lue.valeur);
  return { cle: lue.valeur };
}

// Le moteur que règle la station, lu à son ouverture : un réglage inconnu, ou
// une clé d'API introuvable, est un refus — la station ne prend aucun ticket
// qu'elle ne pourrait pas cuisiner.
export function moteurDeLaStation(env: Record<string, string | undefined>): MoteurDeLaStation | { refus: string } {
  const dit = env[VARIABLE_DU_MOTEUR]?.trim() || MOTEUR_PAR_DEFAUT;
  if (!(MOTEURS as readonly string[]).includes(dit)) return { refus: `${VARIABLE_DU_MOTEUR} “${dit}” is not an engine: expected one of ${MOTEURS.join(", ")}` };
  if (dit === "codex") return { moteur: "codex", codex: env[BINAIRE_CODEX] || "codex" };
  if (dit === "claude-api-key") {
    const fichier = env.BRIGADE_SECRETS_FILE;
    if (!fichier) return { refus: `the claude-api-key engine reads \`${CLE_D_API}\` in the station's secrets, and BRIGADE_SECRETS_FILE is not set` };
    const lue = lireLaCle(fichier);
    if ("probleme" in lue) return { refus: `the claude-api-key engine has no API key: ${lue.probleme}` };
    return { moteur: "claude-api-key", secrets: fichier };
  }
  return { moteur: "claude-subscription" };
}

export type LancementDuMoteur = { commande: string; args: string[]; env: NodeJS.ProcessEnv };

// Le script qui lance `codex` et traduit son flux.
const ADAPTATEUR_CODEX = join(dirname(fileURLToPath(import.meta.url)), "codex-en-flux.ts");

// L'effort de `codex` : il n'en connaît pas au-delà de `high`.
const EFFORT_CODEX: Record<string, string> = { low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" };

// Le dépôt commun d'un worktree, où ses commits s'écrivent : hors de lui
// quand c'est un worktree lié (`.git` est alors un fichier). Null : `.git` est
// un répertoire, sous le worktree. Illisible : une erreur.
function depotCommun(worktree: string): string | null {
  const point = join(worktree, ".git");
  if (statSync(point).isDirectory()) return null;
  const gitdir = /^gitdir:\s*(.+)$/m.exec(readFileSync(point, "utf8"))?.[1]?.trim();
  if (gitdir === undefined) throw new Error(`${point} names no git directory`);
  const prive = resolve(worktree, gitdir);
  const commun = readFileSync(join(prive, "commondir"), "utf8").trim();
  return isAbsolute(commun) ? commun : resolve(prive, commun);
}

// Les arguments de `codex exec` pour un cook : la consigne sur son entrée
// (`-`), son flux en JSON, et son bac à sable en écriture sur le worktree et
// le dépôt où il commite — l'équivalent de la garde du cook Claude, ses
// écritures dans son worktree (`garde-cook/`) —, réseau ouvert pour
// `git fetch`. Le modèle reste celui de `codex` : le calibrage nomme des
// modèles de Claude.
function argumentsCodex(calibrage: Calibrage, worktree: string): string[] {
  const commun = depotCommun(worktree);
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "-c",
    "sandbox_workspace_write.network_access=true",
    "-c",
    `model_reasoning_effort="${EFFORT_CODEX[calibrage.effort] ?? "medium"}"`,
    ...(commun === null ? [] : ["--add-dir", commun]),
    "-C",
    worktree,
    "-",
  ];
}

// Le lancement d'un cook sur le moteur de la station, à partir de celui que
// la station a préparé pour `claude`. Un refus : le cook ne peut pas partir —
// la clé ne se lit plus, le worktree ne dit pas son dépôt.
export function lancementDuCook(moteur: MoteurDeLaStation, cook: { claude: LancementDuMoteur; worktree: string; calibrage: Calibrage }): LancementDuMoteur | { refus: string } {
  const { claude } = cook;
  if (moteur.moteur === "claude-subscription") return claude;
  // Ni la connexion Max, ni rien d'autre que la clé : c'est elle qui paie.
  const { [VARIABLE_DU_JETON]: _jeton, ...sansJeton } = claude.env;
  if (moteur.moteur === "claude-api-key") {
    const lue = lireLaCle(moteur.secrets);
    if ("probleme" in lue) return { refus: `the API key of the claude-api-key engine could not be read: ${lue.probleme}` };
    return { ...claude, env: { ...sansJeton, [CLE_D_API]: lue.cle } };
  }
  let args: string[];
  try {
    args = argumentsCodex(cook.calibrage, cook.worktree);
  } catch (erreur) {
    return { refus: `the codex engine cannot find the worktree's git directory: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  return { commande: process.execPath, args: [ADAPTATEUR_CODEX, moteur.codex, ...args], env: sansJeton };
}

// La clé d'API d'un lancement n'est jamais poussée : ce qu'un push de la
// branche publierait — patchs et messages, après la récolte de ce que le cook
// a laissé — est lu avant. S'il la porte, ou s'il ne se lit pas, le worktree
// et la branche locale sont supprimés : rien de ce que le cook a écrit ne part.
// Rend pourquoi, ou null — toujours null pour un lancement sans clé.
export function cleDansLaLivraison(lancement: LancementDuMoteur, depot: Pick<Depot, "retirer"> & Partial<Pick<Depot, "recolter" | "ajouts">>, worktree: string, branche: string): string | null {
  const cle = lancement.env[CLE_D_API];
  if (!cle) return null;
  let porte: boolean;
  try {
    if (depot.recolter === undefined || depot.ajouts === undefined) throw new Error("this station's clone cannot list what a push would publish");
    depot.recolter(worktree, branche);
    porte = depot.ajouts(branche).includes(cle);
  } catch (erreur) {
    depot.retirer(worktree, branche);
    return `what the cook would push could not be checked for the station's API key, so nothing is pushed: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  if (!porte) return null;
  depot.retirer(worktree, branche);
  return "the cook committed the station's API key: its branch is deleted from the station's clone, and nothing is pushed";
}

// Ce que le flux d'un cook dit de son coût, en dollars : le `total_cost_usd`
// de son dernier résultat. Null : le flux ne le dit pas, ou ne se lit pas.
function coutDuFlux(fichier: string): number | null {
  let contenu: string;
  try {
    contenu = readFileSync(fichier, "utf8");
  } catch {
    return null;
  }
  let cout: number | null = null;
  for (const ligne of contenu.split("\n")) {
    try {
      const evenement = JSON.parse(ligne);
      if (evenement?.type === "result") cout = typeof evenement.total_cost_usd === "number" && Number.isFinite(evenement.total_cost_usd) ? evenement.total_cost_usd : null;
    } catch {
      // Une ligne illisible ne dit rien du coût.
    }
  }
  return cout;
}

// Le fichier des livraisons, sous le répertoire des flux de la station.
const LIVRAISONS = "livraisons.jsonl";

export type DonneesDeLivraison = { at: string; ticket: number; branch: string; engine: Moteur; costUsd?: number | null };

// Range la livraison d'un cook poussée en pass, une ligne JSON par livraison :
// son moteur, et pour `claude-api-key` son coût — `null` quand le flux ne le
// dit pas, jamais un coût inventé. Lève si l'écriture échoue.
export function noterLaLivraison(dossier: string, livraison: { ticket: number; branche: string; moteur: MoteurDeLaStation; flux: string; at: Date }): DonneesDeLivraison {
  const donnees: DonneesDeLivraison = {
    at: livraison.at.toISOString(),
    ticket: livraison.ticket,
    branch: livraison.branche,
    engine: livraison.moteur.moteur,
    ...(livraison.moteur.moteur === "claude-api-key" ? { costUsd: coutDuFlux(livraison.flux) } : {}),
  };
  mkdirSync(dossier, { recursive: true });
  appendFileSync(join(dossier, LIVRAISONS), `${JSON.stringify(donnees)}\n`);
  return donnees;
}
