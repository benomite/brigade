// Le dossier que le superviseur remet au manager (#3943, spec
// 2026-11-20-kitchen-spinning, section B) : la file, la queue du journal,
// l'étape de CI en échec avec ses lignes de log, et l'historique du ticket en
// faute.
//
// Chaque lecture peut échouer : elle est alors dite illisible, avec sa raison,
// et le dossier part avec les autres. Rien n'y est inventé à la place d'une
// lecture qui manque.
import { sortieDErreur } from "../checks-de-la-base.ts";
import type { Evenement } from "../evenements.ts";
import type { GitHub } from "../github.ts";
import type { Journal } from "../journal.ts";
import { lireRail, type TicketRail } from "../projections/rail.ts";
import type { Reveil } from "./declencheur.ts";

// Combien d'événements de la fin du journal le dossier porte.
export const QUEUE_DU_JOURNAL = 50;

export type Lu<T> = { lu: T } | { illisible: string };

// Un check rouge de la base : les étapes qui y échouent, et la fin utile de son
// log, jusqu'à sa dernière erreur.
export type EchecDeCi = { check: string; url: string | null; steps: Lu<string[]>; log: Lu<string> };

// `history` : null quand le réveil ne nomme aucun ticket en faute.
export type Dossier = {
  reveil: Reveil;
  queue: Lu<TicketRail[]>;
  journal: Lu<Evenement[]>;
  ci: Lu<EchecDeCi[]>;
  history: Lu<Evenement[]> | null;
};

export type SourcesDuDossier = {
  journal: Pick<Journal, "base" | "derniers" | "duTicket">;
  github: Pick<GitHub, "ciDeLaBase" | "journalDuCheck" | "etapesEnEchec">;
  // La branche d'intégration du projet.
  branche: string;
};

const raison = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

async function lire<T>(lecture: () => T | Promise<T>): Promise<Lu<T>> {
  try {
    return { lu: await lecture() };
  } catch (erreur) {
    return { illisible: raison(erreur) };
  }
}

async function echecDeCi(github: SourcesDuDossier["github"], check: Awaited<ReturnType<GitHub["ciDeLaBase"]>>[number]): Promise<EchecDeCi> {
  const etapesEnEchec = github.etapesEnEchec?.bind(github);
  const steps: Lu<string[]> = etapesEnEchec === undefined ? { illisible: "this GitHub client does not read the failing steps" } : await lire(() => etapesEnEchec(check));
  const log = await lire(async () => {
    const journal = await github.journalDuCheck(check);
    if (journal === null) throw new Error("GitHub returned no log for this check");
    return sortieDErreur(journal);
  });
  return { check: check.name, url: check.url, steps, log };
}

export async function dossierDuManager({ journal, github, branche }: SourcesDuDossier, reveil: Reveil): Promise<Dossier> {
  const queue = await lire(() => lireRail(journal.base));
  const fin = await lire(() => journal.derniers(QUEUE_DU_JOURNAL));
  const ci = await lire(async () => {
    const rouges = (await github.ciDeLaBase(branche)).filter(({ outcome }) => outcome === "red");
    return Promise.all(rouges.map((check) => echecDeCi(github, check)));
  });
  const history = reveil.ticket === null ? null : await lire(() => journal.duTicket(reveil.ticket as number));
  return { reveil, queue, journal: fin, ci, history };
}
