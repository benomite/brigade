// La file de ce qui attend le chef : tout ce qui ne bougera plus sans une
// décision de lui, avec depuis quand. Rien n'est tenu ici : chaque entrée se
// relit du rail, de la pass et des relevés du manager, donc du journal, et
// disparaît avec le fait qui dit la décision prise — un merge à la main
// constaté, un ticket sorti du rail ou rendu, une dépendance revenue, une issue
// rejugée ou fermée. Une PR fermée sans merge est une décision à moitié prise :
// son entrée change, et dit le geste qui reste.
// Le bloc est en anglais (docs/glossary.md, §2 et §4) : `awaiting` … `end
// awaiting`, et chacune de ses lignes. Une phrase empruntée à un autre module y
// est prise sous sa forme anglaise (`…En`), celui-ci gardant la française pour
// les sorties que rien n'a encore traduites.
// La station mise à jour seule n'attend rien du chef, mais le bloc le dit le
// jour même, sur une ligne à lui : « switched to version X at 14:02 », et de
// même son retour en arrière quand la version n'a pas démarré.
// La passe de fermeture que le chef a demandée y est tant qu'elle attend sa
// condition d'exécution : depuis quand, ce qui la retient — et, passé deux
// heuresEn, qu'elle est sans issue. Elle en sort partie, refusée ou retirée.
// La session Max y est annoncée avant de tomber : quand son échéance estimée
// approche, ou dès que son renouvellement échoue — elle en sort au
// renouvellement réussi suivant, ou à la reconnexion du chef.
// Le jeton longue durée de la connexion Max y est annoncé des semaines avant
// son échéance — ou dès que sa date de création ne se lit pas —, une seule
// fois, avec le seul geste à faire : refaire le jeton. Il en sort quand le
// jeton refait porte une date neuve.
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
// Une carte typée qui a passé la porte de TODO (carte-todo.ts) y est, avec sa
// sorte, sa question et ses choix, tant qu'elle n'en est pas sortie.
// La pause du renommage du code (pause/pause.ts) y entre par sa carte : la
// durée attendue, les tickets en vol qu'elle retiendra, le « oui » ou le
// « non ». Acceptée, elle n'attend plus le chef : le bloc la dit en une ligne
// à elle, « paused for the code rename », qui nomme les tickets qui finissent
// leur travail et ceux qui sont retenus, jusqu'à sa fin. Un renommage qui
// échoue dans sa pause (pause/renommage.ts) y laisse une carte qui dit
// pourquoi, jusqu'à ce que le chef l'ôte.
import type { Base } from "./base.ts";
import { geste } from "./geste.ts";
import { absentesDuMotif, CLE_DES_CAPACITES, direManque, direManqueEn, direStationAbsente, direStationAbsenteEn, GESTE_DE_PRESENCE, GESTE_DE_PRESENCE_EN, gesteDeCapacite, gesteDeCapaciteEn, manqueDuMotif, type Manque } from "./capacites.ts";
import { A_RELIRE, declarationsDeLaCause, DU_MANAGER, ENCORE_ROUGE, MERGE_REFUSE, NON_JUGEE, REDECOUPE, SANS_GRANT, testsInstablesDeLaCause } from "./events/pass.ts";
import { REJOUER_LA_BASE } from "./dire-base.ts";
import { demandeEnAttente, refus, reglagesEnVigueur, type Demande as DemandeDeFermeture, type Refus } from "./closing/condition.ts";
import { direDemande as direDemandeDeFermeture, direDemandeEn as direDemandeDeFermetureEn } from "./closing/say.ts";
import type { Ecart } from "./events/manager.ts";
import { epiquesEnAttente } from "./projections/splits.ts";
import { issuesEnAttente, managerAllume, plusUneEpiqueDepuis } from "./projections/manager.ts";
import { miseAJourDuJour } from "./mise-a-jour/relais.ts";
import { etatDeLaBase, gatesDuRouge, lirePass, reparationDeLaBase, type EchecDeReparation, type PassDeTicket, type SansGrant } from "./projections/pass.ts";
import { feuNonVu, type TicketRail } from "./projections/rail.ts";
import { alerteDeSession, type AlerteDeSession } from "./projections/renewal.ts";
import { alerteDuJeton, type AlerteDuJeton } from "./projections/token.ts";
import { direDeconnexion, direDeconnexionEn, etatStation, GESTE_DE_CONNEXION, GESTE_DE_CONNEXION_EN, GESTE_DE_CONNEXION_TOMBEE, GESTE_DE_CONNEXION_TOMBEE_EN, miseDeCoteBloquee, setupBloque, stationsDeconnectees, type MiseDeCoteBloquee, type SetupBloque } from "./projections/stations.ts";
import { echecsDuDisjoncteur, etatDesGardeFous, type EchecDuDisjoncteur } from "./projections/guardrails.ts";
import { nomAbandon, nomAbandonEn, retenue } from "./rail.ts";
import { echecsDesGates } from "./reparation.ts";
import { DECLARATION_RESEAU } from "./reseau.ts";
import { SCRIPT_SETUP } from "./gates.ts";
import { CAUSES_DU_PROJET } from "./mise-de-cote.ts";
import { REVENU_D_ATTENTE } from "./events/rail.ts";
import { cartesEnTodo, direCarte, direCarteEn, type CarteDeTodo } from "./carte-todo.ts";
import type { EnVol } from "./pause/evenements.ts";
import { echecDuRenommage, EN_PAUSE_POUR_LE_RENOMMAGE, NON, OUI, pauseAccordee, pauseEnCours, ticketsEnVol } from "./pause/pause.ts";
import { INTRANSPOSABLE, pourquoiIntransposable } from "./pause/reprise.ts";

// Ce que le chef lit de la livraison qui l'attend, tel que la pass l'a consigné :
// `resume`, celui de la relecture ; `constat`, le premier constat bloquant (celui
// du reviewer, sinon le premier de ce qui a rougi le verdict) ; `juges`, les
// fichiers de ses juges qu'elle change, avec leurs lignes ajoutées et retirées.
// Une clé n'y est que si la pass l'a consignée.
export type Livraison = { resume?: string; constat?: string; juges?: Array<{ fichier: string; ajoutees: number; retirees: number }> };

function livraisonDe(base: Base, pass: PassDeTicket): Livraison | undefined {
  const resume = pass.review?.summary ?? undefined;
  const constat = pass.review?.findings.find(({ severity }) => severity === "blocking")?.text ?? pass.findings[0];
  const verdict = pass.verdictSeq === null ? undefined : base.lire<{ payload: string }>("SELECT payload FROM events WHERE seq = ?", pass.verdictSeq)[0];
  const consignes: unknown = verdict === undefined ? undefined : (JSON.parse(verdict.payload) as { judges?: unknown }).judges;
  const juges = Array.isArray(consignes)
    ? consignes.flatMap((j: { file?: unknown; added?: unknown; removed?: unknown }) =>
        typeof j?.file === "string" ? [{ fichier: j.file, ajoutees: Number(j.added) || 0, retirees: Number(j.removed) || 0 }] : [],
      )
    : [];
  const livraison: Livraison = { ...(resume ? { resume } : {}), ...(constat ? { constat } : {}), ...(juges.length > 0 ? { juges } : {}) };
  return Object.keys(livraison).length === 0 ? undefined : livraison;
}

// `title` : nul pour une issue qui n'est pas sur le rail — le journal ne
// connaît pas son titre.
export type AttenteDeTicket = { ticket: number; title: string | null; since: string } & (
  // Une livraison verte que la pass ne merge pas elle-même. `reason` : le
  // motif, `cause` : ce qui le précise. `expired` : faute d'un grant qui
  // s'était éteint seul à cet instant.
  | { quoi: "merge"; reason: string; cause: string | null; pr: string | null; expired: string | null; livraison?: Livraison }
  // Un ticket que la pass ou le manager a remonté : il est 86, sans retour.
  // `why` : pourquoi sa livraison ne se porte pas sur l'arbre d'un renommage
  // du code mergé, quand c'est ce qui l'a remonté (pause/reprise.ts).
  | { quoi: "remontee"; reason: string; cause: string | null; pr: string | null; livraison?: Livraison; why?: string; nonVu?: string }
  // Une livraison dont la PR a été fermée sans merge : son ticket tient encore
  // sa place sur le rail. `reason` : ce qu'elle était — arrêtée, remontée.
  | { quoi: "fermee"; reason: string; cause: string | null; pr: string | null; livraison?: Livraison }
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
  // Une carte typée entrée par la porte de TODO : sa sorte, sa question, ses
  // choix, ses captures (carte-todo.ts).
  | { quoi: "carte"; carte: CarteDeTodo }
);

// La dernière version passée en service par la mise à jour de la station, et
// quand, dite en une ligne (« switched to version X at 14:02 », ou son retour en
// arrière) — tant qu'elle date de moins d'un jour à `maintenant`. Nulle sinon.
export type Passage = { le: string; ligne: string };
export function passageEnService(base: Base, maintenant = new Date()): Passage | null {
  return miseAJourDuJour(base, maintenant);
}

// Ce qui attend le chef sans être à un ticket.
type AttenteHorsTicket = { ticket: null; title: null; since: string } & (
  // Une station dont la connexion Max manque : elle retient tous les tickets.
  | { quoi: "connexion"; station: string; reason: string | null }
  // La session Max n'est pas encore tombée, mais elle va le faire : son
  // échéance estimée approche, ou son renouvellement a échoué.
  | ({ quoi: "session" } & Omit<AlerteDeSession, "since">)
  // Le jeton longue durée de la connexion Max approche de son échéance, est
  // échu, ou sa date de création ne se lit pas.
  | ({ quoi: "jeton" } & Omit<AlerteDuJeton, "since">)
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
  // La carte du renommage du code, qui demande la pause : `minutes`, la durée
  // attendue ; `enVol`, les tickets que la pause retiendra, lus à l'instant ;
  // `renommage`, son ticket, nul s'il n'en est pas un. `since` : la demande.
  | { quoi: "pause"; minutes: number; enVol: EnVol[]; renommage: number | null }
  // Le renommage du code a échoué dans sa pause : rien n'est mergé, la cuisine
  // est repartie seule. `why` : pourquoi, tel que la levée de la pause le dit ;
  // `pr` : sa PR restée sans merge, s'il en a ouvert une. `since` : la levée.
  | { quoi: "renommage"; why: string; pr: string | null }
);

export type Attente = AttenteDeTicket | AttenteHorsTicket;

export const REFERMER_LE_DISJONCTEUR = geste("guardrails resume");
export const ACCORDER_LE_GRANT = geste("grant enable merge");

// Les 86 que la station pose sans heure de retour, et ce qu'elle attend du chef
// pour chacun. Les deux premiers reviennent en attente seuls, une fois corrigés.
const GESTES_DE_STATION_EN = {
  "no-calibration": "no calibration — to calibrate: set `model:` and `effort:` on the issue, it starts again on its own",
  "unreadable-card": "unreadable card — to fix: the issue's card, it starts again on its own",
  refused: "refused three times by the model — to decide: rephrase or recalibrate, then remove and set `fire` again; or remove `fire`",
} as const;
type MotifDeStation = keyof typeof GESTES_DE_STATION_EN;
const deStation = (motif: string | null): motif is MotifDeStation => motif !== null && Object.hasOwn(GESTES_DE_STATION_EN, motif);

// Les écarts qui attendent le chef, et ce qu'il a à faire de chacun. Les autres
// — la roadmap, l'issue d'un inconnu — n'attendent personne.
const GESTES_D_ECART_EN = {
  question: "set aside by the manager, it carries `question` — to decide: answer it then remove the label, the manager judges it; or close the issue",
  decision: "set aside by the manager, it carries `decision` — to decide: decide then remove the label, the manager judges it; or close the issue",
  "blocked-on-human": "held back, it carries `blocked-on-human` — to lift: remove the label, the manager judges it; or close the issue",
} as const satisfies Partial<Record<Ecart, string>>;
type EcartQuiAttend = keyof typeof GESTES_D_ECART_EN;
const ecartQuiAttend = (motif: string): motif is EcartQuiAttend => Object.hasOwn(GESTES_D_ECART_EN, motif);

// Ce que le manager attend du chef : les issues qu'il a écartées parce
// qu'elles sont à lui, ses jugements et ses découpages illisibles, les
// questions qu'il pose sur une épique. Une issue fermée n'attend plus ; une
// issue sur le rail est lancée, et ce qui l'y retient se lit du rail.
function attentesDuManager(base: Base, tickets: Map<number, TicketRail>): AttenteDeTicket[] {
  // Une issue retenue dont la carte parle au chef : l'écart nu ferait doublon.
  const avecCarte = new Set(cartesEnTodo(base).map((carte) => carte.ticket));
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
    else if (ecartQuiAttend(reason) && !avecCarte.has(ticket)) parIssue.set(ticket, { ticket, title: null, since: at, quoi: "ecartee", reason });
  }
  return [...parIssue.values()].filter(({ ticket }) => !tickets.has(ticket));
}

// Ce qui attend le chef, le plus ancien d'abord. `rail` : le rail tel que lu ;
// `maintenant` : l'heure à laquelle l'échéance de la session se compte.
export function attentesDuChef(base: Base, rail: TicketRail[], maintenant = new Date()): Attente[] {
  const tickets = new Map(rail.map((ticket) => [ticket.ticket, ticket]));
  const instant = (seq: number) => base.lire<{ at: string }>("SELECT at FROM events WHERE seq = ?", seq)[0]?.at;

  // Le manager qui remonte un ticket rouge avec une carte : la carte parle au
  // chef, la remontée nue ferait doublon.
  const avecCarte = new Set(cartesEnTodo(base).map((carte) => carte.ticket));
  const livraisons = lirePass(base).flatMap((pass): AttenteDeTicket[] => {
    const ticket = tickets.get(pass.ticket);
    if (!ticket) return [];
    const livraison = livraisonDe(base, pass);
    const commun = { ticket: pass.ticket, title: ticket.title, since: pass.since, reason: pass.reason ?? "", cause: pass.cause, pr: pass.pr, ...(livraison === undefined ? {} : { livraison }) };
    // Revenu de WAITING après avoir été rendu au rail, sa pass d'avant ne dit
    // plus rien de lui : son entrée est celle du retour.
    if (ticket.reason === REVENU_D_ATTENTE && pass.phase !== "held") return [];
    if (pass.phase === "held") return [{ ...commun, quoi: "merge", expired: pass.grantExpired }];
    // Rendu au rail par le chef, le ticket n'est plus 86 : sa pass garde sa
    // phase jusqu'au cook suivant, mais plus rien n'attend. Redécoupé, il
    // n'attend personne : ses sous-tickets portent le travail.
    if (pass.phase === "escalated" && ticket.state === "86" && pass.reason !== REDECOUPE) {
      if (pass.cause === DU_MANAGER && avecCarte.has(pass.ticket)) return [];
      const why = pass.cause === INTRANSPOSABLE ? pourquoiIntransposable(base, pass.ticket) : null;
      const nonVu = feuNonVu(base, pass.ticket);
      return [{ ...commun, quoi: "remontee", ...(why === null ? {} : { why }), ...(nonVu === null ? {} : { nonVu }) }];
    }
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
  // Le manager le reprend avant le chef (sans-capacite.ts) : il le réécrit, ou
  // propose une carte `gesture` au triage. Le chef ne le voit tel quel que si le manager est
  // éteint — personne d'autre ne le reprendrait.
  const manager = managerAllume(base);
  const sansStation = rail.flatMap((ticket): AttenteDeTicket[] => {
    const manque = !manager && ticket.state === "86" && ticket.until === null ? manqueDuMotif(ticket.reason) : null;
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

  const echeance = alerteDuJeton(base, maintenant);
  const jeton: Attente[] = echeance === null ? [] : [{ ticket: null, title: null, quoi: "jeton", ...echeance }];

  const demande = demandeEnAttente(base);
  const fermeture: Attente[] = demande === null ? [] : [{ ticket: null, title: null, since: demande.since, quoi: "fermeture", demande, retenue: refus(base, reglagesEnVigueur(base), false) }];

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
  const setup: Attente[] = bloque === null ? [] : [{ ticket: null, title: null, since: bloque.since, quoi: "setup", setup: { why: bloque.why, hosts: bloque.hosts, base: bloque.base, ticket: bloque.ticket, station: bloque.station, output: bloque.output } }];

  const ecartee = miseDeCoteBloquee(base);
  const aside: Attente[] = ecartee === null ? [] : [{ ticket: null, title: null, since: ecartee.since, quoi: "aside", aside: { reason: ecartee.reason, base: ecartee.base, ticket: ecartee.ticket, station: ecartee.station } }];

  // Ouvert, le disjoncteur retient toute la cuisine ; il en sort au « resume ».
  const garde = etatDesGardeFous(base);
  const disjoncteur: Attente[] =
    garde.breakerOpenedAt === null ? [] : [{ ticket: null, title: null, since: garde.breakerOpenedAt, quoi: "disjoncteur", echecs: echecsDuDisjoncteur(base), seuil: garde.breakerThreshold }];

  const cartes = cartesEnTodo(base).map(({ ticket, since, ...carte }): AttenteDeTicket => ({ ticket, title: tickets.get(ticket)?.title ?? null, since, quoi: "carte", carte }));

  // La pause du renommage attend le « oui » du chef ; acceptée, elle n'attend
  // plus personne (`pauseDeLaCuisine`).
  const enCours = pauseEnCours(base);
  const pause: Attente[] =
    enCours === null || enCours.agreedAt !== null
      ? []
      : [{ ticket: null, title: null, since: enCours.since, quoi: "pause", minutes: enCours.minutes, enVol: ticketsEnVol(rail, enCours.ticket), renommage: enCours.ticket }];
  // Le renommage échoué dit pourquoi, jusqu'à ce que le chef l'ait lu.
  const echec = echecDuRenommage(base);
  const renommage: Attente[] = echec === null ? [] : [{ ticket: null, title: null, since: echec.at, quoi: "renommage", why: echec.why, pr: echec.pr }];

  // Ce qui attend un tiers n'attend pas le chef, quoi qu'il attendait avant.
  const enWaiting = (attente: Attente) => attente.ticket !== null && tickets.get(attente.ticket)?.waitingFor != null;
  return [...disjoncteur, ...pause, ...renommage, ...baseRouge, ...setup, ...aside, ...connexions, ...session, ...jeton, ...fermeture, ...livraisons, ...bloques, ...repris, ...refuses, ...sansStation, ...sansPresence, ...attentesDuManager(base, tickets), ...cartes]
    .filter((attente) => !enWaiting(attente))
    .sort((a, b) => a.since.localeCompare(b.since) || (a.ticket ?? 0) - (b.ticket ?? 0));
}

// Les gestes du chef sur la pause du renommage : le « oui », le « non » — qui,
// la pause acceptée, la lève.
export const ACCEPTER_LA_PAUSE = geste(`guardrails pause ${OUI}`);
export const REFUSER_LA_PAUSE = geste(`guardrails pause ${NON}`);

// Ce que la pause fera de chaque ticket en vol : pris, son cook finit son
// travail, puis sa livraison attend ; en pass, son merge attend.
const ticketsRetenusEn = (enVol: EnVol[]) =>
  enVol.length === 0
    ? "no ticket in flight"
    : `in flight, held: ${enVol.map(({ ticket, state }) => `#${ticket} (${state === "taken" ? "taken: its cook finishes its work, then its delivery waits" : "in pass: its merge waits"})`).join(", ")}`;
const ticketsRetenus = (enVol: EnVol[]) =>
  enVol.length === 0
    ? "aucun ticket en vol"
    : `en vol, retenus : ${enVol.map(({ ticket, state }) => `#${ticket} (${state === "taken" ? "pris : son cook finit son travail, puis sa livraison attend" : "en pass : son merge attend"})`).join(", ")}`;

// La carte du renommage : combien de temps, ce qui est retenu, et les deux
// réponses.
function direDemandeDePauseEn({ minutes, enVol, renommage }: Extract<Attente, { quoi: "pause" }>): string {
  const sauf = renommage === null ? "" : ` but #${renommage}'s`;
  return `the code rename asks to pause the kitchen for about ${minutes} min — no merge${sauf}, no new cook until it ends — ${ticketsRetenusEn(enVol)} — to agree: \`${ACCEPTER_LA_PAUSE}\`; to decline: \`${REFUSER_LA_PAUSE}\``;
}
function direDemandeDePause({ minutes, enVol, renommage }: Extract<Attente, { quoi: "pause" }>): string {
  const sauf = renommage === null ? "" : ` que celui de #${renommage}`;
  return `le renommage du code demande de mettre la cuisine en pause pendant environ ${minutes} min — aucun merge${sauf}, aucun cook neuf jusqu'à sa fin — ${ticketsRetenus(enVol)} — pour accepter : \`${ACCEPTER_LA_PAUSE}\` ; pour refuser : \`${REFUSER_LA_PAUSE}\``;
}

// La carte du renommage échoué : pourquoi, ce qu'il reste — rien de mergé, sa
// PR ouverte s'il en a une —, et le geste qui l'ôte de la file.
function direEchecDuRenommageEn({ why, pr }: Extract<Attente, { quoi: "renommage" }>): string {
  const reste = pr === null ? "" : ` — its PR stays open, unmerged, to close: ${pr}`;
  return `the code rename failed: ${why} — nothing was merged, the kitchen went on by itself${reste} — once read: \`${REFUSER_LA_PAUSE}\``;
}
function direEchecDuRenommage({ why, pr }: Extract<Attente, { quoi: "renommage" }>): string {
  const reste = pr === null ? "" : ` — sa PR reste ouverte, sans merge, à fermer : ${pr}`;
  return `le renommage du code a échoué : ${why} — rien n'est mergé, la cuisine est repartie seule${reste} — une fois lu : \`${REFUSER_LA_PAUSE}\``;
}

// La pause acceptée, qui tient : depuis le « oui » (`since`), la durée
// attendue, les tickets dont le cook finit son travail (`finissent`) et ceux
// dont la livraison est retenue (`retenus`), lus à l'instant.
export type PauseEnVigueur = { since: string; minutes: number; renommage: number | null; finissent: number[]; retenus: number[] };

export function pauseDeLaCuisine(base: Base, rail: readonly TicketRail[]): PauseEnVigueur | null {
  const pause = pauseAccordee(base);
  if (pause === null) return null;
  const enVol = ticketsEnVol(rail, pause.ticket);
  const de = (etat: EnVol["state"]) => enVol.flatMap(({ ticket, state }) => (state === etat ? [ticket] : []));
  return { since: pause.agreedAt, minutes: pause.minutes, renommage: pause.ticket, finissent: de("taken"), retenus: de("pass") };
}

// La ligne de la pause dans le bloc `awaiting` : une seule, qui commence par
// ce que la cuisine fait.
export function direPauseEn({ since, minutes, finissent, retenus }: PauseEnVigueur, depuis: (instant: string) => string): string {
  const numeros = (tickets: number[]) => (tickets.length === 0 ? "none" : tickets.map((ticket) => `#${ticket}`).join(", "));
  return `${EN_PAUSE_POUR_LE_RENOMMAGE} — for ${depuis(since)}, expected about ${minutes} min — finishing their work: ${numeros(finissent)} · held: ${numeros(retenus)} — to end it now: \`${REFUSER_LA_PAUSE}\``;
}

// La cuisine au repos parce que le reste du rail attend une capacité qu'aucune
// station ne fournit : plus rien n'est pris ni en pass, aucun ticket en attente
// ne peut partir, et des tickets sont mis de côté `no-station` sans être dans
// la file — le manager allumé les reprend avant le chef (sans-capacite.ts), et
// tant qu'il n'a rien posé, le bloc dirait « nothing awaits the chef » sans
// plus. `sansStation` : ces tickets, chacun avec ce qui lui manque ;
// `derriere` : les tickets en attente que leur fiche retient derrière eux, en
// suivant `awaits` de proche en proche — un ticket qui en attend un autre, sans
// lien avec eux, n'y est pas. Ce n'est pas une décision : rien n'entre dans la
// file, et la tête du bloc ne change pas. Nul dès qu'un ticket peut encore cuire.
export type ReposSansStation = { sansStation: Array<{ ticket: number; manque: Manque }>; derriere: number[] };

export function reposSansStation(rail: readonly TicketRail[], attentes: readonly Attente[]): ReposSansStation | null {
  // Peut encore cuire : un ticket pris ou en pass, un ticket en attente que sa
  // fiche ne retient pas, ou un 86 qui revient seul à son heure.
  const cuit = rail.some(({ state, awaits, until }) => state === "taken" || state === "pass" || (state === "waiting" && awaits.length === 0) || (state === "86" && until !== null));
  if (cuit) return null;
  const dansLaFile = new Set(attentes.flatMap(({ ticket }) => (ticket === null ? [] : [ticket])));
  const sansStation = rail.flatMap(({ ticket, state, until, reason }) => {
    const manque = state === "86" && until === null ? manqueDuMotif(reason) : null;
    return manque === null || dansLaFile.has(ticket) ? [] : [{ ticket, manque }];
  });
  if (sansStation.length === 0) return null;
  const retenus = new Set(sansStation.map(({ ticket }) => ticket));
  for (let encore = true; encore; ) {
    encore = false;
    for (const { ticket, state, awaits } of rail) {
      if (state !== "waiting" || retenus.has(ticket) || !awaits.some(({ ticket: attendu, left }) => left === null && retenus.has(attendu))) continue;
      retenus.add(ticket);
      encore = true;
    }
  }
  const derriere = rail.flatMap(({ ticket, state }) => (state === "waiting" && retenus.has(ticket) && !dansLaFile.has(ticket) ? [ticket] : []));
  return { sansStation, derriere };
}

// Sa ligne dans le bloc `awaiting`, une seule, qui commence par ce que fait la
// cuisine : ce qui manque et les tickets qui le demandent, ceux qui attendent
// derrière eux, puis le geste.
const CUISINE_AU_REPOS = "kitchen idle";
export function direReposSansStationEn({ sansStation, derriere }: ReposSansStation): string {
  const numeros = (tickets: readonly number[]) => tickets.map((ticket) => `#${ticket}`).join(", ");
  const parManque = new Map<string, number[]>();
  for (const { ticket, manque } of sansStation) {
    const noms = manque.capacites.map((nom) => `\`${nom}\``);
    const dit = manque.ensemble ? `${noms.join(" + ")} together` : noms.join(", ");
    parManque.set(dit, [...(parManque.get(dit) ?? []), ticket]);
  }
  const manques = [...parManque].map(([dit, tickets]) => `${dit} (${numeros(tickets)})`).join("; ");
  const capacites = new Set(sansStation.flatMap(({ manque }) => manque.capacites)).size > 1 ? "them" : "it";
  const [ceux, sa, les] = sansStation.length > 1 ? ["those tickets", "their cards", "them"] : ["this ticket", "its card", "it"];
  const enAttente = derriere.length === 0 ? "" : ` — waiting behind ${les}: ${numeros(derriere)}`;
  const aFaire = `attach a station that provides ${capacites}, or lower ${ceux} — remove ${capacites} from the \`${CLE_DES_CAPACITES}\` line of ${sa} — or close ${les}`;
  return `${CUISINE_AU_REPOS} — the rest of the rail needs a human: no station provides ${manques}${enAttente} — to unblock: ${aFaire}`;
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

// Ce qu'est devenue la réparation, sur la ligne de la base rouge.
const ECHECS_DE_REPARATION_EN: Record<EchecDeReparation, string> = {
  partie: "left the rail without being served",
  remontee: "was escalated without being served",
  "rouge-apres-merge": "merged, did not bring it back to green",
};

// Comment relancer une réparation qui n'a pas été servie : rendue au rail, elle
// travaille de nouveau, et la base n'attend plus. Mergée, elle ne se relance pas.
const RELANCES_EN: Record<EchecDeReparation, string | null> = {
  partie: "set `fire` on it again, its issue reopened if needed",
  remontee: "remove and set `fire` again",
  "rouge-apres-merge": null,
};

// La base rouge dont la réparation a échoué : ce qui échoue, ce qu'il est
// advenu de sa réparation, puis le geste. Dans tous les cas, la corriger à la
// main fait repartir la cuisine.
function direBaseRougeEn(attente: Extract<Attente, { quoi: "base" }>): string {
  const relance = RELANCES_EN[attente.echec];
  const relancer = relance === null ? "" : `, or restart #${attente.reparation}: ${relance}`;
  return `BASE RED on ${attente.sha.slice(0, 7)}, failing: ${attente.echecs.join("; ")} — its repair #${attente.reparation} ${ECHECS_DE_REPARATION_EN[attente.echec]} — to repair: fix the base by hand${relancer}; the pass replays it as soon as it moves, and the kitchen starts again on its own once green; a red that is not down to the code is replayed: \`${REJOUER_LA_BASE}\``;
}

// Un hôte refusé, tel qu'il se déclare : la porte le note avec son port, que
// la déclaration ne porte que hors de 443 et 80.
const aDeclarer = (hote: string) => hote.replace(/:(?:443|80)$/, "");

// Une cause de mise de côté répétée sur le projet : la cause en clair, puis le
// geste. La reprise est seule : la branche d'intégration qui bouge, ou une
// autre cause qui prend la place.
function direMiseDeCoteBloqueeEn({ aside }: Extract<Attente, { quoi: "aside" }>): string {
  const cause = CAUSES_DU_PROJET[aside.reason];
  const vu = aside.ticket === null ? "" : ` — seen on #${aside.ticket}`;
  return `tickets put aside: ${cause?.text ?? aside.reason} (${aside.reason}, twice identically${vu}) — only one is taken again at a time, to probe — to do: ${cause?.action ?? "fix the cause"}; the project starts again on its own as soon as a cook leaves, another cause shows up or the integration branch moves`;
}

// Le disjoncteur ouvert : ce qui l'a ouvert, une ligne par échec — ticket,
// code de sortie, tours, tokens —, puis le geste qui le referme.
function direDisjoncteurEn({ echecs, seuil }: Extract<Attente, { quoi: "disjoncteur" }>): string {
  const lignes = echecs.map(({ ticket, code, turns, tokens }) => `${ticket === null ? "no ticket" : `#${ticket}`}: exit ${code ?? "no code"}, ${turns ?? "?"} turns, ${tokens ?? "?"} tokens`);
  const cause = lignes.length === 0 ? "failures in a row" : `${lignes.length} failure${lignes.length > 1 ? "s" : ""} in a row${seuil === null ? "" : ` (threshold ${seuil})`} — ${lignes.join("; ")}`;
  return `breaker open: ${cause} — no cook leaves any more — to do: \`${REFERMER_LE_DISJONCTEUR}\` after looking at what fails`;
}

// Ce que le setup a dit à la fin, sur une ligne, borné : la fin de sa sortie,
// jamais le début. Rien s'il n'a rien dit.
export const FIN_DU_SETUP_MAX = 300;
function finDuSetup(sortie: string): string {
  const ligne = sortie.split("\n").map((brute) => brute.trim()).filter((brute) => brute !== "").join(" ⏎ ");
  if (ligne === "") return "";
  return ` : ${ligne.length > FIN_DU_SETUP_MAX ? `…${ligne.slice(-FIN_DU_SETUP_MAX)}` : ligne}`;
}

// Le setup du projet bloqué : la cause, en clair, puis le geste. Un hôte que la
// porte a refusé pendant le setup se déclare ; sans hôte refusé, c'est le
// setup lui-même qui est à corriger — ce qu'il a dit est sur l'issue du ticket
// qui l'a vu échouer. Dans les deux cas, c'est un merge qui débloque.
function direSetupBloqueEn({ setup }: Extract<Attente, { quoi: "setup" }>): string {
  const vu = setup.ticket === null ? "" : ` — what it said is on #${setup.ticket}`;
  const reprise = `setups start again on their own as soon as the integration branch moves; until then, none is launched, for any ticket`;
  if (setup.hosts.length > 0) {
    const hotes = [...new Set(setup.hosts.map(aDeclarer))].map((hote) => `\`${hote}\``).join(", ");
    return `setup impossible: the door refuses ${hotes} (\`${SCRIPT_SETUP}\`, ${setup.why}, twice identically) — to declare in the project's \`${DECLARATION_RESEAU}\`, one line per host, then merge into the integration branch; ${reprise}`;
  }
  return `setup impossible: \`${SCRIPT_SETUP}\` fails twice identically (${setup.why}${finDuSetup(setup.output)})${vu} — to fix: the project's setup, then merge into the integration branch; ${reprise}`;
}

// Ce qui attend, puis le geste du chef qui le débloque — ou qu'il n'y en a pas
// de connu. En anglais : c'est la ligne du bloc `awaiting`.
export function direAttenteEn(attente: Attente): string {
  switch (attente.quoi) {
    case "merge": {
      const ou = attente.pr === null ? "" : `: ${attente.pr}`;
      const accorder = ` — or enable the grant, for the next ones: \`${ACCORDER_LE_GRANT}\``;
      switch (attente.reason) {
        case SANS_GRANT:
          return `green delivery, not merged${attente.expired === null ? " for lack of a `merge` grant" : `: the \`merge\` grant lapsed on its own on ${attente.expired}`} — merge by hand${ou}${accorder}`;
        case A_RELIRE: {
          const declarations = declarationsDeLaCause(attente.cause);
          return `green delivery that touches ${declarations === null ? "its judges" : `what the project opens up (${declarations})`} — review and merge by hand${ou}`;
        }
        case MERGE_REFUSE:
          return `green delivery, merge refused by GitHub (${attente.cause ?? "?"}) — merge by hand, once what it refuses is lifted${ou}`;
        default:
          return `green delivery, not merged (${attente.reason}) — no known action for this reason${ou} — \`${geste(`pass ${attente.ticket}`)}\``;
      }
    }
    case "remontee": {
      const voir = `\`${geste(`pass ${attente.ticket}`)}\``;
      const sortir = attente.pr === null ? "remove `fire`, or close the issue" : `merge ${attente.pr} by hand, or remove \`fire\``;
      const dit = attente.nonVu === undefined ? "" : ` — the removal of \`fire\` on ${attente.nonVu} came before the hold and was not seen: remove it and set it again now`;
      const precise = attente.cause === null ? "" : `: ${attente.cause}`;
      if (attente.why !== undefined) return `held by the code rename and not resumed on the renamed tree: ${attente.why} — to decide: carry it by hand onto the renamed base and push its branch, then remove and set \`fire\` again; or ${sortir} — ${voir}${dit}`;
      switch (attente.reason) {
        case ENCORE_ROUGE:
          return `${attente.cause === DU_MANAGER ? "escalated by the manager, red" : `escalated by the pass, red (${ENCORE_ROUGE}${precise})`} — to decide: ${sortir} — ${voir}${dit}`;
        case NON_JUGEE: {
          const instables = testsInstablesDeLaCause(attente.cause);
          if (instables !== null) return `base unstable: delivery red on a test this change does not touch, twice (${instables}) — to lift: rerun that test on the base, then remove and set \`fire\` again; or ${sortir} — ${voir}${dit}`;
          return `escalated by the pass, which could not judge it (${NON_JUGEE}${precise}) — to lift: what its issue says, then remove and set \`fire\` again; or ${sortir} — ${voir}${dit}`;
        }
        default:
          return `escalated (${attente.reason}) — no known action for this reason — ${voir}${dit}`;
      }
    }
    case "fermee":
      return `PR closed without merge${attente.pr === null ? "" : `: ${attente.pr}`} — to decide: remove \`fire\`, or close the issue — \`${geste(`pass ${attente.ticket}`)}\``;
    case "86":
      return GESTES_DE_STATION_EN[attente.reason];
    case "capacite":
      return `${direManqueEn(attente.manque)} — to provide: ${gesteDeCapaciteEn(attente.manque)}`;
    case "absente":
      return `${direStationAbsenteEn(attente.stations)} — ${GESTE_DE_PRESENCE_EN}`;
    case "bloque": {
      const numeros = attente.abandonnes.map(({ ticket }) => `#${ticket}`).join(", ");
      const abandons = attente.abandonnes.map(({ ticket, reason }) => `#${ticket} dropped (${nomAbandonEn(reason)})`).join(", ");
      return `BLOCKED: ${abandons} — to unblock: put ${numeros} back on the rail, or remove ${attente.abandonnes.length > 1 ? "them" : "it"} from the \`attend\` line of the card`;
    }
    case "ecartee":
      return GESTES_D_ECART_EN[attente.reason];
    case "illisible":
      return attente.epique
        ? "manager's split unreadable — to redo: edit the epic, the manager splits it again; or close the issue"
        : "manager's judgment unreadable — to redo: edit the issue, the manager judges it again; or set `fire`, `model:` and `effort:` by hand; or close the issue";
    case "question":
      return "manager's question before splitting the epic — to answer: on the issue, the manager reads it again and splits it; or close the issue";
    case "repris": {
      const attendait = attente.attendait === null ? "" : ` (it was waiting for ${attente.attendait.who}: “${attente.attendait.what}”)`;
      return `back from WAITING, picked up again by the chef${attendait} — to decide: \`/brigade arrived #${attente.ticket}\` on the Kitchen board sends it back to the kitchen; \`${geste(`waiting set ${attente.ticket} --what <what it waits for> --from <who>`)}\` puts it back in WAITING; or remove \`fire\``;
    }
    case "carte":
      return direCarteEn(attente.carte);
    case "fermeture":
      return direDemandeDeFermetureEn(attente.demande, attente.retenue);
    case "connexion":
      return `Max connection ${direDeconnexionEn(attente.reason)}${attente.reason === null ? "" : ` (${attente.reason})`} — to restore: ${GESTE_DE_CONNEXION_TOMBEE_EN}`;
    case "session":
      return direSessionEn(attente);
    case "jeton":
      return direEcheanceDuJetonEn(attente);
    case "base":
      return direBaseRougeEn(attente);
    case "setup":
      return direSetupBloqueEn(attente);
    case "aside":
      return direMiseDeCoteBloqueeEn(attente);
    case "disjoncteur":
      return direDisjoncteurEn(attente);
    case "pause":
      return direDemandeDePauseEn(attente);
    case "renommage":
      return direEchecDuRenommageEn(attente);
  }
}

// Ce que le chef a à trancher pour un ticket, pour un programme (`faits`) : `quoi`, la sorte de
// l'attente — son mot ici, `merge`, `remontee`, `86`… ; `motif`, le sien quand la sorte en a un
// (`no-grant`, `still-red`, `refused`, `question`…) ; `cause`, ce qui le précise sans changer le
// geste ; `pr`, la PR de la livraison, nulle sans elle. Ce que la ligne du bloc dit en mots, ceci
// le dit en champs : le lecteur choisit ses mots, et les gestes qu'il pose. Une
// carte typée : `carte`, sa sorte pour motif (`product`, `design`), sa
// question pour ce qui la précise.
export type Decision = { quoi: AttenteDeTicket["quoi"]; motif: string | null; cause: string | null; pr: string | null };

export function decisionDe(attente: AttenteDeTicket): Decision {
  const { quoi } = attente;
  switch (attente.quoi) {
    case "merge":
    case "remontee":
    case "fermee":
      return { quoi, motif: attente.reason, cause: attente.cause, pr: attente.pr };
    case "86":
    case "ecartee":
      return { quoi, motif: attente.reason, cause: null, pr: null };
    case "illisible":
      return { quoi, motif: attente.epique ? "epic" : "issue", cause: null, pr: null };
    case "carte":
      return { quoi, motif: attente.carte.type, cause: attente.carte.question, pr: null };
    default:
      return { quoi, motif: null, cause: null, pr: null };
  }
}

const ORIGINES_EN = { renewed: "the last successful renewal", written: "the last write of the credentials", reconnected: "the last reconnection" } as const;
const heuresEn = (secondes: number) => `${Math.round((secondes / 3600) * 10) / 10} h`;

// La session Max qui va tomber : pourquoi on le sait, quand, et le geste. Le
// renouvellement en échec dit sa nature et ce qu'il en a dit.
function direSessionEn({ expires, origin, lifetimeS, failure }: Extract<Attente, { quoi: "session" }>): string {
  const echeance = expires === null || origin === null ? "expiry unknown" : `estimated expiry on ${expires}, ${heuresEn(lifetimeS)} after ${ORIGINES_EN[origin.what]} (${origin.at})`;
  return failure === null
    ? `Max session close to its expiry — ${echeance} — to do before then: ${GESTE_DE_CONNEXION_EN}`
    : `Max session renewal failing (${failure.nature}${failure.detail === null ? "" : `: ${failure.detail}`}) — ${echeance} — to restore: ${GESTE_DE_CONNEXION_EN}`;
}

// Le seul geste qui fait un jeton neuf : `claude setup-token` sous le compte
// du service, par l'étape de connexion Max — qui ne refait pas un jeton
// rangé, d'où le fichier à retirer d'abord. Le chemin, jamais la valeur.
const gesteDuJetonEn = (fichier: string) =>
  `remake the token — \`claude setup-token\` under the service account: delete ${fichier}, then run the Max connection step again (docs/installation-station.md, step 5); the station reads the new token and its date`;

// Le jeton longue durée qui va échoir, est échu, ou dont la date ne se lit
// pas : quand, ou pourquoi on ne le sait pas, puis le geste.
function direEcheanceDuJetonEn({ state, token, file, created, expires, lifetimeDays, reason }: Extract<Attente, { quoi: "jeton" }>): string {
  const vie = `${lifetimeDays} days after its creation (${created})`;
  if (state === "soon") return `Max connection token close to its expiry — it expires on ${expires}, ${vie} — to do before then: ${gesteDuJetonEn(token)}`;
  if (state === "expired") return `Max connection token EXPIRED since ${expires}, ${vie} — the \`claude\` processes launched no longer log in with it — to do: ${gesteDuJetonEn(token)}`;
  const pourquoi = { absent: "missing", unreadable: "unreadable", invalid: "not readable as a date" }[reason ?? "invalid"];
  return `Max connection token creation date ${pourquoi} (${file}) — its expiry is unknown: it lives ${lifetimeDays} days — to do: ${gesteDuJetonEn(token)}`;
}

// Ce que le chef a fait des livraisons arrêtées faute de grant : de quoi
// décider de l'accorder. Rien tant qu'aucune ne l'a été. En français : c'est
// ce que disent `grant` et `pass` — le bloc `awaiting` dit `direSansGrantEn`.
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

// Le même bilan, en anglais : la ligne `without a grant, …` du bloc `awaiting`.
export function direSansGrantEn({ arretees, mergees, parLaPass, refusees, ouvertes }: SansGrant): string | null {
  if (arretees === 0) return null;
  const s = (n: number) => (n > 1 ? "s" : "");
  const lachees = arretees - mergees - parLaPass - refusees - ouvertes;
  const suites = [
    `${mergees} merged by hand`,
    `${refusees} closed without merge — ${refusees === 0 ? "no disagreement" : `${refusees} disagreement${s(refusees)}`} —`,
    `${ouvertes} still open`,
    ...(parLaPass === 0 ? [] : [`${parLaPass} merged by the pass, the grant enabled since`]),
    ...(lachees === 0 ? [] : [`${lachees} no longer followed`]),
  ];
  return `without a grant, ${arretees} green deliver${arretees > 1 ? "ies" : "y"} stopped: ${suites.join(", ")}`;
}

// Les deux bords du bloc, seuls sur leur ligne : la ligne de tête, la seule de
// la sortie à commencer par `awaiting`, et celle qui le ferme. Un lecteur le
// présente à part sans rien lire de ce qu'il porte : tout ce qui est dedans est
// en retrait.
export const TETE_AWAITING = "awaiting";
export const FIN_AWAITING = "end awaiting";

// Ce qui nomme une entrée, en tête de sa ligne : son ticket, sa station,
// `session`, `jeton`, `fermeture`, `base`, `setup`, `aside`, `disjoncteur`, `pause`
// ou `renommage`. C'est aussi le nom que les faits donnent à la décision.
export const nommerAttente = (attente: Attente): string => (attente.ticket !== null ? `#${attente.ticket}` : attente.quoi === "connexion" ? attente.station : attente.quoi);

// Le même nom, tel que le bloc l'écrit : en anglais (docs/glossary.md, §2).
const NOMS_EN: Partial<Record<Attente["quoi"], string>> = { jeton: "token", fermeture: "closing", disjoncteur: "breaker", renommage: "rename" };
export const nommerEn = (attente: Attente): string => (attente.ticket === null ? (NOMS_EN[attente.quoi] ?? nommerAttente(attente)) : nommerAttente(attente));

// Le bloc `awaiting` de l'état : le décompte, puis une ligne par décision, puis le bilan des arrêts
// faute de grant, puis la version passée en service ce jour. Il est toujours
// là, entre les mêmes bords : la file vide, il le dit — un silence ne se
// distinguerait pas d'une lecture ratée —, et ne porte rien d'autre que la
// version passée en service. Ni l'un ni l'autre ne compte pour une décision.
// La cuisine au repos faute de station (`reposSansStation`) non plus : sa
// ligne vient sous la tête, après la pause.
// `depuis` : la durée écoulée depuis un instant, en anglais (`3 d`, `2 h 04`).
export function decrireAttentes(attentes: Attente[], depuis: (instant: string) => string, sansGrant: SansGrant | null = null, passage: Passage | null = null, pause: PauseEnVigueur | null = null, repos: ReposSansStation | null = null): string[] {
  const [premiere] = attentes;
  const passee = passage === null ? [] : [`  ${passage.ligne}`];
  // La pause acceptée n'est pas une décision : sa ligne vient sous la tête,
  // et ne compte pas.
  const enPause = pause === null ? [] : [`  ${direPauseEn(pause, depuis)}`];
  const auRepos = repos === null ? [] : [`  ${direReposSansStationEn(repos)}`];
  if (premiere === undefined) return [`${TETE_AWAITING.padEnd(11)}nothing awaits the chef`, ...enPause, ...auRepos, ...passee, FIN_AWAITING, ""];
  const tete = attentes.length === 1 ? `1 decision awaits the chef — for ${depuis(premiere.since)}` : `${attentes.length} decisions await the chef — the oldest for ${depuis(premiere.since)}`;
  return [
    `${TETE_AWAITING.padEnd(11)}${tete}`,
    ...enPause,
    ...auRepos,
    ...attentes.map((attente) => `  ${nommerEn(attente)}  for ${depuis(attente.since)}  ${direAttenteEn(attente)}${attente.title === null ? "" : `  ${attente.title}`}`),
    ...[sansGrant === null ? null : direSansGrantEn(sansGrant)].flatMap((bilan) => (bilan === null ? [] : [`  ${bilan}`])),
    ...passee,
    FIN_AWAITING,
    "",
  ];
}

// ——— Les mêmes phrases, en français ———
//
// Pour les sorties que rien n'a encore traduites : la ligne d'urgence de
// `status`, l'alerte d'urgence, `amont` et le geste des faits. Elles tombent
// avec le ticket qui traduit la dernière d'entre elles ; le bloc `awaiting` dit
// `direAttenteEn`.

// Les 86 que la station pose sans heure de retour, et ce qu'elle attend du chef
// pour chacun. Les deux premiers reviennent en attente seuls, une fois corrigés.
const GESTES_DE_STATION = {
  "no-calibration": "sans calibrage — à calibrer : poser `model:` et `effort:` sur l'issue, il repart seul",
  "unreadable-card": "fiche illisible — à corriger : la fiche de l'issue, il repart seul",
  refused: "refusé trois fois par le modèle — à trancher : reformuler ou recalibrer, puis retirer et reposer `fire` ; ou retirer `fire`",
} as const;

// Les écarts qui attendent le chef, et ce qu'il a à faire de chacun. Les autres
// — la roadmap, l'issue d'un inconnu — n'attendent personne.
const GESTES_D_ECART = {
  question: "écartée par le manager, elle porte `question` — à trancher : y répondre puis retirer le label, il la juge ; ou fermer l'issue",
  decision: "écartée par le manager, elle porte `decision` — à trancher : décider puis retirer le label, il la juge ; ou fermer l'issue",
  "blocked-on-human": "retenue, elle porte `blocked-on-human` — à lever : retirer le label, le manager la juge ; ou fermer l'issue",
} as const satisfies Partial<Record<Ecart, string>>;

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
  return `setup impossible : \`${SCRIPT_SETUP}\` échoue deux fois à l'identique (${setup.why}${finDuSetup(setup.output)})${vu} — à corriger : le setup du projet, puis merger sur la branche d'intégration ; ${reprise}`;
}

// Ce qui attend, puis le geste du chef qui le débloque — ou qu'il n'y en a pas
// de connu.
export function direAttente(attente: Attente): string {
  switch (attente.quoi) {
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
      const dit = attente.nonVu === undefined ? "" : ` — le retrait de \`fire\` du ${attente.nonVu} précède la retenue et n'a pas été vu : le retirer et le reposer maintenant`;
      const precise = attente.cause === null ? "" : ` : ${attente.cause}`;
      if (attente.why !== undefined) return `retenu par le renommage du code, et non repris sur l'arbre renommé : ${attente.why} — à trancher : la porter à la main sur la base et pousser sa branche, puis retirer et reposer \`fire\` ; ou ${sortir} — ${voir}${dit}`;
      switch (attente.reason) {
        case ENCORE_ROUGE:
          return `${attente.cause === DU_MANAGER ? "remontée par le manager, rouge" : `remontée par la pass, rouge (${ENCORE_ROUGE}${precise})`} — à trancher : ${sortir} — ${voir}${dit}`;
        case NON_JUGEE: {
          const instables = testsInstablesDeLaCause(attente.cause);
          if (instables !== null) return `base instable : livraison rouge sur un test que ce changement ne touche pas, deux fois (${instables}) — à lever : rejouer ce test sur la base, puis retirer et reposer \`fire\` ; ou ${sortir} — ${voir}${dit}`;
          return `remontée par la pass, qui n'a pas pu la juger (${NON_JUGEE}${precise}) — à lever : ce que dit son issue, puis retirer et reposer \`fire\` ; ou ${sortir} — ${voir}${dit}`;
        }
        default:
          return `remontée (${attente.reason}) — aucun geste connu pour ce motif — ${voir}${dit}`;
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
      return `revenu de WAITING, repris par le chef${attendait} — à trancher : \`/brigade arrived #${attente.ticket}\` sur le tableau de la cuisine le renvoie en cuisine ; \`${geste(`waiting set ${attente.ticket} --what <ce qu'il attend> --from <qui>`)}\` le remet en attente ; ou retirer \`fire\``;
    }
    case "carte":
      return direCarte(attente.carte);
    case "fermeture":
      return direDemandeDeFermeture(attente.demande, attente.retenue);
    case "connexion":
      return `connexion Max ${direDeconnexion(attente.reason)}${attente.reason === null ? "" : ` (${attente.reason})`} — à rétablir : ${GESTE_DE_CONNEXION_TOMBEE}`;
    case "session":
      return direSession(attente);
    case "jeton":
      return direEcheanceDuJeton(attente);
    case "base":
      return direBaseRouge(attente);
    case "setup":
      return direSetupBloque(attente);
    case "aside":
      return direMiseDeCoteBloquee(attente);
    case "disjoncteur":
      return direDisjoncteur(attente);
    case "pause":
      return direDemandeDePause(attente);
    case "renommage":
      return direEchecDuRenommage(attente);
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

// Le seul geste qui fait un jeton neuf : `claude setup-token` sous le compte
// du service, par l'étape de connexion Max — qui ne refait pas un jeton
// rangé, d'où le fichier à retirer d'abord. Le chemin, jamais la valeur.
const gesteDuJeton = (fichier: string) =>
  `refaire le jeton — \`claude setup-token\` sous le compte du service : supprimer ${fichier}, puis relancer l'étape de connexion Max (docs/installation-station.md, « 5. Le jeton de la connexion Max ») ; la station relit le jeton neuf et sa date`;

// Le jeton longue durée qui va échoir, est échu, ou dont la date ne se lit
// pas : quand, ou pourquoi on ne le sait pas, puis le geste.
function direEcheanceDuJeton({ state, token, file, created, expires, lifetimeDays, reason }: Extract<Attente, { quoi: "jeton" }>): string {
  const vie = `${lifetimeDays} jours après sa création (${created})`;
  if (state === "soon") return `jeton de la connexion Max près de son échéance — il échoit le ${expires}, ${vie} — à faire avant : ${gesteDuJeton(token)}`;
  if (state === "expired") return `jeton de la connexion Max ÉCHU depuis le ${expires}, ${vie} — les \`claude\` lancés ne se connectent plus avec lui — à faire : ${gesteDuJeton(token)}`;
  const pourquoi = { absent: "absente", unreadable: "illisible", invalid: "qui ne se lit pas comme une date" }[reason ?? "invalid"];
  return `date de création du jeton de la connexion Max ${pourquoi} (${file}) — son échéance est inconnue : il vit ${lifetimeDays} jours — à faire : ${gesteDuJeton(token)}`;
}
