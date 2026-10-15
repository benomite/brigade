// La file de ce qui attend le chef : tout ce qui ne bougera plus sans une
// décision de lui, avec depuis quand. Rien n'est tenu ici : chaque entrée se
// relit du rail, de la pass et des relevés du manager, donc du journal, et
// disparaît avec le fait qui dit la décision prise — un merge à la main
// constaté, un ticket sorti du rail ou rendu, une dépendance revenue, une issue
// rejugée ou fermée. Une PR fermée sans merge est une décision à moitié prise :
// son entrée change, et dit le geste qui reste. La version du runtime y entre
// aussi : celle qui attend d'être mise en service, et celle que rien n'a pu
// comparer à son origine — elle sort quand la comparaison la dit à jour. Et
// la mise en service que le chef a demandée se lit sur la même ligne : elle
// attend le rail calme, le geste de box est parti, ou elle a échoué — rien
// n'a été redémarré, ou la version précédente est revenue —, avec la raison et
// les dernières lignes du geste sous elle. La version, elle, attend toujours.
// L'essai que le runtime lance seul s'y lit de même : en cours, ou raté — «
// essai de `2af33f0` raté à 14:02 : <raison> — `4e0d0db` reste en service ».
// Une version passée en service n'attend plus rien, mais le bloc le dit le
// jour même, sur une ligne à lui : « passé en `2af33f0` à 14:02 ».
// La passe de fermeture que le chef a demandée y est tant qu'elle attend sa
// condition d'exécution : depuis quand, ce qui la retient — et, passé deux
// heures, qu'elle est sans issue. Elle en sort partie, refusée ou retirée.
// La session Max y est annoncée avant de tomber : quand son échéance estimée
// approche, ou dès que son renouvellement échoue — elle en sort au
// renouvellement réussi suivant, ou à la reconnexion du chef.
// La base rouge y entre quand sa réparation a échoué, et alors seulement :
// pendant que le ticket de réparation travaille, rien n'attend le chef. Elle
// dit depuis quand la base est rouge, ce qui y échoue, et le geste ; elle en
// sort dès que la base redevient verte — la cuisine, elle, repart seule.
// Le setup du projet bloqué sur un échec qui se répète y entre aussi, une fois
// pour tout le projet : sa cause en clair — l'hôte que la porte refuse, ou le
// motif de l'échec — et le geste qui la lève. Il en sort quand la branche
// d'intégration a bougé et que les setups reprennent.
// Un ticket en WAITING n'y est pas : il attend un tiers, pas le chef. Repris
// par le chef, il y revient — avec l'entrée qu'il avait avant d'attendre, ou,
// s'il n'en avait pas, une à lui : ce qu'il attendait, et les gestes.
import type { Base } from "./base.ts";
import { geste } from "./geste.ts";
import { absentesDuMotif, direManque, direStationAbsente, GESTE_DE_PRESENCE, gesteDeCapacite, manqueDuMotif, type Manque } from "./capacites.ts";
import { A_RELIRE, declarationsDeLaCause, DU_MANAGER, ENCORE_ROUGE, MERGE_REFUSE, NON_JUGEE, REDECOUPE, SANS_GRANT } from "./evenements/pass.ts";
import { REJOUER_LA_BASE } from "./dire-base.ts";
import { direEssaiRate, direFin, direIssue, direPassage } from "./dire-mise-en-service.ts";
import { demandeEnAttente, refus, reglagesEnVigueur, type Demande as DemandeDeFermeture, type Refus } from "./fermeture/condition.ts";
import { direDemande as direDemandeDeFermeture } from "./fermeture/dire.ts";
import type { Ecart } from "./evenements/manager.ts";
import { CADENCE_DE_COMPARAISON_MS } from "./evenements/version.ts";
import { epiquesEnAttente } from "./projections/decoupages.ts";
import { issuesEnAttente, plusUneEpiqueDepuis } from "./projections/manager.ts";
import { dernierGeste, dernierGesteRendu, type GesteRendu } from "./projections/mise-en-service.ts";
import { etatDeLaBase, gatesDuRouge, lirePass, reparationDeLaBase, type EchecDeReparation, type SansGrant } from "./projections/pass.ts";
import type { TicketRail } from "./projections/rail.ts";
import { alerteDeSession, type AlerteDeSession } from "./projections/renouvellement.ts";
import { direDeconnexion, etatStation, GESTE_DE_CONNEXION, miseDeCoteBloquee, setupBloque, stationsDeconnectees, type MiseDeCoteBloquee, type SetupBloque } from "./projections/stations.ts";
import { versionComparee } from "./projections/version.ts";
import { echecsDuDisjoncteur, etatDesGardeFous, type EchecDuDisjoncteur } from "./projections/garde-fous.ts";
import { nomAbandon, retenue } from "./rail.ts";
import { echecsDesGates } from "./reparation.ts";
import { DECLARATION_RESEAU } from "./reseau.ts";
import { SCRIPT_SETUP } from "./gates.ts";
import { CAUSES_DU_PROJET } from "./mise-de-cote.ts";
import { REVENU_D_ATTENTE } from "./evenements/rail.ts";

// `title` : nul pour une issue qui n'est pas sur le rail — le journal ne
// connaît pas son titre.
type AttenteDeTicket = { ticket: number; title: string | null; since: string } & (
  // Une livraison verte que la pass ne merge pas elle-même. `reason` : le
  // motif, `cause` : ce qui le précise. `expired` : faute d'un grant qui
  // s'était éteint seul à cet instant.
  | { quoi: "merge"; reason: string; cause: string | null; pr: string | null; expired: string | null }
  // Un ticket que la pass ou le manager a remonté : il est 86, sans retour.
  | { quoi: "remontee"; reason: string; cause: string | null; pr: string | null }
  // Une livraison dont la PR a été fermée sans merge : son ticket tient encore
  // sa place sur le rail. `reason` : ce qu'elle était — arrêtée, remontée.
  | { quoi: "fermee"; reason: string; cause: string | null; pr: string | null }
  // Un ticket que sa station a déclaré 86 sans heure de retour.
  | { quoi: "86"; reason: MotifDeStation }
  // Un ticket 86 parce qu'il demande une capacité qu'aucune station déclarée
  // ne fournit : aucun cook n'est parti.
  | { quoi: "capacite"; manque: Manque }
  // Un ticket 86 parce que seule une station distante absente peut le
  // cuisiner : aucun cook n'est parti, et ce n'est pas une panne.
  | { quoi: "absente"; stations: string[] }
  // Un ticket en attente d'un autre qui a quitté le rail sans être servi.
  | { quoi: "bloque"; abandonnes: { ticket: number; reason: string }[] }
  // Une issue que le manager ne juge pas tant qu'elle porte ce label du chef.
  | { quoi: "ecartee"; reason: EcartQuiAttend }
  // Une issue dont le jugement ne se lit pas — ou, épique, le découpage.
  | { quoi: "illisible"; epique: boolean }
  // Une épique sur laquelle le manager a posé une question avant de découper.
  | { quoi: "question" }
  // Un ticket sorti de WAITING vers le chef, qui n'était pas mis de côté avant
  // d'attendre. `attendait` : ce qu'il attendait, et de qui — nul si le journal
  // ne le dit plus.
  | { quoi: "repris"; attendait: { what: string; who: string } | null }
);

// Où en est la mise en service demandée au runtime, lue avec la version :
// la demande qui vit et les cooks en vol à la lecture, le dernier geste de
// box, s'il n'a pas mis sa version en service, ou l'essai que le runtime a
// lancé seul et qui tourne. Nulle : rien n'a été demandé ni essayé — ou le
// dernier geste a réussi, et c'est une autre version qui attend.
export type MiseEnServiceLue = GesteRendu | null;

// Combien de temps la version passée en service se dit dans le bloc : l'heure
// seule, sans le jour, tromperait au-delà.
export const PASSAGE_MONTRE_MS = 24 * 3_600_000;

// La version que le dernier geste de box a mise en service, et quand — tant
// qu'elle date de moins d'un jour à `maintenant`. Nulle sinon.
export type Passage = { servie: string; le: string };
export function passageEnService(base: Base, maintenant = new Date()): Passage | null {
  const issue = dernierGeste(base)?.issue;
  if (issue?.quoi !== "served") return null;
  const age = maintenant.getTime() - Date.parse(issue.le);
  return age >= 0 && age < PASSAGE_MONTRE_MS ? { servie: issue.servie, le: issue.le } : null;
}

// Ce qui attend le chef sans être à un ticket.
type AttenteHorsTicket = { ticket: null; title: null; since: string } & (
  // Une station dont la connexion Max manque : elle retient tous les tickets.
  | { quoi: "connexion"; station: string; reason: string | null }
  // La session Max n'est pas encore tombée, mais elle va le faire : son
  // échéance estimée approche, ou son renouvellement a échoué.
  | ({ quoi: "session" } & Omit<AlerteDeSession, "since">)
  // La branche que suit le clone de brigade porte, sur son origine, un runtime
  // que le projet ne sert pas. `since` : l'instant de la plus ancienne
  // livraison qui n'est pas en service ; `livraisons` : combien ne le sont pas.
  | { quoi: "version"; projet: string; servie: string; branche: string; tete: string; livraisons: number; service: GesteRendu }
  // La version en service n'a pas pu être comparée à son origine : rien ne dit
  // qu'elle est à jour. `since` : la première comparaison manquée.
  | { quoi: "version-illisible"; projet: string; servie: string; branche: string | null; raison: string; service: MiseEnServiceLue }
  // La passe de fermeture demandée, qui n'est pas partie. `retenue` : ce qui
  // la retient à la lecture, ou null — elle part au prochain réveil.
  | { quoi: "fermeture"; demande: DemandeDeFermeture; retenue: Refus | null }
  // La base d'intégration rouge, dont le ticket de réparation a échoué : plus
  // rien ne la réparera seul. `since` : son passage au rouge ; `sha` : le
  // commit du dernier contrôle rouge ; `echecs` : ce qui y échoue, tel que ses
  // gates le nomment.
  | { quoi: "base"; sha: string; echecs: string[]; reparation: number; echec: EchecDeReparation }
  // Le setup du projet, bloqué sur un échec qui se répète : plus aucun n'est
  // lancé, pour aucun ticket, tant que la branche d'intégration ne bouge pas.
  // `since` : le blocage ; `setup` : sa cause, et le ticket qui l'a vue.
  | { quoi: "setup"; setup: Omit<SetupBloque, "since"> }
  // Une autre cause de mise de côté, répétée à l'identique sur le projet : un
  // seul ticket est repris à la fois, pour sonder, jusqu'à ce qu'un cook parte,
  // qu'une autre cause se présente ou que la branche d'intégration bouge.
  // `since` : le blocage.
  | { quoi: "aside"; aside: Omit<MiseDeCoteBloquee, "since"> }
  // Le disjoncteur ouvert : plus aucun cook ne part. `since` : son ouverture ;
  // `echecs` : les échecs d'affilée qui l'ont ouvert.
  | { quoi: "disjoncteur"; echecs: EchecDuDisjoncteur[]; seuil: number | null }
);

export type Attente = AttenteDeTicket | AttenteHorsTicket;

export const REFERMER_LE_DISJONCTEUR = geste("guardrails resume");
export const ACCORDER_LE_GRANT = geste("grant enable merge");

// Les 86 que la station pose sans heure de retour, et ce qu'elle attend du chef
// pour chacun. Les deux premiers reviennent en attente seuls, une fois corrigés.
const GESTES_DE_STATION = {
  "no-calibration": "sans calibrage — à calibrer : poser `model:` et `effort:` sur l'issue, il repart seul",
  "unreadable-card": "fiche illisible — à corriger : la fiche de l'issue, il repart seul",
  refused: "refusé trois fois par le modèle — à trancher : reformuler ou recalibrer, puis retirer et reposer `fire` ; ou retirer `fire`",
} as const;
type MotifDeStation = keyof typeof GESTES_DE_STATION;
const deStation = (motif: string | null): motif is MotifDeStation => motif !== null && Object.hasOwn(GESTES_DE_STATION, motif);

// Les écarts qui attendent le chef, et ce qu'il a à faire de chacun. Les autres
// — la roadmap, l'issue d'un inconnu — n'attendent personne.
const GESTES_D_ECART = {
  question: "écartée par le manager, elle porte `question` — à trancher : y répondre puis retirer le label, il la juge ; ou fermer l'issue",
  decision: "écartée par le manager, elle porte `decision` — à trancher : décider puis retirer le label, il la juge ; ou fermer l'issue",
  "blocked-on-human": "retenue, elle porte `blocked-on-human` — à lever : retirer le label, le manager la juge ; ou fermer l'issue",
} as const satisfies Partial<Record<Ecart, string>>;
type EcartQuiAttend = keyof typeof GESTES_D_ECART;
const ecartQuiAttend = (motif: string): motif is EcartQuiAttend => Object.hasOwn(GESTES_D_ECART, motif);

// Ce que le manager attend du chef : les issues qu'il a écartées parce
// qu'elles sont à lui, ses jugements et ses découpages illisibles, les
// questions qu'il pose sur une épique. Une issue fermée n'attend plus ; une
// issue sur le rail est lancée, et ce qui l'y retient se lit du rail.
function attentesDuManager(base: Base, tickets: Map<number, TicketRail>): AttenteDeTicket[] {
  const parIssue = new Map<number, AttenteDeTicket>();
  for (const { epic, state, at, seq, closed } of epiquesEnAttente(base)) {
    // Découpée à la main, retirée au manager, rejugée autrement qu'en épique :
    // la question ou l'échec du découpage ne vaut plus, la décision prime.
    if (!closed && !plusUneEpiqueDepuis(base, epic, seq)) parIssue.set(epic, { ticket: epic, title: null, since: at, ...(state === "asked" ? { quoi: "question" } : { quoi: "illisible", epique: true }) });
  }
  // Retenue par le chef après une question, c'est la retenue qui attend.
  for (const { ticket, decision, reason, at, closed } of issuesEnAttente(base)) {
    if (closed) continue;
    if (decision === "failed") parIssue.set(ticket, { ticket, title: null, since: at, quoi: "illisible", epique: false });
    else if (ecartQuiAttend(reason)) parIssue.set(ticket, { ticket, title: null, since: at, quoi: "ecartee", reason });
  }
  return [...parIssue.values()].filter(({ ticket }) => !tickets.has(ticket));
}

// Ce qui attend le chef, le plus ancien d'abord. `rail` : le rail tel que lu ;
// `maintenant` : l'heure à laquelle l'échéance de la session se compte.
export function attentesDuChef(base: Base, rail: TicketRail[], maintenant = new Date()): Attente[] {
  const tickets = new Map(rail.map((ticket) => [ticket.ticket, ticket]));
  const instant = (seq: number) => base.lire<{ at: string }>("SELECT at FROM events WHERE seq = ?", seq)[0]?.at;

  const livraisons = lirePass(base).flatMap((pass): AttenteDeTicket[] => {
    const ticket = tickets.get(pass.ticket);
    if (!ticket) return [];
    const commun = { ticket: pass.ticket, title: ticket.title, since: pass.since, reason: pass.reason ?? "", cause: pass.cause, pr: pass.pr };
    // Revenu de WAITING après avoir été rendu au rail, sa pass d'avant ne dit
    // plus rien de lui : son entrée est celle du retour.
    if (ticket.reason === REVENU_D_ATTENTE && pass.phase !== "held") return [];
    if (pass.phase === "held") return [{ ...commun, quoi: "merge", expired: pass.grantExpired }];
    // Rendu au rail par le chef, le ticket n'est plus 86 : sa pass garde sa
    // phase jusqu'au cook suivant, mais plus rien n'attend. Redécoupé, il
    // n'attend personne : ses sous-tickets portent le travail.
    if (pass.phase === "escalated" && ticket.state === "86" && pass.reason !== REDECOUPE) return [{ ...commun, quoi: "remontee" }];
    // De même rendu au rail, il n'attend plus ; et fermer la PR d'un ticket
    // redécoupé n'appelle rien d'autre.
    if (pass.phase === "closed" && (ticket.state === "pass" || ticket.state === "86") && pass.reason !== REDECOUPE) return [{ ...commun, quoi: "fermee" }];
    return [];
  });

  const bloques = rail.flatMap((ticket): AttenteDeTicket[] => {
    if (retenue(ticket) !== "bloque") return [];
    const partis = ticket.awaits.flatMap(({ ticket: attendu, left }) => (left === null ? [] : [{ ticket: attendu, reason: left.reason, at: instant(left.seq) }]));
    // Bloqué depuis le premier abandon — ou depuis qu'il attend, s'il est
    // arrivé après. Les horodatages sont en ISO 8601 UTC : leur ordre est
    // celui du temps.
    const premier = partis.map(({ at }) => at ?? ticket.since).sort()[0] ?? ticket.since;
    return [{ ticket: ticket.ticket, title: ticket.title, since: premier > ticket.since ? premier : ticket.since, quoi: "bloque", abandonnes: partis.map(({ ticket, reason }) => ({ ticket, reason })) }];
  });

  const repris = rail.flatMap((ticket): AttenteDeTicket[] =>
    ticket.state === "86" && ticket.reason === REVENU_D_ATTENTE ? [{ ticket: ticket.ticket, title: ticket.title, since: ticket.since, quoi: "repris", attendait: derniereAttente(base, ticket.ticket) }] : [],
  );

  const refuses = rail.flatMap((ticket): AttenteDeTicket[] =>
    ticket.state === "86" && ticket.until === null && deStation(ticket.reason) ? [{ ticket: ticket.ticket, title: ticket.title, since: ticket.since, quoi: "86", reason: ticket.reason }] : [],
  );

  // Le motif du 86 porte ce qui manquait quand la station l'a écarté : c'est
  // elle qui le relit, à chaque service, et rend le ticket dès que ça suffit.
  const sansStation = rail.flatMap((ticket): AttenteDeTicket[] => {
    const manque = ticket.state === "86" && ticket.until === null ? manqueDuMotif(ticket.reason) : null;
    return manque === null ? [] : [{ ticket: ticket.ticket, title: ticket.title, since: ticket.since, quoi: "capacite", manque }];
  });

  // De même : le motif nomme les stations absentes, et la station rend le
  // ticket dès que l'une d'elles se manifeste.
  const sansPresence = rail.flatMap((ticket): AttenteDeTicket[] => {
    const stations = ticket.state === "86" && ticket.until === null ? absentesDuMotif(ticket.reason) : null;
    return stations === null ? [] : [{ ticket: ticket.ticket, title: ticket.title, since: ticket.since, quoi: "absente", stations }];
  });

  // Elle sort de la file avec le « reprendre » du chef : c'est lui qui efface
  // la déconnexion.
  const connexions = stationsDeconnectees(base).flatMap((station): Attente[] => {
    const etat = etatStation(base, station);
    return etat?.disconnectedAt ? [{ ticket: null, title: null, since: etat.disconnectedAt, quoi: "connexion", station, reason: etat.disconnectedReason }] : [];
  });

  const alerte = alerteDeSession(base, maintenant);
  const session: Attente[] = alerte === null ? [] : [{ ticket: null, title: null, quoi: "session", ...alerte }];

  const comparee = versionComparee(base);
  const versions = ((): Attente[] => {
    if (comparee === null || comparee.comparaison.outcome === "current") return [];
    const { projet, depuis: since, comparaison } = comparee;
    // Seul un essai raté se lit : une demande qui attend, un essai qui
    // tourne, une version qui attend ne sont pas à la charge du chef.
    const service: MiseEnServiceLue = dernierGesteRendu(base);
    if (comparaison.outcome === "waiting") {
      if (service === null) return [];
      return [{ ticket: null, title: null, since, quoi: "version", projet, servie: comparaison.served, branche: comparaison.branch, tete: comparaison.head, livraisons: comparaison.deliveries, service }];
    }
    return [{ ticket: null, title: null, since, quoi: "version-illisible", projet, servie: comparaison.served, branche: comparaison.branch, raison: comparaison.reason, service }];
  })();

  const demande = demandeEnAttente(base);
  const fermeture: Attente[] = demande === null ? [] : [{ ticket: null, title: null, since: demande.depuis, quoi: "fermeture", demande, retenue: refus(base, reglagesEnVigueur(base), false) }];

  // Pendant sa réparation, ou sans elle — le rouge passager que la pass
  // rejoue, celui dont le ticket s'ouvre —, la base rouge n'attend personne.
  // Seule une réparation échouée de ce rouge-là l'y fait entrer.
  const controle = etatDeLaBase(base);
  const reparation = reparationDeLaBase(base);
  const baseRouge: Attente[] =
    controle?.outcome === "red" && reparation !== null && reparation.echec !== null && reparation.redSince === controle.redSince
      ? [{ ticket: null, title: null, since: controle.redSince ?? controle.at, quoi: "base", sha: controle.sha, echecs: echecsDuRouge(base, reparation.failures), reparation: reparation.ticket, echec: reparation.echec }]
      : [];

  // Un seul blocage pour tout le projet, quel que soit le nombre de tickets
  // qu'il retient : la projection n'en tient qu'un.
  const bloque = setupBloque(base);
  const setup: Attente[] = bloque === null ? [] : [{ ticket: null, title: null, since: bloque.since, quoi: "setup", setup: { why: bloque.why, hosts: bloque.hosts, base: bloque.base, ticket: bloque.ticket, station: bloque.station } }];

  const ecartee = miseDeCoteBloquee(base);
  const aside: Attente[] = ecartee === null ? [] : [{ ticket: null, title: null, since: ecartee.since, quoi: "aside", aside: { reason: ecartee.reason, base: ecartee.base, ticket: ecartee.ticket, station: ecartee.station } }];

  // Ouvert, le disjoncteur retient toute la cuisine ; il en sort au « resume ».
  const garde = etatDesGardeFous(base);
  const disjoncteur: Attente[] =
    garde.breakerOpenedAt === null ? [] : [{ ticket: null, title: null, since: garde.breakerOpenedAt, quoi: "disjoncteur", echecs: echecsDuDisjoncteur(base), seuil: garde.breakerThreshold }];

  // Ce qui attend un tiers n'attend pas le chef, quoi qu'il attendait avant.
  const enWaiting = (attente: Attente) => attente.ticket !== null && tickets.get(attente.ticket)?.waitingFor != null;
  return [...disjoncteur, ...baseRouge, ...setup, ...aside, ...versions, ...connexions, ...session, ...fermeture, ...livraisons, ...bloques, ...repris, ...refuses, ...sansStation, ...sansPresence, ...attentesDuManager(base, tickets)]
    .filter((attente) => !enWaiting(attente))
    .sort((a, b) => a.since.localeCompare(b.since) || (a.ticket ?? 0) - (b.ticket ?? 0));
}

// Ce que le ticket attendait d'un tiers, à sa dernière mise en attente.
function derniereAttente(base: Base, ticket: number): { what: string; who: string } | null {
  const [ligne] = base.lire<{ what: unknown; who: unknown }>(
    "SELECT json_extract(payload, '$.what') AS what, json_extract(payload, '$.who') AS who FROM events WHERE ticket = ? AND type = 'ticket.waiting' ORDER BY seq DESC LIMIT 1",
    ticket,
  );
  return typeof ligne?.what === "string" && typeof ligne.who === "string" ? { what: ligne.what, who: ligne.who } : null;
}

// Ce qui échoue sur la base rouge : ce que ses gates nommaient au dernier
// contrôle joué — à défaut, ce que la réparation avait reçu à son ouverture.
function echecsDuRouge(base: Base, aLOuverture: string[]): string[] {
  const gates = gatesDuRouge(base);
  return gates === null ? aLOuverture : echecsDesGates(gates);
}

const court = (commit: string) => commit.slice(0, 12);

// Ce qu'est devenue la réparation, sur la ligne de la base rouge.
const ECHECS_DE_REPARATION: Record<EchecDeReparation, string> = {
  partie: "a quitté le rail sans être servie",
  remontee: "est remontée sans être servie",
  "rouge-apres-merge": "mergée, ne l'a pas remise au vert",
};

// Comment relancer une réparation qui n'a pas été servie : rendue au rail, elle
// travaille de nouveau, et la base n'attend plus. Mergée, elle ne se relance pas.
const RELANCES: Record<EchecDeReparation, string | null> = {
  partie: "lui reposer `fire`, son issue rouverte s'il le faut",
  remontee: "retirer et reposer `fire`",
  "rouge-apres-merge": null,
};

// La base rouge dont la réparation a échoué : ce qui échoue, ce qu'il est
// advenu de sa réparation, puis le geste. Dans tous les cas, la corriger à la
// main fait repartir la cuisine.
function direBaseRouge(attente: Extract<Attente, { quoi: "base" }>): string {
  const relance = RELANCES[attente.echec];
  const relancer = relance === null ? "" : `, ou relancer #${attente.reparation} : ${relance}`;
  return `BASE ROUGE sur ${attente.sha.slice(0, 7)}, en échec : ${attente.echecs.join(" ; ")} — sa réparation #${attente.reparation} ${ECHECS_DE_REPARATION[attente.echec]} — à réparer : corriger la base à la main${relancer} ; la pass la rejoue dès qu'elle bouge, et la cuisine repart seule au vert ; un rouge qui ne tient pas au code se rejoue : \`${REJOUER_LA_BASE}\``;
}

// Un hôte refusé, tel qu'il se déclare : la porte le note avec son port, que
// la déclaration ne porte que hors de 443 et 80.
const aDeclarer = (hote: string) => hote.replace(/:(?:443|80)$/, "");

// Une cause de mise de côté répétée sur le projet : la cause en clair, puis le
// geste. La reprise est seule : la branche d'intégration qui bouge, ou une
// autre cause qui prend la place.
function direMiseDeCoteBloquee({ aside }: Extract<Attente, { quoi: "aside" }>): string {
  const cause = CAUSES_DU_PROJET[aside.reason];
  const vu = aside.ticket === null ? "" : ` — vue sur #${aside.ticket}`;
  return `tickets mis de côté : ${cause?.texte ?? aside.reason} (${aside.reason}, deux fois à l'identique${vu}) — un seul est repris à la fois, pour sonder — à faire : ${cause?.geste ?? "corriger la cause"} ; le projet reprend seul dès qu'un cook part, qu'une autre cause se présente ou que la branche d'intégration bouge`;
}

// Le disjoncteur ouvert : ce qui l'a ouvert, une ligne par échec — ticket,
// code de sortie, tours, tokens —, puis le geste qui le referme.
function direDisjoncteur({ echecs, seuil }: Extract<Attente, { quoi: "disjoncteur" }>): string {
  const lignes = echecs.map(({ ticket, code, turns, tokens }) => `${ticket === null ? "sans ticket" : `#${ticket}`} : sortie ${code ?? "sans code"}, ${turns ?? "?"} tours, ${tokens ?? "?"} tokens`);
  const cause = lignes.length === 0 ? "échecs d'affilée" : `${lignes.length} échec${lignes.length > 1 ? "s" : ""} d'affilée${seuil === null ? "" : ` (seuil ${seuil})`} — ${lignes.join(" ; ")}`;
  return `disjoncteur ouvert : ${cause} — plus aucun cook ne part — à faire : \`${REFERMER_LE_DISJONCTEUR}\` après avoir regardé ce qui échoue`;
}

// Le setup du projet bloqué : la cause, en clair, puis le geste. Un hôte que la
// porte a refusé pendant le setup se déclare ; sans hôte refusé, c'est le
// setup lui-même qui est à corriger — ce qu'il a dit est sur l'issue du ticket
// qui l'a vu échouer. Dans les deux cas, c'est un merge qui débloque.
function direSetupBloque({ setup }: Extract<Attente, { quoi: "setup" }>): string {
  const vu = setup.ticket === null ? "" : ` — ce qu'il a dit est sur #${setup.ticket}`;
  const reprise = `les setups reprennent seuls dès que la branche d'intégration bouge ; d'ici là, aucun n'est lancé, pour aucun ticket`;
  if (setup.hosts.length > 0) {
    const hotes = [...new Set(setup.hosts.map(aDeclarer))].map((hote) => `\`${hote}\``).join(", ");
    return `setup impossible : la porte refuse ${hotes} (\`${SCRIPT_SETUP}\`, ${setup.why}, deux fois à l'identique) — à déclarer dans \`${DECLARATION_RESEAU}\` du projet, une ligne par hôte, puis merger sur la branche d'intégration ; ${reprise}`;
  }
  return `setup impossible : \`${SCRIPT_SETUP}\` échoue deux fois à l'identique (${setup.why})${vu} — à corriger : le setup du projet, puis merger sur la branche d'intégration ; ${reprise}`;
}

// Le dernier essai raté, à la suite de ce que la ligne dit de la version.
function direService(service: GesteRendu, projet: string): string {
  return service.seul ? direEssaiRate(service) : direIssue(service, projet);
}

// Ce qu'une entrée porte sous sa ligne, en retrait d'elle : les dernières
// lignes du geste de box d'une mise en service qui a échoué. Rien pour les
// autres.
function suiteDeLAttente(attente: Attente): string[] {
  if ((attente.quoi !== "version" && attente.quoi !== "version-illisible") || attente.service === null) return [];
  return direFin(attente.service);
}

// Ce que la ligne `version` dit : un essai raté, et rien d'autre. Une version
// qui attend, ou dont l'essai tourne, n'est pas une décision du chef : le
// runtime l'essaie seul.
function direVersion(attente: Extract<Attente, { quoi: "version" }>): string {
  const { service } = attente;
  if (service.seul) return direService(service, attente.projet);
  return `une version attend : ${attente.branche} (${court(attente.tete)}) porte un runtime qui n'est pas en service — en service : ${court(attente.servie)}, en retard depuis le ${attente.since} ; ${attente.livraisons} livraison${attente.livraisons > 1 ? "s" : ""} non en service — ${direService(service, attente.projet)}`;
}

// Ce qui attend, puis le geste du chef qui le débloque — ou qu'il n'y en a pas
// de connu.
export function direAttente(attente: Attente): string {
  switch (attente.quoi) {
    case "version":
      return direVersion(attente);
    case "version-illisible":
      return `version non comparée à ${attente.branche ?? "son origine"} : ${attente.raison} — rien ne dit que la version en service (${court(attente.servie)}) est à jour ; la comparaison est reprise seule, toutes les ${CADENCE_DE_COMPARAISON_MS / 60_000} min${attente.service === null ? "" : ` — ${direService(attente.service, attente.projet)}`}`;
    case "merge": {
      const ou = attente.pr === null ? "" : ` : ${attente.pr}`;
      const accorder = ` — ou accorder le grant, pour les suivantes : \`${ACCORDER_LE_GRANT}\``;
      switch (attente.reason) {
        case SANS_GRANT:
          return `livraison verte, non mergée ${attente.expired === null ? "faute de grant `merge`" : `: le grant \`merge\` s'est éteint seul le ${attente.expired}`} — à merger à la main${ou}${accorder}`;
        case A_RELIRE: {
          const declarations = declarationsDeLaCause(attente.cause);
          return `livraison verte qui touche à ${declarations === null ? "ses juges" : `ce que le projet s'ouvre (${declarations})`} — à relire et merger à la main${ou}`;
        }
        case MERGE_REFUSE:
          return `livraison verte, merge refusé par GitHub (${attente.cause ?? "?"}) — à merger à la main, une fois levé ce qu'il refuse${ou}`;
        default:
          return `livraison verte, non mergée (${attente.reason}) — aucun geste connu pour ce motif${ou} — \`${geste(`pass ${attente.ticket}`)}\``;
      }
    }
    case "remontee": {
      const voir = `\`${geste(`pass ${attente.ticket}`)}\``;
      const sortir = attente.pr === null ? "retirer `fire`, ou fermer l'issue" : `merger ${attente.pr} à la main, ou retirer \`fire\``;
      const precise = attente.cause === null ? "" : ` : ${attente.cause}`;
      switch (attente.reason) {
        case ENCORE_ROUGE:
          return `${attente.cause === DU_MANAGER ? "remontée par le manager, rouge" : `remontée par la pass, rouge (${ENCORE_ROUGE}${precise})`} — à trancher : ${sortir} — ${voir}`;
        case NON_JUGEE:
          return `remontée par la pass, qui n'a pas pu la juger (${NON_JUGEE}${precise}) — à lever : ce que dit son issue, puis retirer et reposer \`fire\` ; ou ${sortir} — ${voir}`;
        default:
          return `remontée (${attente.reason}) — aucun geste connu pour ce motif — ${voir}`;
      }
    }
    case "fermee":
      return `PR fermée sans merge${attente.pr === null ? "" : ` : ${attente.pr}`} — à trancher : retirer \`fire\`, ou fermer l'issue — \`${geste(`pass ${attente.ticket}`)}\``;
    case "86":
      return GESTES_DE_STATION[attente.reason];
    case "capacite":
      return `${direManque(attente.manque)} — à fournir : ${gesteDeCapacite(attente.manque)}`;
    case "absente":
      return `${direStationAbsente(attente.stations)} — ${GESTE_DE_PRESENCE}`;
    case "bloque": {
      const numeros = attente.abandonnes.map(({ ticket }) => `#${ticket}`).join(", ");
      const abandons = attente.abandonnes.map(({ ticket, reason }) => `#${ticket} abandonné (${nomAbandon(reason)})`).join(", ");
      return `BLOQUÉ : ${abandons} — à débloquer : remettre ${numeros} sur le rail, ou ${attente.abandonnes.length > 1 ? "les" : "le"} retirer de la ligne \`attend\` de la fiche`;
    }
    case "ecartee":
      return GESTES_D_ECART[attente.reason];
    case "illisible":
      return attente.epique
        ? "découpage du manager illisible — à reprendre : modifier l'épique, il la redécoupe ; ou fermer l'issue"
        : "jugement du manager illisible — à reprendre : modifier l'issue, il la rejuge ; ou poser `fire`, `model:` et `effort:` à la main ; ou fermer l'issue";
    case "question":
      return "question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue";
    case "repris": {
      const attendait = attente.attendait === null ? "" : ` (il attendait ${attente.attendait.who} : « ${attente.attendait.what} »)`;
      return `revenu de WAITING, repris par le chef${attendait} — à trancher : \`${geste(`waiting arrived ${attente.ticket}`)}\` le renvoie en cuisine ; \`${geste(`waiting set ${attente.ticket} --what <ce qu'il attend> --from <qui>`)}\` le remet en attente ; ou retirer \`fire\``;
    }
    case "fermeture":
      return direDemandeDeFermeture(attente.demande, attente.retenue);
    case "connexion":
      return `connexion Max ${direDeconnexion(attente.reason)}${attente.reason === null ? "" : ` (${attente.reason})`} — à rétablir : ${GESTE_DE_CONNEXION}`;
    case "session":
      return direSession(attente);
    case "base":
      return direBaseRouge(attente);
    case "setup":
      return direSetupBloque(attente);
    case "aside":
      return direMiseDeCoteBloquee(attente);
    case "disjoncteur":
      return direDisjoncteur(attente);
  }
}

const ORIGINES = { renewed: "le dernier renouvellement réussi", written: "la dernière écriture des identifiants", reconnected: "la dernière reconnexion" } as const;
const heures = (secondes: number) => `${Math.round((secondes / 3600) * 10) / 10} h`.replace(".", ",");

// La session Max qui va tomber : pourquoi on le sait, quand, et le geste. Le
// renouvellement en échec dit sa nature et ce qu'il en a dit.
function direSession({ expires, origin, lifetimeS, failure }: Extract<Attente, { quoi: "session" }>): string {
  const echeance = expires === null || origin === null ? "échéance inconnue" : `échéance estimée le ${expires}, ${heures(lifetimeS)} après ${ORIGINES[origin.what]} (${origin.at})`;
  return failure === null
    ? `session Max près de son échéance — ${echeance} — à faire avant : ${GESTE_DE_CONNEXION}`
    : `renouvellement de la session Max en échec (${failure.nature}${failure.detail === null ? "" : ` : ${failure.detail}`}) — ${echeance} — à rétablir : ${GESTE_DE_CONNEXION}`;
}

// Ce que le chef a fait des livraisons arrêtées faute de grant : de quoi
// décider de l'accorder. Rien tant qu'aucune ne l'a été.
export function direSansGrant({ arretees, mergees, parLaPass, refusees, ouvertes }: SansGrant): string | null {
  if (arretees === 0) return null;
  const s = (n: number) => (n > 1 ? "s" : "");
  const lachees = arretees - mergees - parLaPass - refusees - ouvertes;
  const suites = [
    `${mergees} mergée${s(mergees)} à la main`,
    `${refusees} fermée${s(refusees)} sans merge — ${refusees === 0 ? "aucun désaccord" : `${refusees} désaccord${s(refusees)}`} —`,
    `${ouvertes} encore ouverte${s(ouvertes)}`,
    ...(parLaPass === 0 ? [] : [`${parLaPass} mergée${s(parLaPass)} par la pass, le grant accordé depuis`]),
    ...(lachees === 0 ? [] : [`${lachees} plus suivie${s(lachees)}`]),
  ];
  return `sans grant, ${arretees} livraison${s(arretees)} verte${s(arretees)} arrêtée${s(arretees)} : ${suites.join(", ")}`;
}

// La ligne qui ferme le bloc `attend`, seule sur sa ligne : avec la ligne de
// tête, la seule à commencer par `attend`, elle en fait le bord. Un lecteur le
// présente à part sans rien lire de ce qu'il porte : tout ce qui est dedans est en retrait.
const FIN_ATTEND = "fin attend";
// Sous la ligne d'une entrée, ce qui la précise : plus en retrait qu'elle, donc
// jamais lu comme une entrée, ni comme un bord du bloc.
const RETRAIT_DE_SUITE = "      ";

// Ce qui nomme une entrée, en tête de sa ligne : son ticket, sa station,
// `session`, `fermeture`, `base`, `setup` ou `version`.
export const nommerAttente = (attente: Attente): string =>
  attente.ticket !== null
    ? `#${attente.ticket}`
    : attente.quoi === "connexion"
      ? attente.station
      : attente.quoi === "session" || attente.quoi === "fermeture" || attente.quoi === "base" || attente.quoi === "setup" || attente.quoi === "aside" || attente.quoi === "disjoncteur"
        ? attente.quoi
        : "version";

// Le bloc `attend` de l'état : le décompte, puis une ligne par décision — et,
// sous elle, plus en retrait, ce qui la précise —, puis le bilan des arrêts
// faute de grant, puis la version passée en service ce jour. Il est toujours
// là, entre les mêmes bords : la file vide, il le dit — un silence ne se
// distinguerait pas d'une lecture ratée —, et ne porte rien d'autre que la
// version passée en service. Ni l'un ni l'autre ne compte pour une décision.
export function decrireAttentes(attentes: Attente[], depuis: (instant: string) => string, sansGrant: SansGrant | null = null, passage: Passage | null = null): string[] {
  const [premiere] = attentes;
  const passee = passage === null ? [] : [`  ${direPassage(passage.servie, passage.le)}`];
  if (premiere === undefined) return [`${"attend".padEnd(11)}rien n'attend le chef`, ...passee, FIN_ATTEND, ""];
  const tete = attentes.length === 1 ? `1 décision attend le chef depuis ${depuis(premiere.since)}` : `${attentes.length} décisions attendent le chef — la plus ancienne depuis ${depuis(premiere.since)}`;
  return [
    `${"attend".padEnd(11)}${tete}`,
    ...attentes.flatMap((attente) => [
      `  ${nommerAttente(attente)}  depuis ${depuis(attente.since)}  ${direAttente(attente)}${attente.title === null ? "" : `  ${attente.title}`}`,
      ...suiteDeLAttente(attente).map((ligne) => `${RETRAIT_DE_SUITE}${ligne}`),
    ]),
    ...[sansGrant === null ? null : direSansGrant(sansGrant)].flatMap((bilan) => (bilan === null ? [] : [`  ${bilan}`])),
    ...passee,
    FIN_ATTEND,
    "",
  ];
}
