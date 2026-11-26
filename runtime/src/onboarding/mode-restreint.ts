// Ce que le chef lit d'un cook sans bac à sable (#4392) : le mode restreint, ce qu'il couvre et ce qu'il
// ne couvre pas. Une seule source, pour l'écran de l'app (l'étape de la machine, `etat.ts`) et la ligne
// de la station (`station/cuisine.ts`). Les trous du shell sont ceux que docs/runtime/station-cook.md liste.
export const MODE_RESTREINT = "restricted mode: no sandbox";

export const COUVERT = "Covered: reads of the station's credentials are denied, network access is limited to the project's hosts, and the guard refuses writes outside the cook's worktree and calls to gh beyond its own ticket.";

export const NON_COUVERT = "Not covered: the guard reads a shell command only as far as it knows it, so sed -i, curl -o, perl -i, python -c and similar pass unchecked.";

export const DIT_MODE_RESTREINT = `${MODE_RESTREINT}. ${COUVERT} ${NON_COUVERT}`;
