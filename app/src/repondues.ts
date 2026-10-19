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
import type { Lue } from "./question.ts";

// Une question répondue : son adresse, qui y a répondu — `you` pour une réponse que l'app vient de
// poster, avant que l'issue relue ne donne le compte —, et quand.
export type Repondue = { question: string; par: string; a: string };
// `ici` : postée par l'app, l'issue ne l'a pas encore montrée. `lue` : quand l'issue a été lue pour elle.
type Tenue = Repondue & { ici: boolean; lue: number };

export const PAR_TOI = "you";
// Une carte répondue relit son issue au plus une fois par ce délai.
export const RELIRE_MS = 120_000;

const meme = (une: Repondue | undefined, autre: Repondue | undefined) => une?.question === autre?.question && une?.par === autre?.par && une?.a === autre?.a;

export function tenirRepondues(maintenant: () => number = Date.now) {
  const tenues = new Map<string, Map<number, Tenue>>();
  const siennesDe = (projet: string) => {
    const siennes = tenues.get(projet) ?? new Map<number, Tenue>();
    tenues.set(projet, siennes);
    return siennes;
  };
  // Pose ou retire ce que l'on sait d'un ticket ; rend vrai si le rail en change.
  const poser = (projet: string, ticket: number, tenue: Tenue | undefined): boolean => {
    const siennes = siennesDe(projet);
    const avant = siennes.get(ticket);
    if (tenue === undefined) siennes.delete(ticket);
    else siennes.set(ticket, tenue);
    return !meme(avant, tenue);
  };
  return {
    // L'issue d'un ticket qui t'attend vient d'être lue. Sa question répondue sur l'issue : la carte
    // attend le manager. Plus de question, une autre, ou la même sans réponse : elle t'attend — sauf
    // la réponse que l'app vient de poster, que GitHub peut ne pas montrer encore. Une issue qui n'a
    // pas pu être lue ne change rien. Rend vrai si le rail en change.
    lue(projet: string, ticket: unknown, lue: Lue): boolean {
      if (typeof ticket !== "number" || "sans" in lue) return false;
      const avant = siennesDe(projet).get(ticket);
      const lu = maintenant();
      if ("aucune" in lue) return poser(projet, ticket, undefined);
      const { url, repondue } = lue.question;
      if (repondue !== undefined) return poser(projet, ticket, { question: url, par: repondue.auteur, a: repondue.a, ici: false, lue: lu });
      if (avant?.ici === true && avant.question === url) return poser(projet, ticket, { ...avant, lue: lu });
      return poser(projet, ticket, undefined);
    },
    // La réponse du chef à cette question vient de partir sur l'issue, depuis la fiche.
    postee(projet: string, ticket: unknown, question: string): boolean {
      if (typeof ticket !== "number") return false;
      const lu = maintenant();
      return poser(projet, ticket, { question, par: PAR_TOI, a: new Date(lu).toISOString(), ici: true, lue: lu });
    },
    // Les tickets de ce projet dont la question est répondue.
    de(projet: string): ReadonlyMap<number, Repondue> {
      return new Map([...(tenues.get(projet) ?? [])].map(([ticket, { question, par, a }]) => [ticket, { question, par, a }]));
    },
    // Ce que la file nomme encore (`nommes`) : le reste est lâché — le manager a découpé l'épique, ou
    // elle a été fermée. Indéfini, la file n'est pas lue : rien n'est lâché. Rend les tickets dont
    // l'issue est à relire maintenant, lue depuis plus de `RELIRE_MS` : ils comptent comme relus.
    garder(projet: string, nommes: ReadonlySet<number> | undefined): number[] {
      const siennes = tenues.get(projet);
      if (siennes === undefined) return [];
      const lu = maintenant();
      const arelire: number[] = [];
      for (const [ticket, tenue] of siennes) {
        if (nommes !== undefined && !nommes.has(ticket)) siennes.delete(ticket);
        else if (lu - tenue.lue >= RELIRE_MS) {
          tenue.lue = lu;
          arelire.push(ticket);
        }
      }
      return arelire;
    },
  };
}
