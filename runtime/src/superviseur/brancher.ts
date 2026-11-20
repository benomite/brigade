// Le superviseur branché sur la boucle du runtime (#3914) : à chaque réveil,
// ce que le tour GitHub a observé passe au déclenchement ; quand l'un des trois
// faits tient, un tour part — un seul par projet à la fois —, qui compose le
// dossier, le donne au manager, et joue ses gestes par la porte des six.
//
// Le même déclenchement ne repart pas avant `REDECLENCHEMENT_MS` : un ticket
// pris trois fois, une base rouge sur le même check, un rail immobile ne font
// pas un tour à chaque réveil. Une cuisine que le chef a arrêtée ou éteinte
// n'est pas supervisée.
import type { Base } from "../base.ts";
import { etatDesGardeFous } from "../projections/guardrails.ts";
import { etatDeLInterrupteur } from "../projections/switch.ts";
import type { Runtime } from "../runtime.ts";
import { declencher, direDeclenchement, type Declenchement } from "./declenchement.ts";
import { composerDossier } from "./dossier.ts";
import { etapeEnEchec, githubDuSuperviseur, historique, type ClientDuSuperviseur } from "./github.ts";
import { consigneDuSuperviseur, lireReponse } from "./manager.ts";
import type { ObservationDuTour } from "./observation.ts";
import { tourDuSuperviseur, type Bilan } from "./tour.ts";
import { superviseurDuProjet } from "./un-seul.ts";

export const REDECLENCHEMENT_MS = 30 * 60_000;

// Le manager lancé sur la consigne du tour : sa réponse, ou pourquoi il n'y en a pas.
export type ConsulterLeSuperviseur = (consigne: string) => Promise<{ message: string } | { illisible: string }>;

export type OptionsDuSuperviseur = {
  observation: Pick<ObservationDuTour, "client" | "observation" | "file">;
  // Le manager du projet ; nul, aucun tour ne part.
  consulter: () => ConsulterLeSuperviseur | null;
  // Le dépôt servi (`<owner>/<repo>`).
  depot: string;
  maintenant?: () => Date;
  attendre?: (ms: number) => Promise<void>;
  dire?: (ligne: string) => void;
  // Chaque tour fini, et ce qu'il a fait.
  surTour?: (bilan: Bilan & { declenchement: Declenchement }) => void;
};

// Le chef a arrêté la cuisine, ou éteint le projet : rien n'est supervisé.
export const arreteeParLeChef = (base: Base): boolean => etatDesGardeFous(base).stoppedAt !== null || etatDeLInterrupteur(base)?.on === false;

// Les dernières lignes du journal du projet, de la plus ancienne à la plus récente.
export function queueDuJournal(base: Base, lignes: number): string[] {
  return base
    .lire<{ at: string; type: string; ticket: number | null; payload: string }>(`SELECT at, type, ticket, payload FROM events ORDER BY seq DESC LIMIT ${Math.max(1, Math.floor(lignes))}`)
    .reverse()
    .map(({ at, type, ticket, payload }) => `${at} ${type}${ticket === null ? "" : ` #${ticket}`} ${payload.slice(0, 200)}`);
}

export function brancherSuperviseur<R extends Runtime>(runtime: R, options: OptionsDuSuperviseur): R {
  const maintenant = options.maintenant ?? (() => new Date());
  const dire = options.dire ?? ((ligne: string) => console.error(`brigade : ${ligne}`));
  const superviseur = superviseurDuProjet();
  const traites = new Map<string, number>();
  const { observation, depot } = options;

  const tour = async (client: ClientDuSuperviseur, consulter: ConsulterLeSuperviseur, declenchement: Declenchement) => {
    const vu = direDeclenchement(declenchement);
    const dossier = await composerDossier({
      lectures: { file: async () => observation.file(), queueDuJournal: async (n) => queueDuJournal(runtime.journal.base, n), etapeEnEchec: () => etapeEnEchec(client), historique: (ticket) => historique(client, ticket) },
      ticketFautif: declenchement.cause === "prises-sans-livraison" ? declenchement.ticket : null,
      vu,
    });
    const reponse = await consulter(consigneDuSuperviseur({ depot, declenchement, dossier }));
    const lue = "illisible" in reponse ? reponse : lireReponse(reponse.message);
    const bilan = await tourDuSuperviseur({
      github: githubDuSuperviseur({ client, depot, maintenant, attendre: options.attendre }),
      declenchement,
      vu: "illisible" in lue ? `${vu}. The manager's answer could not be read (${lue.illisible}): no gesture of its own.` : `${vu}. ${lue.vu}`,
      actions: "illisible" in lue ? [] : lue.gestes,
    });
    dire(`supervisor on ${runtime.projet}: ${vu} — ${bilan.fait.length === 0 ? "no gesture" : bilan.fait.join("; ")}${bilan.ticket === null ? "" : `, traced on #${bilan.ticket}`}${bilan.echecDeLaTrace === undefined ? "" : ` (the trace was not written: ${bilan.echecDeLaTrace})`}`);
    options.surTour?.({ ...bilan, declenchement });
  };

  const passer = () => {
    try {
      if (arreteeParLeChef(runtime.journal.base)) return;
      const lu = observation.client();
      const consulter = options.consulter();
      // Sans la lecture d'une issue, aucun geste ne se joue : le tour ne part pas.
      const issue = lu?.issue;
      if (lu === null || issue === undefined || consulter === null) return;
      const client: ClientDuSuperviseur = { ...lu, issue };
      const instant = maintenant().getTime();
      const declenchement = declencher(observation.observation(), new Date(instant));
      if (declenchement === null) return;
      const cle = JSON.stringify(declenchement);
      if (instant - (traites.get(cle) ?? -Infinity) < REDECLENCHEMENT_MS) return;
      // Un second déclenchement pendant un tour ne lance rien, et ne se compte pas.
      if (superviseur.enCours(runtime.projet)) return;
      traites.set(cle, instant);
      void superviseur.declencher(runtime.projet, () => tour(client, consulter, declenchement)).catch((erreur: unknown) => dire(`supervisor on ${runtime.projet}: its run failed — ${erreur instanceof Error ? erreur.message : String(erreur)}`));
    } catch (erreur) {
      dire(`supervisor on ${runtime.projet}: not evaluated — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  runtime.surReveil(passer);
  return runtime;
}
