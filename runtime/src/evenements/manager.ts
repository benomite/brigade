// Les faits du manager : l'interrupteur que le chef tient, et chaque décision
// prise sur une issue — écartée par le code, jugée par le LLM —, avec son
// motif, puis ce qui en a été posé et dit sur GitHub.

// Ce qu'une issue est, d'après le jugement. Seul `ticket` entre sur le rail.
// `incomplete` : une unité de travail, mais à laquelle il manque de quoi partir.
export const NATURES = ["ticket", "epic", "question", "decision", "incomplete"] as const;
export type Nature = (typeof NATURES)[number];

// Chaque nature telle qu'elle se dit au chef.
export const NOMS_DE_NATURE: Record<Nature, string> = {
  ticket: "un ticket",
  epic: "une épique",
  question: "une question",
  decision: "une issue de décision",
  incomplete: "un ticket incomplet",
};

// Pourquoi le code écarte une issue sans la faire juger. `chef-changed` : le
// manager y a déjà posé des labels, et le chef en a retiré depuis — tout ce
// qu'elle porte est désormais à lui.
export type Ecart = "roadmap" | "epic" | "question" | "decision" | "blocked-on-human" | "untrusted-author" | "chef-changed";

export type FaitManager =
  // Les commandes du chef. Sans `manager.enabled`, le manager ne juge rien.
  | { type: "manager.enabled"; payload: Record<string, never> }
  | { type: "manager.disabled"; payload: Record<string, never> }
  // Le code a tranché, sans LLM. `fired` : l'issue porte `fire`, posé par le
  // chef — le manager ne le retire pas, et ne la calibre pas.
  | { type: "manager.set-aside"; payload: { reason: Ecart; fired: boolean } }
  // Le LLM a jugé. `run` : le jugement, dont le calibrage et le coût sont dans
  // son `cook.launched` et son `cook.exited`. `fingerprint` : l'empreinte de
  // ce qui a été jugé — la même ne se rejuge pas. `reason` : le motif.
  // `missing` : ce qui rendrait exécutable une issue refusée. `calibration` :
  // pourquoi ce modèle et cet effort.
  | {
      type: "manager.judged";
      payload: {
        run: string;
        fingerprint: string;
        verdict: "fire" | "refused";
        kind: Nature;
        reason: string;
        missing: string | null;
        model: string | null;
        effort: string | null;
        calibration: string | null;
      };
    }
  // Le jugement n'a rendu aucune décision lisible : rien n'est posé.
  | { type: "manager.failed"; payload: { run: string; fingerprint: string; reason: string } }
  // Ce que le manager a posé sur l'issue, écrit une fois GitHub servi : c'est
  // la seule mémoire de ce qui vient de lui — tout autre label est au chef.
  | { type: "manager.labeled"; payload: { labels: string[] } }
  // La décision est dite sur l'issue.
  | { type: "manager.commented"; payload: Record<string, never> };
