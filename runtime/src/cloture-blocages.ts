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

// La marque du défaut dans son corps : un défaut déjà ouvert n'est pas rouvert à chaque passe.
export const MARQUE_DES_BLOCAGES = "<!-- brigade:blocages-sans-question -->";

// Le défaut à ouvrir, ou `null` quand le décompte est nul.
export function defautDesBlocagesSansQuestion(statut: StatutDeCloture): DefautDeCloture | null {
  const n = statut.blockedWithoutQuestion;
  // A field missing or malformed is not a zero: the closer must not take it for a clean project.
  if (!Number.isInteger(n) || n < 0) throw new Error(`blockedWithoutQuestion is not a count: ${String(n)}`);
  if (n === 0) return null;
  return {
    title: `${n} blocked-on-human without a question`,
    body:
      `${MARQUE_DES_BLOCAGES}\n\nThe status counts ${n} blocked-on-human without a product or design question. ` +
      "Each is a failure of autonomy: fix it like a bug instead of closing the project as clean.",
  };
}
