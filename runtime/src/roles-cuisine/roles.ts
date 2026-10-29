// Les rôles de la cuisine d'un projet, pour l'onglet Cooks de l'app (#1274) : le manager, la pass, le
// reviewer, le second juge, le triage et le closer — chacun avec une ligne qui dit ce qu'il fait, et sa
// dernière action sur ce projet : une courte phrase (quoi), son ticket et son heure (quand). `facts` les
// donne dans `rolesCuisine` ; un rôle qui n'a encore rien fait y a `latest` nul, et l'app le dit en mots.
//
// Tout se relit du journal, à la lecture : aucune table ni projection de plus. La phrase est composée
// ici, des champs structurés du fait — jamais la sortie d'une commande, ni le texte libre d'un modèle.
// Seuls comptent les faits du projet nommé.
import type { Base } from "../base.ts";

export type DerniereAction = { what: string; ticket: number | null; at: string };
export type RoleDeCuisine = { role: string; does: string; latest: DerniereAction | null };

// Ce qu'une ligne du journal donne à la phrase.
type Ligne = { seq: number; at: string; ticket: number | null; payload: string };
// Un type de fait que le rôle écrit : `filtre` écarte, en SQL, ceux qui ne sont pas son geste (un même
// type écrit par un autre, un résultat qui n'est pas une action) ; `dire` en fait la phrase.
type Lecture = { type: string; filtre?: string; dire: (payload: Record<string, unknown>, n: string) => string };
type Role = { role: string; does: string; lectures: readonly Lecture[] };

const nombre = (valeur: unknown): number => (typeof valeur === "number" && Number.isFinite(valeur) ? valeur : 0);
const pluriel = (combien: number, mot: string) => `${combien} ${mot}${combien === 1 ? "" : "s"}`;

// Ce que le manager a décidé de la suite d'un ticket rouge (events/manager.ts, `ChoixDeReaction`).
const REACTIONS: Record<string, (n: string) => string> = {
  retry: (n) => `sent ${n} back for another try`,
  raise: (n) => `raised the calibration of ${n}`,
  split: (n) => `split ${n} again`,
  escalate: (n) => `escalated ${n} to you`,
};
// Ce qu'il a fait d'une issue tenue par `blocked-on-human`, relue (manager.requalified).
const RELECTURES: Record<string, (n: string) => string> = {
  stated: (n) => `re-read ${n}: the decision it awaits is written`,
  card: (n) => `re-read ${n} and put its question in TODO`,
  "taken-back": (n) => `re-read ${n} and took it back`,
  unreadable: (n) => `re-read ${n} without a usable answer`,
};
// Ce que le triage a fait d'une carte (events/todo.ts) — `back`, la carte que la porte lui rend, n'est pas
// un geste : il est écarté par le filtre.
const TRIAGES: Record<string, (n: string) => string> = {
  relaunch: (n) => `relaunched ${n}`,
  resplit: (n) => `had ${n} split again`,
  dependency: (n) => `set ${n} to wait for its dependency`,
  wait: (n) => `set ${n} to wait`,
  remove: (n) => `took ${n} off the rail`,
  through: (n) => `let ${n} into TODO for you`,
};
// Le verdict du second juge (events/pass.ts, `VERDICTS_DU_SECOND_JUGE`).
const SECONDS_JUGEMENTS: Record<string, (n: string) => string> = {
  "not-weakened": (n) => `found the checks of ${n} not weakened`,
  weakened: (n) => `found that ${n} weakens its checks`,
  "cannot-establish": (n) => `could not tell whether ${n} weakens its checks`,
};
// Comment une passe du closer a fini (events/closing.ts, `FinDePasse`).
const FINS_DE_PASSE: Record<string, (removed: number) => string> = {
  delivered: (removed) => `delivered a cleanup PR removing ${pluriel(removed, "line")}`,
  nothing: () => "ended a cleanup with nothing removed",
  tokens: () => "stopped a cleanup at its token cap",
  removals: () => "stopped a cleanup at its removed-lines cap",
  idle: () => "stopped a cleanup that went idle",
  duration: () => "stopped a cleanup at its duration cap",
  stop: () => "stopped a cleanup on your stop",
  breaker: () => "stopped a cleanup: the breaker opened",
  zone: () => "stopped a cleanup that wrote outside its zone",
  failed: () => "ended a cleanup that failed",
  interrupted: () => "ended a cleanup cut by a restart",
};
// La phrase d'une valeur de la table, ou `sinon` pour une valeur qu'elle ne connaît pas — jamais une clé héritée.
const parmi = <A>(table: Record<string, (a: A) => string>, cle: unknown, a: A, sinon: string) => (typeof cle === "string" && Object.hasOwn(table, cle) ? (table[cle] as (a: A) => string)(a) : sinon);

// Les rôles, dans l'ordre où un ticket les croise : le manager le juge, la pass juge sa livraison — avec le
// reviewer et, si elle touche à ses juges, le second juge —, le triage reprend la carte qui irait au chef, et
// le closer nettoie le projet quand le chef le lui demande. Les cooks, eux, sont sur les blocs des stations.
export const ROLES: readonly Role[] = [
  {
    role: "manager",
    does: "Judges the project's issues, puts the ready ones on the rail, splits epics, and decides what follows a red ticket.",
    lectures: [
      { type: "manager.judged", dire: (p, n) => (p.verdict === "fire" ? `put ${n} on the rail` : `judged ${n} not ready to serve`) },
      { type: "manager.set-aside", dire: (_, n) => `set ${n} aside for you` },
      { type: "manager.reacted", dire: (p, n) => parmi(REACTIONS, p.choice, n, `reacted to ${n} turning red`) },
      { type: "manager.split", dire: (p, n) => `split epic ${n} into ${pluriel(Array.isArray(p.tickets) ? p.tickets.length : 0, "ticket")}` },
      { type: "manager.split-asked", dire: (_, n) => `asked you a question on epic ${n}` },
      { type: "manager.split-served", dire: (_, n) => `closed epic ${n}, all its tickets served` },
      { type: "manager.requalified", dire: (p, n) => parmi(RELECTURES, p.outcome, n, `re-read ${n}`) },
      { type: "manager.capability-resplit", dire: (_, n) => `rewrote ${n}: no station has what it asks` },
      { type: "manager.capability-gestured", dire: (_, n) => `asked you for an access ${n} needs` },
    ],
  },
  {
    role: "pass",
    does: "Judges each delivery on its gates, its CI and its review, then merges it, sends it back to its cook, or escalates it to you.",
    lectures: [
      { type: "pass.judged", dire: (p, n) => `judged ${n} ${p.verdict === "green" ? "green" : "red"}` },
      // Mergé par la pass, pas noté d'un merge fait hors d'elle.
      { type: "merge.done", filtre: "json_extract(payload, '$.by') = 'pass'", dire: (_, n) => `merged ${n}` },
      { type: "pass.served", dire: (_, n) => `served ${n}, which had no diff` },
      // Le manager, le triage et le chef écrivent aussi ces deux faits : seuls ceux de la pass sont son geste.
      { type: "pass.returned", filtre: "author = 'pass'", dire: (_, n) => `sent ${n} back to its cook` },
      { type: "pass.escalated", filtre: "author = 'pass'", dire: (_, n) => `escalated ${n}` },
      { type: "pass.deferred", dire: (_, n) => `handed ${n} to the manager` },
    ],
  },
  {
    role: "reviewer",
    does: "Reads each delivery's diff and writes the review the pass judges with.",
    lectures: [
      {
        type: "pass.reviewed",
        dire: (p, n) =>
          p.outcome === "green"
            ? `reviewed ${n}: green`
            : p.outcome === "red"
              ? `reviewed ${n}: red, ${pluriel(Array.isArray(p.findings) ? p.findings.length : 0, "finding")}`
              : `reviewed ${n}, its answer unreadable`,
      },
    ],
  },
  {
    role: "second judge",
    does: "Checks that a green delivery touching its own judges (gates, setup, workflows) does not weaken them.",
    lectures: [{ type: "pass.second-judged", dire: (p, n) => parmi(SECONDS_JUGEMENTS, p.verdict, n, `judged ${n}`) }],
  },
  {
    role: "triage",
    does: "Takes up a card before it reaches TODO, and settles it alone when it can: relaunch, split, wait or remove.",
    lectures: [{ type: "todo.triaged", filtre: "json_extract(payload, '$.action') IS NOT 'back'", dire: (p, n) => parmi(TRIAGES, p.action, n, `triaged ${n}`) }],
  },
  {
    role: "closer",
    does: "Prunes and simplifies the project's code in one cleanup pass, when you ask for it.",
    lectures: [
      { type: "closing.started", dire: () => "started a cleanup" },
      { type: "closing.ended", dire: (p) => parmi(FINS_DE_PASSE, p.outcome, nombre(p.removedLines), "ended a cleanup") },
    ],
  },
];

// Le dernier geste d'un rôle sur le projet : le plus récent des faits qu'il écrit, ou null s'il n'en a
// écrit aucun. Une lecture par type de fait, sur l'index (type, seq) : la dernière seule est lue.
function derniereAction(base: Base, projet: string, { lectures }: Role): DerniereAction | null {
  let retenue: { ligne: Ligne; lecture: Lecture } | null = null;
  for (const lecture of lectures) {
    const [ligne] = base.lire<Ligne>(
      `SELECT seq, at, ticket, payload FROM events WHERE type = ?1 AND project = ?2${lecture.filtre ? ` AND (${lecture.filtre})` : ""} ORDER BY seq DESC LIMIT 1`,
      lecture.type,
      projet,
    );
    if (ligne !== undefined && (retenue === null || ligne.seq > retenue.ligne.seq)) retenue = { ligne, lecture };
  }
  if (retenue === null) return null;
  const { ligne, lecture } = retenue;
  let payload: Record<string, unknown> = {};
  try {
    const lu: unknown = JSON.parse(ligne.payload);
    if (typeof lu === "object" && lu !== null) payload = lu as Record<string, unknown>;
  } catch {
    // Une charge illisible ne tait pas le geste : la phrase se dit sans son détail.
  }
  return { what: lecture.dire(payload, ligne.ticket === null ? "a ticket" : `#${ligne.ticket}`), ticket: ligne.ticket, at: ligne.at };
}

// Les rôles de la cuisine du projet, chacun avec sa ligne et sa dernière action. La liste est toujours
// entière, dans l'ordre de ROLES : la forme ne change pas d'une cuisine à l'autre.
export function rolesDeLaCuisine(base: Base, projet: string): RoleDeCuisine[] {
  return ROLES.map((role) => ({ role: role.role, does: role.does, latest: derniereAction(base, projet, role) }));
}
