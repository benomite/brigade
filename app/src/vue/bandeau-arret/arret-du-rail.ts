// La cuisine arrêtée dans l'app (ticket 3924, épique 3922) : des tickets en file, aucune carte prise ni en pass. Le jugement
// est celui du runtime (runtime/src/arret-cuisine/arret-cuisine.ts) ; la lecture du rail sur GitHub (vue/rail/github.ts,
// `avecLeRail`) lui donne ce qu'elle sait, et pose l'arrêt dans `facts` sous `arretCuisine` ; le rail le dit en tête
// (bandeau-arret.js). Ce qu'elle sait des causes :
//   - main rouge : la réparation `repair-main` sur le rail, que la lecture dit déjà aux alertes (`baseRougeDuRail`) ;
//   - un ticket gelé qui tient une zone de fichiers : un ticket mis de côté dont la PR est ouverte — une PR ouverte tient sa
//     zone (runtime/src/brigade-github.ts, la porte de prise) —, et la zone que sa fiche déclare ;
//   - une zone tenue par une PR (#4244) : les tickets en file sautés pour `zone-held`, avec le numéro de la PR du ticket gelé ;
//   - sinon, la cause est inconnue, et l'arrêt se dit quand même.
import { arretDeLaCuisine, statutDeLaCuisine, statutDeLArret, type ArretDeLaCuisine, type EntreeDeLArret } from "../../../../runtime/src/arret-cuisine/arret-cuisine.ts";
import type { BaseRougeLue } from "../../attente-du-rail/alertes.ts";
import type { TicketDuRail } from "../../../../runtime/src/attente-du-rail/raison.ts";
import { fiche } from "../../../../runtime/src/fiche.ts";
import { recouvrement } from "../../../../runtime/src/zones.ts";

// La zone qu'un ticket gelé tient, et depuis quand.
export type ZoneTenue = { zone: string[]; depuis: string; pr?: number };
// Ce que l'arrêt lit d'un ticket du rail et d'un servi (vue/rail/github.ts, `TicketSurGithub`, `ServiSurGithub`) : dit ici,
// car faits.ts — que le runtime type par pont.d.ts — charge ce module, et pas la lecture du rail.
type TicketLu = { ticket: number; creeLe: string; entreLe?: string | null; zone?: string[]; miseDeCote?: { zoneTenue?: ZoneTenue } };
type ServiLu = { livre: string };

const instant = (valeur: unknown): valeur is string => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));

// D'un ticket mis de côté, des commentaires de son issue déjà lus : la zone que sa fiche déclare, tenue par sa PR ouverte,
// depuis sa mise de côté — à défaut, l'ouverture de sa PR. Sans PR ouverte, sans fiche, une fiche illisible — elle ne
// possède rien — ou sans zone : il n'en tient aucune.
export function zoneTenueDe(commentaires: readonly Record<string, unknown>[], pr: { le: string; numero?: number } | null, misDeCoteLe: string | null): ZoneTenue | undefined {
  if (pr === null) return undefined;
  const laFiche = fiche(commentaires.flatMap(({ body }) => (typeof body === "string" ? [body] : [])));
  if (laFiche === null || laFiche.problems.length > 0 || laFiche.zone.length === 0) return undefined;
  const depuis = misDeCoteLe ?? pr.le;
  return instant(depuis) ? { zone: laFiche.zone, depuis, ...(pr.numero === undefined ? {} : { pr: pr.numero }) } : undefined;
}

// Le plus récent des instants lisibles, ou "" sans aucun.
const plusRecent = (instants: readonly string[]): string => instants.filter(instant).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? "";

// Le champ `arretCuisine` de `facts`, absent quand la cuisine n'est pas arrêtée. `file` : les tickets dans les états de la
// file (`ticketsDeLAttente`) ; `tickets` : tout le rail lu ; `servis` : les servis des dernières 24 h. Sans cause connue,
// l'arrêt court depuis l'entrée en file du plus ancien ticket qui attend, ou depuis le dernier service s'il est plus récent.
export function arretDuRail(file: readonly TicketDuRail[], tickets: readonly TicketLu[], servis: readonly ServiLu[], baseRouge: BaseRougeLue | null): { arretCuisine?: ArretDeLaCuisine } {
  const enFile = file.filter(({ etat }) => etat === "queued");
  const entrees = tickets.filter(({ ticket }) => enFile.some((enAttente) => enAttente.ticket === ticket)).map(({ entreLe, creeLe }) => entreLe ?? creeLe).filter(instant);
  const plusAncienne = entrees.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const gele = tickets.find(({ miseDeCote }) => miseDeCote?.zoneTenue);
  // Les sauts que la porte de prise ferait (#4244), lus de ce que le rail sait : un ticket en file dont la zone de fiche chevauche celle
  // d'un ticket gelé dont la PR ouverte la tient est sauté pour `zone-held`, une fois par PR qui le tient ; un ticket que rien ne
  // tient, ou dont la zone n'est pas lue, est sauté sans ce code — la cause reste alors celle d'avant.
  const tenues = tickets.flatMap(({ miseDeCote }) => (miseDeCote?.zoneTenue?.pr === undefined ? [] : [{ pr: miseDeCote.zoneTenue.pr, zone: miseDeCote.zoneTenue.zone }]));
  const sauts = enFile.flatMap(({ ticket }) => {
    const zone = tickets.find((lu) => lu.ticket === ticket)?.zone ?? [];
    const tenant = tenues.filter((tenue) => recouvrement([...zone], [...tenue.zone]) !== null);
    return tenant.length === 0 ? [{ ticket, reason: "not-held" }] : tenant.map(({ pr, zone: tenue }) => ({ ticket, reason: "zone-held", pr, zone: tenue.join(", ") }));
  });
  const entree: EntreeDeLArret = {
    queued: enFile.length,
    taken: file.filter(({ etat }) => etat === "taken").length,
    inPass: file.filter(({ etat }) => etat === "pass").length,
    since: plusRecent([...(plusAncienne === undefined ? [] : [plusAncienne]), ...servis.map(({ livre }) => livre)]),
    ...(gele?.miseDeCote?.zoneTenue === undefined ? {} : { frozen: { ticket: gele.ticket, zone: gele.miseDeCote.zoneTenue.zone.join(", "), since: gele.miseDeCote.zoneTenue.depuis } }),
    skipped: sauts,
    ...(baseRouge === null ? {} : { mainRed: { since: baseRouge.depuis } }),
  };
  const arret = arretDeLaCuisine(entree);
  const statut = statutDeLaCuisine(entree);
  // Le bandeau ne dit que ce texte : celui du runtime, une seule fois dit, jamais refait par la vue.
  return arret === null || statut === null ? {} : { arretCuisine: { ...arret, statut } };
}

// `arretCuisine`, de la racine de `facts` (faits.ts, `comprendre`) : rien de mal formé ne le pose. Une cause d'une sorte
// que l'app ne connaît pas (un runtime plus récent) se dit inconnue : l'arrêt, lui, se dit toujours.
export function arretCuisineLu(valeur: unknown): { arretCuisine?: ArretDeLaCuisine } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const { cause, since } = valeur as Record<string, unknown>;
  if (typeof since !== "string" || typeof cause !== "object" || cause === null || Array.isArray(cause)) return {};
  const { kind, ticket, zone, pr } = cause as Record<string, unknown>;
  const lu = (laCause: ArretDeLaCuisine["cause"], garde: boolean): { arretCuisine: ArretDeLaCuisine } => {
    const arret = { cause: laCause, since };
    const { statut } = valeur as Record<string, unknown>;
    return { arretCuisine: { ...arret, statut: garde && typeof statut === "string" ? statut : statutDeLArret(arret) } };
  };
  if (kind === "frozen-zone" && typeof ticket === "number" && typeof zone === "string") return lu({ kind, ticket, zone }, true);
  if (kind === "zone-held" && typeof pr === "number" && typeof zone === "string") return lu({ kind, pr, zone }, true);
  if (kind === "main-red") return lu({ kind }, true);
  return lu({ kind: "unknown" }, false);
}
