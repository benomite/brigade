// Le contexte d'un signalement (épique #1973) : ce que l'app sait déjà d'une panne et qu'un signalement doit porter —
// la version de l'app, celle du runtime, le système, et les lignes du journal qui parlent de cette panne. Rien n'est lu
// dans le dépôt de l'utilisateur, et rien n'est masqué ici : le masquage est un module à part, appliqué ensuite.
//
// Les sources sont celles que l'app a déjà, passées par l'appelant : `appVersion` est `app.getVersion()` (ce que
// mise-a-jour/etat.ts dit à la vue), `runtimeVersion` est `versionDuRuntime()` (runtime/src/mise-a-jour/en-service.ts),
// `journal` rend la sortie de la commande `log` (onglets.ts) — une ligne par événement, dans le format de
// runtime/src/ligne-evenement.ts.
import { arch, release, type as nomDuSysteme, version as versionDuSysteme } from "node:os";

// Le nombre maximal de lignes du journal qu'un signalement porte : les plus récentes parmi celles qui parlent de la panne.
export const LIGNES_MAX = 200;

// La panne, par ce qui la désigne : une station, un ticket, une passe (son identifiant), ou une ligne d'erreur.
export type Reference =
  | { station: string }
  | { ticket: number }
  | { pass: string }
  | { ligne: string };

export type Systeme = { name: string; version: string; release: string; arch: string };
export type Contexte = { appVersion: string; runtimeVersion: string; system: Systeme; logLines: string[] };

export type SourcesDuContexte = {
  appVersion: string;
  runtimeVersion: () => string;
  journal: () => string | Promise<string>;
};

// <seq>  <horodatage>  <projet>  #<ticket> ou -  <type>  <auteur>  <charge utile en JSON>
const LIGNE_DU_JOURNAL = /^(\d+) {2}(\d{4}-\d{2}-\d{2}T\S+) {2}(\S+) {2}(#\d+|-) {2}(\S+) {2}(\S+) {2}(.*)$/;

type Ligne = { seq: number; ticket: number | null; auteur: string; brute: string };

// Une ligne n'est gardée que dans le format de brigade, charge utile en JSON comprise : tout le reste (le contenu d'un
// fichier cité, une trace) n'est pas du journal.
function lue(brute: string): Ligne | undefined {
  const trouve = LIGNE_DU_JOURNAL.exec(brute);
  if (trouve === null) return undefined;
  const [, seq = "", , , ticket = "", , auteur = "", charge = ""] = trouve;
  try {
    JSON.parse(charge);
  } catch {
    return undefined;
  }
  return { seq: Number(seq), ticket: ticket === "-" ? null : Number(ticket.slice(1)), auteur, brute };
}

function parle(ligne: Ligne, reference: Reference): boolean {
  if ("ticket" in reference) return ligne.ticket === reference.ticket;
  if ("station" in reference) return ligne.auteur === `station:${reference.station}` || ligne.brute.includes(reference.station);
  const mot = "pass" in reference ? reference.pass : reference.ligne;
  return mot !== "" && ligne.brute.includes(mot);
}

export function lignesDuJournal(texte: string, reference: Reference): string[] {
  return texte
    .split(/\r?\n/)
    .flatMap((brute) => {
      const ligne = lue(brute);
      return ligne !== undefined && parle(ligne, reference) ? [ligne] : [];
    })
    .sort((a, b) => a.seq - b.seq)
    .slice(-LIGNES_MAX)
    .map(({ brute }) => brute);
}

export function systemeDuPoste(): Systeme {
  let version = "unknown";
  try {
    version = versionDuSysteme();
  } catch {
    // le système ne la dit pas : le reste du contexte part quand même
  }
  return { name: nomDuSysteme(), version, release: release(), arch: arch() };
}

export async function contexteDuSignalement(reference: Reference, sources: SourcesDuContexte): Promise<Contexte> {
  let runtimeVersion = "unknown";
  try {
    runtimeVersion = sources.runtimeVersion();
  } catch {
    // la version du runtime ne se lit pas : le signalement part sans elle
  }
  let logLines: string[] = [];
  try {
    logLines = lignesDuJournal(await sources.journal(), reference);
  } catch {
    // journal absent ou illisible : aucune ligne, le reste du contexte part quand même
  }
  return { appVersion: sources.appVersion, runtimeVersion, system: systemeDuPoste(), logLines };
}
