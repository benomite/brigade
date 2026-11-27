// Le rail se relit toutes les 5 secondes (main.ts, la veille) : un merge se montre dans Served quelques secondes après.
// Une lecture déjà tenue ne sert qu'à faire d'une seule lecture celles que les veilles du rail, des faits et de l'amont
// lancent ensemble : elle reste fraîche moins longtemps qu'un tour de veille. Les lectures conditionnelles (ETag) font
// que relire un rail inchangé ne coûte rien au budget GitHub.
export const INTERVAL_OF_THE_STANDBY_MS = 5_000;
export const FRESHNESS_MAX_OF_A_READ_MS = 4_000;
