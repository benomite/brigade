// La veille du blocage branchée sur la boucle du runtime d'un projet (#4213) : à chaque réveil, à côté du superviseur
// (`superviseur/brancher.ts`), elle vérifie si rien n'a été mergé depuis son délai alors que des tickets attendent.
// Ce que lit le superviseur lui sert : le dernier merge et les cuisinables du tour GitHub seul (`superviseur/tour.ts`).
// La machine se lit comme la garde de la station la lit (`machine.ts`) ; ses restes, comme la récupération les rend
// (`github-seul/garde-fous/recuperation.ts`) — lus à blanc pour les faits, rendus pour de vrai pour la réparation. La
// carte du disque plein va sur l'issue du disque (#4091) : une seule, quelle que soit la garde qui l'a posée ; celle de
// la machine saturée, sur le premier ticket qui attend. Une cuisine que le chef a arrêtée ou éteinte n'est pas veillée.
import { worktreesDuProjet } from "../depot.ts";
import { poserCarte, type GitHubDesCartes } from "../github-seul/carte-todo/carte-todo.ts";
import type { DisquePlein } from "../github-seul/garde-fous/disque-plein.ts";
import { fichiersReels, processusReels, recuperer, type Fichiers, type Processus } from "../github-seul/garde-fous/recuperation.ts";
import { lireMachine, saturations, type Machine, type Seuils } from "../machine.ts";
import { etatDesGardeFous } from "../projections/guardrails.ts";
import { cooksEnCoursDeStation, runsRendables } from "../projections/stations.ts";
import { etatDeLInterrupteur } from "../projections/switch.ts";
import type { Runtime } from "../runtime.ts";
import { echeanceSansMerge, PRISES_SANS_LIVRER, SANS_MERGE_MS } from "../superviseur/declencheur.ts";
import type { SuiviDuTour } from "../superviseur/tour.ts";
import { creerVeille } from "./veille.ts";

export type OptionsDeLaVeilleDuProjet = {
  // Le tour GitHub seul observé ; nul quand la station ne s'ouvre pas : rien n'est veillé.
  tour: SuiviDuTour | null;
  // La station de cette machine, dont les cooks en vol se comptent.
  station: string;
  // Le répertoire d'état du projet : ses worktrees, ses runs, et ce que la veille garde.
  repertoireEtat: string;
  seuils: Seuils;
  env: NodeJS.ProcessEnv;
  disque: Pick<DisquePlein, "poser">;
  github: GitHubDesCartes;
  dire: (ligne: string) => void;
  // La machine, ses fichiers et ses processus ; les vrais à défaut.
  machine?: () => Machine;
  fichiers?: Fichiers;
  processus?: Processus;
  maintenant?: () => Date;
};

export function brancherVeilleBlocage<R extends Runtime>(runtime: R, options: OptionsDeLaVeilleDuProjet): R {
  const { tour, station, repertoireEtat, seuils, env, disque, github, dire } = options;
  if (tour !== null) return runtime;
  const { base } = runtime.journal;
  const machine = options.machine ?? (() => lireMachine(repertoireEtat));
  const fichiers = options.fichiers ?? fichiersReels;
  const processus = options.processus ?? processusReels;
  const maintenant = options.maintenant ?? (() => new Date());
  // Sans le cache npm : la station le rend quand la machine sature, il n'est pas un reste qui bloque.
  const lieux = () => ({ worktrees: worktreesDuProjet(env, repertoireEtat), repertoireEtat, ...(env.BRIGADE_REPO_DIR === undefined ? {} : { clone: env.BRIGADE_REPO_DIR }), finis: runsRendables(base) });
  const eteinte = () => etatDesGardeFous(base).stoppedAt !== null || etatDeLInterrupteur(base)?.on === false;
  const veille = creerVeille({
    racine: repertoireEtat,
    maintenant: () => maintenant().getTime(),
    // Le repère du superviseur : le dernier merge, ou l'arrivée du plus ancien ticket qui attend, le plus récent des deux.
    dernierMerge: () => {
      const echeance = echeanceSansMerge(tour.faits());
      return echeance === null ? null : echeance.getTime() - SANS_MERGE_MS;
    },
    attendent: () => (eteinte() ? 0 : tour.faits().cuisinables.length),
    faits: () => {
      const lue = machine();
      const vus = recuperer(lieux(), { ...fichiers, retirer: () => {}, elaguer: () => {} }, { ...processus, tuer: () => {} });
      return {
        charge: lue.charge / lue.coeurs,
        cooks: cooksEnCoursDeStation(base, station).length,
        portes: tour.sauts(),
        boucles: tour.faits().prises.filter(({ prises }) => prises >= PRISES_SANS_LIVRER).map(({ ticket }) => ticket),
        restes: { processus: vus.tues, fichiers: vus.retires },
        disquePlein: saturations(lue, seuils).some(({ resource }) => resource === "disk"),
      };
    },
    reparer: () => {
      const { echecs } = recuperer(lieux(), fichiers, processus);
      if (echecs.length > 0) throw new Error(`could not reclaim ${echecs.join(", ")}`);
    },
    creerCarte: async ({ cause, texte }) => {
      if (cause === "disk") return (await disque.poser({ sorte: "blocked", texte })) === "posee";
      const [tete] = tour.faits().cuisinables;
      if (tete === undefined) throw new Error("no ticket waits any more to carry the card");
      return (await poserCarte(tete.ticket, { sorte: "blocked", texte }, github)) === "posee";
    },
    ecrire: dire,
    chargeParCoeur: seuils.chargeParCoeur,
  });
  runtime.surReveil(() => {
    try {
      veille.verifier();
    } catch (erreur) {
      dire(`brigade : watchdog on ${runtime.projet} — not checked (${erreur instanceof Error ? erreur.message : String(erreur)})`);
    }
  });
  return runtime;
}
