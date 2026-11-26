// Les valeurs par défaut de la fiche du projet (#4237, épique #4136), celles
// d'un projet de code — la colonne « brigade » de la table de la spec
// (`docs/superpowers/specs/2026-11-24-simplified-process.md`). Seul endroit du
// runtime où ces faits s'écrivent : la cuisine les lit dans la fiche du projet,
// et un projet qui n'a pas encore la sienne reçoit celle-ci.

// Où la fiche vit, dans le dépôt du projet.
export const CHEMIN_DE_LA_FICHE = ".brigade/fiche-projet.json";

// Les gates d'un projet de code : le script que `/brigade:init` pose, dont le
// code de sortie est le verdict de la pass (`gates.ts`).
export const SCRIPT_GATES = ".claude/brigade/gates.sh";

// La branche servie d'un projet qui n'en dit aucune.
export const BRANCHE_PRINCIPALE_PAR_DEFAUT = "main";

// La fiche d'un projet de code : une étape et ses gates, servi = sa branche
// principale.
export function ficheParDefaut(branchePrincipale: string) {
  return {
    work: "code and its tests",
    stages: [{ name: "code", gates: [SCRIPT_GATES] }],
    tools: ["git", "the project's CLI", "screenshots"],
    rules: [`the gates \`${SCRIPT_GATES}\` pass: tests, types, CI green`],
    risks: ["an interface", "production data"],
    served: { branch: branchePrincipale },
    recurring: ["the closer, daily"],
    humans: ["the chef, on what only a human does"],
  };
}
