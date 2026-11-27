// « report to brigade », sur chaque panne que l'app montre (ticket 1977, épique 1973) : le geste rassemble le contexte de
// la panne (report/context/), le masque (report/redaction/), en fait l'adresse d'une nouvelle issue
// préremplie sur benomite/brigade (report/report/) et l'ouvre dans le navigateur du poste. C'est là que le chef la
// lit, la corrige et l'envoie lui-même, sous son compte GitHub : l'app n'appelle pas GitHub et n'envoie rien. Fermer la
// page n'envoie rien non plus.
// Ce module ne lance rien lui-même : il compose, et reçoit de quoi lire le journal et ouvrir l'adresse.
import { contextOfReport, type Reference, type System } from "../../report/context/context.ts";
import { buildReport, URL_NEW_ISSUE } from "../../report/report/report.ts";
import { redact } from "../../report/redaction/redact.ts";
import { EVENTS_OF_LOG } from "../../tabs.ts";

// Ce que la vue demande : la panne par ce qui la désigne, ce qu'elle en dit en quelques mots, et le projet dont le
// journal parle d'elle — aucun pour une station qui n'en sert pas un de l'app.
export type Request = { projet?: string; reference: Reference; panne: string };
export type RenderedOfReport = { ouvert: true } | { refus: string; detail?: string };

// Le journal que le geste lit, là où la cuisine du projet tourne : la fin, comme l'onglet Log (tabs.ts).
export const COMMAND_OF_LOG = `log --last ${EVENTS_OF_LOG}`;
// Ce que la vue dit de la panne, au plus : le rapport la coupe encore (report.ts, `MAX_PANNE`).
const OUTAGE_MAX = 500;

export type Sources = {
  appVersion: string;
  // La version du runtime en cause : celle de la station qui sert le projet, ou de la station nommée ; à défaut, celle
  // du runtime à côté de l'app.
  runtimeVersion: (request: Request) => string | Promise<string>;
  // La sortie de `COMMANDE_DU_JOURNAL` pour ce projet ; une erreur, et le signalement part sans lignes de journal.
  journal: (project: string | undefined) => string | Promise<string>;
  // Ouvre l'adresse dans le navigateur du poste (Electron, `shell.openExternal`).
  ouvrir: (url: string) => Promise<unknown>;
};

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

// La référence telle que la vue l'envoie : une seule clé, et sa valeur.
function referenceRead(raw: unknown): Reference | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const keys = Object.keys(raw);
  if (keys.length !== 1) return undefined;
  const { station, ticket, pass, ligne: line } = raw as Record<string, unknown>;
  if (typeof ticket === "number") return Number.isSafeInteger(ticket) && ticket > 0 ? { ticket } : undefined;
  const word = text(station ?? pass ?? line);
  if (word === undefined) return undefined;
  return station !== undefined ? { station: word } : pass !== undefined ? { pass: word } : { ligne: word };
}

export function requestRead(raw: unknown): Request | { refus: string } {
  if (typeof raw !== "object" || raw === null) return { refus: "nothing was opened: the app did not say which failure" };
  const { projet: project, reference, panne: outage } = raw as Record<string, unknown>;
  const readEntry = referenceRead(reference);
  const saidOne = text(outage);
  if (readEntry === undefined || saidOne === undefined) return { refus: "nothing was opened: the app did not say which failure" };
  const name = text(project);
  return { ...(name === undefined ? {} : { projet: name }), reference: readEntry, panne: saidOne.slice(0, OUTAGE_MAX) };
}

// Le système en une ligne : son nom, sa version, son architecture — puis ce que le noyau dit de lui, entre accents graves,
// que GitHub ne lise pas le « #1 » d'un noyau Linux comme un renvoi à une issue.
export function systemSays({ name, release, arch, version }: System): string {
  const head = `${name} ${release} (${arch})`;
  return version === "unknown" || version === "" ? head : `${head} — \`${version.replaceAll("`", "'")}\``;
}

// La version du runtime en cause : la station nommée, sinon celle qui sert le projet ; à défaut, `locale`.
export function versionAimed(request: Request, stations: readonly { nom: string; version: string; projets: readonly string[] }[], locale: string): string {
  const { reference, projet: project } = request;
  const aimed = "station" in reference ? stations.find(({ nom: name }) => name === reference.station) : project === undefined ? undefined : stations.find(({ projets: projects }) => projects.includes(project));
  return aimed !== undefined && aimed.version !== "" ? aimed.version : locale;
}

export async function openTheReport(raw: unknown, sources: Sources): Promise<RenderedOfReport> {
  const request = requestRead(raw);
  if ("refus" in request) return request;
  let runtimeVersion = "unknown";
  try {
    runtimeVersion = (await sources.runtimeVersion(request)) || "unknown";
  } catch {
    // la version ne se lit pas : le signalement part sans elle
  }
  const context = await contextOfReport(request.reference, {
    appVersion: sources.appVersion,
    runtimeVersion: () => runtimeVersion,
    journal: () => sources.journal(request.projet),
  });
  // Le vrai masquage, passé au constructeur : tout texte libre le traverse avant d'entrer dans l'adresse.
  const { url } = buildReport({ appVersion: context.appVersion, runtimeVersion: context.runtimeVersion, system: systemSays(context.system), failure: request.panne, logLines: context.logLines }, redact);
  if (!url.startsWith(`${URL_NEW_ISSUE}?`)) return { refus: "nothing was opened: the report did not make a GitHub address" };
  try {
    await sources.ouvrir(url);
  } catch (error) {
    return { refus: "the browser did not open: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  return { ouvert: true };
}
