// Le grant `merge` tel que le chef le commande et le lit : l'échéance qu'il
// tape, ce qu'un geste écrit au journal, ce qu'il reste d'un grant en cours.
// Tout y prend l'heure en argument : rien n'attend, rien ne lit l'horloge.
import type { ActionDeGrant, CauseDExtinction, FaitPass } from "./evenements/pass.ts";
import type { Journal } from "./journal.ts";
import { etatDuGrant, type Grant } from "./projections/pass.ts";
import { sessionEnCours } from "./projections/sessions.ts";

export const ACTIONS: ActionDeGrant[] = ["merge"];
export type Commande = "activer" | "prolonger" | "revoquer";
export const COMMANDES: Commande[] = ["activer", "prolonger", "revoquer"];

// Ce qu'aucun grant n'autorise, pas même demandé par le chef. La liste est
// ici, dans le code : elle ne se change que par une livraison.
export const JAMAIS_ACCORDEES = [
  { action: "identifiants-max", ligne: "lire les identifiants du compte Max" },
  { action: "acces-prod", ligne: "toute action sur la production d'un projet" },
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
  [/^([0-9]+)j$/, ([, jours]) => Number(jours) * 24 * HEURE_MS],
  [/^([0-9]+)h([0-5][0-9])?$/, ([, heures, minutes]) => Number(heures) * HEURE_MS + Number(minutes ?? 0) * 60_000],
  [/^([0-9]+)min$/, ([, minutes]) => Number(minutes) * 60_000],
];

// Une date du calendrier local, ou rien si elle n'existe pas (le 31 février).
export function dateLocale(annee: number, mois: number, jour: number, heure: number, minute: number, seconde = 0): Date | null {
  const date = new Date(annee, mois - 1, jour, heure, minute, seconde);
  return date.getFullYear() === annee && date.getMonth() === mois - 1 && date.getDate() === jour && date.getHours() === heure && date.getMinutes() === minute ? date : null;
}

// `--jusqu-a` : une date et une heure, une date seule (la fin de cette
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
    throw new GrantRefuse(`--jusqu-a : « ${valeur} » ne se lit pas — attendu une date (2026-10-12), une date et une heure (2026-10-12T18:00) ou une heure d'aujourd'hui (18h, 18h30)`);
  }
  if (instant.getTime() <= maintenant.getTime()) {
    throw new GrantRefuse(
      heure
        ? `--jusqu-a : ${valeur} est déjà passé aujourd'hui — pour demain, dis la date (2026-10-12T18:00) ou une durée (--pour 20h)`
        : `--jusqu-a : ${valeur} est déjà passé`,
    );
  }
  return instant;
}

// Une durée tapée (30min, 4h, 1h30, 2j), en millisecondes — ou rien si elle
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
  throw new GrantRefuse(`--pour : « ${valeur} » ne se lit pas — attendu une durée : 30min, 4h, 1h30, 2j`);
}

// Lit l'échéance tapée : `--jusqu-a <instant>` ou `--pour <durée>`, `--usages
// <n>`, `--sans-echeance`. Une durée se compte à partir de `maintenant`.
export function lireEcheance(args: string[], maintenant: Date): Echeance {
  const echeance: Echeance = { sansEcheance: false };
  const vues = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const option = String(args[i]);
    if (vues.has(option)) throw new GrantRefuse(`${option} est donné deux fois`);
    vues.add(option);
    if (option === "--sans-echeance") {
      echeance.sansEcheance = true;
      continue;
    }
    const valeur = args[++i];
    if (!["--jusqu-a", "--pour", "--usages"].includes(option)) throw new GrantRefuse(`option inconnue : ${option}`);
    if (valeur === undefined) throw new GrantRefuse(`${option} attend une valeur`);
    if (option === "--usages") {
      if (!/^[1-9][0-9]*$/.test(valeur) || !Number.isSafeInteger(Number(valeur))) throw new GrantRefuse(`--usages : « ${valeur} » ne se lit pas — attendu un nombre de merges, 1 au moins`);
      echeance.uses = Number(valeur);
    } else {
      const instant = option === "--pour" ? new Date(maintenant.getTime() + lireDuree(valeur)) : lireInstant(valeur, maintenant);
      if (Number.isNaN(instant.getTime())) throw new GrantRefuse(`${option} : « ${valeur} » mène au-delà de ce qu'une date sait dire — pour un grant sans fin, n'en donne pas`);
      echeance.until = instant.toISOString();
    }
  }
  if (vues.has("--jusqu-a") && vues.has("--pour")) throw new GrantRefuse("--jusqu-a et --pour disent la même chose : l'un ou l'autre");
  if (echeance.sansEcheance && vues.size > 1) throw new GrantRefuse("--sans-echeance ne se combine avec aucune échéance");
  return echeance;
}

const compte = (combien: number, mot: string) => `${combien.toLocaleString("fr-FR")} ${mot}${combien > 1 ? "s" : ""}`;

export const direExtinction = (cause: CauseDExtinction | null) => (cause === "uses" ? "son dernier usage est consommé" : "son échéance est passée");

// Ce qu'il reste d'un grant actif : le temps, les usages, ou « sans échéance ».
// `duree` : la façon dont l'appelant écrit une durée.
export function direReste(grant: Grant, maintenant: Date, duree: (ms: number) => string): string {
  const restes = [
    ...(grant.until === null ? [] : [`jusqu'au ${grant.until} (encore ${duree(Date.parse(grant.until) - maintenant.getTime())})`]),
    ...(grant.usesLeft === null
      ? []
      : [`encore ${compte(grant.usesLeft, "usage")}${grant.reserved === 0 ? "" : `, dont ${grant.reserved} ${grant.reserved > 1 ? "retenus par des merges" : "retenu par un merge"} en cours`}`]),
  ];
  return restes.length === 0 ? "sans échéance" : restes.join(" · ");
}

// Un grant actif qui va s'éteindre sans prévenir : moins d'une heure devant
// lui, ou un seul usage.
export function bientotEteint(grant: Grant, maintenant: Date): boolean {
  if (!grant.active) return false;
  return (grant.until !== null && Date.parse(grant.until) - maintenant.getTime() < HEURE_MS) || grant.usesLeft === 1;
}

// L'état du grant, sur une ligne, pour `grant`.
export function direGrant(grant: Grant | null, maintenant: Date, duree: (ms: number) => string): string {
  if (grant === null) return "ABSENT — jamais donné : la pass s'arrête à la PR ouverte, rien n'est mergé";
  if (grant.active) {
    const bientot = bientotEteint(grant, maintenant) ? "BIENTÔT ÉTEINT — " : "";
    return `ACTIF depuis le ${grant.since} (par ${grant.by}) — ${bientot}${direReste(grant, maintenant, duree)} : une pass verte est mergée sans toi`;
  }
  if (grant.ended === "expired") {
    const ecrit = grant.unrecorded ? " (le runtime l'écrira au journal à son prochain passage)" : "";
    return `ÉTEINT SEUL depuis le ${grant.since} — ${direExtinction(grant.cause)} (accordé par ${grant.by}) : la pass s'arrête à la PR ouverte${ecrit}`;
  }
  return `RÉVOQUÉ depuis le ${grant.since} (par ${grant.by}) — la pass s'arrête à la PR ouverte`;
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
  [...(until === undefined ? [] : [`jusqu'au ${until} (encore ${duree(Date.parse(until) - maintenant.getTime())})`]), ...(uses === undefined ? [] : [`pour ${compte(uses, "usage")}`])].join(" · ");

// Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
// est. Vérifier et écrire tiennent dans une seule transaction. Un grant échu
// que le journal ne dit pas encore éteint y est d'abord écrit éteint : le
// geste du chef ne recouvre pas une extinction.
export function commanderGrant(journal: Journal, commande: Commande, action: ActionDeGrant, echeance: Echeance, maintenant: Date, duree: (ms: number) => string): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) throw new GrantRefuse("journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
    if (commande !== "prolonger" && echeance.sansEcheance) throw new GrantRefuse("--sans-echeance ne vaut que pour `prolonger` : un grant accordé sans option est déjà sans échéance");
    if (commande === "revoquer" && (echeance.until !== undefined || echeance.uses !== undefined)) throw new GrantRefuse("`revoquer` ne prend pas d'échéance");
    constaterExtinction(journal, projet, AUTEUR_DU_CONSTAT, action, maintenant);
    const grant = etatDuGrant(base, action, maintenant);
    const absent = sessionEnCours(base) ? "" : " (aucun runtime ne tourne : la commande vaudra à son prochain démarrage)";
    const ajouter = (fait: FaitPass) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
    const eteint = grant?.ended === "expired" ? ` — il s'est éteint seul le ${grant.since} (${direExtinction(grant.cause)})` : "";

    if (commande === "activer") {
      if (grant?.active) {
        return `grant ${action} déjà actif depuis le ${grant.since} — ${direReste(grant, maintenant, duree)}. Rien n'est écrit : pour changer son échéance, \`prolonger ${action}\``;
      }
      const { until, uses } = echeance;
      ajouter({ type: "grant.activated", payload: { action, ...(until === undefined ? {} : { until }), ...(uses === undefined ? {} : { uses }) } });
      const limites = direLimites(echeance, maintenant, duree);
      return limites === ""
        ? `grant ${action} actif, sans échéance : toute pass verte à partir de maintenant est mergée par le runtime — pas les livraisons déjà arrêtées. Il vaut jusqu'à ce que tu le révoques${absent}`
        : `grant ${action} actif ${limites} : toute pass verte à partir de maintenant est mergée par le runtime — pas les livraisons déjà arrêtées. Il s'éteindra seul${absent}`;
    }

    if (commande === "revoquer") {
      if (!grant?.active) return `rien à révoquer : le grant ${action} n'est pas actif${eteint}`;
      ajouter({ type: "grant.revoked", payload: { action } });
      return `grant ${action} révoqué : la pass s'arrête désormais à la PR ouverte${absent}`;
    }

    if (!grant?.active) throw new GrantRefuse(`rien à prolonger : le grant ${action} n'est pas actif${eteint} — pour le réaccorder, \`activer ${action}\``);
    const { until, uses, sansEcheance } = echeance;
    if (sansEcheance) {
      if (grant.until === null && grant.usesLeft === null) return `grant ${action} déjà sans échéance : rien n'est écrit`;
      ajouter({ type: "grant.extended", payload: { action, until: null, uses: null } });
      return `grant ${action} prolongé : son échéance est levée, il vaut jusqu'à ce que tu le révoques${absent}`;
    }
    if (until === undefined && uses === undefined) throw new GrantRefuse("prolonger de combien ? --jusqu-a <date ou heure>, --pour <durée>, --usages <n> ou --sans-echeance");
    // Poser une limite là où il n'y en a pas, ou en rapprocher une, c'est
    // raccourcir : ce n'est pas le geste de `prolonger`.
    const raccourcir = `pour le raccourcir, révoque-le puis réaccorde-le`;
    if (until !== undefined && grant.until === null) throw new GrantRefuse(`le grant ${action} n'a pas d'échéance en date : lui en poser une ne le prolonge pas — ${raccourcir}`);
    if (until !== undefined && grant.until !== null && until <= grant.until) {
      throw new GrantRefuse(`le grant ${action} vaut déjà jusqu'au ${grant.until} : ${until} ne le prolonge pas — ${raccourcir}`);
    }
    if (uses !== undefined && grant.usesLeft === null) throw new GrantRefuse(`le grant ${action} ne compte pas ses usages : lui en donner un nombre ne le prolonge pas — ${raccourcir}`);
    ajouter({ type: "grant.extended", payload: { action, ...(until === undefined ? {} : { until }), ...(uses === undefined ? {} : { uses }) } });
    const apres = etatDuGrant(base, action, maintenant);
    return `grant ${action} prolongé : ${apres ? direReste(apres, maintenant, duree) : ""}${absent}`;
  });
}

// Écrit au journal que le chef a demandé ce qu'aucun grant n'autorise — s'il
// y a un journal où l'écrire —, et rend le refus à lui dire.
export function refuserJamaisAccordee(journal: Journal | null, { action, ligne }: JamaisAccordee): string {
  const projet = journal?.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
  if (journal && projet) journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "grant.refused", payload: { action, line: ligne } });
  return `grant ${action} refusé : « ${ligne} » — aucun grant ne l'autorise, pas même demandé par toi. Rien n'est accordé${projet ? ", ta demande est écrite au journal" : ""}. Cette liste ne se change par aucune commande : par une livraison, qui se lit dans un diff (${FICHIER_DE_LA_LISTE})`;
}

type Geste = { at: string; author: string; type: string; payload: Record<string, unknown> };

function direGeste({ type, payload }: Geste): string {
  const { until, uses, cause, since } = payload;
  const limites = (usages: (combien: number) => string) =>
    [...(typeof until === "string" ? [`jusqu'au ${until}`] : []), ...(typeof uses === "number" ? [usages(uses)] : [])].join(" · ");
  switch (type) {
    case "grant.activated":
      return `accordé ${limites((combien) => `pour ${compte(combien, "usage")}`) || "sans échéance"}`;
    case "grant.extended":
      return `prolongé : ${limites((combien) => `${compte(combien, "usage")} de plus`) || "échéance levée"}`;
    case "grant.expired":
      return `éteint seul : ${direExtinction(cause === "uses" ? "uses" : "until")}${typeof since === "string" ? ` (depuis le ${since})` : ""}`;
    case "grant.refused":
      return "refusé : aucun grant ne l'autorise";
    default:
      return "révoqué";
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
