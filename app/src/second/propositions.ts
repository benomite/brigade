// Ce que le second propose au chef (#1520, épique #1518), suivi pour la vue : la proposition en cours du second de
// chaque projet — une liste de choix, ou un geste —, qu'il publie par son canal (runtime/src/second-propositions/,
// #1519), et la réponse du chef, que l'app y signale. L'app ne lit pas le terminal : elle suit ce fichier, un par
// dossier de projet, et rien d'autre. Le canal est celui du runtime, chargé par main.ts : rien ici ne le refait.
//
// Un projet du fichier, qui s'ouvre, a son suivi ; il le perd quand il quitte la liste, ou change de dossier — la vue
// reçoit alors null pour lui. Chaque changement est dit à la vue (`surProposition`), et la dernière tenue se relit
// (`vu`) : la vue la demande à son démarrage, le suivi a pu commencer avant elle.
import type { Repondue, Suivi } from "../../../runtime/src/second-propositions/canal.ts";
import type { Proposition } from "../../../runtime/src/second-propositions/proposition.ts";

export type { Proposition };

// Ce que l'app prend du canal du runtime (canal.ts).
export type Canal = {
  fichierDeProposition(dossier: string): string;
  suivreLaProposition(chemin: string, ecouter: (proposition: Proposition | null) => void): Suivi;
  repondre(chemin: string, brute: unknown): Repondue;
};

// Ce que la vue signale : le chef a répondu à la proposition `id`, d'un clic sur un choix, d'un geste confirmé et
// lancé (#1521, sans valeur), ou en tapant dans le terminal du second.
export type AnswerDuChef = { id: string; by: "click"; value: string } | { id: string; by: "click" } | { id: string; by: "text" };

export type Propositions = {
  // Les projets du fichier, tels qu'ils sont maintenant : chacun qui s'ouvre est suivi, les autres ne le sont plus.
  suivre(projects: readonly { nom: string; dossier: string; refus?: string }[]): void;
  // La proposition en cours de chaque projet qui en a une.
  vu(): Record<string, Proposition>;
  repondre(project: string, answer: AnswerDuChef): Repondue;
  arreter(): void;
};

export function holdLesPropositions({ canal, surProposition }: { canal: Canal; surProposition: (project: string, proposition: Proposition | null) => void }): Propositions {
  const suivis = new Map<string, { dossier: string; chemin: string; suivi: Suivi }>();
  const oublier = (name: string) => {
    const tenu = suivis.get(name);
    if (tenu === undefined) return;
    suivis.delete(name);
    tenu.suivi.arreter();
    if (tenu.suivi.actuelle() !== null) surProposition(name, null);
  };
  return {
    suivre(projects) {
      const ouverts = new Map(projects.filter(({ refus: refusal }) => refusal === undefined).map(({ nom: name, dossier }) => [name, dossier]));
      for (const [name, { dossier }] of suivis) if (ouverts.get(name) !== dossier) oublier(name);
      for (const [name, dossier] of ouverts) {
        if (suivis.has(name)) continue;
        const chemin = canal.fichierDeProposition(dossier);
        // Le suivi rend la proposition en cours dès qu'il commence : la vue ne reçoit que ce qui en change.
        let first = true;
        const suivi = canal.suivreLaProposition(chemin, (proposition) => {
          if (first && proposition === null) return;
          surProposition(name, proposition);
        });
        first = false;
        suivis.set(name, { dossier, chemin, suivi });
      }
    },
    vu() {
      const tenues: Record<string, Proposition> = {};
      for (const [name, { suivi }] of suivis) {
        const proposition = suivi.actuelle();
        if (proposition !== null) tenues[name] = proposition;
      }
      return tenues;
    },
    repondre(project, answer) {
      const tenu = suivis.get(project);
      if (tenu === undefined) return { state: "refused", reason: "nothing to answer: this project's second is not followed", current: null };
      return canal.repondre(tenu.chemin, answer);
    },
    arreter() {
      for (const { suivi } of suivis.values()) suivi.arreter();
      suivis.clear();
    },
  };
}
