// La cuisine retenue (#2281) : rien n'a été servi depuis 30 min alors que des
// tickets attendent — prenables, ou en pass. La nuit du 3 au 4 novembre 2026,
// la cuisine s'est arrêtée quatre fois ainsi sans un mot dans la TODO du chef :
// la base rouge sur ses checks Windows, le budget des écritures qui les
// retenait, la limite de GitHub, trois fois.
//
// Ce module est le détecteur seul, sans E/S : il reçoit ce que la boucle a
// observé (`Observation`) et ce qui peut retenir la cuisine (`Signaux`), et
// rend la retenue, sa cause et le geste qui la lève — ou rien. Ce qu'il en est
// fait — les transitions au journal, la ligne de la file du chef — est dans
// `brancher.ts` et `lire.ts`.
//
// Le compte des 30 min part du plus récent de trois repères : le dernier
// service, l'ouverture de la cuisine, le moment où les tickets qui attendent
// ont commencé d'attendre. Un ticket arrivé sur un rail vide n'a pas attendu
// les heures où rien n'était à servir.
//
// Les causes, dans l'ordre où elles se lisent quand plusieurs tiennent : le
// disjoncteur (plus aucun cook ne part, et seul le chef le referme), la limite
// de GitHub et le budget des écritures (ils retiennent tout appel, ou toute
// écriture, tant qu'ils tiennent), puis la base rouge — qui ne retient une
// livraison que rouge sur un check que celle-ci passe aussi (#2279), et
// n'explique donc la retenue qu'à défaut des autres. Puis les livraisons en
// pass qui attendent un check sur leur tête (#2456) : une CI qui tourne
// encore, ou qui n'y a jamais démarré. Aucune : la cause est inconnue, et la
// ligne le dit.
import { ECRITURES_PAR_HEURE } from "../limite-github.ts";
import type { CauseDeRetenue } from "./evenements.ts";

export type { CauseDeRetenue };

export const RETENUE_APRES_MS = 30 * 60_000;

// Ce que la boucle a observé de la cuisine. `eteinte` : le chef l'a arrêtée ou
// éteinte — elle n'a pas à servir, elle n'est pas retenue. `enAttente` : les
// tickets qui attendent la cuisine, prenables ou en pass — pas ceux qui
// attendent le chef, un tiers ou un autre ticket. `attenteDepuis` : depuis
// quand ils attendent, le plus ancien d'entre eux. `dernierService` : le
// dernier ticket servi. `ouverture` : l'ouverture de la cuisine. Instants ISO,
// nuls quand ils ne se savent pas.
export type Observation = {
  eteinte: boolean;
  enAttente: number[];
  attenteDepuis: string | null;
  dernierService: string | null;
  ouverture: string | null;
  // Pourquoi des tickets qui n'avancent pas n'avancent pas, une phrase chacun :
  // une attente sur un ticket mis de côté, un saut de la porte de prise (#2429).
  explications?: string[];
};

// Ce qui peut retenir la cuisine, lu à l'instant : chacun nul quand il ne
// retient rien. `disjoncteur` : son ouverture. `limiteGitHub` : la limite que
// GitHub a posée, ou la réserve des gestes que la box garde, et sa reprise.
// `ecritures` : le budget des écritures qui les retient, et la prochaine.
// `baseRouge` : ce qui échoue sur la base. `attenteCI` : les livraisons en
// pass dont la tête n'a pas de CI conclue, et les checks qui y tournent —
// lues par le tour GitHub seul ; absente ailleurs.
export type Signaux = {
  disjoncteur: string | null;
  limiteGitHub: { limit: string | null; backAt: string; refusedAt?: string } | null;
  ecritures: { writes: number; nextAt: string } | null;
  baseRouge: { sha: string | null; checks: string[] } | null;
  attenteCI?: { tickets: number[]; running: string[] } | null;
  // Ce que l'observation en dit à défaut de toute autre cause (#2429).
  explications?: string[];
};

export const SANS_SIGNAL: Signaux = { disjoncteur: null, limiteGitHub: null, ecritures: null, baseRouge: null };

// Le diagnostic : la cause, et le geste qui la lève — nul quand elle se lève
// seule, ou qu'on ne la connaît pas.
export type Diagnostic = { cause: CauseDeRetenue; gesture: string | null };

// Une retenue : depuis quand rien n'est servi, les tickets qui attendent, et
// son diagnostic.
export type Retenue = Diagnostic & { since: string; tickets: number[] };

// Les gestes, dits comme le bloc `awaiting` les dit : par le bouton de l'app,
// ou « no app button for it yet ».
export const GESTE_DU_DISJONCTEUR = "look at what fails, then press the `Resume` button on the breaker line of TODO";
// Aucun check n'a démarré sur la tête : la CI du projet ne se lance pas sur ses
// PR, ou ses gates n'ont aucune station pour les jouer (#2456).
export const GESTE_DE_LA_CI = "check that the project's CI runs on its PRs; with no CI on its PRs, a station runs its gates (`.claude/brigade/gates.sh`) on the PR head — the station's service log says why it did not: no app button for it yet";
export const GESTE_DE_LA_BASE = "fix the base by hand, the kitchen starts again on its own once it is green; a red that is not down to the code is replayed on the station: no app button for it yet";

export function diagnostiquer({ disjoncteur, limiteGitHub, ecritures, baseRouge, attenteCI = null, explications }: Signaux): Diagnostic {
  if (disjoncteur !== null) return { cause: { kind: "breaker", since: disjoncteur }, gesture: GESTE_DU_DISJONCTEUR };
  if (limiteGitHub !== null) return { cause: { kind: "github-limit", limit: limiteGitHub.limit, backAt: limiteGitHub.backAt, ...(limiteGitHub.refusedAt === undefined ? {} : { refusedAt: limiteGitHub.refusedAt }) }, gesture: null };
  if (ecritures !== null) return { cause: { kind: "write-pacer", writes: ecritures.writes, nextAt: ecritures.nextAt }, gesture: null };
  if (baseRouge !== null) return { cause: { kind: "base-red", sha: baseRouge.sha, checks: baseRouge.checks }, gesture: GESTE_DE_LA_BASE };
  if (attenteCI !== null && attenteCI.tickets.length > 0) return { cause: { kind: "ci-wait", tickets: [...attenteCI.tickets], running: [...attenteCI.running] }, gesture: attenteCI.running.length === 0 ? GESTE_DE_LA_CI : null };
  if (explications !== undefined && explications.length > 0) return { cause: { kind: "tickets", lines: [...explications] }, gesture: null };
  return { cause: { kind: "unknown" }, gesture: null };
}

const plusRecent = (instants: Array<string | null>): string | null =>
  instants.filter((instant): instant is string => instant !== null && !Number.isNaN(Date.parse(instant))).reduce<string | null>((dernier, instant) => (dernier === null || Date.parse(instant) > Date.parse(dernier) ? instant : dernier), null);

// La retenue à `maintenant`, ou null : la cuisine éteinte, aucun ticket qui
// attend, ou moins de 30 min depuis le plus récent des repères.
export function detecterRetenue(observation: Observation, signaux: Signaux, maintenant: Date): Retenue | null {
  if (observation.eteinte || observation.enAttente.length === 0) return null;
  const since = plusRecent([observation.dernierService, observation.ouverture, observation.attenteDepuis]);
  if (since === null || maintenant.getTime() - Date.parse(since) < RETENUE_APRES_MS) return null;
  return { since, tickets: [...observation.enAttente], ...diagnostiquer(signaux) };
}

// Ce qui fait la même cause : une reprise qui recule, des écritures qui se
// comptent autrement ne la changent pas ; une autre sorte, d'autres checks
// rouges, un autre commit, une autre limite, si.
export function cleDeCause(cause: CauseDeRetenue): string {
  switch (cause.kind) {
    case "base-red":
      return JSON.stringify([cause.kind, cause.sha, [...cause.checks].sort()]);
    case "github-limit":
      return JSON.stringify([cause.kind, cause.limit]);
    case "breaker":
      return JSON.stringify([cause.kind, cause.since]);
    // Qu'un check démarre change le geste ; d'autres tickets, non.
    case "ci-wait":
      return JSON.stringify([cause.kind, cause.running.length === 0]);
    case "tickets":
      return JSON.stringify([cause.kind, cause.lines]);
    default:
      return JSON.stringify([cause.kind]);
  }
}

// L'heure d'un instant, en HH:MM, celle de ce process — comme les autres
// lignes de `status`.
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const NOMS_DE_LIMITE: Record<string, string> = {
  primary: "primary limit, hourly quota",
  "secondary-writes": "secondary limit, writes per minute",
  "secondary-concurrency": "secondary limit, concurrent requests",
  reserve: "the box keeps the reserve for your gestures",
};

const TICKETS_NOMMES = 5;
const nommerTickets = (tickets: number[]) => {
  const nommes = tickets.slice(0, TICKETS_NOMMES).map((ticket) => `#${ticket}`).join(", ");
  return tickets.length > TICKETS_NOMMES ? `${nommes} +${tickets.length - TICKETS_NOMMES}` : nommes;
};

// La cause, en clair.
export function direCause(cause: CauseDeRetenue): string {
  switch (cause.kind) {
    case "base-red":
      return `cause: the base is red${cause.sha === null ? "" : ` on ${cause.sha.slice(0, 7)}`}, failing: ${cause.checks.length === 0 ? "no check named" : cause.checks.join(", ")}`;
    case "github-limit":
      return `cause: GitHub is rate-limiting calls (${cause.limit === null ? "limit reached" : (NOMS_DE_LIMITE[cause.limit] ?? cause.limit)}), ${cause.refusedAt === undefined ? `back around ${hhmm(cause.backAt)}` : `calls still refused at ${hhmm(cause.refusedAt)}, whatever the ${hhmm(cause.backAt)} announced`}`;
    case "write-pacer":
      return `cause: the GitHub write budget holds the kitchen's writes, ${cause.writes} of ${ECRITURES_PAR_HEURE} in the last hour, next write at ${hhmm(cause.nextAt)}`;
    case "breaker":
      return `cause: the breaker is open since ${hhmm(cause.since)}, no cook leaves`;
    case "ci-wait": {
      const n = cause.tickets.length;
      return `cause: ${n} deliver${n > 1 ? "ies" : "y"} in pass wait${n > 1 ? "" : "s"} for a CI on ${n > 1 ? "their" : "its"} PR head (${nommerTickets(cause.tickets)}), ${cause.running.length === 0 ? "and no check has started there" : `still running: ${cause.running.join(", ")}`}`;
    }
    case "tickets":
      return `cause: ${cause.lines.join("; ")}`;
    case "unknown":
      return "cause unknown: neither a red base, the GitHub limit, the write budget, the breaker nor a delivery waiting for its CI explains it";
  }
}

// Ce qui suit la cause : le geste, ou qu'elle se lève seule, ou qu'aucun geste
// n'est connu.
function direSuite({ cause, gesture }: Diagnostic): string {
  if (gesture !== null) return `to lift: ${gesture}`;
  if (cause.kind === "github-limit") return cause.refusedAt === undefined ? `nothing to do: it lifts on its own around ${hhmm(cause.backAt)}` : "nothing to do: it lifts on its own once GitHub takes calls again";
  if (cause.kind === "write-pacer") return `nothing to do: it lifts on its own around ${hhmm(cause.nextAt)}`;
  if (cause.kind === "ci-wait") return "nothing to do: it lifts on its own once the running checks conclude";
  return "no gesture known: the station's service log says what it tried";
}

// La ligne de la file du chef, en anglais : ce qui se passe, la cause, le geste.
// La durée est dite par la tête de la ligne (`kitchen  for 42 min`).
export function direRetenueEn(retenue: Retenue): string {
  const n = retenue.tickets.length;
  return `HELD: nothing served while ${n} ticket${n > 1 ? "s" : ""} wait${n > 1 ? "" : "s"} (${nommerTickets(retenue.tickets)}) — ${direCause(retenue.cause)} — ${direSuite(retenue)}`;
}

// La même ligne, en français, pour les sorties que rien n'a encore traduites.
export function direRetenue(retenue: Retenue): string {
  const n = retenue.tickets.length;
  const causes: Record<CauseDeRetenue["kind"], string> = {
    "base-red": "base rouge",
    "github-limit": "limite de GitHub",
    "write-pacer": "budget des écritures GitHub",
    breaker: "disjoncteur ouvert",
    "ci-wait": "livraisons en attente de leur CI",
    tickets: "tickets retenus (voir leurs raisons)",
    unknown: "cause inconnue",
  };
  const detail =
    retenue.cause.kind === "base-red"
      ? ` (${retenue.cause.checks.join(", ") || "aucun check nommé"})`
      : retenue.cause.kind === "ci-wait"
        ? ` (${nommerTickets(retenue.cause.tickets)} : ${retenue.cause.running.length === 0 ? "aucun check démarré sur leur tête" : `en cours : ${retenue.cause.running.join(", ")}`})`
        : "";
  return `CUISINE RETENUE : rien de servi alors que ${n} ticket${n > 1 ? "s" : ""} attend${n > 1 ? "ent" : ""} (${nommerTickets(retenue.tickets)}) — ${causes[retenue.cause.kind]}${detail} — ${retenue.gesture === null ? "aucun geste : elle se lève seule, ou sa cause n'est pas connue" : `pour la lever : ${retenue.gesture}`}`;
}
