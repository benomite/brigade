// Le réveil du superviseur sur un ticket sans progrès (#4027, spec
// 2026-11-23-autonomy-trust-control, section A2) : un ticket qui n'a fait aucun
// progrès depuis 30 minutes, dans quelque état qu'il soit — en cuisine, en
// pass, mis de côté, parqué, en WAITING —, réveille le superviseur, une fois
// par période de silence.
//
// Un progrès : un nouveau commit, un résultat de CI, un verdict de relecture,
// ou un changement de label fait par un agent. Un label changé par un humain
// ou par la station elle-même n'en est pas un.
//
// Le compte part du dernier progrès du ticket ; sans progrès vu, du tour qui
// l'a vu le premier dans l'un de ces états. Un ticket qui sort de ces états
// oublie son compte. Rien n'est tenu d'un process à l'autre.
//
// La raison du réveil s'écrit sur le ticket, avec la date du dernier progrès.
// Ce qui observe les progrès sur le client de la station est dans `observer.ts`.

export const SANS_PROGRES_MS = 30 * 60_000;

const MARQUE_D_INACTIVITE = "<!-- brigade:no-progress";

export type GenreDeProgres = "commit" | "ci" | "review" | "label";

// `by` : qui l'a fait — un agent (cook, pass, manager, superviseur), un humain, ou la station.
// `at` : quand, en ISO ; un instant à venir ou illisible compte pour l'instant de l'observation.
export type Progres = { kind: GenreDeProgres | string; by: "agent" | "human" | "station" | string; at: string };

// Un ticket suivi, et son état dans les mots du glossaire : `cooking`, `in pass`, `set aside`, `parked`, `WAITING`.
export type TicketSuivi = { number: number; state: string };

// Le réveil : le ticket, son état, et depuis quand il ne progresse plus — `kind` nul quand
// aucun progrès n'a été vu, le compte partant alors du premier tour qui l'a vu.
type ReveilSansProgres = { ticket: number; state: string; since: string; kind: string | null };

export type OptionsDeLInactivite = {
  maintenant?: () => Date;
  // Réveille le superviseur ; `false` : il n'a pas pu partir (un run tient déjà le projet),
  // et le réveil se retente au tour suivant.
  reveiller: (reveil: ReveilSansProgres) => boolean | void;
  github: { commenter(ticket: number, corps: string): Promise<void> };
  dire?: (ligne: string) => void;
};

export type Inactivite = {
  progres(ticket: number, progres: Progres): void;
  passer(tickets: readonly TicketSuivi[]): Promise<void>;
};

const NOMS: Record<string, string> = { commit: "a new commit", ci: "a CI result", review: "a review verdict", label: "a label change by an agent" };

export function raisonDuReveil({ ticket, state, since, kind }: ReveilSansProgres): string {
  const dernier = kind === null ? `No progress seen since ${since}, when the station first saw it ${state}.` : `Last progress: ${NOMS[kind] ?? kind}, ${since}.`;
  return [
    `${MARQUE_D_INACTIVITE} since=${since} -->`,
    `**Supervisor** — woke because #${ticket} (${state}) has made no progress for 30 minutes or more: no new commit, CI result, review verdict or label change by an agent. ${dernier}`,
  ].join("\n");
}

export function ouvrirInactivite(options: OptionsDeLInactivite): Inactivite {
  const maintenant = options.maintenant ?? (() => new Date());
  const dire = options.dire ?? ((ligne: string) => console.error(`brigade : ${ligne}`));
  // Le dernier progrès de chaque ticket, ou le premier tour qui l'a vu suivi.
  const derniers = new Map<number, { a: number; kind: string | null }>();
  // Le début de la période de silence pour laquelle le superviseur a déjà été réveillé.
  const reveilles = new Map<number, number>();

  return {
    progres(ticket, { kind, by, at }) {
      if (kind === "label" && by !== "agent") return;
      const instant = maintenant().getTime();
      const lu = Date.parse(at);
      derniers.set(ticket, { a: Number.isNaN(lu) ? instant : Math.min(lu, instant), kind });
    },
    async passer(tickets) {
      const instant = maintenant().getTime();
      const suivis = new Set(tickets.map(({ number }) => number));
      for (const ticket of derniers.keys()) if (!suivis.has(ticket)) derniers.delete(ticket);
      for (const ticket of reveilles.keys()) if (!suivis.has(ticket)) reveilles.delete(ticket);
      for (const { number, state } of tickets) {
        const dernier = derniers.get(number) ?? { a: instant, kind: null };
        derniers.set(number, dernier);
        if (instant - dernier.a < SANS_PROGRES_MS || reveilles.get(number) === dernier.a) continue;
        const reveil = { ticket: number, state, since: new Date(dernier.a).toISOString(), kind: dernier.kind };
        if (options.reveiller(reveil) === false) continue;
        reveilles.set(number, dernier.a);
        try {
          await options.github.commenter(number, raisonDuReveil(reveil));
        } catch (erreur) {
          dire(`#${number}: the supervisor woke on no progress, but its reason was not written on the ticket — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        }
      }
    },
  };
}
