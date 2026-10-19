// La connexion Max, branchée sur la cuisine d'un projet. La veille de la
// station dit l'état de la machine ; chaque cuisine le traduit dans son
// journal, avec les faits qu'elle connaît déjà :
//
// - perdue : chacune de ses stations d'ici est dite déconnectée
//   (`station.disconnected`) — elle ne prend plus de ticket, et ni relecture
//   ni jugement ne part. Aucun cook n'est lancé pour découvrir la perte : rien
//   n'échoue, rien ne compte au disjoncteur, aucun ticket n'est commenté ;
// - connectee, sur une réécriture postérieure à la chute : l'arrêt se lève
//   (`session.restored`), la cuisine reprend seule ;
// - et dans l'autre sens : une station d'ici que le flux d'un cook dit
//   déconnectée signale la perte à la veille, et les autres projets
//   suspendent sans lancer chacun le sien.
import { derniereReconnexion } from "../projections/renewal.ts";
import { etatStation, stationsAnnoncees, stationsDeconnectees } from "../projections/stations.ts";
import type { Runtime } from "../runtime.ts";
import { PERTES_D_UN_PROJET, type ConnexionMax } from "./connection.ts";
import type { VeilleConnexionMax } from "./watch.ts";

const AUTEUR = "station";

const apres = (instant: string | null, repere: string | null) => instant !== null && repere !== null && Date.parse(instant) > Date.parse(repere);

// Rend le runtime : son `arreter` désabonne la cuisine de la veille.
export function brancherConnexionMax<R extends Runtime>(runtime: R, veille: VeilleConnexionMax): R {
  const { journal, projet } = runtime;
  const { base } = journal;

  // Les stations du projet qui tournent ici : une station distante a sa
  // machine, et sa connexion.
  const dIci = () => stationsAnnoncees(base).filter((station) => etatStation(base, station)?.remote === false);

  const appliquer = (connexion: ConnexionMax) => {
    const locales = dIci();
    if (connexion.etat === "perdue") {
      // Le chef a fait reprendre ce projet après la perte (« reprendre ») :
      // c'est sa décision, la veille ne la défait pas. Un cook qui trouve la
      // connexion fermée le suspendra de lui-même.
      if (apres(derniereReconnexion(base), connexion.depuis)) return;
      for (const station of locales) {
        if (etatStation(base, station)?.disconnectedAt) continue;
        journal.ajouter({ project: projet, ticket: null, author: `${AUTEUR}:${station}`, type: "station.disconnected", payload: { station, reason: connexion.raison ?? "connexion Max perdue", run: null } });
      }
      return;
    }
    // Une chute que la connexion ne contredit pas — postérieure à la dernière
    // réécriture — vient d'un cook : la machine entière l'apprend.
    const tombees = stationsDeconnectees(base).filter((station) => locales.includes(station));
    for (const station of tombees) {
      const etat = etatStation(base, station);
      if (etat?.disconnectedAt && etat.disconnectedReason !== null && PERTES_D_UN_PROJET.includes(etat.disconnectedReason) && !apres(connexion.reecrite, etat.disconnectedAt)) {
        veille.signalerPerte(etat.disconnectedReason, etat.disconnectedAt);
        return;
      }
    }
    if (connexion.etat !== "connectee") return;
    const levees = tombees.filter((station) => apres(connexion.reecrite, etatStation(base, station)?.disconnectedAt ?? null));
    if (levees.length === 0 || connexion.reecrite === null) return;
    journal.ajouter({ project: projet, ticket: null, author: "runtime", type: "session.restored", payload: { stations: levees, verified: connexion.reecrite } });
  };

  const garder = (faire: () => void) => {
    try {
      faire();
    } catch (erreur) {
      // Une écriture manquée se reprend au réveil suivant.
      console.error(`brigade [${projet}] : connexion Max non reportée au journal — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };

  const desabonner = veille.surChangement((connexion) => garder(() => appliquer(connexion)));
  // Ce que le journal apprend — une station annoncée, une chute vue par un
  // cook — se rapporte aussitôt à la connexion.
  const desabonnerReveil = runtime.surReveil(() => garder(() => appliquer(veille.connexion())));
  garder(() => appliquer(veille.connexion()));

  return {
    ...runtime,
    arreter(signal: string) {
      desabonner();
      desabonnerReveil();
      runtime.arreter(signal);
    },
  };
}
