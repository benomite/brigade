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

// Le défaut à ouvrir, ou `null` quand le décompte est nul.
export function defautDesBlocagesSansQuestion(statut: StatutDeCloture): DefautDeCloture | null {
  const n = statut.blockedWithoutQuestion;
  if (!(n > 0)) return null;
  return {
    title: `${n} blocked-on-human without a question`,
    body:
      `The status counts ${n} blocked-on-human without a product or design question. ` +
      "Each is a failure of autonomy: fix it like a bug instead of closing the project as clean.",
  };
}
