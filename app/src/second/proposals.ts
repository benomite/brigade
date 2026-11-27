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
export type Channel = {
  fichierDeProposition(folder: string): string;
  suivreLaProposition(path: string, ecouter: (proposal: Proposition | null) => void): Suivi;
  repondre(path: string, raw: unknown): Repondue;
};

// Ce que la vue signale : le chef a répondu à la proposition `id`, d'un clic sur un choix, d'un geste confirmé et
// lancé (#1521, sans valeur), ou en tapant dans le terminal du second.
export type AnswerOfChef = { id: string; by: "click"; value: string } | { id: string; by: "click" } | { id: string; by: "text" };

export type Proposals = {
  // Les projets du fichier, tels qu'ils sont maintenant : chacun qui s'ouvre est suivi, les autres ne le sont plus.
  suivre(projects: readonly { nom: string; dossier: string; refus?: string }[]): void;
  // La proposition en cours de chaque projet qui en a une.
  vu(): Record<string, Proposition>;
  repondre(project: string, answer: AnswerOfChef): Repondue;
  arreter(): void;
};

export function holdTheProposals({ canal: channel, surProposition: onProposal }: { canal: Channel; surProposition: (project: string, proposal: Proposition | null) => void }): Proposals {
  const tracked = new Map<string, { dossier: string; chemin: string; suivi: Suivi }>();
  const forget = (name: string) => {
    const tenu = tracked.get(name);
    if (tenu === undefined) return;
    tracked.delete(name);
    tenu.suivi.arreter();
    if (tenu.suivi.actuelle() !== null) onProposal(name, null);
  };
  return {
    suivre(projects) {
      const openOnes = new Map(projects.filter(({ refus: refusal }) => refusal === undefined).map(({ nom: name, dossier: folder }) => [name, folder]));
      for (const [name, { dossier: folder }] of tracked) if (openOnes.get(name) !== folder) forget(name);
      for (const [name, folder] of openOnes) {
        if (tracked.has(name)) continue;
        const path = channel.fichierDeProposition(folder);
        // Le suivi rend la proposition en cours dès qu'il commence : la vue ne reçoit que ce qui en change.
        let first = true;
        const tracking = channel.suivreLaProposition(path, (proposal) => {
          if (first && proposal === null) return;
          onProposal(name, proposal);
        });
        first = false;
        tracked.set(name, { dossier: folder, chemin: path, suivi: tracking });
      }
    },
    vu() {
      const heldEntries: Record<string, Proposition> = {};
      for (const [name, { suivi: tracking }] of tracked) {
        const proposal = tracking.actuelle();
        if (proposal !== null) heldEntries[name] = proposal;
      }
      return heldEntries;
    },
    repondre(project, answer) {
      const tenu = tracked.get(project);
      if (tenu === undefined) return { state: "refused", reason: "nothing to answer: this project's second is not followed", current: null };
      return channel.repondre(tenu.chemin, answer);
    },
    arreter() {
      for (const { suivi: tracking } of tracked.values()) tracking.arreter();
      tracked.clear();
    },
  };
}
