// La marque d'un correctif que le superviseur ouvre (#3914) : sa cause, cachée en
// tête de son corps. Sans import ni E/S : la lecture du rail de l'app la lit aussi,
// pour dire main rouge tant que le correctif d'un check rouge est sur le rail.

// La marque cachée de la cause d'un correctif, en tête de son corps.
// La cause se lit jusqu'à la fin de la marque : un check de la CI a des espaces dans son nom (« tests runtime (14/16) »).
export const MARQUE_DE_CAUSE = /^<!-- brigade:cause (.+?) -->$/m;
export const marqueDeCause = (cause: string) => `<!-- brigade:cause ${cause} -->`;
// Le correctif d'un check rouge de la base : ce que la base rouge ne retient pas.
export const estUnCorrectifDeLaCi = (corps: string): boolean => MARQUE_DE_CAUSE.exec(corps)?.[1]?.startsWith("ci:") === true;
