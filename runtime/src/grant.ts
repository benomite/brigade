// Le grant `merge` tel que le chef le commande et le lit : l'échéance qu'il
// tape, ce qu'un geste écrit au journal, ce qu'il reste d'un grant en cours.
// Tout y prend l'heure en argument : rien n'attend, rien ne lit l'horloge.
import type { ActionDeGrant, CauseDExtinction, FaitPass } from "./events/pass.ts";
import type { Journal } from "./journal.ts";
import { etatDuGrant, type Grant } from "./projections/pass.ts";
import { sessionEnCours } from "./projections/sessions.ts";

export const ACTIONS: ActionDeGrant[] = ["merge"];
export type Commande = "enable" | "extend" | "revoke";
export const COMMANDES: Commande[] = ["enable", "extend", "revoke"];

// Ce qu'aucun grant n'autorise, pas même demandé par le chef. La liste est
// ici, dans le code : elle ne se change que par une livraison.
export const JAMAIS_ACCORDEES = [
  { action: "identifiants-max", ligne: "read the Max account credentials" },
  { action: "acces-prod", ligne: "any action on a project's production" },
] as const;
export type JamaisAccordee = (typeof JAMAIS_ACCORDEES)[number];
const FICHIER_DE_LA_LISTE = "runtime/src/grant.ts";

// La ligne qui interdit l'action tapée, accents ou non (`accès-prod`).
export function jamaisAccordee(action: string | undefined): JamaisAccordee | undefined {
  const tapee = action?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return JAMAIS_ACCORDEES.find((interdite) => interdite.action === tapee);
}

const AUTEUR = "chef";
// Qui écrit l'extinction qu'une commande du chef constate avant d'écrire la
// sienne : ce n'est pas son geste.
const AUTEUR_DU_CONSTAT = "runtime";
const HEURE_MS = 3_600_000;
const GESTES_MONTRES = 10;

// Un geste que le grant ne permet pas : la commande le dit et n'écrit rien.
export class GrantRefuse extends Error {}

// Ce que le chef a tapé après l'action. `until` : l'instant, en ISO 8601 UTC.
export type Echeance = { until?: string; uses?: number; sansEcheance: boolean };

const DUREES: Array<[RegExp, (trouve: RegExpExecArray) => number]> = [
  // `2d`, et `2j` — l'ancien mot, que le chef a encore dans les doigts.
  [/^([0-9]+)[dj]$/, ([, jours]) => Number(jours) * 24 * HEURE_MS],
  [/^([0-9]+)h([0-5][0-9])?$/, ([, heures, minutes]) => Number(heures) * HEURE_MS + Number(minutes ?? 0) * 60_000],
  [/^([0-9]+)min$/, ([, minutes]) => Number(minutes) * 60_000],
];

// Une date du calendrier local, ou rien si elle n'existe pas (le 31 février).
export function dateLocale(annee: number, mois: number, jour: number, heure: number, minute: number, seconde = 0): Date | null {
  const date = new Date(annee, mois - 1, jour, heure, minute, seconde);
  return date.getFullYear() === annee && date.getMonth() === mois - 1 && date.getDate() === jour && date.getHours() === heure && date.getMinutes() === minute ? date : null;
}

// `--until` : une date et une heure, une date seule (la fin de cette
// journée), ou une heure seule (aujourd'hui) — à l'heure de la machine.
function lireInstant(valeur: string, maintenant: Date): Date {
  const complet = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2}))?$/.exec(valeur);
  const heure = /^([0-9]{1,2})(?:h([0-9]{2})?|:([0-9]{2}))$/.exec(valeur);
  let instant: Date | null = null;
  if (complet) {
    const [, annee, mois, jour, h, min] = complet;
    instant = h === undefined ? dateLocale(Number(annee), Number(mois), Number(jour), 23, 59, 59) : dateLocale(Number(annee), Number(mois), Number(jour), Number(h), Number(min));
  } else if (heure) {
    instant = dateLocale(maintenant.getFullYear(), maintenant.getMonth() + 1, maintenant.getDate(), Number(heure[1]), Number(heure[2] ?? heure[3] ?? 0));
  }
  if (instant === null) {
    throw new GrantRefuse(`--until: “${valeur}” cannot be read — expected a date (2026-10-12), a date and a time (2026-10-12T18:00) or a time today (18h, 18h30)`);
  }
  if (instant.getTime() <= maintenant.getTime()) {
    throw new GrantRefuse(
      heure
        ? `--until: ${valeur} has already passed today — for tomorrow, give the date (2026-10-12T18:00) or a duration (--for 20h)`
        : `--until: ${valeur} has already passed`,
    );
  }
  return instant;
}

// Une durée tapée (30min, 4h, 1h30, 2d, or 2j), en millisecondes — ou rien si elle
// ne se lit pas, ou ne dure rien.
export function dureeTapee(valeur: string): number | null {
  for (const [forme, enMs] of DUREES) {
    const trouve = forme.exec(valeur);
    if (trouve && enMs(trouve) > 0) return enMs(trouve);
  }
  return null;
}

function lireDuree(valeur: string): number {
  const lue = dureeTapee(valeur);
  if (lue !== null) return lue;
  throw new GrantRefuse(`--for: “${valeur}” cannot be read — expected a duration: 30min, 4h, 1h30, 2d`);
}

// Lit l'échéance tapée : `--until <instant>` ou `--for <durée>`, `--uses
// <n>`, `--no-expiry`. Une durée se compte à partir de `maintenant`.
export function lireEcheance(args: string[], maintenant: Date): Echeance {
  const echeance: Echeance = { sansEcheance: false };
  const vues = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const option = String(args[i]);
    if (vues.has(option)) throw new GrantRefuse(`${option} is given twice`);
    vues.add(option);
    if (option === "--no-expiry") {
      echeance.sansEcheance = true;
      continue;
    }
    const valeur = args[++i];
    if (!["--until", "--for", "--uses"].includes(option)) throw new GrantRefuse(`unknown option: ${option}`);
    if (valeur === undefined) throw new GrantRefuse(`${option} needs a value`);
    if (option === "--uses") {
      if (!/^[1-9][0-9]*$/.test(valeur) || !Number.isSafeInteger(Number(valeur))) throw new GrantRefuse(`--uses: “${valeur}” cannot be read — expected a number of merges, 1 at least`);
      echeance.uses = Number(valeur);
    } else {
      const instant = option === "--for" ? new Date(maintenant.getTime() + lireDuree(valeur)) : lireInstant(valeur, maintenant);
      if (Number.isNaN(instant.getTime())) throw new GrantRefuse(`${option}: “${valeur}” goes beyond what a date can express — for a grant with no end, give none`);
      echeance.until = instant.toISOString();
    }
  }
  if (vues.has("--until") && vues.has("--for")) throw new GrantRefuse("--until and --for say the same thing: one or the other");
  if (echeance.sansEcheance && vues.size > 1) throw new GrantRefuse("--no-expiry does not combine with any deadline");
  return echeance;
}

// `direInstant` et `direExtinction` restent en français : `attente.ts` et `pass.ts`
// les appellent encore. `grant` dit `direInstantEn` et `direExtinctionEn`.
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// Un instant d'échéance, avec son fuseau en lettres : « 12 oct. 19:20 UTC ».
// La box est en UTC et ne connaît pas le fuseau du chef : un `Z` collé à un
// horodatage ISO se lit comme une heure locale, « UTC » écrit ne se lit pas ainsi.
export function direInstant(iso: string): string {
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())} UTC`;
}

const MOIS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Le même instant, en anglais : « 12 Oct 19:20 UTC ».
export function direInstantEn(iso: string): string {
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MOIS_EN[d.getUTCMonth()]} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())} UTC`;
}

// Une échéance : la durée restante d'abord — la seule mention qui ne trompe
// dans aucun fuseau —, puis l'instant, fuseau en lettres. C'est la forme que
// l'app relit (app/src/grants.ts, `ECHEANCE`).
export const direEcheance = (until: string, maintenant: Date, duree: (ms: number) => string) =>
  `${duree(Date.parse(until) - maintenant.getTime())} left (until ${direInstantEn(until)})`;

// Ce que `--until` a compris, à rendre avant d'écrire : l'instant en UTC et
// la durée qui le sépare de maintenant, dans la même phrase.
export const direCompris = (until: string, maintenant: Date, duree: (ms: number) => string) =>
  `understood: until ${direInstantEn(until)} — in ${duree(Date.parse(until) - maintenant.getTime())}`;

const usages = (combien: number) => `${combien.toLocaleString("en-US")} ${combien > 1 ? "uses" : "use"}`;

export const direExtinctionEn = (cause: CauseDExtinction | null) => (cause === "uses" ? "its last use is consumed" : "its deadline has passed");

export const direExtinction = (cause: CauseDExtinction | null) => (cause === "uses" ? "son dernier usage est consommé" : "son échéance est passée");

// Ce qu'il reste d'un grant actif : le temps, les usages, ou « no deadline ».
// `duree` : la façon dont l'appelant écrit une durée. La ligne `grant` de
// `status` (etat.ts) dit la même chose.
export function direResteEn(grant: Grant, maintenant: Date, duree: (ms: number) => string): string {
  const restes = [
    ...(grant.until === null ? [] : [direEcheance(grant.until, maintenant, duree)]),
    ...(grant.usesLeft === null ? [] : [`${usages(grant.usesLeft)} left${grant.reserved === 0 ? "" : `, of which ${grant.reserved} held by ${grant.reserved > 1 ? "merges" : "a merge"} under way`}`]),
  ];
  return restes.length === 0 ? "no deadline" : restes.join(" · ");
}

// Un grant actif qui va s'éteindre sans prévenir : moins d'une heure devant
// lui, ou un seul usage.
export function bientotEteint(grant: Grant, maintenant: Date): boolean {
  if (!grant.active) return false;
  return (grant.until !== null && Date.parse(grant.until) - maintenant.getTime() < HEURE_MS) || grant.usesLeft === 1;
}

// L'état du grant, sur une ligne, pour `grant`. L'app la relit (app/src/grants.ts,
// `ETAT`) : tout changement de forme se répercute là-bas.
export function direGrant(grant: Grant | null, maintenant: Date, duree: (ms: number) => string): string {
  if (grant === null) return "ABSENT — never given: the pass stops at the open PR, nothing is merged";
  if (grant.active) {
    const bientot = bientotEteint(grant, maintenant) ? "EXPIRING SOON — " : "";
    return `ACTIVE since ${grant.since} (by ${grant.by}) — ${bientot}${direResteEn(grant, maintenant, duree)}: a green pass is merged without you`;
  }
  if (grant.ended === "expired") {
    const ecrit = grant.unrecorded ? " (the runtime will write it to the log on its next pass)" : "";
    return `LAPSED since ${grant.since} — ${direExtinctionEn(grant.cause)} (enabled by ${grant.by}): the pass stops at the open PR${ecrit}`;
  }
  return `REVOKED since ${grant.since} (by ${grant.by}) — the pass stops at the open PR`;
}

// Écrit l'extinction d'un grant échu que le journal ne dit pas encore, et rend
// ce grant ; rien s'il n'y a rien à constater. Le fait rend le grant inactif :
// il ne s'écrit qu'une fois, quel que soit le nombre de ceux qui constatent.
export function constaterExtinction(journal: Journal, projet: string, auteur: string, action: ActionDeGrant, maintenant: Date): Grant | null {
  return journal.base.transaction(() => {
    const grant = etatDuGrant(journal.base, action, maintenant);
    if (!grant?.unrecorded || grant.cause === null) return null;
    journal.ajouter({ project: projet, ticket: null, author: auteur, type: "grant.expired", payload: { action, cause: grant.cause, since: grant.since } });
    return grant;
  });
}

const direLimites = ({ until, uses }: Echeance, maintenant: Date, duree: (ms: number) => string) =>
  [...(until === undefined ? [] : [direEcheance(until, maintenant, duree)]), ...(uses === undefined ? [] : [`for ${usages(uses)}`])].join(" · ");

// Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
// est. Vérifier et écrire tiennent dans une seule transaction. Un grant échu
// que le journal ne dit pas encore éteint y est d'abord écrit éteint : le
// geste du chef ne recouvre pas une extinction.
export function commanderGrant(journal: Journal, commande: Commande, action: ActionDeGrant, echeance: Echeance, maintenant: Date, duree: (ms: number) => string): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) throw new GrantRefuse("the log is empty: the runtime has never started on this state directory");
    if (commande !== "extend" && echeance.sansEcheance) throw new GrantRefuse("--no-expiry only applies to `extend`: a grant enabled with no option already has no deadline");
    if (commande === "revoke" && (echeance.until !== undefined || echeance.uses !== undefined)) throw new GrantRefuse("`revoke` takes no deadline");
    constaterExtinction(journal, projet, AUTEUR_DU_CONSTAT, action, maintenant);
    const grant = etatDuGrant(base, action, maintenant);
    const absent = sessionEnCours(base) ? "" : " (no runtime is running: the command will take effect on its next start)";
    const ajouter = (fait: FaitPass) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
    const eteint = grant?.ended === "expired" ? ` — it lapsed on ${grant.since} (${direExtinctionEn(grant.cause)})` : "";

    if (commande === "enable") {
      if (grant?.active) {
        return `grant ${action} already active since ${grant.since} — ${direResteEn(grant, maintenant, duree)}. Nothing is written: to change its deadline, \`extend ${action}\``;
      }
      const { until, uses } = echeance;
      ajouter({ type: "grant.activated", payload: { action, ...(until === undefined ? {} : { until }), ...(uses === undefined ? {} : { uses }) } });
      const limites = direLimites(echeance, maintenant, duree);
      return limites === ""
        ? `grant ${action} active, no deadline: every green pass from now on is merged by the runtime — not the deliveries already stopped. It holds until you revoke it${absent}`
        : `grant ${action} active, ${limites}: every green pass from now on is merged by the runtime — not the deliveries already stopped. It will lapse on its own${absent}`;
    }

    if (commande === "revoke") {
      if (!grant?.active) return `nothing to revoke: the ${action} grant is not active${eteint}`;
      ajouter({ type: "grant.revoked", payload: { action } });
      return `grant ${action} revoked: the pass now stops at the open PR${absent}`;
    }

    if (!grant?.active) throw new GrantRefuse(`nothing to extend: the ${action} grant is not active${eteint} — to enable it again, \`enable ${action}\``);
    const { until, uses, sansEcheance } = echeance;
    if (sansEcheance) {
      if (grant.until === null && grant.usesLeft === null) return `grant ${action} already has no deadline: nothing is written`;
      ajouter({ type: "grant.extended", payload: { action, until: null, uses: null } });
      return `grant ${action} extended: its deadline is lifted, it holds until you revoke it${absent}`;
    }
    if (until === undefined && uses === undefined) throw new GrantRefuse("extend by how much? --until <date or time>, --for <duration>, --uses <n> or --no-expiry");
    // Poser une limite là où il n'y en a pas, ou en rapprocher une, c'est
    // raccourcir : ce n'est pas le geste de `extend`.
    const raccourcir = `to shorten it, revoke it then enable it again`;
    if (until !== undefined && grant.until === null) throw new GrantRefuse(`the ${action} grant has no dated deadline: setting one does not extend it — ${raccourcir}`);
    if (until !== undefined && grant.until !== null && until <= grant.until) {
      throw new GrantRefuse(`the ${action} grant already holds until ${direInstantEn(grant.until)}: ${direInstantEn(until)} does not extend it — ${raccourcir}`);
    }
    if (uses !== undefined && grant.usesLeft === null) throw new GrantRefuse(`the ${action} grant does not count its uses: giving it a number does not extend it — ${raccourcir}`);
    ajouter({ type: "grant.extended", payload: { action, ...(until === undefined ? {} : { until }), ...(uses === undefined ? {} : { uses }) } });
    const apres = etatDuGrant(base, action, maintenant);
    return `grant ${action} extended: ${apres ? direResteEn(apres, maintenant, duree) : ""}${absent}`;
  });
}

// Écrit au journal que le chef a demandé ce qu'aucun grant n'autorise — s'il
// y a un journal où l'écrire —, et rend le refus à lui dire.
export function refuserJamaisAccordee(journal: Journal | null, { action, ligne }: JamaisAccordee): string {
  const projet = journal?.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
  if (journal && projet) journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "grant.refused", payload: { action, line: ligne } });
  return `grant ${action} refused: “${ligne}” — no grant allows it, not even asked by you. Nothing is enabled${projet ? ", your request is written to the log" : ""}. This list is changed by no command: only by a delivery, which reads as a diff (${FICHIER_DE_LA_LISTE})`;
}

type Geste = { at: string; author: string; type: string; payload: Record<string, unknown> };

function direGeste({ type, payload }: Geste): string {
  const { until, uses, cause, since } = payload;
  const limites = (nombre: (combien: number) => string) =>
    [...(typeof until === "string" ? [`until ${direInstantEn(until)}`] : []), ...(typeof uses === "number" ? [nombre(uses)] : [])].join(" · ");
  switch (type) {
    case "grant.activated":
      return `enabled ${limites((combien) => `for ${usages(combien)}`) || "with no deadline"}`;
    case "grant.extended":
      return `extended: ${limites((combien) => `${usages(combien)} more`) || "deadline lifted"}`;
    case "grant.expired":
      return `lapsed: ${direExtinctionEn(cause === "uses" ? "uses" : "until")}${typeof since === "string" ? ` (since ${since})` : ""}`;
    case "grant.refused":
      return "refused: no grant allows it";
    default:
      return "revoked";
  }
}

// Les derniers gestes sur les grants, le plus récent d'abord : accordé,
// prolongé, éteint seul, révoqué, refusé — l'histoire que l'état seul ne dit pas.
export function gestesDuGrant(journal: Journal, combien = GESTES_MONTRES): string[] {
  return journal.base
    .lire<Omit<Geste, "payload"> & { payload: string }>(
      "SELECT at, author, type, payload FROM events WHERE type IN ('grant.activated', 'grant.extended', 'grant.expired', 'grant.revoked', 'grant.refused') ORDER BY seq DESC LIMIT ?",
      combien,
    )
    .map((ligne) => {
      const geste = { ...ligne, payload: JSON.parse(ligne.payload) as Record<string, unknown> };
      return `${geste.at}  ${String(geste.payload.action ?? "?")}  ${direGeste(geste)}  (${geste.author})`;
    });
}
