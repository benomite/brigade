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
// `already-split` : une épique dont le corps porte déjà la liste de ses tickets,
// sans que le journal sache l'avoir découpée — elle l'a été à la main.
export type Ecart = "roadmap" | "epic" | "question" | "decision" | "blocked-on-human" | "untrusted-author" | "chef-changed" | "already-split";

// La commande par laquelle le chef rend au manager une issue écartée
// `chef-changed`, telle qu'elle se dit sur l'issue et dans le relevé.
export const commandeRendre = (numero: number) => `npm --prefix runtime run manager -- rendre ${numero}`;

// Un ticket tel que le découpage le prévoit, avant qu'il n'existe sur GitHub.
// `waitsFor` : les rangs, à partir de 1, des tickets du même découpage qu'il
// attend — toujours plus petits que le sien, c'est ce qui fait l'ordre.
export type TicketPrevu = {
  title: string;
  context: string;
  criteria: string[];
  waitsFor: number[];
  zone: string[];
  // Ceux de ses `waitsFor` que le code a ajoutés au découpage : sa zone
  // recouvrait la leur sans qu'il les attende. `path` : le chemin en commun.
  overlaps?: { index: number; path: string }[];
  model: string;
  effort: string;
  calibration: string;
};

// Ce que le manager fait d'un ticket que la pass lui a passé. `retry` : le
// second renvoi, au même calibrage — rien ne pouvait monter. `raise` : il monte
// le calibrage. `split` : il le redécoupe. `escalate` : il le remonte au chef.
export type ChoixDeReaction = "retry" | "raise" | "split" | "escalate";

// La réaction du manager à un ticket rouge. L'enveloppe porte son numéro.
export type FaitReaction =
  // Le choix, et son motif : c'est ici que le chef lit « pourquoi ce ticket
  // a-t-il été découpé ? ». `verdict` : le numéro de séquence du `pass.judged`
  // auquel il répond — le même ne se décide pas deux fois. `returns` : les
  // renvois déjà consommés. `run` : le jugement qui a choisi, nul quand le
  // code a tranché seul. `from`, `to` : le calibrage, avant et après une
  // montée. `proposal` : ce qu'il propose au chef, quand il remonte.
  | {
      type: "manager.reacted";
      payload: {
        verdict: number;
        returns: number;
        choice: ChoixDeReaction;
        reason: string;
        proposal: string | null;
        run: string | null;
        from: { model: string; effort: string };
        to: { model: string; effort: string } | null;
      };
    }
  // Les labels de calibrage changés par une montée, écrit une fois GitHub
  // servi. `added` : ceux-là sont au manager, il pourra les remplacer encore.
  | { type: "manager.raised"; payload: { added: string[]; removed: string[] } }
  // La réaction est dite sur l'issue.
  | { type: "manager.reaction-commented"; payload: Record<string, never> };

export type FaitManager =
  | FaitReaction
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
  // Le jugement est allé à son terme, mais sa réponse ne se lit pas : rien
  // n'est posé. Un jugement qui n'a pas abouti (panne, garde-fou) n'écrit rien
  // ici : il est retenté.
  | { type: "manager.failed"; payload: { run: string; fingerprint: string; reason: string } }
  // Ce que le manager a posé sur l'issue, écrit une fois GitHub servi : c'est
  // la seule mémoire de ce qui vient de lui — tout autre label est au chef.
  | { type: "manager.labeled"; payload: { labels: string[] } }
  // La décision est dite sur l'issue.
  | { type: "manager.commented"; payload: Record<string, never> }
  // Le chef rend au manager une issue écartée `chef-changed` : le manager
  // oublie ce qu'il en avait décidé et ce qu'il y avait posé, et la rejuge.
  // Une remise vaut pour un jugement : écartée de nouveau, il en faut une autre.
  | { type: "manager.handed-back"; payload: Record<string, never> }
  // Les labels de calibrage que le manager avait posés sur une issue rendue,
  // et qu'il en a retirés avant de la rejuger, écrit une fois GitHub servi.
  | { type: "manager.withdrew"; payload: { labels: string[] } }
  // --- Le découpage d'une épique. Sauf mention contraire, l'enveloppe porte le
  // numéro de l'épique.
  //
  // Le LLM a découpé : c'est l'intention, écrite avant tout appel à GitHub.
  // `reason` : pourquoi ces tickets-là ; `order` : pourquoi cet ordre. Une
  // épique qui porte ce fait n'est plus jamais rejugée.
  | { type: "manager.split"; payload: { run: string; fingerprint: string; reason: string; order: string; tickets: TicketPrevu[] } }
  // Le LLM ne découpe pas ce qu'il ne comprend pas : il pose une question au
  // chef. L'épique est relue quand elle change.
  | { type: "manager.split-asked"; payload: { run: string; fingerprint: string; question: string } }
  // Le LLM lit que l'épique liste déjà ses tickets : rien n'est créé.
  | { type: "manager.split-skipped"; payload: { run: string; fingerprint: string; reason: string } }
  // Le découpage est allé à son terme, mais sa réponse ne se lit pas.
  | { type: "manager.split-failed"; payload: { run: string; fingerprint: string; reason: string } }
  // Le ticket de rang `index` va être créé : écrit avant l'appel. Sans
  // `split-created` derrière lui, rien ne dit si GitHub l'a créé — il se
  // cherche avant d'être recréé.
  | { type: "manager.split-creating"; payload: { index: number } }
  // L'enveloppe porte le numéro du ticket né. `reconciled` : retrouvé sur
  // GitHub après une création dont le fait manquait.
  | { type: "manager.split-created"; payload: { epic: number; index: number; reconciled: boolean } }
  // Sa fiche est posée, puis `fire` : il est sur le rail. Enveloppe : le ticket.
  | { type: "manager.split-fired"; payload: { epic: number; index: number } }
  // Tous les tickets prévus existent et sont lancés.
  | { type: "manager.split-done"; payload: Record<string, never> }
  // Ce que le manager avait à dire du découpage est dit sur l'épique.
  | { type: "manager.split-commented"; payload: Record<string, never> }
  // Un ticket que le chef a rattaché lui-même à une épique découpée, par la
  // ligne « Épique : #N » de son corps. Enveloppe : le ticket.
  | { type: "manager.split-adopted"; payload: { epic: number; title: string } }
  // Un ticket d'une épique a quitté la liste des issues ouvertes, ou y est
  // revenu. Enveloppe : le ticket.
  | { type: "manager.split-seen"; payload: { epic: number; open: boolean } }
  // La liste des tickets est écrite dans le corps de l'épique. `digest` :
  // l'empreinte de ce qui y est écrit — la même ne se réécrit pas.
  | { type: "manager.split-listed"; payload: { digest: string } };
