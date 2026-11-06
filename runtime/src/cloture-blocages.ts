// La clôture et les blocages sans question : un projet dont le statut compte
// des `blocked-on-human` sans question posée n'est pas clos propre — la
// clôture ouvre un défaut à corriger, qui nomme le décompte.

// Le défaut que la clôture ouvre.
export interface DefautDeCloture {
  title: string;
  body: string;
}

// Ce que la clôture lit du statut.
export interface StatutDeCloture {
  blockedWithoutQuestion: number;
}

// La marque du défaut dans son corps, avec le décompte qu'il nomme : le décompte ne se remet jamais à zéro,
// un défaut ouvert ou fermé pour ce décompte n'est pas rouvert à chaque passe.
const MARQUE = /<!-- brigade:blocages-sans-question n=(\d+) -->/;

// Le décompte nommé par la marque du corps d'une issue, ou `null` quand le corps n'en porte pas.
export function decompteMarque(corps: string): number | null {
  const trouve = MARQUE.exec(corps);
  return trouve === null ? null : Number(trouve[1]);
}

// Le défaut à ouvrir, ou `null` quand le décompte est nul.
export function defautDesBlocagesSansQuestion(statut: StatutDeCloture): DefautDeCloture | null {
  const n = statut.blockedWithoutQuestion;
  // A field missing or malformed is not a zero: the closer must not take it for a clean project.
  if (!Number.isInteger(n) || n < 0) throw new Error(`blockedWithoutQuestion is not a count: ${String(n)}`);
  if (n === 0) return null;
  return {
    title: `${n} blocked-on-human without a question`,
    body:
      `<!-- brigade:blocages-sans-question n=${n} -->\n\nThe status counts ${n} blocked-on-human without a product or design question. ` +
      "Each is a failure of autonomy: fix it like a bug instead of closing the project as clean.",
  };
}
