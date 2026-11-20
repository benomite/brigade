// Ce qui reste du ticket de réparation d'une base rouge que la pass ouvrait
// (#3914 : le superviseur l'a remplacé) : la priorité et la marque par
// lesquelles la mesure de la qualité reconnaît une réparation d'avant lui
// (`qualite-github.ts`), et ce que les gates d'une base rouge nomment.
import type { Gates } from "./events/pass.ts";

// La priorité qui passe devant toutes les autres : celle de la réparation.
export const PRIO_REPARATION = "prio:0";

// La marque d'une issue de réparation, avec le commit du rouge qu'elle répare.
const MARQUE = /^\s*<!--\s*brigade:reparation-base ([0-9A-Za-z._-]+)\s*-->\s*$/m;
export function shaDeReparation(corps: string): string | null {
  return MARQUE.exec(corps)?.[1] ?? null;
}

// Ce qui a échoué, tel que les gates le nomment : leurs lignes `FAIL`, sans le
// mot. Sans ligne `FAIL`, ce que leur sortie dit d'elles.
export function echecsDesGates(gates: Gates): string[] {
  const nommes = gates.failures.map((ligne) => ligne.replace(/^FAIL\s+/, "").trim()).filter((ligne) => ligne !== "");
  if (nommes.length > 0) return nommes;
  return [gates.outcome === "timeout" ? "gates arrêtées à leur plafond de durée" : `gates sorties en ${gates.code ?? "erreur"}`];
}
