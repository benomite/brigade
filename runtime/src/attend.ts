// La file de ce qui attend le chef : tout ce qui ne bougera plus sans une
// décision de lui, avec depuis quand. Rien n'est tenu ici : chaque entrée se
// relit du rail et de la pass, donc du journal, et disparaît avec le fait qui
// dit la décision prise — un merge à la main constaté, un ticket sorti du rail
// ou rendu, une dépendance revenue.
//
// Ce qui n'y entre pas encore : ce que le manager attend du chef. Fermer une
// issue qu'il a écartée n'écrit aucun fait, et l'entrée ne sortirait jamais.
// Le bloc le compte à part, sans le mettre dans la file.
import type { Base } from "./base.ts";
import { JUGES_MODIFIES, SANS_GRANT, type MotifDeRemontee } from "./evenements/pass.ts";
import type { Ecart } from "./evenements/manager.ts";
import { decoupagesDuManager } from "./projections/decoupages.ts";
import { decisionsDuManager } from "./projections/manager.ts";
import { lirePass } from "./projections/pass.ts";
import type { TicketRail } from "./projections/rail.ts";
import { nomAbandon, retenue } from "./rail.ts";

export type Attente = { ticket: number; title: string; since: string } & (
  // Une livraison verte que la pass ne merge pas elle-même. `reason` : pourquoi.
  | { quoi: "merge"; reason: string; pr: string | null }
  // Un ticket que la pass ou le manager a remonté : il est 86, sans retour.
  | { quoi: "remontee"; reason: string; pr: string | null }
  // Un ticket que sa station a déclaré 86 sans heure de retour.
  | { quoi: "86"; reason: MotifDeStation }
  // Un ticket en attente d'un autre qui a quitté le rail sans être servi.
  | { quoi: "bloque"; abandonnes: { ticket: number; reason: string }[] }
);

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

// Ce qui attend le chef, le plus ancien d'abord. `rail` : le rail tel que lu.
export function attentesDuChef(base: Base, rail: TicketRail[]): Attente[] {
  const tickets = new Map(rail.map((ticket) => [ticket.ticket, ticket]));
  const instant = (seq: number) => base.lire<{ at: string }>("SELECT at FROM events WHERE seq = ?", seq)[0]?.at;

  const livraisons = lirePass(base).flatMap((pass): Attente[] => {
    const ticket = tickets.get(pass.ticket);
    if (!ticket) return [];
    const commun = { ticket: pass.ticket, title: ticket.title, since: pass.since, reason: pass.reason ?? "", pr: pass.pr };
    if (pass.phase === "held") return [{ ...commun, quoi: "merge" }];
    // Rendu au rail par le chef, le ticket n'est plus 86 : sa pass garde sa
    // phase jusqu'au cook suivant, mais plus rien n'attend.
    if (pass.phase === "escalated" && ticket.state === "86" && pass.reason !== REDECOUPAGE) return [{ ...commun, quoi: "remontee" }];
    return [];
  });

  const bloques = rail.flatMap((ticket): Attente[] => {
    if (retenue(ticket) !== "bloque") return [];
    const partis = ticket.awaits.flatMap(({ ticket: attendu, left }) => (left === null ? [] : [{ ticket: attendu, reason: left.reason, at: instant(left.seq) }]));
    // Bloqué depuis le premier abandon — ou depuis qu'il attend, s'il est
    // arrivé après. Les horodatages sont en ISO 8601 UTC : leur ordre est
    // celui du temps.
    const premier = partis.map(({ at }) => at ?? ticket.since).sort()[0] ?? ticket.since;
    return [{ ticket: ticket.ticket, title: ticket.title, since: premier > ticket.since ? premier : ticket.since, quoi: "bloque", abandonnes: partis.map(({ ticket, reason }) => ({ ticket, reason })) }];
  });

  const refuses = rail.flatMap((ticket): Attente[] =>
    ticket.state === "86" && ticket.until === null && deStation(ticket.reason) ? [{ ticket: ticket.ticket, title: ticket.title, since: ticket.since, quoi: "86", reason: ticket.reason }] : [],
  );

  return [...livraisons, ...bloques, ...refuses].sort((a, b) => a.since.localeCompare(b.since) || a.ticket - b.ticket);
}

const PREFIXE_REFUS = "merge-refused: ";

// Ce qui attend, puis ce qu'on attend du chef.
function direAttente(attente: Attente): string {
  switch (attente.quoi) {
    case "merge": {
      const ou = attente.pr === null ? "" : ` : ${attente.pr}`;
      if (attente.reason === SANS_GRANT) return `livraison verte, non mergée faute de grant \`merge\` — à merger à la main${ou}`;
      if (attente.reason === JUGES_MODIFIES) return `livraison verte qui touche à ses juges — à relire et merger à la main${ou}`;
      if (attente.reason.startsWith(PREFIXE_REFUS)) return `livraison verte, merge refusé par GitHub (${attente.reason.slice(PREFIXE_REFUS.length)}) — à merger à la main${ou}`;
      return `livraison verte, non mergée (${attente.reason}) — à merger à la main${ou}`;
    }
    case "remontee": {
      const qui = attente.reason === DU_MANAGER ? "remontée par le manager" : `remontée par la pass (${attente.reason})`;
      const geste = attente.pr === null ? "retirer `fire`, ou fermer l'issue" : `merger ${attente.pr} à la main, ou retirer \`fire\``;
      return `${qui} — à trancher : ${geste} — \`run pass -- ${attente.ticket}\``;
    }
    case "86":
      return GESTES_DE_STATION[attente.reason];
    case "bloque": {
      const numeros = attente.abandonnes.map(({ ticket }) => `#${ticket}`).join(", ");
      const abandons = attente.abandonnes.map(({ ticket, reason }) => `#${ticket} abandonné (${nomAbandon(reason)})`).join(", ");
      return `BLOQUÉ : ${abandons} — à débloquer : remettre ${numeros} sur le rail, ou ${attente.abandonnes.length > 1 ? "les" : "le"} retirer de la ligne \`attend\` de la fiche`;
    }
  }
}

// Combien de lignes des relevés du manager sont relues : bien plus qu'il n'en
// garde d'ouvertes.
const RELUES = 1000;
const ECARTS_QUI_ATTENDENT: readonly string[] = ["question", "decision", "blocked-on-human"] satisfies Ecart[];

// Ce que le manager attend du chef, hors file : les issues qu'il a écartées
// parce qu'elles sont à lui, ses jugements illisibles, les questions qu'il pose
// sur une épique. Un majorant — celles que le chef a fermées depuis y restent.
export function horsFile(base: Base): number {
  const issues = decisionsDuManager(base, RELUES).filter(({ decision, reason }) => decision === "failed" || (decision === "aside" && ECARTS_QUI_ATTENDENT.includes(reason)));
  const questions = decoupagesDuManager(base, RELUES).filter(({ state }) => state === "asked" || state === "failed");
  return issues.length + questions.length;
}

const pluriel = (combien: number, mot: string) => `${combien} ${mot}${combien > 1 ? "s" : ""}`;

// Le bloc `attend` de l'état : le décompte, une ligne par décision, puis ce que
// la file ne compte pas encore — un bloc sans entrée ne dit pas « personne ne
// t'attend » tant que le manager, lui, attend peut-être. Rien quand il n'y a ni
// l'un ni l'autre : le bloc n'apparaît que pour être lu.
export function decrireAttentes(attentes: Attente[], manager: number, depuis: (instant: string) => string): string[] {
  const [premiere] = attentes;
  if (premiere === undefined && manager === 0) return [];
  const tete =
    premiere === undefined
      ? "aucune décision dans la file"
      : attentes.length === 1
        ? `1 décision attend le chef depuis ${depuis(premiere.since)}`
        : `${attentes.length} décisions attendent le chef — la plus ancienne depuis ${depuis(premiere.since)}`;
  return [
    `${"attend".padEnd(11)}${tete}`,
    ...attentes.map((attente) => `  #${attente.ticket}  depuis ${depuis(attente.since)}  ${direAttente(attente)}  ${attente.title}`),
    ...(manager === 0
      ? []
      : [`${"".padEnd(11)}hors file : ${pluriel(manager, "issue")} que le manager a écartée${manager > 1 ? "s" : ""} ou n'a pas su lire, fermées comprises — pas encore comptées ici : \`run manager\``]),
    "",
  ];
}
