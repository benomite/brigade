// Ce qu'une porte tient du journal de son projet : sa liste blanche, que le
// runtime y publie (`network.declared`), et ses refus, qu'elle y écrit. Le
// journal n'est ouvert que le temps d'un geste : une restauration ne trouve
// pas la porte assise dessus. La porte d'une installation par projet
// (`tenir-porte.ts`) et celles de la station (`station/doors.ts`) le lisent
// de la même façon.
import { existsSync } from "node:fs";
import { logPath, openLog } from "./log.ts";
import { AUTRES_HOTES, compterLesRefus, garderLaListe } from "./door.ts";
import { REGLES_DE_BASE, reglesDuProjet, type Regle } from "./reseau.ts";

const AUTEUR = "porte";
// Ce que la liste se garde entre deux lectures du journal. Un hôte
// fraîchement publié n'attend pas ce délai : la porte relit avant de refuser.
const RELECTURE_MS = 5000;
// Une relecture avant refus par seconde au plus : une rafale de refus ne fait
// pas ouvrir le journal à chaque connexion.
const RELECTURE_AVANT_REFUS_MS = 1000;

const dire = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// La liste blanche du projet, lue de son journal. Avant le premier démarrage
// de son runtime, il n'y a pas de journal : le socle suffit à rapatrier le
// dépôt, d'où viendra le reste.
export function logList(repertoireEtat: string, options: { avertir?: (message: string) => void } = {}): (fraiches?: boolean) => Regle[] {
  return garderLaListe(
    (): Regle[] => {
      if (!existsSync(logPath(repertoireEtat))) return REGLES_DE_BASE;
      const log = openLog(repertoireEtat, { lectureSeule: true });
      try {
        return reglesDuProjet(log.duType("network.declared", 1)[0]?.payload.hosts ?? []);
      } finally {
        log.fermer();
      }
    },
    { delaiMs: RELECTURE_MS, plancherFraisMs: RELECTURE_AVANT_REFUS_MS, avertir: options.avertir },
  );
}

// Ce qu'une porte fait d'un refus : une ligne de sa sortie, et — comptés, un
// par hôte et par dix minutes — un `network.refused` au journal du projet.
export function loggedRefusals(repertoireEtat: string, projet: string, options: { dire?: (ligne: string) => void } = {}): (hote: string, port: number) => void {
  const ecrire = options.dire ?? ((ligne: string) => console.error(ligne));
  return compterLesRefus((refus) => {
    ecrire(`brigade : outgoing connection refused — ${refus.host === AUTRES_HOTES ? "other hosts still, no longer named" : `${refus.host}:${refus.port}`}${refus.count > 1 ? ` (${refus.count} attempts)` : ""}`);
    try {
      if (!existsSync(logPath(repertoireEtat))) return;
      const log = openLog(repertoireEtat);
      try {
        log.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "network.refused", payload: refus });
      } finally {
        log.fermer();
      }
    } catch (erreur) {
      ecrire(`brigade : refusal not logged — ${dire(erreur)}`);
    }
  });
}
