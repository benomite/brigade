// La conversation avec le second d'un projet, lue où Claude Code la garde
// (#1413) : le transcript de la session que le second du desktop reprend.
//
// Le second du desktop est `claude --continue /brigade:po`, lancé dans le
// dossier du projet (`lancement.ts`) : il reprend la dernière session de ce
// dossier — le plus récent des transcripts de `projects/<dossier>/`, sous le
// répertoire de configuration de `claude` (`CLAUDE_CONFIG_DIR`, à défaut
// `~/.claude`). Ce module lit ce transcript-là, et rien d'autre : ce que le
// chef y a écrit — dans le terminal du desktop, ou du téléphone par le guichet
// de sa station (`telephone/second.ts`), qui y écrit par `claude --continue`
// lui aussi —, et ce que le second y a répondu, du plus ancien au plus récent.
// Deux lectures du même dossier au même instant rendent donc le même échange,
// d'où qu'il ait été écrit.
//
// Ce qui n'est pas de la conversation n'est pas rendu : les appels d'outils et
// leurs résultats, la réflexion du modèle, ce que Claude Code ajoute de lui-même
// (`isMeta`, les rappels du système, les résumés d'un compactage), les
// sous-agents, la sortie d'une commande locale. Une commande tapée par le chef
// (`/brigade:po`, `!git status`) l'est, telle qu'il l'a tapée. Les textes que le
// second écrit d'affilée, entre deux messages du chef, sont une seule réponse.
//
// L'app l'importe (`lireLaConversation`), ou lance la commande :
//
//   node runtime/src/second/conversation.ts <dossier du projet>
//
// qui rend la conversation en une ligne JSON — code 0 —, ou `{"said"}`, la
// phrase qui dit pourquoi elle ne se lit pas — code 1.
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { dossierDuProjet } from "../reprise-de-session.ts";

// Un message : qui l'a écrit, quand (l'instant du transcript), et son texte —
// du markdown, tel qu'écrit.
export type MessageDuSecond = { from: "chef" | "second"; at: string; text: string };

// `session` : celle du transcript lu, null quand le dossier n'en a encore
// aucune. `omitted` : le nombre de messages plus anciens que ceux rendus.
export type ConversationDuSecond = { session: string | null; messages: MessageDuSecond[]; omitted?: number };

// Les derniers messages rendus : une session de plusieurs semaines ne part pas
// entière à chaque lecture. Ceux d'avant sont comptés dans `omitted`.
export const MESSAGES_MAX = 200;

const SUFFIXE = ".jsonl";

// Pourquoi la conversation ne se lit pas, en une phrase sans majuscule ni point.
export class ConversationIllisible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationIllisible";
  }
}

// Le répertoire de configuration de `claude` dans cet environnement.
export const configurationDeClaude = (env: Record<string, string | undefined>): string => env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), ".claude");

// Ce que Claude Code écrit dans un message du chef pour une commande, ou
// autour : la commande se rend telle que tapée, sa sortie ne se rend pas.
const BALISE = (nom: string) => new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`);
const SORTIES = /^\s*<(local-command-stdout|local-command-stderr|bash-stdout|bash-stderr)>/;
const RAPPELS = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

function texteDuChef(contenu: unknown): string | null {
  const brut =
    typeof contenu === "string"
      ? contenu
      : Array.isArray(contenu)
        ? contenu
            .filter((bloc): bloc is { type: "text"; text: string } => bloc?.type === "text" && typeof bloc.text === "string")
            .map((bloc) => bloc.text)
            .join("\n\n")
        : "";
  if (SORTIES.test(brut) || brut.startsWith("[Request interrupted")) return null;
  const commande = BALISE("command-name").exec(brut)?.[1];
  if (commande !== undefined) {
    const args = BALISE("command-args").exec(brut)?.[1]?.trim() ?? "";
    return args === "" ? commande.trim() : `${commande.trim()} ${args}`;
  }
  const shell = BALISE("bash-input").exec(brut)?.[1];
  if (shell !== undefined) return `!${shell}`;
  const texte = brut.replace(RAPPELS, "").trim();
  return texte === "" ? null : texte;
}

function texteDuSecond(contenu: unknown): string | null {
  if (!Array.isArray(contenu)) return typeof contenu === "string" && contenu.trim() !== "" ? contenu.trim() : null;
  const texte = contenu
    .filter((bloc): bloc is { type: "text"; text: string } => bloc?.type === "text" && typeof bloc.text === "string")
    .map((bloc) => bloc.text.trim())
    .filter(Boolean)
    .join("\n\n");
  return texte === "" ? null : texte;
}

// Les messages d'un transcript, dans son ordre. Une ligne illisible est
// ignorée : la dernière peut être en train de s'écrire.
export function messagesDuTranscript(contenu: string): MessageDuSecond[] {
  const messages: MessageDuSecond[] = [];
  for (const ligne of contenu.split("\n")) {
    let entree;
    try {
      entree = JSON.parse(ligne);
    } catch {
      continue;
    }
    if (typeof entree !== "object" || entree === null) continue;
    if (entree.isSidechain === true || entree.isMeta === true || entree.isCompactSummary === true || entree.isVisibleInTranscriptOnly === true) continue;
    const at = typeof entree.timestamp === "string" ? entree.timestamp : "";
    if (entree.type === "user") {
      const text = texteDuChef(entree.message?.content);
      if (text !== null) messages.push({ from: "chef", at, text });
    } else if (entree.type === "assistant") {
      const text = texteDuSecond(entree.message?.content);
      if (text === null) continue;
      const precedent = messages.at(-1);
      if (precedent?.from === "second") {
        precedent.text = `${precedent.text}\n\n${text}`;
        precedent.at = at || precedent.at;
      } else messages.push({ from: "second", at, text });
    }
  }
  return messages;
}

// Le transcript que `claude --continue`, lancé dans `dossier`, reprendrait : le
// plus récemment écrit de son répertoire de projet. Null : aucun, le dossier
// n'a pas encore de conversation. Un lien n'est pas suivi.
export function transcriptDuSecond(claude: string, dossier: string): string | null {
  let reel: string;
  try {
    reel = realpathSync(dossier);
  } catch {
    throw new ConversationIllisible(`the project's folder ${dossier} does not exist on this machine`);
  }
  const repertoire = dossierDuProjet(claude, reel);
  if (repertoire === null) throw new ConversationIllisible(`the project's folder ${reel} has a path too long for its conversation to be found`);
  let noms: string[];
  try {
    noms = readdirSync(repertoire);
  } catch {
    return null;
  }
  let plusRecent: { chemin: string; ecritMs: number } | null = null;
  for (const nom of noms) {
    if (!nom.endsWith(SUFFIXE)) continue;
    const chemin = join(repertoire, nom);
    let vu;
    try {
      vu = lstatSync(chemin);
    } catch {
      continue;
    }
    if (!vu.isFile()) continue;
    if (plusRecent === null || vu.mtimeMs > plusRecent.ecritMs) plusRecent = { chemin, ecritMs: vu.mtimeMs };
  }
  return plusRecent?.chemin ?? null;
}

// La conversation du second qui tourne dans `dossier`, avec `claude` pour
// répertoire de configuration.
export function lireLaConversation(lieux: { claude: string; dossier: string }): ConversationDuSecond {
  const transcript = transcriptDuSecond(lieux.claude, lieux.dossier);
  if (transcript === null) return { session: null, messages: [] };
  let contenu: string;
  try {
    contenu = readFileSync(transcript, "utf8");
  } catch (erreur) {
    throw new ConversationIllisible(`its transcript ${transcript} cannot be read (${(erreur as NodeJS.ErrnoException).code ?? String(erreur)})`);
  }
  const tous = messagesDuTranscript(contenu);
  const session = basename(transcript, SUFFIXE);
  const omitted = Math.max(0, tous.length - MESSAGES_MAX);
  return omitted === 0 ? { session, messages: tous } : { session, messages: tous.slice(omitted), omitted };
}

const USAGE = "usage: node runtime/src/second/conversation.ts <project folder>";

export function principal(appel: Appel): void {
  const [dossier, ...reste] = appel.args;
  if (dossier === undefined || dossier === "" || reste.length > 0) {
    appel.redire(USAGE);
    throw new Sortie(2);
  }
  try {
    appel.dire(JSON.stringify(lireLaConversation({ claude: configurationDeClaude(appel.env), dossier })));
  } catch (erreur) {
    if (!(erreur instanceof ConversationIllisible)) throw erreur;
    appel.dire(JSON.stringify({ said: `the second's conversation cannot be read: ${erreur.message}` }));
    throw new Sortie(1);
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
