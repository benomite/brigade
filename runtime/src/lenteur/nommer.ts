// Le plus lent d'un projet, dit en mots simples (#2350, épique #2337).
//
// Quatre candidats : la durée médiane de la CI, des gates, des tests, et la
// part médiane du temps d'un cook passée dans ses outils. Tous se comparent en
// secondes : la part des outils pèse sa part de la durée médiane d'un cook.
// Le plus lourd est nommé ; sans aucune mesure, rien n'est nommé (`null`).
import { lireDurees, type Durees } from "./durees.ts";
import { lirePartsCook, type PartCook } from "./part-cook.ts";

export type Partie = "ci" | "gates" | "tests" | "cook";
export type Chiffres = { mediane: number; impact: number; mesures: number };
export type PlusLent = { partie: Partie; phrase: string; chiffres: Chiffres };
export type Lecteurs = {
  lireDurees: (projet: string) => Durees;
  lirePartsCook: (racine: string) => Pick<PartCook, "partOutils" | "claude" | "outils">[];
};
// `racine` : le dossier du projet, où vivent les parts des cooks (par défaut `projet`).
// `env` : d'où `lireDurees` trouve l'état de la station.
export type Ou = { racine?: string; env?: Record<string, string | undefined>; lecteurs?: Lecteurs };

function mediane(valeurs: number[]): number {
  const tri = [...valeurs].sort((a, b) => a - b);
  const m = tri.length >> 1;
  return tri.length % 2 === 1 ? (tri[m] ?? 0) : ((tri[m - 1] ?? 0) + (tri[m] ?? 0)) / 2;
}

const fini = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;

function duree(secondes: number): string {
  return secondes < 60 ? `${Math.round(secondes)} s` : `${Math.round(secondes / 60)} min`;
}

const NOMS: Record<"ci" | "gates" | "tests", string> = { ci: "CI", gates: "gates", tests: "tests" };

export function nommerLePlusLent(projet: string, { racine = projet, env, lecteurs }: Ou = {}): PlusLent | null {
  const lire = lecteurs ?? { lireDurees: (p: string) => lireDurees(p, env === undefined ? {} : { env }), lirePartsCook };
  const candidats: PlusLent[] = [];
  const durees = lire.lireDurees(projet);
  for (const partie of ["ci", "gates", "tests"] as const) {
    const valeurs = (durees[partie] ?? []).filter(fini);
    if (valeurs.length === 0) continue;
    const m = mediane(valeurs);
    candidats.push({ partie, phrase: `${NOMS[partie]}: ${duree(m)} median`, chiffres: { mediane: m, impact: m, mesures: valeurs.length } });
  }
  const parts = lire.lirePartsCook(racine).filter((c) => fini(c.partOutils));
  if (parts.length > 0) {
    const part = mediane(parts.map((c) => c.partOutils));
    const totaux = parts.map((c) => (fini(c.claude) ? c.claude : 0) + (fini(c.outils) ? c.outils : 0)).filter((t) => t > 0);
    // Sans durée de cook connue, la part seule fait foi : elle vaut ses secondes sur un cook d'une seconde.
    const impact = part * (totaux.length > 0 ? mediane(totaux) : 1);
    candidats.push({ partie: "cook", phrase: `a cook spends ${Math.round(part * 100)} % of its time in tests`, chiffres: { mediane: part, impact, mesures: parts.length } });
  }
  // `reduce` garde le premier des ex æquo : CI, gates, tests, puis le cook.
  return candidats.reduce<PlusLent | null>((tete, c) => (tete === null || c.chiffres.impact > tete.chiffres.impact ? c : tete), null);
}
