// Relire le journal qu'un autre process écrit, aussi souvent qu'une attente le
// sonde, sans le rouvrir ni le relire en entier à chaque sondage : une
// connexion en lecture seule reste ouverte par journal, et ce qu'elle en a lu
// est rendu tel quel tant qu'aucune autre connexion n'y a écrit.
// `PRAGMA data_version` le dit : SQLite change ce nombre à chaque écriture
// validée par une autre connexion — de ce process ou d'un autre —, et cette
// connexion-ci n'écrit jamais. Une écriture validée entre la lecture du
// numéro et celle du journal ne fait que relire une fois de trop au sondage
// suivant : rien de périmé n'est jamais rendu.
import { type Journal, ouvrirJournal } from "../../src/journal.ts";

export type Relecteur = {
  // Ce que `lire` rend du journal de ce répertoire d'état — relu seulement
  // s'il a changé depuis la dernière lecture sous la même clé.
  lire<T>(repertoire: string, cle: string, lire: (journal: Journal) => T): T;
  // Ferme les connexions gardées : avant que leurs répertoires disparaissent.
  fermer(): void;
};

export function relecteur(): Relecteur {
  const ouverts = new Map<string, { journal: Journal; lus: Map<string, { version: unknown; valeur: unknown }> }>();
  return {
    lire<T>(repertoire: string, cle: string, lire: (journal: Journal) => T): T {
      let ouvert = ouverts.get(repertoire);
      if (ouvert === undefined) {
        ouvert = { journal: ouvrirJournal(repertoire, { lectureSeule: true }), lus: new Map() };
        ouverts.set(repertoire, ouvert);
      }
      const version = ouvert.journal.base.lire<{ data_version: number }>("PRAGMA data_version")[0]?.data_version;
      const lu = ouvert.lus.get(cle);
      if (lu !== undefined && lu.version === version) return lu.valeur as T;
      const valeur = lire(ouvert.journal);
      ouvert.lus.set(cle, { version, valeur });
      return valeur;
    },
    fermer() {
      for (const { journal } of ouverts.values()) journal.fermer();
      ouverts.clear();
    },
  };
}
