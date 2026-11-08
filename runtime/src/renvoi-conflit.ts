// Le renvoi d'une PR en conflit avec sa base, côté cook (#2953, épique #2949).
// `cuisinerLeTicket` (brigade-github.ts) l'appelle à deux endroits et ne
// décide rien lui-même :
// - avant le cook : la station intègre la base dans son worktree
//   (`integration-base.ts`, #2950) et lui remet une branche qui porte déjà la
//   tentative de fusion, conflits non commités ;
// - quand le cook s'arrête sur le refus d'une commande git (`blocage-technique.ts`,
//   #2952), la station reprend la main (`reprise-conflit-refus.ts`, #2951) :
//   jamais un second renvoi, jamais une carte pour le chef, jamais `blocked-on-human`.
import { classerArret as classerLArretTechnique } from "./blocage-technique.ts";
import { integrerLaBase, type IntegrationBase, type LanceurGit } from "./integration-base.ts";
import { reprendreApresRefus } from "./reprise-conflit-refus.ts";

// La consigne que la fusion déjà tentée donne au cook, ou null si la station
// n'a pas pu la tenter (accès refusé, base inconnue…) : le cook part alors avec
// la consigne d'avant, et fait lui-même le `git fetch` et le `git merge`.
export function consigneDeLIntegration(integration: IntegrationBase, base: string): string | null {
  if (integration.etat === "echec") return null;
  const tete = `The station already fetched \`origin/${base}\` and merged it into this branch, without committing. Do not run \`git fetch\` or \`git merge\`: they are done.`;
  const suite = "Fix what is red, run the gates and commit: the commit completes the merge. Adding nothing is not an option.";
  if (integration.etat === "propre") return `${tete} It merged without conflict and is staged. ${suite}`;
  return `${tete} It stopped on conflicts, left in the worktree with their markers, in:\n${integration.fichiers.map((f) => `- \`${f}\``).join("\n")}\nResolve each one (remove every conflict marker), \`git add\` it. ${suite}`;
}

// Intègre la base dans le worktree du cook avant son départ. Un git qui ne se
// lance pas est un `echec` comme un autre, jamais une panne du tour.
export async function integrerAvantLeCook(git: LanceurGit, worktree: string, base: string): Promise<IntegrationBase> {
  try {
    return await integrerLaBase(git, worktree, base);
  } catch (erreur) {
    return { etat: "echec", etape: "fetch", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

// Ce que devient un cook qui s'est arrêté sur `texte` pendant un renvoi pour
// conflit. `null` : ce n'est pas un blocage technique, l'arrêt suit son cours
// (le manager). `integree` : la station a fusionné la base, la livraison suit.
// `recreee` : la branche est repartie de la base, le ticket revient à un cook.
export type SuiteDuBlocage = "integree" | "recreee";

export type DependancesDeLaSuite = {
  git: LanceurGit;
  worktree: string;
  recreerLaBranche(): Promise<void>;
};

export async function suiteDuBlocageTechnique(texte: string, base: string, deps: DependancesDeLaSuite): Promise<SuiteDuBlocage | null> {
  const arret = classerLArretTechnique(texte);
  if (arret.genre !== "technique") return null;
  // `classerArret` a lu le refus dans les mots du cook, en français ou en
  // anglais ; la reprise reconnaît les siens : on lui dit le refus en toutes lettres.
  const issue = { echec: { commande: `git ${arret.commande}`, sortie: `permission denied: ${texte}` } };
  let recreee = false;
  const action = await reprendreApresRefus(`origin/${base}`, issue, {
    git: async (args) => {
      const sortie = await deps.git(args, deps.worktree);
      return { code: sortie.code, sortie: sortie.stderr || sortie.stdout };
    },
    recreerLaBranche: async () => {
      await deps.recreerLaBranche();
      recreee = true;
    },
    // Le ticket revient à un cook par l'issue `subi` de `cuisinerLeTicket`,
    // qui ne compte pas parmi ses essais : rien à faire de plus ici.
    relancerLeTicket: async () => {},
  });
  if (action === null) return null;
  return action.action === "integrer-la-base" && !recreee ? "integree" : "recreee";
}
