// Les faits du correctif : une cause de ratage qui revient sur plusieurs
// tickets récents du projet, relevée comme candidate à une correction, puis la
// correction proposée pour elle — ou écartée —, le « oui » ou le « non » du chef,
// et ce que le « oui » en a fait : une branche, une PR, remise à la pass.

// `cause` : la cause des ratages (`causes-des-ratages.ts`), `title` sa phrase.
// `tickets` : ceux de la fenêtre où elle a fait rater au moins un essai, dans
// l'ordre de leur prise. `failures` : les essais qu'elle a fait rater sur ces
// tickets, au moment du relevé. `threshold`, `window` : les réglages en
// vigueur — le nombre de tickets qui fait une récurrence, et les derniers
// tickets servis qu'on regarde.
export type CandidatACorrection = { cause: string; title: string; tickets: number[]; failures: number; threshold: number; window: number };

// La correction proposée pour une candidate (`correctif/proposer.ts`).
// `candidate` : le fait `correction.candidate` qu'elle corrige, par son `seq`.
// `run` : le lancement qui l'a écrite, et `tokens` ce qu'il a coûté, comptés
// comme ceux d'un cook (`cook.exited`). `reason` : pourquoi cette correction,
// dans les mots du modèle — null s'il n'en a rien dit. `diff` : la correction,
// un diff unifié des seules consignes du projet (`correctif/portee.ts`), et
// `files` les fichiers qu'il touche. `base` : le commit de la branche
// d'intégration sur lequel il s'applique tel quel.
export type PropositionDeCorrection = {
  candidate: number;
  cause: string;
  title: string;
  tickets: number[];
  run: string;
  tokens: number;
  reason: string | null;
  diff: string;
  files: string[];
  base: string;
};

// Une proposition qui n'est pas montrée : elle touche autre chose que les
// consignes du projet, ne s'applique pas, ou ne se lit pas. `reason` dit
// laquelle ; `files`, les fichiers que le diff nommait — vide s'il ne se lisait
// pas. Le diff n'est pas gardé : rien ne doit pouvoir le montrer.
export type CorrectionEcartee = { candidate: number; cause: string; tickets: number[]; run: string; tokens: number; reason: string; files: string[] };

// Le « oui » ou le « non » du chef sur une proposition (`correctif/decision.ts`).
// `proposal` : le fait `correction.proposed` qu'il tranche, par son `seq`.
// Sur un « non », `runs` : les essais ratés pour cette cause que le journal
// portait à cet instant, par leur run — c'est d'eux que la même cause doit
// s'écarter pour revenir en candidate (`correctif/detecter.ts`).
export type DecisionSurCorrection = { proposal: number; candidate: number; cause: string };
export type CorrectionRefusee = DecisionSurCorrection & { tickets: number[]; runs: string[] };

// La livraison d'une correction acceptée (`correctif/livrer.ts`). `run` : la
// livraison, qui nomme sa branche (`branch`) comme celle d'un cook. Partie,
// elle finit livrée — sa PR (`pr`, `number`) et le commit poussé (`sha`) — ou
// non livrée, et `reason` dit pourquoi ; `branch` y est nulle si elle n'a pas
// pu naître.
export type LivraisonDeCorrection = { proposal: number; run: string; branch: string };
export type CorrectionLivree = LivraisonDeCorrection & { pr: string; number: number; sha: string };
export type CorrectionNonLivree = { proposal: number; run: string; branch: string | null; reason: string };

export type FaitCorrectif =
  // Écrit une fois par récurrence : un second relevé sur les mêmes tickets
  // n'écrit rien (`correctif/detecter.ts`).
  | { type: "correction.candidate"; payload: CandidatACorrection }
  // L'un ou l'autre, une fois par candidate : la même clé d'unicité les tient.
  | { type: "correction.proposed"; payload: PropositionDeCorrection }
  | { type: "correction.discarded"; payload: CorrectionEcartee }
  // L'un ou l'autre, une fois par proposition : un second geste n'écrit rien.
  | { type: "correction.accepted"; payload: DecisionSurCorrection }
  | { type: "correction.refused"; payload: CorrectionRefusee }
  // Chaque fois qu'une livraison part — une seconde ne part que si la
  // précédente est morte avec le runtime sans avoir ouvert de PR.
  | { type: "correction.started"; payload: LivraisonDeCorrection }
  // L'un ou l'autre, une fois par proposition : une PR au plus.
  | { type: "correction.delivered"; payload: CorrectionLivree }
  | { type: "correction.undelivered"; payload: CorrectionNonLivree };
