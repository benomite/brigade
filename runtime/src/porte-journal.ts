// Ce qu'une porte tient du journal de son projet : sa liste blanche, que le
// runtime y publie (`network.declared`), et ses refus, qu'elle y écrit. Le
// journal n'est ouvert que le temps d'un geste : une restauration ne trouve
// pas la porte assise dessus. La porte d'une installation par projet
// (`tenir-porte.ts`) et celles de la station (`station/portes.ts`) le lisent
// de la même façon.
import { existsSync } from "node:fs";
import { cheminJournal, ouvrirJournal } from "./journal.ts";
import { AUTRES_HOTES, compterLesRefus, garderLaListe } from "./porte.ts";
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
export function listeDuJournal(repertoireEtat: string, options: { avertir?: (message: string) => void } = {}): (fraiches?: boolean) => Regle[] {
  return garderLaListe(
    (): Regle[] => {
      if (!existsSync(cheminJournal(repertoireEtat))) return REGLES_DE_BASE;
      const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
      try {
        return reglesDuProjet(journal.duType("network.declared", 1)[0]?.payload.hosts ?? []);
      } finally {
        journal.fermer();
      }
    },
    { delaiMs: RELECTURE_MS, plancherFraisMs: RELECTURE_AVANT_REFUS_MS, avertir: options.avertir },
  );
}

// Ce qu'une porte fait d'un refus : une ligne de sa sortie, et — comptés, un
// par hôte et par dix minutes — un `network.refused` au journal du projet.
export function refusAuJournal(repertoireEtat: string, projet: string, options: { dire?: (ligne: string) => void } = {}): (hote: string, port: number) => void {
  const ecrire = options.dire ?? ((ligne: string) => console.error(ligne));
  return compterLesRefus((refus) => {
    ecrire(`brigade : sortie refusée — ${refus.host === AUTRES_HOTES ? "d'autres hôtes encore, qui ne sont plus nommés" : `${refus.host}:${refus.port}`}${refus.count > 1 ? ` (${refus.count} tentatives)` : ""}`);
    try {
      if (!existsSync(cheminJournal(repertoireEtat))) return;
      const journal = ouvrirJournal(repertoireEtat);
      try {
        journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "network.refused", payload: refus });
      } finally {
        journal.fermer();
      }
    } catch (erreur) {
      ecrire(`brigade : refus non journalisé — ${dire(erreur)}`);
    }
  });
}
