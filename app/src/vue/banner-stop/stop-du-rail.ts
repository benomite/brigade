// La cuisine arrêtée dans l'app (ticket 3924, épique 3922) : des tickets en file, aucune carte prise ni en pass. Le jugement
// est celui du runtime (runtime/src/arret-cuisine/arret-cuisine.ts) ; la lecture du rail sur GitHub (vue/rail/github.ts,
// `avecLeRail`) lui donne ce qu'elle sait, et pose l'arrêt dans `facts` sous `arretCuisine` ; le rail le dit en tête
// (banner-stop.js). Ce qu'elle sait des causes :
//   - main rouge : la réparation `repair-main` sur le rail, que la lecture dit déjà aux alertes (`baseRougeDuRail`) ;
//   - un ticket gelé qui tient une zone de fichiers : un ticket mis de côté, ou parqué par ses échecs (ticket 4260), dont la PR est
//     ouverte — une PR ouverte tient sa zone (runtime/src/brigade-github.ts, la porte de prise) —, et la zone que sa fiche
//     déclare ;
//   - une zone tenue par une PR (ticket 4244) : les tickets en file sautés pour `zone-held`, avec le numéro de la PR du ticket gelé ;
//   - sinon, la cause est inconnue, et l'arrêt se dit quand même.
import { arretDeLaCuisine, statutDeLaCuisine, statutDeLArret, type ArretDeLaCuisine, type EntreeDeLArret } from "../../../../runtime/src/arret-cuisine/arret-cuisine.ts";
import type { BaseRedLue } from "../../wait-du-rail/alerts.ts";
import type { TicketDuRail } from "../../../../runtime/src/attente-du-rail/raison.ts";
import { fiche } from "../../../../runtime/src/fiche.ts";
import { recouvrement } from "../../../../runtime/src/zones.ts";

// La zone qu'un ticket gelé tient, et depuis quand.
export type ZoneTenue = { zone: string[]; depuis: string; pr?: number };
// Ce que l'arrêt lit d'un ticket du rail et d'un servi (vue/rail/github.ts, `TicketSurGithub`, `ServiSurGithub`) : dit ici,
// car facts.ts — que le runtime type par pont.d.ts — charge ce module, et pas la lecture du rail.
type TicketLu = { ticket: number; creeLe: string; entreLe?: string | null; zone?: string[]; miseDeCote?: { zoneTenue?: ZoneTenue }; parqueParEchecs?: { zoneTenue?: ZoneTenue } };
type ServedLu = { livre: string };

const instant = (valeur: unknown): valeur is string => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));

// D'un ticket mis de côté ou parqué par ses échecs, des commentaires de son issue déjà lus : la zone que sa fiche déclare,
// tenue par sa PR ouverte, depuis sa mise de côté ou son parking — à défaut, l'ouverture de sa PR. Sans PR ouverte, sans fiche, une fiche illisible — elle ne
// possède rien — ou sans zone : il n'en tient aucune.
export function zoneTenueDe(commentaires: readonly Record<string, unknown>[], pr: { le: string; numero?: number } | null, misDeSideLe: string | null): ZoneTenue | undefined {
  if (pr === null) return undefined;
  const laCard = fiche(commentaires.flatMap(({ body }) => (typeof body === "string" ? [body] : [])));
  if (laCard === null || laCard.problems.length > 0 || laCard.zone.length === 0) return undefined;
  const depuis = misDeSideLe ?? pr.le;
  return instant(depuis) ? { zone: laCard.zone, depuis, ...(pr.numero === undefined ? {} : { pr: pr.numero }) } : undefined;
}

// Le plus récent des instants lisibles, ou "" sans aucun.
const plusRecent = (instants: readonly string[]): string => instants.filter(instant).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? "";

// Le champ `arretCuisine` de `facts`, absent quand la cuisine n'est pas arrêtée. `file` : les tickets dans les états de la
// file (`ticketsDeLAttente`) ; `tickets` : tout le rail lu ; `servis` : les servis des dernières 24 h. Sans cause connue,
// l'arrêt court depuis l'entrée en file du plus ancien ticket qui attend, ou depuis le dernier service s'il est plus récent.
export function stopDuRail(file: readonly TicketDuRail[], tickets: readonly TicketLu[], servedOnes: readonly ServedLu[], baseRed: BaseRedLue | null): { arretCuisine?: ArretDeLaCuisine } {
  const enFile = file.filter(({ etat: state }) => state === "queued");
  const entrees = tickets.filter(({ ticket }) => enFile.some((queued) => queued.ticket === ticket)).map(({ entreLe, creeLe }) => entreLe ?? creeLe).filter(instant);
  const plusAncienne = entrees.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const geles = tickets.flatMap(({ ticket, miseDeCote: miseDeSide, parqueParEchecs: parqueParFailures }) => {
    const zoneTenue = miseDeSide?.zoneTenue ?? parqueParFailures?.zoneTenue;
    return zoneTenue === undefined ? [] : [{ ticket, zoneTenue }];
  });
  const gele = geles[0];
  // Les sauts que la porte de prise ferait (ticket 4244), lus de ce que le rail sait : un ticket en file dont la zone de fiche chevauche celle
  // d'un ticket gelé dont la PR ouverte la tient est sauté pour `zone-held`, une fois par PR qui le tient ; un ticket que rien ne
  // tient, ou dont la zone n'est pas lue, est sauté sans ce code — la cause reste alors celle d'avant.
  const tenues = geles.flatMap(({ zoneTenue }) => (zoneTenue.pr === undefined ? [] : [{ pr: zoneTenue.pr, zone: zoneTenue.zone }]));
  const sauts = enFile.flatMap(({ ticket }) => {
    const zone = tickets.find((lu) => lu.ticket === ticket)?.zone ?? [];
    const tenant = tenues.filter((tenue) => recouvrement([...zone], [...tenue.zone]) !== null);
    return tenant.length === 0 ? [{ ticket, reason: "not-held" }] : tenant.map(({ pr, zone: tenue }) => ({ ticket, reason: "zone-held", pr, zone: tenue.join(", ") }));
  });
  const entree: EntreeDeLArret = {
    queued: enFile.length,
    taken: file.filter(({ etat: state }) => state === "taken").length,
    inPass: file.filter(({ etat: state }) => state === "pass").length,
    since: plusRecent([...(plusAncienne === undefined ? [] : [plusAncienne]), ...servedOnes.map(({ livre }) => livre)]),
    ...(gele === undefined ? {} : { frozen: { ticket: gele.ticket, zone: gele.zoneTenue.zone.join(", "), since: gele.zoneTenue.depuis } }),
    skipped: sauts,
    ...(baseRed === null ? {} : { mainRed: { since: baseRed.depuis } }),
  };
  const stop = arretDeLaCuisine(entree);
  const status = statutDeLaCuisine(entree);
  // Le bandeau ne dit que ce texte : celui du runtime, une seule fois dit, jamais refait par la vue.
  return stop === null || status === null ? {} : { arretCuisine: { ...stop, statut: status } };
}

// `arretCuisine`, de la racine de `facts` (facts.ts, `comprendre`) : rien de mal formé ne le pose. Une cause d'une sorte
// que l'app ne connaît pas (un runtime plus récent) se dit inconnue : l'arrêt, lui, se dit toujours.
export function stopKitchenLu(valeur: unknown): { arretCuisine?: ArretDeLaCuisine } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const { cause, since } = valeur as Record<string, unknown>;
  if (typeof since !== "string" || typeof cause !== "object" || cause === null || Array.isArray(cause)) return {};
  const { kind, ticket, zone, pr } = cause as Record<string, unknown>;
  const lu = (laCause: ArretDeLaCuisine["cause"], guard: boolean): { arretCuisine: ArretDeLaCuisine } => {
    const stop = { cause: laCause, since };
    const { statut: status } = valeur as Record<string, unknown>;
    return { arretCuisine: { ...stop, statut: guard && typeof status === "string" ? status : statutDeLArret(stop) } };
  };
  if (kind === "frozen-zone" && typeof ticket === "number" && typeof zone === "string") return lu({ kind, ticket, zone }, true);
  if (kind === "zone-held" && typeof pr === "number" && typeof zone === "string") return lu({ kind, pr, zone }, true);
  if (kind === "main-red") return lu({ kind }, true);
  return lu({ kind: "unknown" }, false);
}
