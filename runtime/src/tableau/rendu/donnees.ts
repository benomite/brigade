// Ce que le tableau de la cuisine montre, tiré de l'état que `status` lit
// (`lireEtat`) : la file de ce qui attend le chef, chaque ligne avec son geste,
// et l'état de la cuisine. Rien n'est lu ni calculé ici que `status` ne lise ou
// ne calcule : les lignes sont les siennes, mot pour mot, et ses champs ceux
// de son état. Pur : le même état, à la même heure, donne le même tableau.
import { direPauseEn, direSansGrantEn, decisionDe, nommerEn, direAttenteEn, TETE_AWAITING, FIN_AWAITING, type Attente } from "../../attend.ts";
import { AGE_MAX_SAUVEGARDE_MS, coince, decrireEtat, dureeEn, faits, type EtatCuisine } from "../../etat.ts";
import type { Repartition } from "../../limite-github.ts";
import { plafondDeCooks } from "../../projections/stations.ts";
import type { CuisineDuTableau, LigneDeLaFile, RubriqueDuTableau, Tableau } from "./bloc.ts";

// Ce que `status` reçoit en plus de l'état, et le tableau avec lui.
export type OptionsDuTableau = { ageMaxSauvegardeMs?: number; limiteGithub?: number | null; appels?: Repartition | null };

// Les rubriques de `status` que le tableau ne porte pas : ce qui ne se lit que
// sur la box — les serveurs et leurs adresses en 127.0.0.1, les worktrees, les
// transcripts. Le rail ne s'y lit que par son décompte : ses tickets sont les
// issues du dépôt.
const SUR_LA_BOX_SEULEMENT = new Set(["servers", "to launch", "service", "worktrees", "claude"]);
const DECOMPTE_SEUL = new Set(["rail"]);
const TITRE = 11;
const DERNIERS_EVENEMENTS = "latest events";

// La ligne de la file d'une attente.
function ligneDeLaFile(attente: Attente): LigneDeLaFile {
  const carte = attente.quoi === "carte" ? { type: attente.carte.type, question: attente.carte.question, choix: attente.carte.choix.map(({ texte, suite }) => ({ texte, suite })) } : null;
  return {
    nom: nommerEn(attente),
    ticket: attente.ticket,
    titre: attente.title,
    quoi: attente.quoi,
    depuis: attente.since,
    ligne: direAttenteEn(attente),
    decision: attente.ticket === null ? null : decisionDe(attente),
    carte,
  };
}

// Les lignes de `status`, rubrique par rubrique, sans le bloc `awaiting` — la
// file le porte —, sans les derniers événements, ni ce qui ne se lit que sur
// la box. Une ligne qui commence par un titre (`ligne(titre, valeur)` d'etat.ts,
// le titre sur onze colonnes) ouvre une rubrique ; une ligne en retrait la continue.
export function rubriquesDeStatus(lignes: string[]): RubriqueDuTableau[] {
  const rubriques: RubriqueDuTableau[] = [];
  let dansAwaiting = false;
  for (const ligne of lignes) {
    if (ligne === DERNIERS_EVENEMENTS) break;
    if (ligne.startsWith(`${TETE_AWAITING} `)) dansAwaiting = true;
    if (dansAwaiting) {
      if (ligne === FIN_AWAITING) dansAwaiting = false;
      continue;
    }
    if (ligne.trim() === "") continue;
    if (ligne.startsWith(" ")) {
      rubriques.at(-1)?.lignes.push(ligne.trim());
      continue;
    }
    const titree = ligne.length > TITRE && ligne[TITRE - 1] === " " && ligne[TITRE] !== " ";
    rubriques.push(titree ? { titre: ligne.slice(0, TITRE).trim(), lignes: [ligne.slice(TITRE)] } : { titre: "", lignes: [ligne] });
  }
  return rubriques
    .filter(({ titre }) => !SUR_LA_BOX_SEULEMENT.has(titre))
    .map((rubrique) => (DECOMPTE_SEUL.has(rubrique.titre) ? { ...rubrique, lignes: rubrique.lignes.slice(0, 1) } : rubrique));
}

// Le tableau de cet état, lu à `maintenant`.
export function tableauDeLaCuisine(etat: EtatCuisine, maintenant: Date, { ageMaxSauvegardeMs = AGE_MAX_SAUVEGARDE_MS, limiteGithub = null, appels = null }: OptionsDuTableau = {}): Tableau {
  const depuisEn = (instant: string) => dureeEn(maintenant.getTime() - Date.parse(instant));
  const { session, tick, gardeFous, base, reparation, urgence } = etat;
  const tenus = new Map(etat.rail.filter((ticket) => ticket.state === "taken").map((ticket) => [ticket.ticket, ticket]));
  const stationDe = new Map(etat.auxFourneaux.flatMap(({ station, ticket }) => (ticket === null ? [] : [[ticket, station] as const])));
  const bilans = [
    ...(etat.pause === null ? [] : [direPauseEn(etat.pause, depuisEn)]),
    ...[direSansGrantEn(etat.sansGrant)].flatMap((bilan) => (bilan === null ? [] : [bilan])),
    ...(etat.passage === null ? [] : [etat.passage.ligne]),
  ];
  const cuisine: CuisineDuTableau = {
    etat: faits(etat, maintenant).etat,
    runtime: { demarreLe: session?.startedAt ?? null, arreteLe: session?.endedAt ?? null, dernierTick: tick?.at ?? null },
    arreteeLe: gardeFous.stoppedAt,
    disjoncteur: { ouvertLe: gardeFous.breakerOpenedAt, echecs: gardeFous.failures, seuil: gardeFous.breakerThreshold },
    base:
      base === null
        ? null
        : { resultat: base.outcome, sha: base.sha, le: base.at, rougeDepuis: base.redSince, reparation: reparation !== null && reparation.redSince === base.redSince ? reparation.ticket : null },
    urgence: urgence === null ? null : { depuis: urgence.depuis, retenus: urgence.retenus, decisions: urgence.causes.map(({ attente }) => nommerEn(attente)) },
    cooks: etat.cooks.map((cook) => {
      const ticket = cook.ticket === null ? undefined : tenus.get(cook.ticket);
      return {
        ticket: cook.ticket,
        run: cook.run,
        station: cook.ticket === null ? null : (stationDe.get(cook.ticket) ?? null),
        modele: cook.station?.model ?? null,
        effort: cook.station?.effort ?? null,
        lanceLe: cook.launchedAt,
        coince: ticket !== undefined && coince(ticket, maintenant),
        tours: cook.mesure?.turns ?? null,
        tokens: cook.mesure?.tokens ?? null,
      };
    }),
    stations: etat.stations.map((station) => ({
      station: station.station,
      distante: station.remote,
      plafond: plafondDeCooks(station),
      satureeDepuis: station.saturatedAt,
      saturation: station.saturatedCauses.map(({ resource }) => resource),
      retenueDepuis: station.heldAt,
      deconnecteeDepuis: station.disconnectedAt,
      quotaJusqua: station.quotaUntil,
    })),
    plafonds: gardeFous.limits === null ? null : { tours: gardeFous.limits.turns, tokens: gardeFous.limits.tokens, dureeMs: gardeFous.limits.durationMs, inactiviteMs: gardeFous.limits.idleMs },
    consommation: {
      enCours: { ...etat.consommation.enCours },
      fenetres: etat.consommation.fenetres.map((fenetre) => ({ ...fenetre })),
    },
    rubriques: rubriquesDeStatus(decrireEtat(etat, maintenant, ageMaxSauvegardeMs, limiteGithub, appels)),
  };
  return { projet: etat.projet, lu: maintenant.toISOString(), file: etat.attend.map(ligneDeLaFile), bilans, cuisine };
}
