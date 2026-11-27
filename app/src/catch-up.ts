// L'app passe à la nouvelle version d'elle-même : son clone est avancé jusqu'à la branche de
// l'origine qu'il suit, puis elle repart sur ce code. Deux moments, et aucune commande à
// recopier : à son ouverture — `npm start` passe ici avant de lancer Electron (launch.ts) —,
// et au clic sur la ligne qui dit son retard, en tête de « Tous les projets » : elle se met à
// jour, puis se relance d'elle-même (main.ts).
//
// Rien que de l'avance rapide (`git merge --ff-only`), sur la branche où est le clone : un
// clone qui a des commits que l'origine n'a pas, ou des changements que la nouvelle version
// écraserait, n'est pas touché — elle le dit, et tourne sur le code qu'elle a. Une origine qui
// ne répond pas n'empêche jamais l'app de s'ouvrir.
//
// Joué aussi par Node seul, avant toute dépendance (launch.ts) : rien ne s'importe hors de Node.
import { announcementOf, git, readUpstream, type Settings } from "./delay.ts";

// Ce que le rattrapage a fait du clone. `commits` : ceux qu'il a gagnés — zéro, il était déjà
// à jour. Sans nombres, la raison : le clone n'a pas bougé.
export type CatchesUp = { racine: string; suivie: string; avant: string; apres: string; commits: number } | { racine?: string; raison: string };

const court = (commit: string) => commit.slice(0, 7);
const commits = (count: number) => `${count} commit${count > 1 ? "s" : ""}`;

// Avance le clone où est ce dossier jusqu'à la branche de l'origine qu'il suit — ou dit
// pourquoi il ne bouge pas.
export async function catchUp(settings: Settings, folder: string, signal?: AbortSignal): Promise<CatchesUp> {
  const upstream = await readUpstream(settings, folder, signal);
  if ("raison" in upstream) return upstream.racine === undefined ? { raison: upstream.raison } : { racine: upstream.racine, raison: upstream.raison };
  const { racine: root, tete: before, distant, reference, suivie: tracked } = upstream;
  const announcement = await announcementOf(settings, upstream, root, signal);
  if ("raison" in announcement) return { racine: root, raison: announcement.raison };
  const { la: the } = announcement;
  // Déjà là — ou derrière ses propres commits : rien de nouveau à prendre.
  if (the === before || !("dit" in (await git(settings, root, ["merge-base", "--is-ancestor", the, before], signal)))) return { racine: root, suivie: tracked, avant: before, apres: before, commits: 0 };

  // Cette fois, ce qui manque est rapatrié dans le clone : c'est lui qui change de version.
  // Ni étiquette, ni élagage, ni sous-module, quoi que la configuration du chef demande.
  const bringsHome = await git(settings, root, ["fetch", "--quiet", "--no-tags", "--no-prune", "--no-recurse-submodules", distant, reference], signal);
  if ("dit" in bringsHome) return { racine: root, raison: `the new version could not be fetched (\`git fetch ${distant} ${reference}\`): ${bringsHome.dit}` };
  // Le clone a des commits à lui : l'avancer, ce serait les fusionner — c'est au chef d'en décider.
  const ancestor = await git(settings, root, ["merge-base", "--is-ancestor", before, the], signal);
  if ("dit" in ancestor) {
    const itsOwn = await git(settings, root, ["rev-list", "--count", `${the}..${before}`], signal);
    const howMany = "dit" in itsOwn || !/^\d+$/.test(itsOwn.sortie) ? "commits" : commits(Number(itsOwn.sortie));
    return { racine: root, raison: `the clone ${root} has ${howMany} that ${tracked} does not have: it cannot simply move forward, and merging is your call` };
  }
  const ahead = await git(settings, root, ["merge", "--ff-only", "--quiet", "--no-stat", the], signal);
  if ("dit" in ahead) return { racine: root, raison: `the clone ${root} could not move forward to ${court(the)} (\`git merge --ff-only\`): ${ahead.dit}` };
  const gained = await git(settings, root, ["rev-list", "--count", `${before}..${the}`], signal);
  return { racine: root, suivie: tracked, avant: before, apres: the, commits: "dit" in gained || !/^\d+$/.test(gained.sortie) ? 0 : Number(gained.sortie) };
}

// Ce que le lancement en dit, avant d'ouvrir l'app : rien, si le clone était déjà à jour.
export function tellAtLaunch(catchesUp: CatchesUp): string | undefined {
  if ("raison" in catchesUp) return `brigade: the app was not updated — ${catchesUp.raison}. It opens on the code it has.`;
  if (catchesUp.apres === catchesUp.avant) return undefined;
  return `brigade: the app is updated — ${commits(catchesUp.commits)} from ${catchesUp.suivie} (${court(catchesUp.avant)} → ${court(catchesUp.apres)}), in ${catchesUp.racine}. It opens on the new version.`;
}

// Comment l'app repart après s'être mise à jour : par le chemin qui l'a lancée, `npm start`, pour
// que son lancement pose ce que la nouvelle version demande (launch.ts). npm laisse à ce qu'il
// lance le `node` et le `npm` qui l'ont joué ; sans eux — lancée autrement —, l'app repart telle
// qu'elle a été lancée, sur le nouveau code.
export function relaunchOf(env: NodeJS.ProcessEnv, app: string): { execPath: string; args: string[] } | undefined {
  const { npm_execpath: npm, npm_node_execpath: node } = env;
  if (npm === undefined || npm === "" || node === undefined || node === "") return undefined;
  return { execPath: node, args: [npm, "--prefix", app, "start"] };
}

// Le clic sur la ligne qui dit le retard de l'app : elle se met à jour, puis `relancer` la fait
// repartir sur la nouvelle version — elle se ferme, et rien n'est rendu. Ou elle dit pourquoi elle
// ne bouge pas, et tourne sur son code. `quandMeme` : son clone a déjà avancé depuis son lancement
// — elle repart sur lui, même si l'origine n'a pas répondu ; son lancement réessaiera. Une seule
// mise à jour à la fois : un second clic pendant la première est la même.
export function holdPassage(options: { reglages: Settings; app: string; relancer(): void }) {
  let inProgress: Promise<{ refus: string } | undefined> | undefined;
  return (whenSame = false): Promise<{ refus: string } | undefined> => {
    inProgress ??= (async () => {
      const catchesUp = await catchUp(options.reglages, options.app);
      if ("raison" in catchesUp && !whenSame) return { refus: `this app was not updated: ${catchesUp.raison}. It keeps running on the code it has.` };
      options.relancer();
      return undefined;
    })().finally(() => (inProgress = undefined));
    return inProgress;
  };
}
