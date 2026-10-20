// La décision du chef devant une station sans bac à sable : ses cooks liraient
// tout ce que le compte de la station lit, et l'écran ne le disait pas. Tant
// que le chef n'a pas choisi, rien ne part pour le projet — pas même le ticket
// de préparation. Deux choix : continuer sans bac à sable sur cette machine
// (`accepterSansBacASable`), ou donner le projet à une autre station.
//
// La décision porte le nom de la station : elle ne vaut que pour elle. Le
// projet changé de station, la décision n'est pas reprise — la nouvelle
// station, si elle n'a pas de bac à sable non plus, redemande.
//
// Comme la préparation (`preparation-depot/attendre.ts`), c'est le rail que
// lisent les stations qui est retenu ; le journal du projet est relu à chaque
// prise : la décision posée vaut à la suivante, sans redémarrage.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeAvecRail } from "../alimenter.ts";
import type { Rail } from "../rail.ts";

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

export type OptionsRetenue = {
  repertoireEtat: string;
  // La station qui ouvre cette cuisine.
  station: string;
  // Une ligne du journal de service de la station.
  dire: (ligne: string) => void;
};

export function retenirSansDecision<R extends RuntimeAvecRail>(runtime: R, options: OptionsRetenue): R {
  const { repertoireEtat, station } = options;
  const { journal } = runtime;
  let dit: "retenu" | "libre" | null = null;
  const retenu = (): boolean => {
    const cloison = journal.duType("isolation.configured", 1)[0]?.payload;
    const retenue = decisionAttendue({ station, sansBacASable: cloison === undefined ? null : cloison.sandbox === null, decision: lireDecisionSansBacASable(repertoireEtat) });
    if (retenue && dit !== "retenu") options.dire(`brigade : ${station} cuit sans bac à sable — aucun cook ne part avant que le chef ait choisi : continuer sans, ou une autre station`);
    if (!retenue && dit === "retenu") options.dire(`brigade : le chef a décidé pour ${station} — le rail démarre`);
    dit = retenue ? "retenu" : "libre";
    return retenue;
  };
  const rail: Rail = {
    ...runtime.rail,
    prendre: (qui, enCuisine, seul) => (retenu() ? null : runtime.rail.prendre(qui, enCuisine, seul)),
    servables: (enCuisine, preneuses, seul) => (retenu() ? 0 : runtime.rail.servables(enCuisine, preneuses, seul)),
  };
  return { ...runtime, rail };
}
