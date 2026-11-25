// La pass renvoie une PR au cook pour le fond, jamais pour la forme d'un test (#4302). Les motifs de renvoi sont une
// liste fermée : un comportement faux, un critère non tenu, un test qui échoue. Une remarque de forme (nom, mise en page,
// style, test qui vérifie la forme) devient une note, ou un correctif de la pass : elle ne renvoie pas la PR. Sans E/S.

export const MOTIFS_DE_RENVOI = ["wrong behaviour", "unmet criterion", "failing test"] as const;
export type MotifDeRenvoi = (typeof MOTIFS_DE_RENVOI)[number];

const estUnMotifDeRenvoi = (motif: string): motif is MotifDeRenvoi => (MOTIFS_DE_RENVOI as readonly string[]).includes(motif);

// Ne renvoie rien si le motif est permis ; sinon lève, en nommant les motifs permis.
export function verifierMotifDeRenvoi(motif: string): asserts motif is MotifDeRenvoi {
  if (!estUnMotifDeRenvoi(motif)) throw new Error(`send-back reason "${motif}" refused: a PR is sent back only for one of: ${MOTIFS_DE_RENVOI.join(", ")}`);
}

export type Remarque = { nature: "behaviour" | "criterion" | "test-failure" | "form"; texte: string };
// Le premier élément est typé `string` : sous l'indexation stricte, `notes[0]` serait sinon `string | undefined` pour qui lit
// la note d'une PR qu'il sait de forme. La valeur reste un tableau simple, vide quand il n'y a aucune remarque de forme.
export type Verdict = { action: "merge" | "send-back"; notes: string[] & { 0: string }; motifs: MotifDeRenvoi[] };

const MOTIF_DE_LA_NATURE: Record<Exclude<Remarque["nature"], "form">, MotifDeRenvoi> = {
  behaviour: "wrong behaviour",
  criterion: "unmet criterion",
  "test-failure": "failing test",
};

// Les remarques de fond renvoient la PR, chacune avec son motif ; celles de forme font des notes. Une CI rouge sans
// remarque de fond est un test qui échoue : elle renvoie aussi. Sans motif, la PR part au merge.
export function jugerLaPR({ remarques, ci }: { remarques: readonly Remarque[]; ci: "green" | "red" }): Verdict {
  const notes = remarques.filter((r) => r.nature === "form").map((r) => r.texte) as Verdict["notes"];
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

// Le texte d'une relecture qui demande des changements, en remarques : chaque puce « - **Blocking** » est de fond, avec la
// nature que ses mots disent ; toute autre puce (« - Advice ») est de forme. Un texte sans puce est une seule remarque de fond.
export function remarquesDeLaRelecture(texte: string): Remarque[] {
  const puces = texte.split(/^(?=- )/m).filter((p) => p.startsWith("- "));
  if (puces.length === 0) return [{ nature: "behaviour", texte }];
  return puces.map((puce) => {
    if (!puce.startsWith("- **Blocking**")) return { nature: "form", texte: puce.trim() };
    if (/criterion/i.test(puce)) return { nature: "criterion", texte: puce.trim() };
    if (/mutation check|red on main|failing test|test fails|red ci/i.test(puce)) return { nature: "test-failure", texte: puce.trim() };
    return { nature: "behaviour", texte: puce.trim() };
  });
}

// Les motifs d'un renvoi par la relecture : celle-ci a demandé des changements, donc une relecture dont toutes les puces
// sont de forme renvoie quand même, pour un comportement faux.
export function motifsDeLaRelecture(texte: string): MotifDeRenvoi[] {
  const { motifs } = jugerLaPR({ remarques: remarquesDeLaRelecture(texte), ci: "green" });
  return motifs.length > 0 ? motifs : ["wrong behaviour"];
}

// La ligne qui énonce les motifs d'un renvoi, chacun vérifié contre la liste.
export function motifsEnonces(motifs: readonly string[]): string {
  for (const motif of motifs) verifierMotifDeRenvoi(motif);
  return `Send-back reason: ${motifs.join(", ")}`;
}
