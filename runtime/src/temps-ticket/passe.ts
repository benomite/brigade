// Le temps de la pass sur les 7 derniers jours (#3512), tiré des passages que
// la mesure écrit dans `temps-tickets.json` (`passes`, `mesure.ts`) : pour
// chaque phase — l'attente de la pass, les gates, la relecture, la CI, le
// merge — et pour les deux parts de la CI que GitHub dit — l'attente d'un
// runner, la course —, sa médiane et son p75 par livraison, son total et sa
// part du temps de pass ; la phase qui pèse le plus en tout, la part qui pèse
// le plus, les runs relancés parce que la branche a bougé, et ce que les
// passages renvoyés ont coûté. Une livraison compte chacun de ses passages,
// renvoyés compris. Fonction pure : la station la sert avec les temps des
// tickets (`projets/tenir.ts`), l'app la dit telle quelle.
import { centile } from "./mesure.ts";
import { mediane, type Passage } from "./synthese.ts";
import type { TempsTicket } from "./ligne-status.ts";

const JOURS_DE_LA_PASSE = 7;
const SEMAINE_MS = JOURS_DE_LA_PASSE * 24 * 60 * 60 * 1000;

// Les phases d'un passage, puis les deux parts de sa CI que GitHub dit, et leur nom.
const PARTS_DE_LA_PASSE = [
  ["attente", "waiting for the pass"],
  ["gates", "gates"],
  ["revue", "review"],
  ["ci", "CI"],
  ["merge", "merge"],
  ["ciAttente", "CI waiting for runners"],
  ["ciCourse", "CI running"],
] as const;
type Cle = (typeof PARTS_DE_LA_PASSE)[number][0];
const PHASES_DU_PASSAGE = ["attente", "gates", "revue", "ci", "merge"] as const;

// Une part : sur combien de livraisons elle se mesure, sa médiane et son p75
// par livraison (null sans livraison mesurée : jamais 0 à la place d'une
// mesure qui manque), son total, et sa part du temps de pass de ces
// livraisons, en pour cent (null sans temps de pass).
type PartDeLaPasse = { cle: Cle; nom: string; livraisons: number; medianeS: number | null; p75S: number | null; totalS: number; partPct: number | null };

export type ResumeDeLaPasse = {
  jours: number;
  // Les livraisons mergées dans la fenêtre dont la station a vu chaque passage.
  livraisons: number;
  parts: PartDeLaPasse[];
  // La phase qui pèse le plus en tout, et la part — phase ou part de la CI —
  // qui pèse le plus sur le temps de pass ; null quand rien n'a duré.
  phaseLaPlusLourde: { nom: string; totalS: number } | null;
  partLaPlusLourde: { nom: string; partPct: number } | null;
  // Les runs relancés parce que la branche a bougé, sur les livraisons dont
  // GitHub a dit la CI ; null sans aucune.
  relancees: number | null;
  // Les livraisons renvoyées au moins une fois, et le temps de pass de leurs passages renvoyés.
  renvoyees: number;
  passesRenvoyeesS: number;
};

const duree = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;

function passageLu(lu: unknown): Passage | null {
  const p = lu as Partial<Passage> | null;
  if (typeof p !== "object" || p === null || !PHASES_DU_PASSAGE.every((cle) => duree(p[cle])) || typeof p.renvoyee !== "boolean") return null;
  const ci = p.ciGitHub;
  const ciLue = typeof ci === "object" && ci !== null && duree(ci.attente) && duree(ci.course) && duree(ci.relancees) ? ci : undefined;
  return { debut: String(p.debut), fin: String(p.fin), attente: p.attente as number, gates: p.gates as number, revue: p.revue as number, ci: p.ci as number, merge: p.merge as number, renvoyee: p.renvoyee, ...(ciLue === undefined ? {} : { ciGitHub: ciLue }) };
}

// Les passages d'une livraison, tous lisibles, ou null.
function passagesDe(t: TempsTicket): Passage[] | null {
  const lus = (t as { passes?: unknown }).passes;
  if (!Array.isArray(lus) || lus.length === 0) return null;
  const passages = lus.map(passageLu);
  return passages.every((p): p is Passage => p !== null) ? passages : null;
}

const tempsDePasse = (p: Passage) => PHASES_DU_PASSAGE.reduce((somme, cle) => somme + p[cle], 0);

// Une part d'une livraison, en secondes : la somme de ses passages, ou null
// quand un de ses passages ne la dit pas (la CI que GitHub n'a pas dite).
function partDe(passages: readonly Passage[], cle: Cle): number | null {
  if (cle === "ciAttente" || cle === "ciCourse") {
    if (!passages.every((p) => p.ciGitHub !== undefined)) return null;
    return passages.reduce((somme, p) => somme + (cle === "ciAttente" ? (p.ciGitHub?.attente ?? 0) : (p.ciGitHub?.course ?? 0)), 0);
  }
  return passages.reduce((somme, p) => somme + p[cle], 0);
}

// Le résumé des livraisons mergées dans les 7 jours avant `maintenant` (ms) ;
// null quand aucune n'a de passage mesuré.
export function resumerLaPasse(enregistrements: readonly TempsTicket[], maintenant: number): ResumeDeLaPasse | null {
  const livraisons = enregistrements.flatMap((t) => {
    const merge = Date.parse(t.mergedAt ?? "");
    if (Number.isNaN(merge) || merge < maintenant - SEMAINE_MS || merge > maintenant) return [];
    const passages = passagesDe(t);
    return passages === null ? [] : [passages];
  });
  if (livraisons.length === 0) return null;
  const parts = PARTS_DE_LA_PASSE.map(([cle, nom]): PartDeLaPasse => {
    const mesurees = livraisons.flatMap((passages) => {
      const secondes = partDe(passages, cle);
      return secondes === null ? [] : [{ secondes, pass: passages.reduce((somme, p) => somme + tempsDePasse(p), 0) }];
    });
    const valeurs = mesurees.map(({ secondes }) => secondes);
    const totalS = valeurs.reduce((a, b) => a + b, 0);
    const pass = mesurees.reduce((somme, { pass }) => somme + pass, 0);
    return {
      cle,
      nom,
      livraisons: mesurees.length,
      medianeS: mesurees.length === 0 ? null : Math.round(mediane(valeurs)),
      p75S: mesurees.length === 0 ? null : centile(valeurs, 0.75),
      totalS,
      partPct: pass === 0 ? null : Math.round((totalS / pass) * 100),
    };
  });
  const phases = parts.filter(({ cle }) => (PHASES_DU_PASSAGE as readonly string[]).includes(cle));
  const lourde = phases.reduce((a, b) => (b.totalS > a.totalS ? b : a));
  const pesees = parts.filter((p): p is PartDeLaPasse & { partPct: number } => p.partPct !== null && p.totalS > 0);
  const plusLourde = pesees.length === 0 ? null : pesees.reduce((a, b) => (b.partPct > a.partPct ? b : a));
  const ciDites = livraisons.filter((passages) => passages.every((p) => p.ciGitHub !== undefined));
  const renvoyes = livraisons.flatMap((passages) => passages.filter((p) => p.renvoyee));
  return {
    jours: JOURS_DE_LA_PASSE,
    livraisons: livraisons.length,
    parts,
    phaseLaPlusLourde: lourde.totalS > 0 ? { nom: lourde.nom, totalS: lourde.totalS } : null,
    partLaPlusLourde: plusLourde === null ? null : { nom: plusLourde.nom, partPct: plusLourde.partPct },
    relancees: ciDites.length === 0 ? null : ciDites.reduce((somme, passages) => somme + passages.reduce((n, p) => n + (p.ciGitHub?.relancees ?? 0), 0), 0),
    renvoyees: livraisons.filter((passages) => passages.some((p) => p.renvoyee)).length,
    passesRenvoyeesS: renvoyes.reduce((somme, p) => somme + tempsDePasse(p), 0),
  };
}
