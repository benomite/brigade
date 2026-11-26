// « report to brigade », sur chaque panne que l'app montre (ticket 1977, épique 1973) : le geste rassemble le contexte de
// la panne (signalement/contexte/), le masque (signalement/redaction/), en fait l'adresse d'une nouvelle issue
// préremplie sur benomite/brigade (signalement/rapport/) et l'ouvre dans le navigateur du poste. C'est là que le chef la
// lit, la corrige et l'envoie lui-même, sous son compte GitHub : l'app n'appelle pas GitHub et n'envoie rien. Fermer la
// page n'envoie rien non plus.
// Ce module ne lance rien lui-même : il compose, et reçoit de quoi lire le journal et ouvrir l'adresse.
import { contexteDuSignalement, type Reference, type Systeme } from "../../signalement/contexte/contexte.ts";
import { construireRapport, URL_NOUVELLE_ISSUE } from "../../signalement/rapport/rapport.ts";
import { redact } from "../../signalement/redaction/redact.ts";
import { EVENEMENTS_DU_LOG } from "../../onglets.ts";

// Ce que la vue demande : la panne par ce qui la désigne, ce qu'elle en dit en quelques mots, et le projet dont le
// journal parle d'elle — aucun pour une station qui n'en sert pas un de l'app.
export type Demande = { projet?: string; reference: Reference; panne: string };
export type RenduDuSignalement = { ouvert: true } | { refus: string; detail?: string };

// Le journal que le geste lit, là où la cuisine du projet tourne : la fin, comme l'onglet Log (onglets.ts).
export const COMMANDE_DU_JOURNAL = `log --last ${EVENEMENTS_DU_LOG}`;
// Ce que la vue dit de la panne, au plus : le rapport la coupe encore (rapport.ts, `MAX_PANNE`).
const PANNE_MAX = 500;

export type Sources = {
  appVersion: string;
  // La version du runtime en cause : celle de la station qui sert le projet, ou de la station nommée ; à défaut, celle
  // du runtime à côté de l'app.
  runtimeVersion: (demande: Demande) => string | Promise<string>;
  // La sortie de `COMMANDE_DU_JOURNAL` pour ce projet ; une erreur, et le signalement part sans lignes de journal.
  journal: (projet: string | undefined) => string | Promise<string>;
  // Ouvre l'adresse dans le navigateur du poste (Electron, `shell.openExternal`).
  ouvrir: (url: string) => Promise<unknown>;
};

const texte = (valeur: unknown): string | undefined => (typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : undefined);

// La référence telle que la vue l'envoie : une seule clé, et sa valeur.
function referenceLue(brute: unknown): Reference | undefined {
  if (typeof brute !== "object" || brute === null || Array.isArray(brute)) return undefined;
  const cles = Object.keys(brute);
  if (cles.length !== 1) return undefined;
  const { station, ticket, pass, ligne } = brute as Record<string, unknown>;
  if (typeof ticket === "number") return Number.isSafeInteger(ticket) && ticket > 0 ? { ticket } : undefined;
  const mot = texte(station ?? pass ?? ligne);
  if (mot === undefined) return undefined;
  return station !== undefined ? { station: mot } : pass !== undefined ? { pass: mot } : { ligne: mot };
}

export function demandeLue(brute: unknown): Demande | { refus: string } {
  if (typeof brute !== "object" || brute === null) return { refus: "nothing was opened: the app did not say which failure" };
  const { projet, reference, panne } = brute as Record<string, unknown>;
  const lue = referenceLue(reference);
  const dite = texte(panne);
  if (lue === undefined || dite === undefined) return { refus: "nothing was opened: the app did not say which failure" };
  const nom = texte(projet);
  return { ...(nom === undefined ? {} : { projet: nom }), reference: lue, panne: dite.slice(0, PANNE_MAX) };
}

// Le système en une ligne : son nom, sa version, son architecture — puis ce que le noyau dit de lui, entre accents graves,
// que GitHub ne lise pas le « #1 » d'un noyau Linux comme un renvoi à une issue.
export function systemeDit({ name, release, arch, version }: Systeme): string {
  const tete = `${name} ${release} (${arch})`;
  return version === "unknown" || version === "" ? tete : `${tete} — \`${version.replaceAll("`", "'")}\``;
}

// La version du runtime en cause : la station nommée, sinon celle qui sert le projet ; à défaut, `locale`.
export function versionVisee(demande: Demande, stations: readonly { nom: string; version: string; projets: readonly string[] }[], locale: string): string {
  const { reference, projet } = demande;
  const visee = "station" in reference ? stations.find(({ nom }) => nom === reference.station) : projet === undefined ? undefined : stations.find(({ projets }) => projets.includes(projet));
  return visee !== undefined && visee.version !== "" ? visee.version : locale;
}

export async function ouvrirLeSignalement(brute: unknown, sources: Sources): Promise<RenduDuSignalement> {
  const demande = demandeLue(brute);
  if ("refus" in demande) return demande;
  let runtimeVersion = "unknown";
  try {
    runtimeVersion = (await sources.runtimeVersion(demande)) || "unknown";
  } catch {
    // la version ne se lit pas : le signalement part sans elle
  }
  const contexte = await contexteDuSignalement(demande.reference, {
    appVersion: sources.appVersion,
    runtimeVersion: () => runtimeVersion,
    journal: () => sources.journal(demande.projet),
  });
  // Le vrai masquage, passé au constructeur : tout texte libre le traverse avant d'entrer dans l'adresse.
  const { url } = construireRapport({ appVersion: contexte.appVersion, runtimeVersion: contexte.runtimeVersion, system: systemeDit(contexte.system), failure: demande.panne, logLines: contexte.logLines }, redact);
  if (!url.startsWith(`${URL_NOUVELLE_ISSUE}?`)) return { refus: "nothing was opened: the report did not make a GitHub address" };
  try {
    await sources.ouvrir(url);
  } catch (erreur) {
    return { refus: "the browser did not open: nothing was sent", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  return { ouvert: true };
}
