// Les faits du correctif : une cause de ratage qui revient sur plusieurs
// tickets récents du projet, relevée comme candidate à une correction. Rien
// ici ne la corrige : c'est ce que les étapes suivantes liront.

// `cause` : la cause des ratages (`causes-des-ratages.ts`), `title` sa phrase.
// `tickets` : ceux de la fenêtre où elle a fait rater au moins un essai, dans
// l'ordre de leur prise. `failures` : les essais qu'elle a fait rater sur ces
// tickets, au moment du relevé. `threshold`, `window` : les réglages en
// vigueur — le nombre de tickets qui fait une récurrence, et les derniers
// tickets servis qu'on regarde.
export type CandidatACorrection = { cause: string; title: string; tickets: number[]; failures: number; threshold: number; window: number };

export type FaitCorrectif =
  // Écrit une fois par récurrence : un second relevé sur les mêmes tickets
  // n'écrit rien (`correctif/detecter.ts`).
  { type: "correction.candidate"; payload: CandidatACorrection };
