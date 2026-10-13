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
// attend le rail calme, le geste de box est parti, ou il n'a rien redémarré.
import type { Base } from "./base.ts";
import { absentesDuMotif, direManque, direStationAbsente, GESTE_DE_PRESENCE, gesteDeCapacite, manqueDuMotif, type Manque } from "./capacites.ts";
import { A_RELIRE, declarationsDeLaCause, DU_MANAGER, ENCORE_ROUGE, MERGE_REFUSE, NON_JUGEE, REDECOUPE, SANS_GRANT } from "./evenements/pass.ts";
import { COUPER, DEMANDER, direDemande, direRendu } from "./dire-mise-en-service.ts";
import type { Ecart } from "./evenements/manager.ts";
import { CADENCE_DE_COMPARAISON_MS } from "./evenements/version.ts";
import { epiquesEnAttente } from "./projections/decoupages.ts";
import { cooksEnVol, type CookEnVol } from "./projections/garde-fous.ts";
import { issuesEnAttente, plusUneEpiqueDepuis } from "./projections/manager.ts";
import { demandeDeMiseEnService, dernierRendu, type Demande, type Rendu } from "./projections/mise-en-service.ts";
import { lirePass, type SansGrant } from "./projections/pass.ts";
import type { TicketRail } from "./projections/rail.ts";
import { direDeconnexion, etatStation, GESTE_DE_CONNEXION, stationsDeconnectees } from "./projections/stations.ts";
import { versionComparee } from "./projections/version.ts";
import { nomAbandon, retenue } from "./rail.ts";

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
);

// Où en est la mise en service demandée au runtime, lue avec la version :
// la demande qui vit et les cooks en vol à la lecture, ou ce que le dernier
// geste de box a rendu sans rien redémarrer. Nulle : rien n'a été demandé.
export type MiseEnServiceLue = { demande: Demande; enVol: CookEnVol[] } | { demande: null; rendu: Rendu } | null;

// Ce qui attend le chef sans être à un ticket.
type AttenteHorsTicket = { ticket: null; title: null; since: string } & (
  // Une station dont la connexion Max manque : elle retient tous les tickets.
  | { quoi: "connexion"; station: string; reason: string | null }
  // La branche que suit le clone de brigade porte, sur son origine, un runtime
  // que le projet ne sert pas. `since` : l'instant de la plus ancienne
  // livraison qui n'est pas en service ; `livraisons` : combien ne le sont pas.
  | { quoi: "version"; projet: string; servie: string; branche: string; tete: string; livraisons: number; service: MiseEnServiceLue }
  // La version en service n'a pas pu être comparée à son origine : rien ne dit
  // qu'elle est à jour. `since` : la première comparaison manquée.
  | { quoi: "version-illisible"; projet: string; servie: string; branche: string | null; raison: string; service: MiseEnServiceLue }
);

export type Attente = AttenteDeTicket | AttenteHorsTicket;

export const ACCORDER_LE_GRANT = "npm --prefix runtime run grant -- activer merge";

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

// Ce qui attend le chef, le plus ancien d'abord. `rail` : le rail tel que lu.
export function attentesDuChef(base: Base, rail: TicketRail[]): Attente[] {
  const tickets = new Map(rail.map((ticket) => [ticket.ticket, ticket]));
  const instant = (seq: number) => base.lire<{ at: string }>("SELECT at FROM events WHERE seq = ?", seq)[0]?.at;

  const livraisons = lirePass(base).flatMap((pass): AttenteDeTicket[] => {
    const ticket = tickets.get(pass.ticket);
    if (!ticket) return [];
    const commun = { ticket: pass.ticket, title: ticket.title, since: pass.since, reason: pass.reason ?? "", cause: pass.cause, pr: pass.pr };
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

  const comparee = versionComparee(base);
  const versions = ((): Attente[] => {
    if (comparee === null || comparee.comparaison.outcome === "current") return [];
    const { projet, depuis: since, comparaison } = comparee;
    const demande = demandeDeMiseEnService(base);
    const rendu = dernierRendu(base);
    const service: MiseEnServiceLue = demande !== null ? { demande, enVol: cooksEnVol(base) } : rendu !== null ? { demande: null, rendu } : null;
    return comparaison.outcome === "waiting"
      ? [{ ticket: null, title: null, since, quoi: "version", projet, servie: comparaison.served, branche: comparaison.branch, tete: comparaison.head, livraisons: comparaison.deliveries, service }]
      : [{ ticket: null, title: null, since, quoi: "version-illisible", projet, servie: comparaison.served, branche: comparaison.branch, raison: comparaison.reason, service }];
  })();

  return [...versions, ...connexions, ...livraisons, ...bloques, ...refuses, ...sansStation, ...sansPresence, ...attentesDuManager(base, tickets)].sort((a, b) => a.since.localeCompare(b.since) || (a.ticket ?? 0) - (b.ticket ?? 0));
}

const court = (commit: string) => commit.slice(0, 12);

// La mise en service demandée, à la suite de ce que la ligne dit de la version.
const direService = (service: Exclude<MiseEnServiceLue, null>, projet: string) => (service.demande !== null ? direDemande(service.demande, service.enVol, projet) : direRendu(service.rendu, projet));

// Ce qui attend, puis le geste du chef qui le débloque — ou qu'il n'y en a pas
// de connu.
function direAttente(attente: Attente): string {
  switch (attente.quoi) {
    case "version":
      return `une version attend : ${attente.branche} (${court(attente.tete)}) porte un runtime qui n'est pas en service — en service : ${court(attente.servie)}, en retard depuis le ${attente.since} ; ${attente.livraisons} livraison${attente.livraisons > 1 ? "s" : ""} non en service — ${
        attente.service === null
          ? `à mettre en service : \`${DEMANDER}\`, qui dit d'abord ce qui est en vol et ce que ça a coûté, puis attend le rail calme sans interrompre aucun cook — ou \`${COUPER}\`, sans attendre : les cooks en vol sont interrompus, et leurs tickets repris par des cooks neufs`
          : direService(attente.service, attente.projet)
      }`;
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
          return `livraison verte, non mergée (${attente.reason}) — aucun geste connu pour ce motif${ou} — \`run pass -- ${attente.ticket}\``;
      }
    }
    case "remontee": {
      const voir = `\`run pass -- ${attente.ticket}\``;
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
      return `PR fermée sans merge${attente.pr === null ? "" : ` : ${attente.pr}`} — à trancher : retirer \`fire\`, ou fermer l'issue — \`run pass -- ${attente.ticket}\``;
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
    case "connexion":
      return `connexion Max ${direDeconnexion(attente.reason)}${attente.reason === null ? "" : ` (${attente.reason})`} — à rétablir : ${GESTE_DE_CONNEXION}`;
  }
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

// Ce qui nomme une entrée, en tête de sa ligne : son ticket, sa station, ou
// `version`.
const nommer = (attente: Attente) => (attente.ticket !== null ? `#${attente.ticket}` : attente.quoi === "connexion" ? attente.station : "version");

// Le bloc `attend` de l'état : le décompte, puis une ligne par décision, puis
// le bilan des arrêts faute de grant. Il est toujours là, entre les mêmes
// bords : la file vide, il le dit — un silence ne se distinguerait pas d'une
// lecture ratée —, et ne porte rien d'autre.
export function decrireAttentes(attentes: Attente[], depuis: (instant: string) => string, sansGrant: SansGrant | null = null): string[] {
  const [premiere] = attentes;
  if (premiere === undefined) return [`${"attend".padEnd(11)}rien n'attend le chef`, FIN_ATTEND, ""];
  const tete = attentes.length === 1 ? `1 décision attend le chef depuis ${depuis(premiere.since)}` : `${attentes.length} décisions attendent le chef — la plus ancienne depuis ${depuis(premiere.since)}`;
  return [
    `${"attend".padEnd(11)}${tete}`,
    ...attentes.map((attente) => `  ${nommer(attente)}  depuis ${depuis(attente.since)}  ${direAttente(attente)}${attente.title === null ? "" : `  ${attente.title}`}`),
    ...[sansGrant === null ? null : direSansGrant(sansGrant)].flatMap((bilan) => (bilan === null ? [] : [`  ${bilan}`])),
    FIN_ATTEND,
    "",
  ];
}
