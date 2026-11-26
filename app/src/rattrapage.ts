// L'app passe à la nouvelle version d'elle-même : son clone est avancé jusqu'à la branche de
// l'origine qu'il suit, puis elle repart sur ce code. Deux moments, et aucune commande à
// recopier : à son ouverture — `npm start` passe ici avant de lancer Electron (lancement.ts) —,
// et au clic sur la ligne qui dit son retard, en tête de « Tous les projets » : elle se met à
// jour, puis se relance d'elle-même (main.ts).
//
// Rien que de l'avance rapide (`git merge --ff-only`), sur la branche où est le clone : un
// clone qui a des commits que l'origine n'a pas, ou des changements que la nouvelle version
// écraserait, n'est pas touché — elle le dit, et tourne sur le code qu'elle a. Une origine qui
// ne répond pas n'empêche jamais l'app de s'ouvrir.
//
// Joué aussi par Node seul, avant toute dépendance (lancement.ts) : rien ne s'importe hors de Node.
import { annonceDe, git, lireAmont, type Reglages } from "./retard.ts";

// Ce que le rattrapage a fait du clone. `commits` : ceux qu'il a gagnés — zéro, il était déjà
// à jour. Sans nombres, la raison : le clone n'a pas bougé.
export type Rattrape = { racine: string; suivie: string; avant: string; apres: string; commits: number } | { racine?: string; raison: string };

const court = (commit: string) => commit.slice(0, 7);
const commits = (nombre: number) => `${nombre} commit${nombre > 1 ? "s" : ""}`;

// Avance le clone où est ce dossier jusqu'à la branche de l'origine qu'il suit — ou dit
// pourquoi il ne bouge pas.
export async function rattraper(reglages: Reglages, dossier: string, signal?: AbortSignal): Promise<Rattrape> {
  const amont = await lireAmont(reglages, dossier, signal);
  if ("raison" in amont) return amont.racine === undefined ? { raison: amont.raison } : { racine: amont.racine, raison: amont.raison };
  const { racine, tete: avant, distant, reference, suivie } = amont;
  const annonce = await annonceDe(reglages, amont, racine, signal);
  if ("raison" in annonce) return { racine, raison: annonce.raison };
  const { la } = annonce;
  // Déjà là — ou derrière ses propres commits : rien de nouveau à prendre.
  if (la === avant || !("dit" in (await git(reglages, racine, ["merge-base", "--is-ancestor", la, avant], signal)))) return { racine, suivie, avant, apres: avant, commits: 0 };

  // Cette fois, ce qui manque est rapatrié dans le clone : c'est lui qui change de version.
  // Ni étiquette, ni élagage, ni sous-module, quoi que la configuration du chef demande.
  const rapatrie = await git(reglages, racine, ["fetch", "--quiet", "--no-tags", "--no-prune", "--no-recurse-submodules", distant, reference], signal);
  if ("dit" in rapatrie) return { racine, raison: `the new version could not be fetched (\`git fetch ${distant} ${reference}\`): ${rapatrie.dit}` };
  // Le clone a des commits à lui : l'avancer, ce serait les fusionner — c'est au chef d'en décider.
  const ancetre = await git(reglages, racine, ["merge-base", "--is-ancestor", avant, la], signal);
  if ("dit" in ancetre) {
    const siens = await git(reglages, racine, ["rev-list", "--count", `${la}..${avant}`], signal);
    const combien = "dit" in siens || !/^\d+$/.test(siens.sortie) ? "commits" : commits(Number(siens.sortie));
    return { racine, raison: `the clone ${racine} has ${combien} that ${suivie} does not have: it cannot simply move forward, and merging is your call` };
  }
  const avance = await git(reglages, racine, ["merge", "--ff-only", "--quiet", "--no-stat", la], signal);
  if ("dit" in avance) return { racine, raison: `the clone ${racine} could not move forward to ${court(la)} (\`git merge --ff-only\`): ${avance.dit}` };
  const gagnes = await git(reglages, racine, ["rev-list", "--count", `${avant}..${la}`], signal);
  return { racine, suivie, avant, apres: la, commits: "dit" in gagnes || !/^\d+$/.test(gagnes.sortie) ? 0 : Number(gagnes.sortie) };
}

// Ce que le lancement en dit, avant d'ouvrir l'app : rien, si le clone était déjà à jour.
export function direAuLancement(rattrape: Rattrape): string | undefined {
  if ("raison" in rattrape) return `brigade: the app was not updated — ${rattrape.raison}. It opens on the code it has.`;
  if (rattrape.apres === rattrape.avant) return undefined;
  return `brigade: the app is updated — ${commits(rattrape.commits)} from ${rattrape.suivie} (${court(rattrape.avant)} → ${court(rattrape.apres)}), in ${rattrape.racine}. It opens on the new version.`;
}

// Comment l'app repart après s'être mise à jour : par le chemin qui l'a lancée, `npm start`, pour
// que son lancement pose ce que la nouvelle version demande (lancement.ts). npm laisse à ce qu'il
// lance le `node` et le `npm` qui l'ont joué ; sans eux — lancée autrement —, l'app repart telle
// qu'elle a été lancée, sur le nouveau code.
export function relanceDe(env: NodeJS.ProcessEnv, app: string): { execPath: string; args: string[] } | undefined {
  const { npm_execpath: npm, npm_node_execpath: node } = env;
  if (npm === undefined || npm === "" || node === undefined || node === "") return undefined;
  return { execPath: node, args: [npm, "--prefix", app, "start"] };
}

// Le clic sur la ligne qui dit le retard de l'app : elle se met à jour, puis `relancer` la fait
// repartir sur la nouvelle version — elle se ferme, et rien n'est rendu. Ou elle dit pourquoi elle
// ne bouge pas, et tourne sur son code. `quandMeme` : son clone a déjà avancé depuis son lancement
// — elle repart sur lui, même si l'origine n'a pas répondu ; son lancement réessaiera. Une seule
// mise à jour à la fois : un second clic pendant la première est la même.
export function tenirPassage(options: { reglages: Reglages; app: string; relancer(): void }) {
  let enCours: Promise<{ refus: string } | undefined> | undefined;
  return (quandMeme = false): Promise<{ refus: string } | undefined> => {
    enCours ??= (async () => {
      const rattrape = await rattraper(options.reglages, options.app);
      if ("raison" in rattrape && !quandMeme) return { refus: `this app was not updated: ${rattrape.raison}. It keeps running on the code it has.` };
      options.relancer();
      return undefined;
    })().finally(() => (enCours = undefined));
    return enCours;
  };
}
