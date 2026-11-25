// La pass renvoie une PR au cook pour le fond, jamais pour la forme d'un test (#4302). Les motifs de renvoi sont une
// liste fermée : un comportement faux, un critère non tenu, un test qui échoue. Une remarque de forme (nom, mise en page,
// style, test qui vérifie la forme) devient une note, ou un correctif de la pass : elle ne renvoie pas la PR. Sans E/S.

export const MOTIFS_DE_RENVOI = ["wrong behaviour", "unmet criterion", "failing test"] as const;
export type MotifDeRenvoi = (typeof MOTIFS_DE_RENVOI)[number];

export const estUnMotifDeRenvoi = (motif: string): motif is MotifDeRenvoi => (MOTIFS_DE_RENVOI as readonly string[]).includes(motif);

// Ne renvoie rien si le motif est permis ; sinon lève, en nommant les motifs permis.
export function verifierMotifDeRenvoi(motif: string): asserts motif is MotifDeRenvoi {
  if (!estUnMotifDeRenvoi(motif)) throw new Error(`send-back reason "${motif}" refused: a PR is sent back only for one of: ${MOTIFS_DE_RENVOI.join(", ")}`);
}

export type Remarque = { nature: "behaviour" | "criterion" | "test-failure" | "form"; texte: string };
export type Verdict = { action: "merge" | "send-back"; notes: string[]; motifs: MotifDeRenvoi[] };

const MOTIF_DE_LA_NATURE: Record<Exclude<Remarque["nature"], "form">, MotifDeRenvoi> = {
  behaviour: "wrong behaviour",
  criterion: "unmet criterion",
  "test-failure": "failing test",
};

// Les remarques de fond renvoient la PR, chacune avec son motif ; celles de forme font des notes. Une CI rouge sans
// remarque de fond est un test qui échoue : elle renvoie aussi. Sans motif, la PR part au merge.
export function jugerLaPR({ remarques, ci }: { remarques: readonly Remarque[]; ci: "green" | "red" }): Verdict {
  const notes = remarques.filter((r) => r.nature === "form").map((r) => r.texte);
  const motifs: MotifDeRenvoi[] = [];
  for (const r of remarques) {
    if (r.nature === "form") continue;
    const motif = MOTIF_DE_LA_NATURE[r.nature];
    if (!motifs.includes(motif)) motifs.push(motif);
  }
  if (ci === "red" && motifs.length === 0) motifs.push("failing test");
  return { action: motifs.length > 0 ? "send-back" : "merge", notes, motifs };
}

// Le commentaire d'un renvoi : il énonce son motif, pris dans la liste.
export function commentaireDeRenvoi({ motif, detail }: { motif: string; detail: string }): string {
  verifierMotifDeRenvoi(motif);
  return `Send-back reason: ${motif}\n\n${detail}`;
}
