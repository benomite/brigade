// La décision du chef devant une station sans bac à sable : ses cooks liraient
// tout ce que le compte de la station lit, et l'écran ne le disait pas. Tant
// que le chef n'a pas choisi, rien ne part pour le projet — pas même le ticket
// de préparation. Deux choix : continuer sans bac à sable sur cette machine
// (`accepterSansBacASable`), ou donner le projet à une autre station.
//
// La décision porte le nom de la station : elle ne vaut que pour elle. Le
// projet changé de station, la décision n'est pas reprise — la nouvelle
// station, si elle n'a pas de bac à sable non plus, redemande.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Dans le répertoire d'état du projet.
export const FICHIER = "decision-sans-bac-a-sable.json";

export type DecisionSansBacASable = { station: string; accepteLe: string };

// La décision du chef de cuire sans bac à sable, ou null. Illisible, elle n'en
// est pas une : la cuisine ne se libère pas sur un fichier qu'elle ne comprend pas.
export function lireDecisionSansBacASable(repertoireEtat: string): DecisionSansBacASable | null {
  try {
    const lu = JSON.parse(readFileSync(join(repertoireEtat, FICHIER), "utf8")) as Partial<DecisionSansBacASable>;
    return typeof lu.station === "string" && lu.station !== "" && typeof lu.accepteLe === "string" ? { station: lu.station, accepteLe: lu.accepteLe } : null;
  } catch {
    return null;
  }
}

// Le chef continue sans bac à sable sur `station` : la retenue est levée pour elle.
export function accepterSansBacASable(options: { repertoireEtat: string; station: string; maintenant?: () => Date }): DecisionSansBacASable {
  const { repertoireEtat, station } = options;
  const decision = { station, accepteLe: (options.maintenant ?? (() => new Date()))().toISOString() };
  mkdirSync(repertoireEtat, { recursive: true });
  const fichier = join(repertoireEtat, FICHIER);
  writeFileSync(`${fichier}.ecriture`, `${JSON.stringify(decision)}\n`);
  renameSync(`${fichier}.ecriture`, fichier);
  return decision;
}

// Le projet attend le chef : sa station cuit sans bac à sable (`sansBacASable`,
// null tant qu'on ne le sait pas : rien n'est retenu sur un doute) et il n'a
// pas décidé pour elle.
export function decisionAttendue(faits: { station: string | null; sansBacASable: boolean | null; decision: Pick<DecisionSansBacASable, "station"> | null }): boolean {
  return faits.station !== null && faits.sansBacASable === true && faits.decision?.station !== faits.station;
}
