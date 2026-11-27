// Le récapitulatif d'un projet (#3581, épique #3579) : ce que la cuisine a fait
// depuis que le chef a regardé pour la dernière fois — le marqueur « vu
// jusqu'à » (`marqueur.ts`). L'app le montre à son ouverture, projet par projet,
// puis dit l'avoir montré : le marqueur avance alors jusqu'à `until`, et le
// récapitulatif suivant ne redit rien de ce qui a été vu.
//
//   served    les tickets servis, chacun avec la PR qui l'a servi (servis.ts) ;
//   sentBack  les tickets que la pass a renvoyés ou refusés, avec leur raison (renvois.ts) ;
//   stops     ce qu'un garde-fou a arrêté, et lequel (arrets.ts).
//
// Ce qui attend le chef dans TODO n'est pas lu ici.
//
// Sans marqueur — aucun récapitulatif encore montré —, il couvre les
// `PREMIERE_FENETRE_MS` d'avant. Une lecture qui échoue lève : jamais un
// récapitulatif vide à la place de ce qui ne s'est pas lu.
import type { Base } from "../base.ts";
import { arretsEntre, type Arret } from "./arrets.ts";
import { lireLeMarqueur } from "./marqueur.ts";
import { renvoisEntre, type GitHubDesRenvois, type Renvoye } from "./renvois.ts";
import { servisEntre, type GitHubDesServis, type Servi } from "./servis.ts";

const PREMIERE_FENETRE_MS = 7 * 24 * 3600 * 1000;

export type Recap = { repository: string; since: string; until: string; served: Servi[]; sentBack: Renvoye[]; stops: Arret[] };

export type GitHubDuRecap = GitHubDesServis & GitHubDesRenvois;

export async function calculerLeRecap({ repertoireEtat, depot, github, base, maintenant }: { repertoireEtat: string; depot: string; github: GitHubDuRecap; base: Base; maintenant: Date }): Promise<Recap> {
  const until = maintenant.toISOString();
  const since = lireLeMarqueur(repertoireEtat) ?? new Date(maintenant.getTime() - PREMIERE_FENETRE_MS).toISOString();
  const stops = arretsEntre(base, since, until);
  const served = await servisEntre(github, depot, since, until);
  const sentBack = await renvoisEntre(github, depot, since, until);
  return { repository: depot, since, until, served, sentBack, stops };
}
