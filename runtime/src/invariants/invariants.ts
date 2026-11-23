// Les invariants du rail (#4026, spec 2026-11-23-autonomy-trust-control, A1) :
// quatre phrases, contrôlées à chaque tour de la station. Quand l'une casse, le
// superviseur la répare d'un geste qu'il a déjà, et écrit sur le ticket quel
// invariant a cassé et ce qu'il a fait :
//   1. un ticket qu'aucun cook ne cuit et qui n'est pas en pass ne tient ni ne
//      réserve aucune zone de fichiers (zones.ts) ;
//   2. le même échec sur le même commit n'est ni jugé ni relancé deux fois
//      (meme-echec.ts) ;
//   3. un ticket mis de côté, parqué ou en WAITING a une raison nommée et une
//      date pour le revoir (mis-de-cote.ts) ;
//   4. un check rouge sur la base est relancé une fois avant toute autre chose
//      (base-rouge.ts).
// Un nouveau genre de panne devient un invariant de plus, pas un mécanisme de plus.
import type { CheckDeLaBase } from "../checks-de-la-branche.ts";
import type { GitHubDuTour, TicketLu } from "../brigade-github.ts";
import { LimiteGitHubAtteinte } from "../limite-github.ts";
import { baseRougeRelancee, type RelancerLaBase } from "./base-rouge.ts";
import { memeEchecRelance } from "./meme-echec.ts";
import { misDeCoteSansDate } from "./mis-de-cote.ts";
import { zonesSansCook } from "./zones.ts";

// Ce qu'un tour donne à ses contrôles. `tickets` : les tickets lancés du tour,
// tels que les gestes des invariants les laissent — un ticket mis de côté par
// l'invariant 2 ne se prend pas au même tour.
export type TourDesInvariants = {
  station: string;
  base: string;
  maintenant: Date;
  github: GitHubDuTour;
  tickets: TicketLu[];
  checksDeLaBase: readonly CheckDeLaBase[];
  // Le ticket a-t-il un cook ici en ce moment ?
  enCuisine(numero: number): boolean;
  // Les PR ouvertes, lues une fois par tour ; la zone d'un ticket, comme la porte de prise la lit.
  prsOuvertes(): ReturnType<GitHubDuTour["prsOuvertes"]>;
  zoneDuTicket(numero: number): Promise<string[]>;
  // L'arrêt d'un ticket après son dernier essai (le manager le reprend, ou il est mis de côté) : rend ce qui a été fait.
  arreter(ticket: TicketLu, motifs: string[]): Promise<string>;
  // Répare un invariant cassé : le geste, puis le commentaire qui le dit. Rend vrai s'il a réparé.
  reparer(reparation: Reparation): Promise<boolean>;
  // Retient le reste du tour : rien d'autre ne s'y fait (invariant 4).
  retenir(): void;
};

export type Invariant = (tour: TourDesInvariants) => Promise<void>;

// `cle` : ce qui distingue cette casse d'une autre du même invariant sur le
// même ticket ; une casse déjà dite sur le ticket ne se répare ni ne se redit.
// `entete` : ce qui ouvre le commentaire, avant la marque (la marque de WAITING
// que ses lecteurs relisent en tête). `geste` rend ce qu'il a fait, ou nul
// quand il n'y avait rien qu'il puisse faire : rien n'est dit.
export type Reparation = { invariant: 1 | 2 | 3 | 4; ticket: number | null; cle: string; casse: string; geste: () => Promise<string | null>; entete?: string };

const MARQUE = "<!-- brigade:invariant";
export const marqueDeLInvariant = (invariant: number, cle: string) => `${MARQUE} n=${invariant} ${cle} -->`;

// Le commentaire d'une réparation : quel invariant a cassé, ce que le superviseur a fait.
export const corpsDeLaReparation = ({ invariant, cle, casse, entete }: Omit<Reparation, "geste" | "ticket">, fait: string, station: string) =>
  [...(entete === undefined ? [] : [entete, ""]), marqueDeLInvariant(invariant, cle), `**Invariant ${invariant} broke** — ${casse}`, "", `What the supervisor did (station \`${station}\`): ${fait}`].join("\n");

// Le contrôleur des invariants d'une station : chaque contrôle une fois par tour,
// dans l'ordre — la base d'abord. Un contrôle qui échoue est dit, et ne retient
// ni les autres ni le tour. Rend vrai quand le tour est retenu.
export function controleurDesInvariants(invariants: readonly Invariant[], avertir: (texte: string) => void) {
  // Les casses déjà dites : le tour suivant ne relit pas leurs commentaires.
  const dites = new Set<string>();
  return async (tour: Omit<TourDesInvariants, "reparer" | "retenir">): Promise<boolean> => {
    let retenu = false;
    const reparer = async (reparation: Reparation): Promise<boolean> => {
      // Retenu par la relance de la base : aucun autre geste avant son résultat.
      if (retenu) return false;
      const { invariant, ticket, cle } = reparation;
      const id = `${ticket ?? "base"} ${invariant} ${cle}`;
      if (dites.has(id)) return false;
      try {
        if (ticket !== null && (await tour.github.commentaires(ticket)).some(({ body }) => body.includes(marqueDeLInvariant(invariant, cle)))) {
          dites.add(id);
          return false;
        }
        const fait = await reparation.geste();
        dites.add(id);
        if (fait === null) return false;
        if (ticket === null) avertir(`brigade : invariant ${invariant} broke on ${tour.station} — ${reparation.casse}; the supervisor ${fait}`);
        else await tour.github.commenter(ticket, corpsDeLaReparation(reparation, fait, tour.station));
        return true;
      } catch (erreur) {
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
        avertir(`brigade : invariant ${invariant} broke on ${tour.station}${ticket === null ? "" : ` (#${ticket})`} — ${reparation.casse}; it could not be repaired, retried next turn: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        return false;
      }
    };
    const complet: TourDesInvariants = { ...tour, reparer, retenir: () => void (retenu = true) };
    for (const invariant of invariants) {
      try {
        await invariant(complet);
      } catch (erreur) {
        // GitHub limite ses appels : le tour s'arrête, comme pour ses autres lectures.
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
        avertir(`brigade : an invariant of the rail could not be checked on ${tour.station}, checked again next turn — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    }
    return retenu;
  };
}

// Les quatre contrôles du rail, la base d'abord : sa relance passe avant tout autre geste.
export const invariantsDuRail = (relancer: RelancerLaBase): Invariant[] => [baseRougeRelancee(relancer), zonesSansCook, memeEchecRelance, misDeCoteSansDate];
