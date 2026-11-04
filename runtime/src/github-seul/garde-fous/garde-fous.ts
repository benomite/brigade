// Les garde-fous de l'ancien chemin, appliqués aux cooks de l'état GitHub seul
// (épique #2209, ticket #2213). Le tour GitHub seul (`brigade-github.ts`)
// lançait ses cooks sans passer par eux ; il les consulte maintenant avant
// chaque prise, et ses lancements passent par ceux du runtime :
//
// - le « stop » du chef et le disjoncteur se lisent au journal, comme pour
//   l'ancienne station (`station.ts`, `borneDe`) : tant que l'un tient, aucune
//   prise ne part. Les lancements passent par `brancherGardeFous` : le « stop »
//   arrête dans la seconde les cooks qui tournent, un échec compte pour le
//   disjoncteur, les plafonds sont ceux du projet ;
// - le budget du compte Max : un cook qui bute sur le quota l'écrit
//   (`station.86`, avec son heure de retour), et aucune prise ne part avant ;
// - l'arbitre entre projets, consulté en dernier, pour chaque ticket que la
//   station s'apprête à prendre. Injoignable, au plus un cook à la fois.
//
// Rien de neuf n'est compté ici : les faits sont ceux que l'ancien chemin
// écrit et lit déjà, et `status` les montre de même.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Arbitrage, Reponse } from "../../arbitrage.ts";
import type { Lancer } from "../../brigade-github.ts";
import { lireFlux, verdict } from "../../claude.ts";
import type { FaitStation, Retenue } from "../../events/station.ts";
import { LancementRefuse, type GardeFous, type Verdict } from "../../garde-fous.ts";
import { etatDesGardeFous } from "../../projections/guardrails.ts";
import { consommationDesCooks, etatStation } from "../../projections/stations.ts";
import type { Runtime } from "../../runtime.ts";
import type { Fin } from "../../superviseur.ts";

// Ce qui retient une prise sur ce chemin : le « stop » du chef, le
// disjoncteur, le quota du compte épuisé, l'arbitre qui refuse — ou qui ne
// répond pas alors qu'un cook tourne déjà.
export type RetenueDuTour = Extract<Retenue, "stopped" | "breaker" | "quota" | "arbiter" | "unarbitrated">;

// Sans heure de retour dans le flux, le quota est tenu pour épuisé une heure,
// comme sur l'ancien chemin.
export const REPLI_QUOTA_MS = 3_600_000;

export type GardesDuTour = {
  // Ce qui retient la prise d'un ticket de plus, `cooks` cooks de tickets en
  // vol : null, la prise peut partir — et l'arbitre a compté sa place.
  retenue(cooks: number): Promise<RetenueDuTour | null>;
  // La fin d'un tour : le projet redit son état à l'arbitre, qui l'apprend
  // même quand rien n'est demandé.
  redire(cooks: number): Promise<void>;
  // Le lancement gardé d'un cook ou d'une relecture du tour.
  lancer: Lancer;
  // Le tour s'arrête : le projet rend sa part à l'arbitre.
  quitter(): Promise<void>;
};

export type OptionsDesGardes = {
  // Le runtime du projet, augmenté de ses garde-fous.
  garde: Pick<GardeFous, "lancer"> & Pick<Runtime, "journal" | "projet">;
  // La station GitHub seul de cette machine : le nom sous lequel ses retenues
  // et son quota s'écrivent.
  station: string;
  // Le répertoire d'état du projet, où les garde-fous écrivent le flux des cooks.
  repertoireEtat: string;
  arbitre: Arbitrage | null;
  maintenant?: () => Date;
  avertir?: (message: string) => void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

const DIT: Record<RetenueDuTour, string> = {
  stopped: "the kitchen is stopped by the chef — nothing is taken before `guardrails resume`",
  breaker: "the breaker is open — nothing is taken before `guardrails resume`",
  quota: "the Max quota is spent — nothing is taken before it is back",
  arbiter: "the arbiter gives the account's places to other projects",
  unarbitrated: "the arbiter does not answer — one cook at a time until it is back",
};

// Comme l'ancien chemin le juge : le quota, la connexion expirée et le refus
// du modèle ne disent pas que la cuisine est cassée.
const jugerDuFlux = (lu: ReturnType<typeof verdict>): Verdict => (lu === "done" ? "ok" : lu === "86" || lu === "disconnected" ? "neutral" : lu === "refused" ? "refused" : "failed");

export function gardesDuTour(options: OptionsDesGardes): GardesDuTour {
  const { garde, station, repertoireEtat, arbitre } = options;
  const { journal, projet } = garde;
  const { base } = journal;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const noter = (fait: FaitStation) => journal.ajouter({ project: projet, ticket: null, author: "runtime", ...fait });

  // Ce qui retient la station, tel que le journal le dit (`station.held`) :
  // écrit quand la raison change, pas à chaque prise.
  let tenue: Retenue | null = etatStation(base, station)?.heldReason ?? null;
  // Une retenue a été lue ce tour-ci : il y avait un ticket à prendre.
  let lueCeTour = false;
  // Ce tour a buté sur l'arbitre : le projet a des tickets qui attendent.
  let enAttente = false;
  let degrade = false;

  const dire = (retenue: RetenueDuTour | null) => {
    if (retenue === tenue) return;
    tenue = retenue;
    noter(retenue === null ? { type: "station.released", payload: { station } } : { type: "station.held", payload: { station, reason: retenue } });
    avertir(retenue === null ? `brigade : GitHub-only station ${station} takes tickets again` : `brigade : GitHub-only station ${station} takes no ticket — ${DIT[retenue]}`);
  };

  const mot = (cooks: number, demande: boolean) => ({ cooks, demande, machine: false, nonArbitres: degrade ? cooks : 0, consommation: consommationDesCooks(base, station, maintenant()) });

  // Demande une place à l'arbitre ; null s'il ne répond pas. L'entrée en mode
  // dégradé et le retour se disent une fois chacun.
  const echanger = async (cooks: number, veut: boolean): Promise<Reponse | null> => {
    if (arbitre === null) return null;
    try {
      const reponse = await arbitre.echanger(projet, { ...mot(cooks, veut || enAttente), veut });
      if (degrade) {
        degrade = false;
        avertir(`brigade : the arbiter answers again — GitHub-only station ${station} is arbitrated`);
      }
      return reponse;
    } catch (erreur) {
      if (!degrade) {
        degrade = true;
        avertir(`brigade : ${message(erreur)} — GitHub-only station ${station} launches one cook at a time, unarbitrated, until it is back`);
      }
      return null;
    }
  };

  const retenueLue = async (cooks: number): Promise<RetenueDuTour | null> => {
    const etat = etatDesGardeFous(base);
    if (etat.stoppedAt !== null) return "stopped";
    if (etat.breakerOpenedAt !== null) return "breaker";
    const quota = etatStation(base, station)?.quotaUntil ?? null;
    if (quota !== null && quota > maintenant().toISOString()) return "quota";
    if (arbitre === null) return null;
    const reponse = await echanger(cooks, true);
    if (reponse === null) return cooks === 0 ? null : "unarbitrated";
    return reponse.accorde ? null : "arbiter";
  };

  // Un cook a buté sur le quota du compte : épuisé pour lui, il l'est pour
  // tous. Une heure de retour déjà passée ne retiendrait rien.
  const noterLeQuota = (lecture: ReturnType<typeof lireFlux>) => {
    const instant = maintenant();
    const annonce = lecture.quota?.retour ?? null;
    const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
    noter({ type: "station.86", payload: { station, reason: "quota", until: retour.toISOString(), window: lecture.quota?.fenetre ?? null } });
  };

  const lancer: Lancer = ({ commande, args, cwd, env, flux: demande }) => {
    // Le run est unique au journal : un ticket renvoyé repart sous un autre.
    const run = `${basename(demande).replace(/\.flux\.jsonl$|\.jsonl$/, "")}-${randomUUID().slice(0, 8)}`;
    const flux = join(repertoireEtat, "runs", `${run}.jsonl`);
    const lu = () => lireFlux(existsSync(flux) ? readFileSync(flux, "utf8") : "");
    try {
      const lance = garde.lancer({
        ticket: null,
        run,
        contexte: { station },
        commande,
        args,
        cwd,
        env,
        juger: (fin) => {
          const lecture = lu();
          const conclusion = verdict(lecture, fin.code);
          if (conclusion === "86") noterLeQuota(lecture);
          return jugerDuFlux(conclusion);
        },
      });
      return { fin: lance.fin, flux };
    } catch (erreur) {
      // Le « stop » ou le disjoncteur tombé entre la prise et le lancement :
      // rien n'est parti, et le cook le dit comme une fin sans livraison.
      if (!(erreur instanceof LancementRefuse)) throw erreur;
      const fin: Fin = { code: null, signal: null, turns: 0, tokens: 0, durationMs: 0, arret: null, erreur: `launch refused: ${erreur.message}` };
      return { fin: Promise.resolve(fin), flux };
    }
  };

  return {
    lancer,
    retenue: async (cooks) => {
      lueCeTour = true;
      const retenue = await retenueLue(cooks);
      if (retenue === "arbiter" || retenue === "unarbitrated") enAttente = true;
      dire(retenue);
      return retenue;
    },
    redire: async (cooks) => {
      // Aucun ticket à prendre ce tour : plus rien ne retient la station.
      if (!lueCeTour) dire(null);
      lueCeTour = false;
      if (arbitre !== null) await echanger(cooks, false);
      enAttente = false;
    },
    quitter: async () => {
      if (arbitre === null) return;
      try {
        await arbitre.quitter(projet);
      } catch {}
    },
  };
}
