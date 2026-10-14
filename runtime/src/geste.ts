// Les gestes que le runtime cite, écrits sous leur forme valide là où le chef
// les lit : sur la box, `brigade <projet> <commande> [arguments…]`
// (`deploy/brigade`). `run <commande>` est la forme du poste de dev, que la box
// refuse (code 66) — jamais écrite dans un message.
//
// Le projet est celui du service (`BRIGADE_PROJECT`, que le geste de box
// transmet à toute commande) ; sans lui, `<projet>` reste à remplir.
export const nomDuProjet = (env: NodeJS.ProcessEnv = process.env): string => env.BRIGADE_PROJECT || "<projet>";

// `geste("garde-fous reprendre")` → `brigade espace garde-fous reprendre`.
// Pas de `--` : le geste de box en passe un lui-même à npm, et retire celui qu'on
// lui donne.
export const geste = (commande: string, env?: NodeJS.ProcessEnv): string => `brigade ${nomDuProjet(env)} ${commande}`;
