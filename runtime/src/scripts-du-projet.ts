// Les chemins des scripts du projet, dans son worktree (`gates.ts` les joue et
// les réexporte). Un module à part, sans dépendance : `secrets.ts`, chargé par
// chaque relais, cite le setup sans charger ce qui lance les gates.
export const SCRIPT_GATES = ".claude/brigade/gates.sh";
export const SCRIPT_SETUP = ".claude/brigade/worktree-setup.sh";
