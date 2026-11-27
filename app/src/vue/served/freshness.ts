// Le rail se relit une fois par minute et par projet (main.ts, la veille) : un merge se montre dans Served dans la minute.
// Toutes les cinq secondes (#3925), une cuisine affairée — dont chaque lecture trouve une liste changée, donc un 200 que
// GitHub compte — dépensait plus de 5 000 demandes par heure, le quota entier du compte (#4627). Un geste du chef relit
// aussitôt (`oublier`).
// Une lecture déjà tenue ne sert qu'à faire d'une seule lecture celles que les veilles du rail, des faits et de l'amont
// lancent ensemble : elle reste fraîche moins longtemps qu'un tour de veille. Les lectures conditionnelles (ETag) font
// que relire un rail inchangé ne coûte rien au budget GitHub.
export const INTERVAL_OF_THE_STANDBY_MS = 60_000;
export const FRESHNESS_MAX_OF_A_READ_MS = 55_000;
