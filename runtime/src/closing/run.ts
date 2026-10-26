// La fermeture qui écrit, branchée sur le runtime : une passe ne part que sur
// une demande (`closing.requested`) — la commande du chef, ou celle que le
// runtime écrit seul pour un projet dont le closer est réglé, après
// `MERGES_PER_PASS` merges ou un seuil de dérive franchi depuis la dernière
// passe partie, et jamais deux le même jour (`trigger.ts`) ; jamais d'une
// horloge seule. La demande attend que sa condition d'exécution soit remplie,
// relue à chaque réveil, et la passe part alors, une fois ; une demande qui
// attend depuis `SANS_ISSUE_MS` est dite sans issue. Elle part hors du rail :
// elle ne prend aucun ticket et n'a pas de priorité. C'est l'agent le plus
// dangereux du système — un closer qui se trompe efface du bon code, et les
// gates diront « ça marche toujours » —, il part donc sous tous les
// garde-fous, et ce sont ceux de tout le monde :
//
// - sa condition d'exécution, relue à l'instant de partir : moins de cooks en
//   vol que son seuil (`condition.ts`) ;
// - le lancement gardé de `garde-fous.ts` : le « stop » du chef, le
//   disjoncteur, l'inactivité, la durée, et son propre plafond de tokens à la
//   place de celui d'un cook ;
// - son plafond de retraits, relevé au tick dans son worktree et à sa fin ;
// - les zones de fichiers du rail, dans les deux sens : elle ne se voit
//   proposer et ne livre rien de ce qu'un cook tient, et tant qu'elle range,
//   le rail ne prête aucun ticket dont la zone recouvre la sienne.
//
// Elle ne merge rien et ne pousse jamais sur la branche d'intégration : ce
// qu'elle retire part sur sa branche et dans une PR, où tout ce qu'elle a
// laissé faute d'être sûre est écrit avec son motif — et cette PR, elle la
// remet à la pass, qui la juge et la merge comme celle d'un ticket : la fusion
// avec la base, les gates, le reviewer, la CI, le grant `merge`. Un garde-fou
// franchi, un fichier écrit hors de ce qu'elle tenait : rien n'est poussé.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeAvecRail } from "../alimenter.ts";
import { argumentsClaude, environnementCook, lireFlux, verdict } from "../claude.ts";
import { environnementClaude } from "../jeton-claude.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "../bac-a-sable/local.ts";
import { envelopper, type Cloison } from "../cloison.ts";
import { worktreeAuJournal, type Depot as DepotDeStation } from "../depot.ts";
import { SANS_ISSUE_MS, type FaitFermeture, type FinDePasse, type Laisse, type Pente, type ReglagesDeFermeture, type Retrait } from "../events/closing.ts";
import { LancementRefuse, type CookLance, type GardeFous, type Verdict } from "../garde-fous.ts";
import type { GitHub } from "../github.ts";
import { identifiantsLivres } from "../identifiants.ts";
import { direJauge } from "../mesures.ts";
import type { Pass } from "../pass.ts";
import { etatDesGardeFous } from "../projections/guardrails.ts";
import type { Rail } from "../rail.ts";
import type { Fin } from "../superviseur.ts";
import { horsZone } from "../zones.ts";
import { candidats, proposer, restants, type Proposition } from "./candidates.ts";
import { DEMANDEE, demandeEnAttente, faitAttendre, passeEnCours, refus, reglagesEnVigueur, tenant, zonesTenues, type Demande, type Refus } from "./condition.ts";
import { consigneDuCloser, corpsDeLaPR, laisses, motifsDuCloser, titreDeLaPR } from "./brief.ts";
import { direDemande, direFin, direRefus } from "./say.ts";
import { lignesChangees, lignesRetirees, lireDepot } from "./reading.ts";
import { mesurerRatio } from "./ratio.ts";
import { trigger } from "./trigger.ts";

const AUTEUR = "closer";
// La station sous laquelle le closer est lancé : c'est par elle que le relevé
// des garde-fous le distingue d'un cook, d'une relecture, d'un jugement.
export const STATION = "closer";
// Ce que la passe tient, parmi ce que le rail tient pour en cuisine : aucun
// ticket ne porte ce numéro.
const PASSE = 0;

export type OptionsFermeture = {
  // Lus à chaque passe, et jamais pendant qu'elle range : une décision du chef
  // vaut à la suivante, et ne change pas les plafonds de celle qui tourne.
  reglages: ReglagesDeFermeture | (() => ReglagesDeFermeture);
  repertoireEtat: string;
  // Le dépôt de la station : le worktree de la passe est un worktree comme un
  // autre, et sa branche se pousse par le même geste.
  depot: DepotDeStation;
  // Le clone du projet et sa branche d'intégration : ce que l'observation lit.
  clone: string;
  base: string;
  github: Pick<GitHub, "ouvrirPR" | "prDeBranche">;
  // `<owner>/<repo>`, pour la consigne du closer.
  depotGitHub: string;
  // Le binaire `claude`.
  bin: string;
  // L'environnement dont part celui du closer. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  cloison?: Cloison | null;
  // Le bac à sable d'une cuisine locale, sur le Mac du chef : le closer y
  // part. Absent : il part sans.
  bacASable?: BacASableLocal | null;
  // Où va ce que la passe a à dire hors du journal (journald).
  avertir?: (message: string) => void;
  // L'heure à laquelle se compte l'attente d'une demande. Par défaut, l'horloge.
  maintenant?: () => Date;
};

type FinEcrite = Omit<Extract<FaitFermeture, { type: "closing.ended" }>["payload"], "run">;
// Ce que la passe retient d'un closer qui a livré, entre le jugement de sa
// fin et le push.
type Livraison = { fichiers: string[]; retirees: number; ajoutees: number; retires: Retrait[]; gardes: Laisse[]; compteRendu: string | null };
type EnCours = { lance: CookLance; worktree: string; entree: string; disjoncte: boolean };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const liste = (fichiers: string[]) => fichiers.map((fichier) => `\`${fichier}\``).join(", ");

// Rend le runtime, augmenté de sa fermeture. À brancher avant les stations :
// c'est par son rail qu'elles se voient refuser ce que la passe tient. Et
// après la pass : c'est à elle que la passe remet sa PR.
export function brancherFermeture<R extends RuntimeAvecRail & GardeFous & Pass>(runtime: R, options: OptionsFermeture): R {
  const { journal, projet } = runtime;
  const { base } = journal;
  const { depot } = options;
  const lireReglages = typeof options.reglages === "function" ? options.reglages : () => options.reglages as ReglagesDeFermeture;
  let reglages = lireReglages();
  const env = options.env ?? process.env;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const maintenant = options.maintenant ?? (() => new Date());
  const noter = (fait: FaitFermeture) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
  const refuser = (motif: Refus) => {
    noter({ type: "closing.refused", payload: motif });
    avertir(`brigade : passe de fermeture refusée — ${direRefus(motif)}`);
  };

  base.transaction(() => {
    // Réconciliation : une passe sans fin au journal est morte avec le runtime
    // précédent, et une demande qu'il n'a pas prise ne vaut plus — l'agent le
    // plus dangereux ne part pas d'un geste d'une autre vie.
    // L'une n'exclut pas l'autre : le chef a pu redemander après la mort du
    // runtime.
    const orpheline = passeEnCours(journal);
    if (orpheline !== null && orpheline !== DEMANDEE) noter({ type: "closing.ended", payload: { run: orpheline, outcome: "interrupted" } });
    if (passeEnCours(journal) === DEMANDEE) refuser({ reason: "restarted", observed: null, limit: null, detail: null });
    // Un projet qui n'a jamais réglé son closer n'a rien à écrire.
    const connus = reglagesEnVigueur(journal);
    if ((connus !== null || reglages.calibration !== null) && JSON.stringify(connus) !== JSON.stringify(reglages)) noter({ type: "closing.configured", payload: reglages });
  });

  let arrete = false;
  // Une seule passe à la fois.
  let occupee = false;
  // Ce que la passe tient tant qu'elle range, et son closer.
  let tenue: string[] | null = null;
  let enCours: EnCours | null = null;

  // Le rail, tel que les stations le lisent : ce que la passe tient y compte
  // comme la zone d'un ticket en cuisine. C'est le même recouvrement que
  // celui de deux tickets — rien n'en est récrit ici.
  const avecLaPasse = (enCuisine?: ReadonlyMap<number, string[]>) => (tenue === null ? enCuisine : new Map([...(enCuisine ?? []), [PASSE, tenue]]));
  const rail: Rail = {
    ...runtime.rail,
    prendre: (qui, enCuisine) => runtime.rail.prendre(qui, avecLaPasse(enCuisine)),
    servables: (enCuisine, preneuses) => runtime.rail.servables(avecLaPasse(enCuisine), preneuses),
  };

  // Relit les réglages entre deux passes, et les note au journal quand ils ont
  // changé : c'est par ce fait que la commande du chef les connaît.
  const relire = () => {
    if (occupee || arrete) return;
    const lus = lireReglages();
    if (JSON.stringify(lus) === JSON.stringify(reglages)) return;
    reglages = lus;
    const connus = reglagesEnVigueur(journal);
    if ((connus !== null || lus.calibration !== null) && JSON.stringify(connus) !== JSON.stringify(lus)) noter({ type: "closing.configured", payload: lus });
  };

  const ranger = async (calibrage: NonNullable<ReglagesDeFermeture["calibration"]>, demande: Demande): Promise<void> => {
    const run = `fermeture-${randomUUID().slice(0, 8)}`;
    // Une passe partie a une fin au journal, une seule.
    let finie = false;
    const finir = (fin: FinEcrite) => {
      if (arrete || finie) return;
      finie = true;
      noter({ type: "closing.ended", payload: { run, ...fin } });
      avertir(`brigade : passe de fermeture ${run} — ${direFin({ run, ...fin })}`);
    };

    // L'observation, sur la base telle que l'origine la porte à l'instant — et
    // sa pente, celle dont le bilan dira ce que la passe y change.
    let avant;
    try {
      await depot.rapatrier();
      avant = lireDepot(options.clone, options.base, env);
    } catch (erreur) {
      if (!arrete) refuser({ reason: "depot", observed: null, limit: null, detail: message(erreur) });
      return;
    }
    if (arrete) return;

    // D'un seul geste : la demande toujours là, la condition relue, ce que les
    // cooks tiennent, et ce que la passe tient à son tour. Aucun cook ne part
    // entre les deux, et le chef ne retire pas la demande entre les deux.
    const proposition = base.transaction((): Proposition | null => {
      // Retirée par le chef pendant le rapatriement : rien ne part.
      if (demandeEnAttente(base)?.seq !== demande.seq) return null;
      const motif = refus(base, reglages, false);
      // Un cook parti pendant le rapatriement : elle attend encore, et le
      // prochain réveil la relit.
      if (motif && faitAttendre(motif)) return null;
      if (motif) {
        refuser(motif);
        return null;
      }
      const tenues = zonesTenues(base);
      const tous = candidats(avant);
      const choix = proposer(tous, tenues);
      if (choix.proposes.length === 0) {
        const detail = tous.length === 0 ? `l'observation ne repère ni doublon ni code mort sur \`${options.base}\`` : `les ${tous.length} candidats de l'observation sont tous dans ce que des cooks tiennent`;
        refuser({ reason: "nothing", observed: null, limit: null, detail });
        return null;
      }
      tenue = choix.zone;
      noter({
        type: "closing.started",
        payload: { run, base: avant.sha, zone: choix.zone, held: tenues.flatMap(({ zone }) => zone ?? ["*"]), candidates: choix.proposes.length, limits: { tokens: reglages.tokens, removedLines: reglages.removedLines } },
      });
      return choix;
    });
    if (proposition === null) return;
    const pente = mesurerRatio(avant.merges).map(({ fenetre, merges, ajoute, retire }): Pente => ({ window: fenetre, merges, added: ajoute, removed: retire }));
    // Passé ce point la passe est partie : quoi qu'il lui arrive, elle finit
    // au journal — sans quoi elle passerait pour ranger jusqu'au redémarrage.
    try {
      await cuisiner(run, calibrage, proposition, pente, finir);
    } catch (erreur) {
      finir({ outcome: "failed", detail: message(erreur) });
    }
  };

  const cuisiner = async (run: string, calibrage: NonNullable<ReglagesDeFermeture["calibration"]>, { proposes, ecartes, zone }: Proposition, pente: Pente[], finir: (fin: FinEcrite) => void): Promise<void> => {
    let worktree: string;
    let branche: string;
    try {
      ({ worktree, branche } = await depot.preparer(run));
    } catch (erreur) {
      return finir({ outcome: "failed", detail: `worktree non préparé — ${message(erreur)}` });
    }
    const retirer = () => {
      try {
        depot.retirer(worktree, branche);
      } catch (erreur) {
        avertir(`brigade : worktree de la passe ${run} non retiré — ${message(erreur)}`);
      }
    };
    if (arrete) return retirer();
    // D'où part la branche : c'est contre ce commit que se comptent les retraits.
    const entree = depot.tete(branche);

    // La fin du closer se juge ici, avant qu'elle ne s'écrive : un closer qui
    // sort en 0 mais dépasse son plafond de retraits, ou écrit ce qu'il ne
    // tenait pas, a échoué — et le disjoncteur le compte.
    const issue: { fin: FinEcrite; livraison: Livraison | null } = { fin: { outcome: "failed" }, livraison: null };
    const conclure = (fin: FinEcrite, verdictDuCook: Verdict): Verdict => {
      issue.fin = fin;
      return verdictDuCook;
    };
    const juger = (resultat: Fin): Verdict => {
      // Arrêté par un garde-fou : sa fin se lit sur l'arrêt, rien n'est livré.
      if (resultat.arret) return "failed";
      try {
        let flux = "";
        try {
          flux = readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8");
        } catch {
          // Sans flux, rien ne prouve que le closer a fini.
        }
        const lecture = lireFlux(flux);
        const lu = verdict(lecture, resultat.code);
        if (lu !== "done") {
          const detail = lu === "failed" ? (resultat.code === 0 ? "flux sans résultat" : resultat.code === null ? `signal ${resultat.signal}` : `code de sortie ${resultat.code}`) : lu;
          return conclure({ outcome: "failed", detail }, lu === "refused" ? "refused" : lu === "failed" ? "failed" : "neutral");
        }
        if (!depot.surSaBranche(worktree, branche)) return conclure({ outcome: "failed", detail: "le closer a quitté sa branche" }, "failed");
        depot.recolter(worktree, branche);
        const fichiers = depot.changes(branche);
        const motifs = motifsDuCloser(lecture.message);
        if (fichiers.length === 0) return conclure({ outcome: "nothing", kept: [...laisses(proposes, proposes, motifs), ...ecartes], slope: pente }, "ok");
        const { retire: retirees, ajoute: ajoutees } = lignesChangees(options.clone, env, entree, branche);
        if (retirees > reglages.removedLines) return conclure({ outcome: "removals", observed: retirees, limit: reglages.removedLines }, "failed");
        // Les deux sens, relus à la livraison : rien hors de ce qu'elle
        // tenait, rien dans ce qu'un cook tient — un cook sans zone parti
        // pendant qu'elle rangeait tient tout.
        const hors = horsZone(zone, fichiers);
        const tenues = zonesTenues(base);
        const tenus = fichiers.filter((fichier) => tenant(tenues, fichier) !== null);
        if (hors.length > 0 || tenus.length > 0) {
          const detail = [hors.length === 0 ? null : `elle a écrit hors de ce qu'elle tenait (${liste(hors)})`, tenus.length === 0 ? null : `elle a écrit dans ce qu'un cook tient (${liste(tenus)})`].filter(Boolean).join(" ; ");
          return conclure({ outcome: "zone", files: [...new Set([...hors, ...tenus])].sort(), detail }, "failed");
        }
        if (identifiantsLivres(depot.ajouts(branche)).length > 0) return conclure({ outcome: "failed", detail: "sa branche porte le nom ou la forme des identifiants de Claude" }, "failed");
        const gardes = laisses(proposes, restants(proposes, lireDepot(options.clone, options.base, env, 0, branche)), motifs);
        const restes = new Set(gardes.map(({ id }) => id));
        const retires = proposes.filter(({ id }) => !restes.has(id)).map(({ id, quoi }) => ({ id, what: quoi }));
        issue.livraison = { fichiers, retirees, ajoutees, retires, gardes, compteRendu: lecture.message };
        return "ok";
      } catch (erreur) {
        return conclure({ outcome: "failed", detail: message(erreur) }, "failed");
      }
    };

    let lance: CookLance;
    try {
      lance = runtime.lancer({
        ticket: null,
        run,
        contexte: { station: STATION, ...calibrage, branch: branche, worktree: worktreeAuJournal(run) },
        // Son plafond de tokens est le sien, par passe.
        plafonds: { tokens: reglages.tokens },
        ...envelopper(
          options.cloison,
          {
            commande: options.bin,
            args: dansLeBacASableLocal(options.bacASable, argumentsClaude(consigneDuCloser({ depot: options.depotGitHub, base: options.base, candidats: proposes, zone, retraits: reglages.removedLines }), calibrage), worktree),
          },
          { cwd: worktree, depot: "ecriture" },
        ),
        cwd: worktree,
        env: environnementClaude(environnementCook(env), env),
        juger,
      });
    } catch (erreur) {
      retirer();
      if (!(erreur instanceof LancementRefuse)) throw erreur;
      // « stop » ou disjoncteur, arrivés entre la condition et le lancement.
      return finir({ outcome: erreur.motif === "breaker" ? "breaker" : "stop" });
    }
    const vol: EnCours = { lance, worktree, entree, disjoncte: false };
    enCours = vol;

    const resultat = await lance.fin;
    enCours = null;
    // Le runtime s'en va : rien à écrire, son prochain démarrage le notera.
    if (arrete || resultat.outcome === "interrupted") return;
    let fin = issue.fin;
    if (resultat.arret) {
      const { reason, limit, observed } = resultat.arret;
      const outcome: FinDePasse = reason === "stop" ? (vol.disjoncte ? "breaker" : "stop") : reason === "lease" ? "failed" : reason;
      fin = reason === "stop" ? { outcome } : { outcome, observed, limit };
    }
    const livree = resultat.arret ? null : issue.livraison;
    // Le numéro de sa PR : c'est sous lui que la pass la suit.
    let numero: number | null = null;
    if (livree !== null) {
      // Sa branche, jamais celle d'intégration ; et une PR, que rien ici ne merge.
      try {
        depot.pousser(branche);
        const corps = corpsDeLaPR({ run, base: options.base, calibration: calibrage, proposes, laisses: livree.gardes, ecartes, retirees: livree.retirees, ajoutees: livree.ajoutees, cap: reglages.removedLines, fichiers: livree.fichiers, compteRendu: livree.compteRendu });
        const pr = await options.github.ouvrirPR({ branche, base: options.base, titre: titreDeLaPR(run), corps });
        const ouverte = await options.github.prDeBranche(branche);
        if (ouverte === null) throw new Error(`GitHub ne rend pas la PR qu'il vient d'ouvrir (${pr})`);
        numero = ouverte.number;
        fin = {
          outcome: "delivered",
          branch: branche,
          pr,
          sha: depot.tete(branche),
          removedLines: livree.retirees,
          addedLines: livree.ajoutees,
          files: livree.fichiers,
          removed: livree.retires,
          kept: [...livree.gardes, ...ecartes],
          slope: pente,
        };
      } catch (erreur) {
        fin = { outcome: "failed", branch: branche, detail: `sa livraison n'est pas partie — ${message(erreur)}`, kept: [...livree.gardes, ...ecartes] };
      }
    }
    // Livrée, elle entre en pass du même geste : une passe dite livrée dont la
    // PR ne serait jugée par personne aurait un chemin à elle vers la base.
    base.transaction(() => {
      finir(fin);
      if (!arrete && numero !== null && fin.outcome === "delivered" && fin.pr !== undefined) runtime.prendreHorsRail({ run, branche, pr: fin.pr, numero });
    });
    // Son worktree part comme celui d'un cook : ce qui y traîne est commité
    // sur sa branche, que rien ne pousse plus.
    await depot.ranger(worktree, branche).catch((erreur) => avertir(`brigade : worktree de la passe ${run} non rangé — ${message(erreur)}`));
  };

  // La demande que le runtime écrit seul, comme le geste du chef l'écrirait :
  // un projet sans closer réglé n'en reçoit jamais. Ni pendant qu'une passe
  // attend ou range, ni sous le « stop » ou le disjoncteur, qui la
  // refuseraient — elle vient au réveil qui suit la reprise.
  const declencher = () => {
    if (arrete || occupee || !reglages.calibration) return;
    const reglee = reglages;
    base.transaction(() => {
      if (passeEnCours(journal) !== null) return;
      const motif = refus(base, reglee, false);
      if (motif && !faitAttendre(motif)) return;
      const pourquoi = trigger(base, maintenant());
      if (pourquoi === null) return;
      journal.ajouter({ project: projet, ticket: null, author: "runtime", type: "closing.requested", payload: {} });
      const cause = pourquoi.reason === "merges" ? `${pourquoi.merges} merges depuis la dernière passe` : `seuil de dérive franchi — ${direJauge(pourquoi.crossing)}`;
      avertir(`brigade : passe de fermeture demandée par le runtime — ${cause}`);
    });
  };

  // La demande qui attend, relue à chaque réveil : elle part si rien ne la
  // retient, attend si c'est sa condition d'exécution — et le dit, une fois,
  // passé `SANS_ISSUE_MS` —, et est refusée sinon.
  const passer = () => {
    if (arrete || occupee) return;
    relire();
    const lue = base.transaction(() => {
      const demande = demandeEnAttente(base);
      if (demande === null) return null;
      const motif = refus(base, reglages, false);
      if (motif === null || !faitAttendre(motif)) return { demande, motif };
      if (demande.sansIssue === null && maintenant().getTime() - Date.parse(demande.since) >= SANS_ISSUE_MS) {
        const { reason, observed, limit, detail } = motif;
        const fait = noter({ type: "closing.stalled", payload: { requestedAt: demande.since, reason, observed, limit, detail } });
        avertir(`brigade : ${direDemande({ ...demande, sansIssue: fait?.at ?? demande.since }, motif)}`);
      }
      return null;
    });
    if (lue === null) return;
    const { demande, motif } = lue;
    if (motif || !reglages.calibration) return refuser(motif ?? { reason: "unconfigured", observed: null, limit: null, detail: null });
    const calibrage = reglages.calibration;
    occupee = true;
    void ranger(calibrage, demande)
      .catch((erreur) => {
        if (!arrete) avertir(`brigade : la passe de fermeture a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
      })
      .finally(() => {
        tenue = null;
        enCours = null;
        occupee = false;
      });
  };

  const desabonner = runtime.surReveil((cause) => {
    relire();
    declencher();
    passer();
    const vol = enCours;
    if (vol === null) return;
    // Le disjoncteur s'est ouvert pendant qu'elle rangeait : la cuisine échoue
    // d'affilée, et ce n'est pas le moment d'y effacer quoi que ce soit.
    if (!vol.disjoncte && etatDesGardeFous(base).breakerOpenedAt !== null) {
      vol.disjoncte = true;
      vol.lance.arreter();
    }
    // Au tick, ce que son worktree a déjà retiré, commité ou non.
    if (cause !== "tick") return;
    try {
      const retirees = lignesRetirees(vol.worktree, env, vol.entree);
      if (retirees > reglages.removedLines) vol.lance.arreter({ reason: "removals", limit: reglages.removedLines, observed: retirees });
    } catch {
      // Un worktree qui ne se lit pas à cet instant est relu au tick suivant,
      // et à la fin du closer.
    }
  });

  return {
    ...runtime,
    rail,
    arreter(signal) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}
