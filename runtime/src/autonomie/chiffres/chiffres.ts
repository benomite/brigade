// A project's autonomy figures (#3222, epic #3213), over a period: brigade's
// goal is autonomy (CLAUDE.md), and these three figures say whether it holds.
// - served without a human: the share of the tickets merged in the period
//   whose path from `fire` to merge never asked the chef anything — no TODO
//   card (`chef-todo`, a `brigade:todo` comment, a design held for the chef's
//   validation) and no `blocked-on-human`;
// - lead time: the median time from `fire` to merge;
// - send-back rate: the share of those deliveries the pass sent back at least
//   once (a `brigade:renvoi` comment) — sent back twice counts once.
//
// Everything is read from what GitHub holds — the merged pull requests, and
// the events and comments of each ticket's issue —, never from a file of the
// machine: a new computer shows the same figures. Pure functions: nothing is
// read or written here; the app fetches (app/src/vue/autonomie/autonomie-github.ts)
// and hands the data over. Several repositories together give the figures of
// all projects: their tickets are pooled, not their shares averaged.
//
// A ticket merged with no `fire` before its merge was not served by the
// kitchen: it is left out of the three figures.
import { mediane } from "../../temps-ticket/synthese.ts";

// The marks the stations write, with the constants of their writers:
// `MARQUE_DE_RENVOI` (qualite-github.ts), `CHEF_TODO` and `marqueur`
// (github-seul/carte-todo/carte-todo.ts), `A_LA_MAIN` (brigade-github.ts) — the
// test compares them —, and `marqueDeRetenue` (validation-design/validation-design.ts).
// Restated rather than imported: those modules pull the kitchen's rail, which
// the app does not load.
export const FIRE = "fire";
export const BLOCKED_ON_HUMAN = "blocked-on-human";
export const CHEF_TODO = "chef-todo";
export const MARQUE_DE_RENVOI = "<!-- brigade:renvoi";
export const MARQUE_DE_CARTE = /^\s*<!--\s*brigade:todo\s+kind=[A-Za-z0-9_-]+\s*-->/;
export const MARQUE_DE_RETENUE = /^\s*<!--\s*brigade:validation-design-carte\b[^>]*-->/;
// Only whoever has a hand on the repository writes a station's comments: anyone
// can comment a public issue.
const DE_CONFIANCE = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

// The periods the app offers, in days.
export const PERIODES: readonly number[] = [7, 30];
const JOUR_MS = 24 * 3600 * 1000;

// A ticket served by a merged pull request (app/src/vue/rail/github.ts,
// `lireLesServis`): its number, title, address and merge instant.
export type Servi = { ticket: number; titre: string; url: string; livre: string };
// What one repository's GitHub holds for the figures: its served tickets, and
// for each, its issue's events and comments as GitHub's REST API returns them.
export type DonneesDuDepot = { depot: string; servis: readonly Servi[]; issues: Readonly<Record<number, { evenements: readonly unknown[]; commentaires: readonly unknown[] }>> };

// A ticket served with a human: the questions it asked the chef, in order —
// null for one whose text is not on the ticket (a label set by hand).
export type ServiAvecHumain = { depot: string; ticket: number; titre: string; url: string; livre: string; questions: (string | null)[] };
// The figures. `tickets`: the merged tickets counted. With none, the three
// figures are null: the view says so, never a NaN.
export type ChiffresDAutonomie = {
  debut: string;
  fin: string;
  tickets: number;
  sansHumain: number;
  partSansHumain: number | null;
  delaiMedianMs: number | null;
  renvoyes: number;
  partRenvoyee: number | null;
  avecHumain: ServiAvecHumain[];
};

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

type Evenement = { type: string; label: string; le: number };
type Commentaire = { corps: string; le: number };
const evenementsLus = (bruts: readonly unknown[]): Evenement[] =>
  bruts.flatMap((brut) => {
    const lu = objet(brut);
    const le = Date.parse(texte(lu?.created_at));
    return lu === null || Number.isNaN(le) ? [] : [{ type: texte(lu.event), label: texte(objet(lu.label)?.name), le }];
  });
const commentairesLus = (bruts: readonly unknown[]): Commentaire[] =>
  bruts.flatMap((brut) => {
    const lu = objet(brut);
    const le = Date.parse(texte(lu?.created_at));
    return lu === null || Number.isNaN(le) || !DE_CONFIANCE.has(texte(lu.author_association)) ? [] : [{ corps: texte(lu.body), le }];
  });

// The first line a human reads of a comment, its marks and markdown emphasis
// removed; null when nothing is left.
export function premiereLigne(corps: string): string | null {
  const ligne = corps
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((une) => une.replace(/^\s*(?:#+|>)\s*/, "").replace(/\*\*|__/g, "").trim())
    .find((une) => une !== "");
  return ligne ?? null;
}

// What a ticket asked the chef between its `fire` and its merge: each TODO
// card's text, each design held for the chef's validation, and, for each
// `blocked-on-human`, the comment the station writes just before setting it
// (blocages-sans-question.ts, `poserALaMain`). A `chef-todo` set with no card
// comment in the window is a question whose text is not on the ticket.
function questionsDuParcours(evenements: readonly Evenement[], commentaires: readonly Commentaire[], fire: number, merge: number): (string | null)[] {
  const dans = (le: number) => le >= fire && le <= merge;
  const marquees = commentaires.filter(({ corps, le }) => dans(le) && (MARQUE_DE_CARTE.test(corps) || MARQUE_DE_RETENUE.test(corps)));
  const questions: { le: number; question: string | null }[] = marquees.map(({ corps, le }) => ({ le, question: premiereLigne(corps) }));
  for (const { type, label, le } of evenements) {
    if (type !== "labeled" || !dans(le)) continue;
    if (label === BLOCKED_ON_HUMAN) {
      const dite = commentaires.filter((un) => un.le >= fire && un.le <= le && !un.corps.trimStart().startsWith("<!--")).at(-1);
      questions.push({ le, question: dite === undefined ? null : premiereLigne(dite.corps) });
    } else if (label === CHEF_TODO && !marquees.some((un) => MARQUE_DE_CARTE.test(un.corps))) questions.push({ le, question: null });
  }
  return questions.sort((a, b) => a.le - b.le).map(({ question }) => question);
}

// The figures over the `jours` days before `maintenant`, pooled over the
// repositories given.
export function chiffresDAutonomie(depots: readonly DonneesDuDepot[], jours: number, maintenant: Date): ChiffresDAutonomie {
  const fin = maintenant.getTime();
  const debut = fin - jours * JOUR_MS;
  const delais: number[] = [];
  const avecHumain: ServiAvecHumain[] = [];
  let renvoyes = 0;
  for (const { depot, servis, issues } of depots) {
    for (const servi of servis) {
      const merge = Date.parse(servi.livre);
      if (Number.isNaN(merge) || merge < debut || merge > fin) continue;
      const lue = issues[servi.ticket];
      if (lue === undefined) continue;
      const evenements = evenementsLus(lue.evenements);
      const fire = evenements.find(({ type, label, le }) => type === "labeled" && label === FIRE && le <= merge)?.le;
      if (fire === undefined) continue;
      const commentaires = commentairesLus(lue.commentaires);
      delais.push(merge - fire);
      if (commentaires.some(({ corps, le }) => le >= fire && le <= merge && corps.trimStart().startsWith(MARQUE_DE_RENVOI))) renvoyes++;
      const questions = questionsDuParcours(evenements, commentaires, fire, merge);
      if (questions.length > 0) avecHumain.push({ depot, ticket: servi.ticket, titre: servi.titre, url: servi.url, livre: servi.livre, questions });
    }
  }
  const tickets = delais.length;
  const part = (n: number) => (tickets === 0 ? null : n / tickets);
  return {
    debut: new Date(debut).toISOString(),
    fin: new Date(fin).toISOString(),
    tickets,
    sansHumain: tickets - avecHumain.length,
    partSansHumain: part(tickets - avecHumain.length),
    delaiMedianMs: tickets === 0 ? null : mediane(delais),
    renvoyes,
    partRenvoyee: part(renvoyes),
    avecHumain: avecHumain.sort((a, b) => Date.parse(b.livre) - Date.parse(a.livre)),
  };
}
