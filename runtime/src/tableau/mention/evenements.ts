// Le fait de la mention du chef sur le tableau de la cuisine (`tableau/mention/`) :
// la box a posté, sous l'issue « Kitchen board », le commentaire qui nomme le
// chef et la décision qui l'attend.
//
// `key` : la clé de la décision — son nom, la sorte d'attente et l'instant où
// elle a commencé d'attendre. `board` : le numéro du tableau qui porte le
// commentaire. `decision` : le nom de la décision, tel que la file le dit.
export type FaitMentionDuTableau = { type: "board.mention"; payload: { key: string; board: number; decision: string } };
