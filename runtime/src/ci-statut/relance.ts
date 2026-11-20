// La relance d'un run de GitHub Actions quand son vrai verdict est un statut de
// commit (#3952). Un run de la cuisine — une branche `cook/*`, sa PR, `main` —
// finit vert : ses checks rendent leur issue en statut de commit, sous le nom du
// check, et aucun de ses jobs n'échoue. « Relancer les jobs en échec » n'y
// relancerait rien : un run fini vert se relance en entier, et chaque job y
// repose son statut sous le même nom. Un run fini rouge (un run hors cuisine, un
// job qui pend) ne relance que ses jobs en échec, comme avant.

// La route de GitHub qui relance le run `run` de `depot`, d'après sa conclusion.
export const routeDeRelance = (depot: string, run: number, conclusion: string | null): string =>
  conclusion === "success" ? `repos/${depot}/actions/runs/${run}/rerun` : `repos/${depot}/actions/runs/${run}/rerun-failed-jobs`;
