// Un cook revient d'un renvoi pour conflit bloqué par un refus de permission
// sur une commande git (fetch, merge, rebase) (#2951, épique #2949). La
// station ne renvoie pas une seconde fois et ne lève pas de carte TODO pour le
// chef : elle reprend la main. Elle intègre elle-même la base ; si cela
// échoue à son tour, elle recrée la branche depuis main et relance le ticket.
//
// Le module est autonome : le runner git, la recréation de branche et la
// relance du ticket sont injectés.

// Les commandes git dont un refus déclenche cette reprise.
export const COMMANDES_GIT_DU_CONFLIT = ["fetch", "merge", "rebase"] as const;
export type CommandeGit = (typeof COMMANDES_GIT_DU_CONFLIT)[number];

// L'issue d'un renvoi pour conflit : la commande git qui a échoué, avec sa
// sortie, ou null si le cook est revenu sans commande en échec.
export type IssueDuRenvoi = { echec: { commande: string; sortie: string } | null };

export type ResultatGit = { code: number; sortie: string };

export type DependancesDeReprise = {
  git(args: string[]): Promise<ResultatGit>;
  recreerLaBranche(): Promise<void>;
  relancerLeTicket(): Promise<void>;
};

// Les deux seules suites possibles : jamais un autre renvoi, jamais une carte
// TODO. `null` : l'issue n'est pas un refus de permission, la reprise ne
// s'applique pas et le flux existant décide.
export type ActionDeReprise = { action: "integrer-la-base" } | { action: "recreer-depuis-main" };

const REFUS = /permission denied|operation not permitted|not permitted|access denied|EACCES|EPERM|permission to .* denied|denied by|was denied/i;

export function estUnRefusDePermission(issue: IssueDuRenvoi): boolean {
  const { echec } = issue;
  if (echec === null) return false;
  const commande = echec.commande.trim().split(/\s+/);
  const verbe = commande[0] === "git" ? commande[1] : commande[0];
  return (COMMANDES_GIT_DU_CONFLIT as readonly string[]).includes(verbe ?? "") && REFUS.test(echec.sortie);
}

// Décide et exécute la suite d'un renvoi pour conflit. Pour un refus de
// permission : intègre la base (`git merge`) ; si git refuse ou échoue encore,
// recrée la branche depuis main puis relance le ticket. Retourne null quand
// l'issue n'est pas un refus de permission.
export async function reprendreApresRefus(base: string, issue: IssueDuRenvoi, deps: DependancesDeReprise): Promise<ActionDeReprise | null> {
  if (!estUnRefusDePermission(issue)) return null;
  const fusion = await deps.git(["merge", "--no-edit", base]).catch((): ResultatGit => ({ code: 1, sortie: "git n'a pas pu être lancé" }));
  if (fusion.code === 0) return { action: "integrer-la-base" };
  await deps.recreerLaBranche();
  await deps.relancerLeTicket();
  return { action: "recreer-depuis-main" };
}
