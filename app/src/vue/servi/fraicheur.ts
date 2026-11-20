// Le rail se relit toutes les trente secondes (main.ts, la veille) : une lecture déjà tenue ne sert qu'à faire d'une seule
// lecture celles que les veilles du rail, des faits et de l'amont lancent ensemble. Plus longtemps gardée, elle cachait
// un merge au chef — Served ne le montrait qu'une minute après — (#3925) ; les lectures conditionnelles (ETag) font que
// relire un rail inchangé ne coûte rien au budget GitHub.
export const FRAICHEUR_MAX_D_UNE_LECTURE_MS = 5_000;
