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
// - la machine (`machine.ts`) : tant qu'il lui manque du processeur, de la
//   mémoire ou du disque, aucune prise ne part (`station.saturated`). L'ancien
//   chemin la lisait avant toute autre borne (#98) ; #2061 l'a retirée avec
//   lui, et ne restait que le plafond tiré des cœurs, qui la devinait (#3560) ;
// - l'arbitre entre projets, consulté en dernier, pour chaque ticket que la
//   station s'apprête à prendre. Injoignable, au plus un cook à la fois.
//
// Rien de neuf n'est compté ici : les faits sont ceux que l'ancien chemin
// écrit et lit déjà, et `status` les montre de même.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Arbitrage, Reponse } from "../../arbitrage.ts";
import type { Lancer } from "../../brigade-github.ts";
import { lireFlux, verdict } from "../../claude.ts";
import type { FaitStation, Ressource, Retenue } from "../../events/station.ts";
import { LancementRefuse, type GardeFous, type Verdict } from "../../garde-fous.ts";
import { direSaturationsEn, JEUNE_MS, reserver, saturations, type Machine, type Saturation, type Seuils } from "../../machine.ts";
import { worktreesDuProjet } from "../../depot.ts";
import { carteDuDisque, peutEncoreLiberer, type DisquePlein } from "./disque-plein.ts";
import { recuperer, type Fichiers } from "./recuperation.ts";
import { etatDesGardeFous } from "../../projections/guardrails.ts";
import { consommationDesCooks, etatStation, runsRendables } from "../../projections/stations.ts";
import { activeEngine, direLeStatut, moteursDeLaStation, VARIABLE_DU_MOTEUR } from "../../repli/moteur-actif.ts";
import type { Runtime } from "../../runtime.ts";
import type { Fin } from "../../superviseur.ts";

// Le début de l'erreur d'un lancement refusé parce que la station est retenue : un arrêt subi, que le cook n'a pas causé.
const LANCEMENT_RETENU = "launch refused (station held)";

// Un arrêt que le cook n'a pas causé : le quota, la session Claude, une station
// arrêtée ou un process tué (un signal sans erreur du lanceur). Un plafond (jetons, durée, inactivité) est le sien.
export const arretSubi = (conclusion: string, fin: { code: number | null; signal: string | null; arret: { reason: string } | null; erreur: string | null }): boolean => {
  if (conclusion === "86" || conclusion === "disconnected") return true;
  if (fin.erreur?.startsWith(LANCEMENT_RETENU)) return true;
  if (fin.arret !== null) return fin.arret.reason === "stop";
  // SIGTERM : le signal, ou le code 143 quand un relais ou un shell l'a rendu en code de sortie (#3528).
  return fin.erreur === null && (fin.signal !== null || fin.code === 143);
};

// Ce qui retient une prise sur ce chemin : le « stop » du chef, le
// disjoncteur, le quota du compte épuisé, la machine à court, l'arbitre qui
// refuse — ou qui ne répond pas alors qu'un cook tourne déjà.
export type RetenueDuTour = Extract<Retenue, "stopped" | "breaker" | "quota" | "machine" | "arbiter" | "unarbitrated">;

// Un processeur qui dépasse son seuil de moins de cette part ne retient la
// station que s'il le dépasse ainsi sur ce nombre de lectures de suite (#4142).
const MARGE_DU_PIC = 0.1;
const LECTURES_DU_PIC = 3;

// Sans heure de retour dans le flux, le quota est tenu pour épuisé une heure,
// comme sur l'ancien chemin.
export const REPLI_QUOTA_MS = 3_600_000;

export type GardesDuTour = {
  // Ce qui retient la prise d'un ticket de plus, `cooks` cooks de tickets en
  // vol : null, la prise peut partir — et l'arbitre a compté sa place.
  // `reparation` : le numéro du ticket qui répare la saturation de la machine (#4100) — elle ne le retient
  // pas, et son cook se lance sur la station retenue pour elle.
  retenue(cooks: number, reparation?: number): Promise<RetenueDuTour | null>;
  // La fin d'un tour : le projet redit son état à l'arbitre, qui l'apprend
  // même quand rien n'est demandé.
  redire(cooks: number): Promise<void>;
  // Le lancement gardé d'un cook ou d'une relecture du tour.
  lancer: Lancer;
  // Le tour s'arrête : le projet rend sa part à l'arbitre.
  quitter(): Promise<void>;
  // L'arbitre vient de refuser la prise : vrai dès qu'une place s'ouvre pour
  // le projet, faux s'il n'en voit aucune dans son attente, s'il ne retient plus
  // la station ou s'il ne répond pas (#2832). Une seule attente à la fois.
  attendreUnePlace(): Promise<boolean>;
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
  // La machine sous la station et ses seuils (`configMachine`). Absente : rien
  // ne se retient sur elle.
  machine?: { lire: () => Machine; seuils: Seuils };
  // Un disque saturé que la cuisine ne peut plus libérer, sans cook en vol,
  // est dit au chef par une carte de TODO (#4091). Absent : rien ne se dit.
  disquePlein?: DisquePlein;
  // Ce que la récupération lit et retire sur le disque (`recuperation.ts`) ; le vrai disque par défaut.
  fichiers?: Fichiers;
  maintenant?: () => Date;
  avertir?: (message: string) => void;
  // L'environnement de la station, où se lit son moteur de repli (#3745).
  env?: Record<string, string | undefined>;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce que dit chaque retenue : au journal, et sur les tickets qu'elle laisse (#3699).
export const DIT_DES_RETENUES: Record<RetenueDuTour, string> = {
  stopped: "the kitchen is stopped by the chef — nothing is taken before `guardrails resume`",
  breaker: "the breaker is open — nothing is taken before `guardrails resume`",
  quota: "the Max quota is spent — nothing is taken before it is back",
  machine: "the machine runs short of processor, memory or disk — nothing is taken before it recovers",
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

  // Le moteur de chaque cook : le principal, ou le repli tant que le quota du
  // principal est épuisé (#3745). Le repli et le quota de chacun se lisent au
  // journal (`station.fallback`, `station.86`).
  const moteurs = moteursDeLaStation(station, options.env ?? {});
  if (moteurs.refus !== null) avertir(`brigade : ${moteurs.refus}`);
  const { engine, fallbackEngine } = moteurs;
  if ((etatStation(base, station)?.fallbackEngine ?? null) !== fallbackEngine) noter({ type: "station.fallback", payload: { station, engine: fallbackEngine } });
  // Ce que la station a dit de son moteur : elle le redit quand il change.
  let moteurDit = direLeStatut({ station, engine, fallbackEngine }, { engine, fallback: false, blocked: false, blockedUntil: null });
  const surQuelMoteur = () => {
    const etat = etatStation(base, station);
    const statut = activeEngine({ station, engine, fallbackEngine, quotaUntil: etat?.quotaUntil ?? null, fallbackQuotaUntil: etat?.fallbackQuotaUntil ?? null }, maintenant());
    const dit = direLeStatut({ station, engine, fallbackEngine }, statut);
    if (dit !== moteurDit) avertir(`brigade : ${dit}`);
    moteurDit = dit;
    return statut;
  };

  // Ce qui retient la station, tel que le journal le dit (`station.held`) :
  // écrit quand la raison change, pas à chaque prise.
  let tenue: Retenue | null = etatStation(base, station)?.heldReason ?? null;
  // Une retenue a été lue ce tour-ci : il y avait un ticket à prendre.
  let lueCeTour = false;
  // Ce tour a buté sur l'arbitre : le projet a des tickets qui attendent.
  let enAttente = false;
  let degrade = false;
  // L'attente d'une place en cours chez l'arbitre, s'il y en a une.
  let placeAttendue: Promise<boolean> | null = null;
  // Les ressources dont la machine manque, telles que le journal les dit : une
  // saturation ne se lève qu'avec de la marge (`saturations`).
  let saturees: Ressource[] = (etatStation(base, station)?.saturatedCauses ?? []).map(({ resource }) => resource);
  // Les prises accordées : la charge moyenne court sur une minute, un cook qui
  // part ne pèse pas encore — chacun est compté d'avance (`reserver`), qu'un
  // rail plein ne parte pas d'un bloc.
  let accordees: number[] = [];
  let machineIllisible = false;
  // Les restes des cooks partis ont été rendus ce tour-ci : une seule fois par tour.
  let recupereCeTour = false;
  // Les lectures de suite où le processeur dépasse à peine son seuil (#4142).
  let pic = 0;
  let saturee = false;
  // La machine à court retient les tickets de ce tour, sauf la réparation de la saturation (#4100).
  let machineRetient = false;
  // Les tickets de réparation de la saturation que la machine a laissés passer : leur cook se lance (#4100).
  const reparationsLaissees = new Set<number>();
  // Ce dont le disque manque, tel que la dernière lecture de la machine le dit.
  let manqueDisque: Saturation | null = null;
  // La carte du disque est posée : elle ne se repose pas tant qu'il reste plein.
  let carteDuDisquePosee = false;

  const dire = (retenue: RetenueDuTour | null) => {
    if (retenue === tenue) return;
    tenue = retenue;
    noter(retenue === null ? { type: "station.released", payload: { station } } : { type: "station.held", payload: { station, reason: retenue } });
    avertir(retenue === null ? `brigade : GitHub-only station ${station} takes tickets again` : `brigade : GitHub-only station ${station} takes no ticket — ${DIT_DES_RETENUES[retenue]}`);
  };

  // `machine` : l'arbitre partage entre les projets ce que la machine porte quand elle sature —
  // lue par ce runtime, pas une saturation qu'un runtime d'avant a laissée au journal.
  const mot = (cooks: number, demande: boolean, reparation: boolean) => ({ cooks, demande, machine: saturee && !reparation, nonArbitres: degrade ? cooks : 0, consommation: consommationDesCooks(base, station, maintenant()) });

  // Demande une place à l'arbitre ; null s'il ne répond pas. L'entrée en mode
  // dégradé et le retour se disent une fois chacun.
  const echanger = async (cooks: number, veut: boolean, reparation = false): Promise<Reponse | null> => {
    if (arbitre === null) return null;
    try {
      const reponse = await arbitre.echanger(projet, { ...mot(cooks, veut || enAttente, reparation), veut });
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

  // Une ressource qui manque, avec son plus gros consommateur quand la machine
  // lue le mesure (#4090) : un lecteur absent, qui échoue ou ne nomme rien la
  // laisse telle quelle.
  const nommer = (machine: Machine) => (manque: Saturation): Saturation => {
    try {
      const gros = machine.consommateur?.(manque.resource) ?? null;
      return gros === null ? manque : { ...manque, consumer: `${gros.name} (${gros.amount})` };
    } catch {
      return manque;
    }
  };

  // Ce dont la machine manque, ses prises récentes comptées d'avance ; le
  // journal le dit quand les ressources en cause changent. Sans cook en vol,
  // elle ne retient rien : jamais moins d'un cook, comme le plafond des cœurs.
  // Une machine qui ne se lit pas ne retient rien — les places de la station
  // bornent toujours ses cooks — et le dit une fois.
  const machineAcourt = (cooks: number): boolean => {
    const { machine } = options;
    if (machine === undefined) return false;
    const mesurer = () => {
      const instant = maintenant().getTime();
      accordees = accordees.filter((a) => instant - a < JEUNE_MS);
      const lue = machine.lire();
      const vue = reserver(lue, accordees.length);
      let manques = saturations(vue, machine.seuils, saturees);
      // Un pic ne retient rien (#4142) : la lecture brute passe le seuil, la charge comptée d'avance de peu, et la station n'est pas déjà retenue pour le processeur.
      const cpu = manques.find(({ resource }) => resource === "cpu");
      const bref = cpu !== undefined && !saturees.includes("cpu") && lue.charge > cpu.limit && vue.charge <= cpu.limit * (1 + MARGE_DU_PIC);
      pic = bref ? pic + 1 : 0;
      if (bref && pic < LECTURES_DU_PIC) manques = manques.filter(({ resource }) => resource !== "cpu");
      return { lue, manques };
    };
    let mesure: { lue: Machine; manques: Saturation[] };
    try {
      mesure = mesurer();
      // Saturée sans cook en vol : ce que les cooks partis ont laissé se rend, puis la machine se relit.
      if (mesure.manques.length > 0 && cooks === 0 && !recupereCeTour) {
        recupereCeTour = true;
        try {
          const { retires, echecs } = recuperer({ worktrees: worktreesDuProjet(options.env ?? {}, repertoireEtat), repertoireEtat, clone: options.env?.BRIGADE_REPO_DIR, finis: runsRendables(base), cacheNpm: options.env?.npm_config_cache || join(homedir(), ".npm") }, options.fichiers);
          if (retires.length > 0) avertir(`brigade : GitHub-only station ${station} gave back ${retires.length} leftover worktree(s), run file(s), tmp dir(s) and npm cache of exited cooks`);
          if (echecs.length > 0) avertir(`brigade : GitHub-only station ${station} could not reclaim ${echecs.join(", ")}`);
        } catch (erreur) {
          avertir(`brigade : GitHub-only station ${station} could not reclaim what exited cooks left (${message(erreur)})`);
        }
        mesure = mesurer();
      }
      machineIllisible = false;
    } catch (erreur) {
      if (!machineIllisible) avertir(`brigade : the machine under GitHub-only station ${station} could not be read (${message(erreur)}) — its places alone bound its cooks until it reads again`);
      machineIllisible = true;
      return false;
    }
    const { lue, manques } = mesure;
    const ressources = manques.map(({ resource }) => resource);
    if (ressources.join() !== saturees.join()) {
      const [premier] = manques;
      if (premier === undefined) {
        noter({ type: "station.relieved", payload: { station } });
        avertir(`brigade : the machine under GitHub-only station ${station} has room again`);
      } else {
        const nommes = manques.map(nommer(lue));
        const [tete = premier, ...aussi] = nommes;
        noter({ type: "station.saturated", payload: { station, ...tete, ...(aussi.length > 0 ? { also: aussi } : {}) } });
        const dit = direSaturationsEn(nommes);
        avertir(`brigade : the machine under GitHub-only station ${station} runs short of ${dit.ressources} — ${dit.detail}`);
      }
      saturees = ressources;
    }
    saturee = manques.length > 0;
    manqueDisque = manques.find(({ resource }) => resource === "disk") ?? null;
    return saturee && cooks > 0;
  };

  // Le disque est plein, aucun cook ne tourne : si ce que la cuisine tient ne
  // suffirait pas à le vider assez, le chef en est averti — une seule carte
  // tant que l'état dure. Un disque qui respire lève la carte. Une sonde ou une
  // pose qui échoue se dit et se retente au tour suivant : rien ne se devine.
  // Elle ne retient pas le tour : `du` peut durer. Une seule à la fois.
  let disqueEnCours: Promise<void> | null = null;
  const direLeDisque = async (cooks: number) => {
    const { disquePlein } = options;
    if (disquePlein === undefined) return;
    try {
      if (manqueDisque === null) {
        if (carteDuDisquePosee) {
          await disquePlein.lever();
          carteDuDisquePosee = false;
        }
        return;
      }
      if (cooks > 0 || carteDuDisquePosee) return;
      const { observed, limit } = manqueDisque;
      const sonde = await disquePlein.sonder();
      if (peutEncoreLiberer(observed * 1024 * 1024, sonde.propre, limit)) return;
      await disquePlein.poser(carteDuDisque({ libreMo: observed, minMo: limit, propre: sonde.propre, consommateurs: sonde.consommateurs, station }));
      carteDuDisquePosee = true;
      avertir(`brigade : the disk under GitHub-only station ${station} is full of things the kitchen cannot free — a TODO card tells the chef`);
    } catch (erreur) {
      avertir(`brigade : the disk card of GitHub-only station ${station} could not be settled (${message(erreur)}) — tried again next round`);
    }
  };

  // Le ticket qui répare la saturation passe la machine à court — elle se lit et se dit quand même —, pas les autres bornes (#4100).
  const retenueLue = async (cooks: number, reparation: boolean): Promise<RetenueDuTour | null> => {
    machineRetient = false;
    const etat = etatDesGardeFous(base);
    if (etat.stoppedAt !== null) return "stopped";
    if (etat.breakerOpenedAt !== null) return "breaker";
    if (surQuelMoteur().blocked) return "quota";
    machineRetient = machineAcourt(cooks);
    disqueEnCours ??= direLeDisque(cooks).finally(() => {
      disqueEnCours = null;
    });
    if (machineRetient && !reparation) return "machine";
    if (arbitre === null) return null;
    const reponse = await echanger(cooks, true, reparation);
    if (reponse === null) return cooks === 0 ? null : "unarbitrated";
    return reponse.accorde ? null : "arbiter";
  };

  // Un cook a buté sur le quota du compte : épuisé pour lui, il l'est pour
  // tous ceux de son moteur. Une heure de retour déjà passée ne retiendrait rien.
  const noterLeQuota = (lecture: ReturnType<typeof lireFlux>, moteur: string) => {
    const instant = maintenant();
    const annonce = lecture.quota?.retour ?? null;
    const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
    noter({ type: "station.86", payload: { station, reason: "quota", until: retour.toISOString(), window: lecture.quota?.fenetre ?? null, ...(moteur === engine ? {} : { engine: moteur }) } });
  };

  const lancer: Lancer = ({ commande, args, entree, cwd, env, flux: demande, ticket }) => {
    // Le run est unique au journal : un ticket renvoyé repart sous un autre.
    const run = `${basename(demande).replace(/\.flux\.jsonl$|\.jsonl$/, "")}-${randomUUID().slice(0, 8)}`;
    const fluxDe = (essai: string) => join(repertoireEtat, "runs", `${essai}.jsonl`);
    const flux = fluxDe(run);
    const lu = (essai: string) => lireFlux(existsSync(fluxDe(essai)) ? readFileSync(fluxDe(essai), "utf8") : "");
    // Choisi au lancement : un cook garde son moteur jusqu'à sa fin. Retenue, la
    // station lance ce qu'on lui demande encore (une relecture) sur le principal.
    const moteur = surQuelMoteur().engine ?? engine;
    try {
      const lance = garde.lancer({
        ticket: null,
        run,
        // Hors ticket au journal ; le ticket servi se dit à part, pour le disjoncteur (#3656).
        contexte: { station, ...(ticket === undefined ? {} : { serves: ticket }), ...(ticket !== undefined && reparationsLaissees.has(ticket) ? { saturationRepair: true } : {}) },
        commande,
        args,
        ...(entree === undefined ? {} : { entree }),
        cwd,
        env: { ...env, [VARIABLE_DU_MOTEUR]: moteur },
        juger: (fin, essai) => {
          const lecture = lu(essai);
          const conclusion = verdict(lecture, fin.code);
          if (conclusion === "86") noterLeQuota(lecture, moteur);
          return jugerDuFlux(conclusion);
        },
      });
      // Un run calé est relancé sous un autre nom, avec son flux (#3599) : le
      // flux qui se lit après la fin est celui du dernier essai.
      let dernier = run;
      return {
        fin: lance.fin.then((fin) => {
          dernier = fin.run;
          return fin;
        }),
        get flux() {
          return fluxDe(dernier);
        },
      };
    } catch (erreur) {
      // Le « stop » ou le disjoncteur tombé entre la prise et le lancement :
      // rien n'est parti, et le cook le dit comme une fin sans livraison.
      if (!(erreur instanceof LancementRefuse)) throw erreur;
      const fin: Fin = { code: null, signal: null, turns: 0, tokens: 0, durationMs: 0, arret: null, erreur: `${erreur.motif === "held" ? LANCEMENT_RETENU : "launch refused"}: ${erreur.message}` };
      return { fin: Promise.resolve(fin), flux };
    }
  };

  return {
    lancer,
    retenue: async (cooks, reparation) => {
      lueCeTour = true;
      const retenue = await retenueLue(cooks, reparation !== undefined);
      if (retenue === null) accordees.push(maintenant().getTime());
      if (retenue === null && reparation !== undefined) reparationsLaissees.add(reparation);
      if (retenue === "arbiter" || retenue === "unarbitrated") enAttente = true;
      // La réparation passée, la machine retient encore les autres : la station ne se dit pas libre.
      if (retenue !== null || !machineRetient) dire(retenue);
      return retenue;
    },
    redire: async (cooks) => {
      // Aucun ticket à prendre ce tour : plus rien ne retient la station.
      if (!lueCeTour) dire(null);
      lueCeTour = false;
      recupereCeTour = false;
      if (arbitre !== null) await echanger(cooks, false);
      enAttente = false;
    },
    attendreUnePlace: () => {
      if (arbitre === null || tenue !== "arbiter") return Promise.resolve(false);
      placeAttendue ??= arbitre
        .attendreUnePlace(projet)
        .catch((erreur) => {
          // Le tour suivant redemande à son heure : rien n'est perdu, la station ne presse pas.
          avertir(`brigade : ${message(erreur)} — GitHub-only station ${station} waits for its next turn to ask the arbiter again`);
          return false;
        })
        .finally(() => {
          placeAttendue = null;
        });
      return placeAttendue;
    },
    quitter: async () => {
      if (arbitre === null) return;
      try {
        await arbitre.quitter(projet);
      } catch {}
    },
  };
}
