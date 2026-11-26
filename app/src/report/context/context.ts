// Le contexte d'un signalement (épique #1973) : ce que l'app sait déjà d'une panne et qu'un signalement doit porter —
// la version de l'app, celle du runtime, le système, et les lignes du journal qui parlent de cette panne. Rien n'est lu
// dans le dépôt de l'utilisateur, et rien n'est masqué ici : le masquage est un module à part, appliqué ensuite.
//
// Les sources sont celles que l'app a déjà, passées par l'appelant : `appVersion` est `app.getVersion()` (ce que
// mise-a-jour/etat.ts dit à la vue), `runtimeVersion` est `versionDuRuntime()` (runtime/src/mise-a-jour/en-service.ts),
// `journal` rend la sortie de la commande `log` (onglets.ts) — une ligne par événement, dans le format de
// runtime/src/ligne-evenement.ts.
import { arch, release, type as nameDuSysteme, version as versionDuSysteme } from "node:os";

// Le nombre maximal de lignes du journal qu'un signalement porte : les plus récentes parmi celles qui parlent de la panne.
export const LINES_MAX = 200;

// La panne, par ce qui la désigne : une station, un ticket, une passe (son identifiant), ou une ligne d'erreur.
export type Reference =
  | { station: string }
  | { ticket: number }
  | { pass: string }
  | { ligne: string };

export type Systeme = { name: string; version: string; release: string; arch: string };
export type Context = { appVersion: string; runtimeVersion: string; system: Systeme; logLines: string[] };

export type SourcesDuContext = {
  appVersion: string;
  runtimeVersion: () => string;
  journal: () => string | Promise<string>;
};

// <seq>  <horodatage>  <projet>  #<ticket> ou -  <type>  <auteur>  <charge utile en JSON>
const LINE_DU_LOG = /^(\d+) {2}(\d{4}-\d{2}-\d{2}T\S+) {2}(\S+) {2}(#\d+|-) {2}(\S+) {2}(\S+) {2}(.*)$/;

type Line = { seq: number; ticket: number | null; auteur: string; brute: string };

// Une ligne n'est gardée que dans le format de brigade, charge utile en JSON comprise : tout le reste (le contenu d'un
// fichier cité, une trace) n'est pas du journal.
function lue(brute: string): Line | undefined {
  const trouve = LINE_DU_LOG.exec(brute);
  if (trouve === null) return undefined;
  const [, seq = "", , , ticket = "", , auteur = "", charge = ""] = trouve;
  try {
    JSON.parse(charge);
  } catch {
    return undefined;
  }
  return { seq: Number(seq), ticket: ticket === "-" ? null : Number(ticket.slice(1)), auteur, brute };
}

function parle(line: Line, reference: Reference): boolean {
  if ("ticket" in reference) return line.ticket === reference.ticket;
  if ("station" in reference) return line.auteur === `station:${reference.station}` || line.brute.includes(reference.station);
  const word = "pass" in reference ? reference.pass : reference.ligne;
  return word !== "" && line.brute.includes(word);
}

export function linesDuLog(texte: string, reference: Reference): string[] {
  return texte
    .split(/\r?\n/)
    .flatMap((brute) => {
      const line = lue(brute);
      return line !== undefined && parle(line, reference) ? [line] : [];
    })
    .sort((a, b) => a.seq - b.seq)
    .slice(-LINES_MAX)
    .map(({ brute }) => brute);
}

export function systemeDuWorkstation(): Systeme {
  let version = "unknown";
  try {
    version = versionDuSysteme();
  } catch {
    // le système ne la dit pas : le reste du contexte part quand même
  }
  return { name: nameDuSysteme(), version, release: release(), arch: arch() };
}

export async function contextDuReport(reference: Reference, sources: SourcesDuContext): Promise<Context> {
  let runtimeVersion = "unknown";
  try {
    runtimeVersion = sources.runtimeVersion();
  } catch {
    // la version du runtime ne se lit pas : le signalement part sans elle
  }
  let logLines: string[] = [];
  try {
    logLines = linesDuLog(await sources.journal(), reference);
  } catch {
    // journal absent ou illisible : aucune ligne, le reste du contexte part quand même
  }
  return { appVersion: sources.appVersion, runtimeVersion, system: systemeDuWorkstation(), logLines };
}
