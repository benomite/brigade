// Les places de la station GitHub seul de cette machine : combien de tickets elle tient à la fois, relu à chaque tour (#3446).
//
// Depuis #2061, la station les fixait à son démarrage — sa déclaration bornée par les cœurs de la machine
// (`plafondDesCoeurs`), 3 sur une machine de 8 cœurs — et ne s'annonçait plus au journal. Le plafond que le chef règle à
// chaud (`station -- cooks <N>`, `station.capped`) s'y écrivait, mais rien ne le lisait, et `status` ne disait pas le plafond qui tenait.
// Les tickets du rail attendaient leur prise qu'un des trois cooks finisse, sans geste qui puisse y répondre : l'attente
// d'une prise, la perte la plus lourde des dix tickets que #3446 mesure.
//
// La station s'annonce donc à son démarrage (`station.announced` : sa déclaration et les cœurs de sa machine), comme le
// faisait l'ancien chemin : `status` et `station` disent son plafond et d'où il vient. Ses places sont, à chaque tour, le
// plafond du chef s'il en a réglé un (0 : sans limite), sinon son défaut — le même qu'avant. Un journal qui ne se lit pas
// garde le défaut, et le dit une fois.
import { availableParallelism } from "node:os";
import type { Journal } from "../../journal.ts";
import { etatStation, plafondDesCoeurs } from "../../projections/stations.ts";
import type { StationDeclaree } from "../../stations-declarees.ts";

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export type OptionsDesPlaces = {
  // Les cœurs de la machine ; par défaut, ceux que Node voit.
  coeurs?: number;
  avertir?: (message: string) => void;
};

// Annonce la station au journal du projet, et rend ce qui lit ses places à chaque tour.
export function placesDeLaStation(journal: Pick<Journal, "ajouter" | "base">, projet: string, station: Pick<StationDeclaree, "nom" | "moteur" | "fournit" | "cooks">, options: OptionsDesPlaces = {}): () => number {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const coeurs = options.coeurs ?? availableParallelism();
  // Pas plus de cooks que la machine n'en porte, tant que le chef n'a rien réglé : une station déclarée à 30 en tiendrait 30.
  const defaut = Math.min(station.cooks, plafondDesCoeurs(coeurs));
  try {
    journal.ajouter({ project: projet, ticket: null, author: "runtime", type: "station.announced", payload: { station: station.nom, engine: station.moteur, provides: station.fournit, maxCooks: station.cooks, cores: coeurs } });
  } catch (erreur) {
    avertir(`brigade : station ${station.nom} could not announce itself in the log (${message(erreur)}) — status does not say its cap; it takes ${defaut} tickets at most until the chef sets one`);
  }
  let illisible = false;
  return () => {
    try {
      const cap = etatStation(journal.base, station.nom)?.cap ?? null;
      illisible = false;
      if (cap === null) return defaut;
      return cap === 0 ? Number.POSITIVE_INFINITY : cap;
    } catch (erreur) {
      if (!illisible) avertir(`brigade : the cap of station ${station.nom} could not be read from the log (${message(erreur)}) — it takes ${defaut} tickets at most, its default, until it reads again`);
      illisible = true;
      return defaut;
    }
  };
}
