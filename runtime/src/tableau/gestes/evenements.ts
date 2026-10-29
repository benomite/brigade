// Les faits des gestes du chef sur le tableau de la cuisine (`tableau/gestes/`) :
// un commentaire du chef sur l'issue « Kitchen board », lu, joué ou refusé, puis
// sa réponse d'une ligne postée sous lui. Le ticket du geste est dans
// l'enveloppe — nul pour un geste incompris, et pour la réponse à une
// correction ou à un profil proposés, qui ne sont pas des tickets.
//
// `comment` : l'id GitHub du commentaire, croissant d'un commentaire au
// suivant — le plus grand lu est le curseur de la box, et un commentaire n'est
// joué qu'une fois (la clé d'unicité du fait le garde). `board` : le numéro du
// tableau qui le porte. `url` : l'adresse du commentaire. `writtenAt` : son
// heure sur GitHub. `gesture` : le geste lu (`merge`, `send-back`, `set-aside`,
// `answer`, `choose`, `arrived`, `comment`, `ask`, `correction`, `profile`, ou le premier mot d'un geste de box : `cooks`, `stop`, `resume`,
// `base`, `grant`, `station`), nul s'il ne se comprend pas. `done` : joué, ou refusé —
// incompris compris. `reply` : la ligne que la box répond sous lui. `request` :
// la demande au second qu'un `ask` joué a composée, mot pour mot — absente de
// tout autre geste. `toSecond` : elle est partie dans le second du projet, que
// cette box tient — sa réponse est un `board.second`.
export type FaitGesteDuTableau =
  | {
      type: "board.gesture";
      payload: { comment: number; board: number; url: string; author: string; writtenAt: string; gesture: string | null; done: boolean; reply: string; request?: string; toSecond?: boolean };
    }
  // La réponse au geste `comment` est postée sous lui. Tant qu'elle ne l'est
  // pas — GitHub l'a refusée —, la box la reposte au passage suivant.
  | { type: "board.replied"; payload: { comment: number; board: number } }
  // Le second du projet a répondu à la demande d'un `ask` (`answered`, et sa
  // réponse, `answer`), ou ne l'a pas fait (`reason`). `reply` : le commentaire
  // que la box poste sous le geste pour le dire. Une fois par geste.
  | { type: "board.second"; payload: { comment: number; board: number; answered: boolean; answer: string | null; reason: string | null; reply: string } }
  // Ce commentaire est posté sous le geste. Tant qu'il ne l'est pas, la box le
  // reposte au passage suivant.
  | { type: "board.second-replied"; payload: { comment: number; board: number } };
