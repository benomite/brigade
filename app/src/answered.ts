// Les questions du manager déjà répondues (#503) : une carte de TODO qui t'attend pour une question
// avant découpage quitte TODO dès que la réponse est partie — postée depuis la fiche, ou lue sur
// l'issue, écrite ailleurs —, sans attendre que le manager l'ait lue. Elle attend alors le manager,
// dans WAITING (facts.ts, `rail`), jusqu'à ce que la file ne la nomme plus — il a découpé l'épique —
// ou que l'issue pose une autre question : elle revient alors dans TODO.
// La file ne dit pas qu'une question est répondue : seule l'issue le dit. Ce qui en est su ici vient
// des lectures que l'app fait déjà par le `gh` du poste (question.ts) — à l'ouverture d'une fiche, à
// l'envoi d'une réponse — et d'une relecture de l'issue d'une carte répondue, de loin en loin, tant
// que la file la nomme : c'est elle qui voit le manager poser une autre question.
// Ce module ne lance rien : il retient, et dit quoi relire.
import type { Read } from "./question.ts";

// Une question répondue : son adresse, qui y a répondu — `you` pour une réponse que l'app vient de
// poster, avant que l'issue relue ne donne le compte —, et quand.
export type Answered = { question: string; par: string; a: string };
// `ici` : postée par l'app, l'issue ne l'a pas encore montrée. `lue` : quand l'issue a été lue pour elle.
type Held = Answered & { ici: boolean; lue: number };

export const PAR_YOU = "you";
// Une carte répondue relit son issue au plus une fois par ce délai.
export const REREAD_MS = 120_000;

const same = (one: Answered | undefined, other: Answered | undefined) => one?.question === other?.question && one?.par === other?.par && one?.a === other?.a;

export function holdAnswered(now: () => number = Date.now) {
  const heldEntries = new Map<string, Map<number, Held>>();
  const itsOwnOf = (project: string) => {
    const itsOwn = heldEntries.get(project) ?? new Map<number, Held>();
    heldEntries.set(project, itsOwn);
    return itsOwn;
  };
  // Pose ou retire ce que l'on sait d'un ticket ; rend vrai si le rail en change.
  const set = (project: string, ticket: number, heldOne: Held | undefined): boolean => {
    const itsOwn = itsOwnOf(project);
    const before = itsOwn.get(ticket);
    if (heldOne === undefined) itsOwn.delete(ticket);
    else itsOwn.set(ticket, heldOne);
    return !same(before, heldOne);
  };
  return {
    // L'issue d'un ticket qui t'attend vient d'être lue. Sa question répondue sur l'issue : la carte
    // attend le manager. Plus de question, une autre, ou la même sans réponse : elle t'attend — sauf
    // la réponse que l'app vient de poster, que GitHub peut ne pas montrer encore. Une issue qui n'a
    // pas pu être lue ne change rien. Rend vrai si le rail en change.
    lue(project: string, ticket: unknown, readEntry: Read): boolean {
      if (typeof ticket !== "number" || "sans" in readEntry) return false;
      const before = itsOwnOf(project).get(ticket);
      const readOne = now();
      if ("aucune" in readEntry) return set(project, ticket, undefined);
      const { url, repondue: answeredOne } = readEntry.question;
      if (answeredOne !== undefined) return set(project, ticket, { question: url, par: answeredOne.auteur, a: answeredOne.a, ici: false, lue: readOne });
      if (before?.ici === true && before.question === url) return set(project, ticket, { ...before, lue: readOne });
      return set(project, ticket, undefined);
    },
    // La réponse du chef à cette question vient de partir sur l'issue, depuis la fiche.
    postee(project: string, ticket: unknown, question: string): boolean {
      if (typeof ticket !== "number") return false;
      const readOne = now();
      return set(project, ticket, { question, par: PAR_YOU, a: new Date(readOne).toISOString(), ici: true, lue: readOne });
    },
    // Les tickets de ce projet dont la question est répondue.
    de(project: string): ReadonlyMap<number, Answered> {
      return new Map([...(heldEntries.get(project) ?? [])].map(([ticket, { question, par, a }]) => [ticket, { question, par, a }]));
    },
    // Ce que la file nomme encore (`nommes`) : le reste est lâché — le manager a découpé l'épique, ou
    // elle a été fermée. Indéfini, la file n'est pas lue : rien n'est lâché. Rend les tickets dont
    // l'issue est à relire maintenant, lue depuis plus de `RELIRE_MS` : ils comptent comme relus.
    garder(project: string, named: ReadonlySet<number> | undefined): number[] {
      const itsOwn = heldEntries.get(project);
      if (itsOwn === undefined) return [];
      const readOne = now();
      const arelire: number[] = [];
      for (const [ticket, heldOne] of itsOwn) {
        if (named !== undefined && !named.has(ticket)) itsOwn.delete(ticket);
        else if (readOne - heldOne.lue >= REREAD_MS) {
          heldOne.lue = readOne;
          arelire.push(ticket);
        }
      }
      return arelire;
    },
  };
}
