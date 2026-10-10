// La file de ce qui attend le chef : tout ce qui ne bougera plus sans une
// décision de lui, avec depuis quand. Rien n'est tenu ici : chaque entrée se
// relit du rail, de la pass et des relevés du manager, donc du journal, et
// disparaît avec le fait qui dit la décision prise — un merge à la main
// constaté, un ticket sorti du rail ou rendu, une dépendance revenue, une issue
// rejugée ou fermée. Une PR fermée sans merge est une décision à moitié prise :
// son entrée change, et dit le geste qui reste.
import type { Base } from "./base.ts";
import { declarationsDuMotif, JUGES_MODIFIES, SANS_GRANT, type MotifDeRemontee } from "./evenements/pass.ts";
import type { Ecart } from "./evenements/manager.ts";
import { epiquesEnAttente } from "./projections/decoupages.ts";
import { issuesEnAttente, plusUneEpiqueDepuis } from "./projections/manager.ts";
import { lirePass } from "./projections/pass.ts";
import type { TicketRail } from "./projections/rail.ts";
import { direDeconnexion, etatStation, GESTE_DE_CONNEXION, stationsDeconnectees } from "./projections/stations.ts";
import { nomAbandon, retenue } from "./rail.ts";

// `title` : nul pour une issue qui n'est pas sur le rail — le journal ne
// connaît pas son titre.
type AttenteDeTicket = { ticket: number; title: string | null; since: string } & (
  // Une livraison verte que la pass ne merge pas elle-même. `reason` : pourquoi.
  // `expired` : faute d'un grant qui s'était éteint seul à cet instant.
  | { quoi: "merge"; reason: string; pr: string | null; expired: string | null }
  // Un ticket que la pass ou le manager a remonté : il est 86, sans retour.
  | { quoi: "remontee"; reason: string; pr: string | null }
  // Une livraison dont la PR a été fermée sans merge : son ticket tient encore
  // sa place sur le rail. `reason` : ce qu'elle était — arrêtée, remontée.
  | { quoi: "fermee"; reason: string; pr: string | null }
  // Un ticket que sa station a déclaré 86 sans heure de retour.
  | { quoi: "86"; reason: MotifDeStation }
  // Un ticket en attente d'un autre qui a quitté le rail sans être servi.
  | { quoi: "bloque"; abandonnes: { ticket: number; reason: string }[] }
  // Une issue que le manager ne juge pas tant qu'elle porte ce label du chef.
  | { quoi: "ecartee"; reason: EcartQuiAttend }
  // Une issue dont le jugement ne se lit pas — ou, épique, le découpage.
  | { quoi: "illisible"; epique: boolean }
  // Une épique sur laquelle le manager a posé une question avant de découper.
  | { quoi: "question" }
);

// Ce qui attend le chef : un ticket, ou une station dont la connexion Max
// manque — elle n'est à aucun ticket, et les retient tous.
export type Attente = AttenteDeTicket | { ticket: null; title: null; since: string; quoi: "connexion"; station: string; reason: string | null };

// Le redécoupage passe par le même fait qu'une remontée, mais n'attend
// personne : les sous-tickets portent le travail.
const REDECOUPAGE: MotifDeRemontee = "manager-split";
const DU_MANAGER: MotifDeRemontee = "manager-escalated";

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
    const commun = { ticket: pass.ticket, title: ticket.title, since: pass.since, reason: pass.reason ?? "", pr: pass.pr };
    if (pass.phase === "held") return [{ ...commun, quoi: "merge", expired: pass.grantExpired }];
    // Rendu au rail par le chef, le ticket n'est plus 86 : sa pass garde sa
    // phase jusqu'au cook suivant, mais plus rien n'attend.
    if (pass.phase === "escalated" && ticket.state === "86" && pass.reason !== REDECOUPAGE) return [{ ...commun, quoi: "remontee" }];
    // De même rendu au rail, il n'attend plus ; et fermer la PR d'un ticket
    // redécoupé n'appelle rien d'autre.
    if (pass.phase === "closed" && (ticket.state === "pass" || ticket.state === "86") && pass.reason !== REDECOUPAGE) return [{ ...commun, quoi: "fermee" }];
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

  // Elle sort de la file avec le « reprendre » du chef : c'est lui qui efface
  // la déconnexion.
  const connexions = stationsDeconnectees(base).flatMap((station): Attente[] => {
    const etat = etatStation(base, station);
    return etat?.disconnectedAt ? [{ ticket: null, title: null, since: etat.disconnectedAt, quoi: "connexion", station, reason: etat.disconnectedReason }] : [];
  });

  return [...connexions, ...livraisons, ...bloques, ...refuses, ...attentesDuManager(base, tickets)].sort((a, b) => a.since.localeCompare(b.since) || (a.ticket ?? 0) - (b.ticket ?? 0));
}

const PREFIXE_REFUS = "merge-refused: ";

// Ce qui attend, puis ce qu'on attend du chef.
function direAttente(attente: Attente): string {
  switch (attente.quoi) {
    case "merge": {
      const ou = attente.pr === null ? "" : ` : ${attente.pr}`;
      if (attente.reason === SANS_GRANT && attente.expired !== null) return `livraison verte, non mergée : le grant \`merge\` s'est éteint seul le ${attente.expired} — à merger à la main${ou}`;
      if (attente.reason === SANS_GRANT) return `livraison verte, non mergée faute de grant \`merge\` — à merger à la main${ou}`;
      if (attente.reason === JUGES_MODIFIES) return `livraison verte qui touche à ses juges — à relire et merger à la main${ou}`;
      const declarations = declarationsDuMotif(attente.reason);
      if (declarations !== null) return `livraison verte qui touche à ce que le projet s'ouvre (${declarations}) — à relire et merger à la main${ou}`;
      if (attente.reason.startsWith(PREFIXE_REFUS)) return `livraison verte, merge refusé par GitHub (${attente.reason.slice(PREFIXE_REFUS.length)}) — à merger à la main${ou}`;
      return `livraison verte, non mergée (${attente.reason}) — à merger à la main${ou}`;
    }
    case "remontee": {
      const qui = attente.reason === DU_MANAGER ? "remontée par le manager" : `remontée par la pass (${attente.reason})`;
      const geste = attente.pr === null ? "retirer `fire`, ou fermer l'issue" : `merger ${attente.pr} à la main, ou retirer \`fire\``;
      return `${qui} — à trancher : ${geste} — \`run pass -- ${attente.ticket}\``;
    }
    case "fermee":
      return `PR fermée sans merge${attente.pr === null ? "" : ` : ${attente.pr}`} — à trancher : retirer \`fire\`, ou fermer l'issue — \`run pass -- ${attente.ticket}\``;
    case "86":
      return GESTES_DE_STATION[attente.reason];
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

// Le bloc `attend` de l'état : le décompte, puis une ligne par décision. Rien
// quand la file est vide : le bloc n'apparaît que pour être lu.
export function decrireAttentes(attentes: Attente[], depuis: (instant: string) => string): string[] {
  const [premiere] = attentes;
  if (premiere === undefined) return [];
  const tete = attentes.length === 1 ? `1 décision attend le chef depuis ${depuis(premiere.since)}` : `${attentes.length} décisions attendent le chef — la plus ancienne depuis ${depuis(premiere.since)}`;
  return [
    `${"attend".padEnd(11)}${tete}`,
    ...attentes.map((attente) => `  ${attente.ticket === null ? attente.station : `#${attente.ticket}`}  depuis ${depuis(attente.since)}  ${direAttente(attente)}${attente.title === null ? "" : `  ${attente.title}`}`),
    "",
  ];
}
