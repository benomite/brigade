// A correction ticket never lowers a guard (#2679, epic #2673). The guards are
// listed here with the repository paths that carry each one, the rule is a text
// ready to be pasted in a quality ticket, and a pure check reads a correction
// PR: its body must name every guard under "Guards left untouched", and none of
// its changed paths may belong to a guard.

export type Garde = {
  id: string;
  nom: string;
  chemins: readonly string[];
};

// A path ending with "/" owns everything under it; any other path owns that file.
export const GARDES: readonly Garde[] = [
  {
    id: "calibration",
    nom: "reviewer and second judge calibration",
    chemins: [
      "agents/second-juge.md",
      "runtime/src/reviewer.ts",
      "runtime/src/second-juge.ts",
      "runtime/src/calibrage.ts",
    ],
  },
  {
    id: "gates",
    nom: "gates",
    chemins: [
      ".claude/brigade/gates.sh",
      ".claude/brigade/tests-touches.mjs",
      "runtime/src/gates.ts",
    ],
  },
  {
    id: "tests",
    nom: "tests",
    chemins: ["runtime/test/", "app/test/", "runtime/test-hang-guard/"],
  },
  {
    id: "ci",
    nom: "CI checks",
    chemins: [".github/workflows/"],
  },
  {
    id: "criteres",
    nom: "acceptance criteria",
    chemins: ["agents/manager.md", "agents/product.md"],
  },
];

export const TITRE_SECTION = "Guards left untouched";

export const REGLE_GARDE_CORRECTION: string = [
  "## A correction ticket never lowers a guard",
  "",
  "A correction ticket fixes a defect. It never makes the kitchen less demanding to get there. It leaves untouched:",
  "",
  ...GARDES.map((g, i) => `${i + 1}. ${g.nom} (${g.chemins.join(", ")})`),
  "",
  `Its PR body has a "${TITRE_SECTION}" section that names each of these guards. A change to a path a guard owns is a guard lowered, and the correction is refused.`,
].join("\n");

export type ConstatGarde = {
  conforme: boolean;
  sectionManquante: boolean;
  gardesOmises: Garde[];
  gardesAbaissees: { garde: Garde; chemins: string[] }[];
  problemes: string[];
};

function sectionDuCorps(corps: string): string | null {
  const lignes = corps.split(/\r?\n/);
  const titre = TITRE_SECTION.toLowerCase();
  const debut = lignes.findIndex((l) => {
    const m = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(l);
    return m !== null && m[1]!.replace(/[*_`:]/g, "").trim().toLowerCase() === titre;
  });
  if (debut === -1) return null;
  const suite = lignes.slice(debut + 1);
  const fin = suite.findIndex((l) => /^\s{0,3}#{1,6}\s/.test(l));
  return (fin === -1 ? suite : suite.slice(0, fin)).join("\n");
}

function appartient(chemin: string, possede: string): boolean {
  const c = chemin.replace(/^\.\//, "");
  return possede.endsWith("/") ? c.startsWith(possede) : c === possede;
}

export function verifierGardesCorrection(corps: string, cheminsModifies: readonly string[]): ConstatGarde {
  const section = sectionDuCorps(corps);
  const texte = section?.toLowerCase() ?? "";
  const gardesOmises = section === null ? [] : GARDES.filter((g) => !texte.includes(g.nom.toLowerCase()));
  const gardesAbaissees = GARDES.map((garde) => ({
    garde,
    chemins: cheminsModifies.filter((c) => garde.chemins.some((p) => appartient(c, p))),
  })).filter((x) => x.chemins.length > 0);
  const problemes: string[] = [];
  if (section === null) problemes.push(`missing section "${TITRE_SECTION}"`);
  for (const g of gardesOmises) problemes.push(`guard not named in "${TITRE_SECTION}": ${g.nom}`);
  for (const a of gardesAbaissees) problemes.push(`guard lowered: ${a.garde.nom} (${a.chemins.join(", ")})`);
  return {
    conforme: problemes.length === 0,
    sectionManquante: section === null,
    gardesOmises,
    gardesAbaissees,
    problemes,
  };
}
