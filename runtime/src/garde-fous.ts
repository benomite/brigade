// Les garde-fous d'un projet, branchés sur son runtime : aucun cook ne se
// lance sans passer par ici. Mécanique, pas jugement — des plafonds, une
// minuterie d'inactivité, un disjoncteur et la commande « stop » du chef.
//
// Rien n'est gardé en mémoire que les process eux-mêmes : le disjoncteur et
// le « stop » se lisent dans le journal, donc tiennent après un redémarrage.
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ContexteCook, FaitGardeFous, Issue, Plafonds } from "./events/guardrails.ts";
import type { Reglages } from "./plafonds.ts";
import { cooksEnCours, etatDesGardeFous } from "./projections/guardrails.ts";
import type { Runtime } from "./runtime.ts";
import { arreterParLeRelais, relaisASuivre, superviser, superviserParRelais, suivreLeRelais, type Arret, type Fin, type Supervise } from "./superviseur.ts";
import { superviserADistance, type Mesure } from "./superviseur-distant.ts";

export { lireReglages, type Reglages } from "./plafonds.ts";

const AUTEUR = "runtime";
// Le curseur de celui qui guette les « stop » du chef dans le journal.
const CONSOMMATEUR = "garde-fous";

// Ce que la station dit d'une fin que les garde-fous n'ont pas provoquée.
// `neutral` : ni échec ni réussite pour le disjoncteur — le quota épuisé (86).
// `refused` : pas davantage, mais dit à part au journal — le modèle a refusé
// de répondre.
export type Verdict = "ok" | "failed" | "neutral" | "refused";

export type DemandeCook = {
  // Nul : le cook ne tient aucun ticket du rail — un jugement du manager.
  ticket: number | null;
  // Le nom du run, quand celui qui lance en a besoin avant le lancement (pour
  // nommer un worktree). Par défaut : `<ticket>-<8 caractères>`.
  run?: string;
  // Porté tel quel par `cook.launched`.
  contexte?: Partial<ContexteCook>;
  // Les plafonds propres à ce lancement, à la place de ceux du projet : la
  // passe de fermeture a son plafond de tokens. Ce qu'ils ne nomment pas reste
  // celui du projet.
  plafonds?: Partial<Plafonds>;
  commande: string;
  args: string[];
  cwd?: string;
  // Par défaut, l'environnement du runtime.
  env?: NodeJS.ProcessEnv;
  // Le masque des secrets que ce cook a reçus : son flux brut ne les garde pas.
  // La forme des identifiants de Claude, elle, y est masquée quoi qu'il arrive.
  masquer?: (texte: string) => string;
  // Le cook survit au runtime : un relais le porte (`relais.ts`), et le
  // runtime qui démarre après celui-ci le reprend (`reprendre`). `secrets` :
  // ceux qu'il reçoit, par nom — le relais masque leurs valeurs, à la place de
  // `masquer`. Absent : le cook meurt avec le runtime.
  survivant?: { secrets: Record<string, string> };
  // Par défaut : code de sortie 0 → réussite, tout autre → échec. Appelé aussi
  // pour un cook qu'un garde-fou a arrêté (`fin.arret`) : seul « ok » en fait
  // alors autre chose qu'un arrêt par garde-fou.
  juger?: (fin: Fin) => Verdict;
};

// `interrupted` : le runtime s'est arrêté pendant que le cook tournait. Rien
// n'en est écrit sur le moment — le démarrage suivant le note.
export type FinDeCook = Fin & { outcome: Issue | "interrupted" };

export type CookLance = {
  run: string;
  pid: number | undefined;
  // Arrête ce cook, et lui seul. Sans motif, sa fin sera un « stop » ; avec,
  // c'est un arrêt de garde-fou, donc jugé. Sans effet sur un cook déjà mort.
  arreter(motif?: Arret): void;
  // Résolue une fois la fin du cook écrite au journal.
  fin: Promise<FinDeCook>;
};

// Le cook d'une station distante : il ne tourne pas ici, et rien ne peut lui
// être signalé. Le reste est celui d'un cook de la box — son lancement, ses
// plafonds, son relevé au tick, le « stop » du chef, sa fin au journal.
export type DemandeDistante = Pick<DemandeCook, "run" | "contexte" | "juger"> & { ticket: number };

export type CookDistant = Omit<CookLance, "pid"> & {
  // Ce que la station rapporte de ce que son cook a consommé : au-delà d'un
  // plafond, il est arrêté ici, et elle l'apprend.
  mesurer(mesure: Mesure): void;
  // Le cook a fini chez elle : la fin se juge et s'écrit comme une autre.
  rendre(code: number | null): void;
};

// `deploy` : n'est plus levé — une mise en service ne retient aucun cook ; le
// motif reste pour que les journaux d'avant se lisent.
export type RefusDeLancer = "breaker" | "stopped" | "deploy";

export class LancementRefuse extends Error {
  readonly motif: RefusDeLancer;

  constructor(motif: RefusDeLancer, message: string) {
    super(message);
    this.name = "LancementRefuse";
    this.motif = motif;
  }
}

// Un cook qu'une vie précédente du runtime a lancé par un relais, et qui tourne
// encore — ou dont la fin attend d'être lue.
export type Survivant = { run: string; ticket: number | null };

export type GardeFous = {
  // Lance un cook sous surveillance. Lève `LancementRefuse`, sans rien lancer
  // ni rien écrire, si le disjoncteur est ouvert, ou si le chef a dit « stop ».
  lancer(demande: DemandeCook): CookLance;
  // Note le lancement du cook d'une station distante, sous les mêmes refus et
  // les mêmes plafonds, sans rien lancer ici.
  lancerDistant(demande: DemandeDistante): CookDistant;
  // Le verdict de la pass sur la livraison d'une relance du manager. Rouge,
  // c'est un échec d'affilée de plus, qui ouvre le disjoncteur au seuil.
  jugerRelance(ticket: number, run: string, verdict: "green" | "red"): void;
  // Les cooks qu'une vie précédente a laissés en vol. Celui que personne ne
  // reprend pendant le démarrage — avant le premier tour de la boucle — est
  // arrêté, et son interruption notée.
  survivants(): Survivant[];
  // Reprend un survivant : il est suivi comme s'il venait d'être lancé ici —
  // plafonds, relevés, « stop », fin jugée et écrite. Rend null si ce run
  // n'est pas, ou plus, un survivant à reprendre.
  reprendre(run: string, juger?: (fin: Fin) => Verdict): CookLance | null;
};

export const nomDeRun = (ticket: number | null) => `${ticket ?? "sans-ticket"}-${randomUUID().slice(0, 8)}`;

const jugerParDefaut = (fin: Fin): Verdict => (fin.code === 0 ? "ok" : "failed");

// Le « stop » du chef et un lancement impossible ne se jugent pas. Tout le
// reste, si : même arrêté par un garde-fou, un cook peut avoir livré — c'est à
// celui qui l'a lancé de le dire. S'il ne le dit pas, l'arrêt reste un arrêt.
function issue(resultat: Fin, juger: (fin: Fin) => Verdict): Issue {
  if (resultat.arret?.reason === "stop") return "stop";
  if (resultat.erreur !== null) return "failed";
  const verdict = juger(resultat);
  return resultat.arret && verdict !== "ok" ? "guard" : verdict;
}

// Un cook tué par SIGTERM (143) sans que le superviseur l'ait arrêté : quelqu'un
// d'autre l'a signalé. Si brigade l'a demandé depuis son lancement — un « stop »
// du chef, une mise à jour lancée —, c'est son fait, pas un échec du cook.
const mortParSigterm = (fin: Fin) => fin.arret === null && fin.erreur === null && (fin.code === 143 || fin.signal === "SIGTERM");

// Rend le runtime, augmenté du lancement gardé. Son `arreter` emporte les
// cooks qu'il tient avec lui ; ceux qu'un relais porte lui survivent, et le
// runtime suivant les reprend.
export function brancherGardeFous<R extends Runtime>(reglages: Reglages, runtime: R): R & GardeFous {
  const { journal, projet } = runtime;
  const base = journal.base;
  const noter = (ticket: number | null, fait: FaitGardeFous) =>
    journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

  let repertoireRuns: string;
  // Les cooks d'une vie précédente qu'un relais porte, en attente de reprise.
  const survivants = new Map<string, Survivant & { stream: string; limits: Plafonds }>();
  const survivant = (stream: string): boolean => relaisASuivre(join(dirname(repertoireRuns), stream));
  try {
    // Le flux brut des cooks s'écrit dans runs/, à côté du journal. Le runtime
    // ne dit pas où est son répertoire d'état : la base, si.
    const fichierJournal = base.lire<{ file: string }>("PRAGMA database_list")[0]?.file;
    if (!fichierJournal) throw new Error("journal sans fichier : impossible de situer le répertoire d'état");
    repertoireRuns = join(dirname(fichierJournal), "runs");
    base.transaction(() => {
      // Réconciliation : un lancement sans fin au journal est celui d'un cook
      // mort avec le runtime précédent — sauf celui qu'un relais porte encore,
      // ou dont le relais a écrit la fin : il attend d'être repris.
      for (const cook of cooksEnCours(base)) {
        if (survivant(cook.stream)) survivants.set(cook.run, { run: cook.run, ticket: cook.ticket, stream: cook.stream, limits: cook.limits });
        else noter(cook.ticket, { type: "cook.interrupted", payload: { run: cook.run } });
      }
      // Un « stop » d'avant ce démarrage ne vise aucun cook d'aujourd'hui.
      journal.consommer(CONSOMMATEUR, () => {});
      const etat = etatDesGardeFous(base);
      const enVigueur = { limits: reglages.plafonds, breakerThreshold: reglages.seuilDisjoncteur };
      const connus = { limits: etat.limits, breakerThreshold: etat.breakerThreshold };
      if (JSON.stringify(connus) !== JSON.stringify(enVigueur)) noter(null, { type: "guard.configured", payload: enVigueur });
    });
  } catch (erreur) {
    // Un runtime sans garde-fous ne tourne pas.
    try {
      runtime.arreter("garde-fous");
    } catch {}
    throw erreur;
  }

  // Les cooks qui tournent, chacun avec le numéro de séquence de son lancement.
  const cooks = new Map<Supervise, number>();
  // Les mêmes, avec ce qu'il faut pour écrire leur relevé.
  const releves = new Map<Supervise, { ticket: number | null; run: string }>();
  let arrete = false;

  // Ouvre le disjoncteur si les échecs d'affilée ont atteint son seuil. Dans la
  // transaction du fait qui vient de les compter.
  const disjoncter = () => {
    const etat = etatDesGardeFous(base);
    if (etat.breakerOpenedAt === null && etat.failures >= reglages.seuilDisjoncteur) {
      noter(null, { type: "breaker.opened", payload: { failures: etat.failures, threshold: reglages.seuilDisjoncteur } });
    }
  };

  // Ce que brigade a demandé depuis le lancement du cook, quand il est mort de
  // SIGTERM sans arrêt du superviseur. Connu avant que la fin ne soit comptée.
  const causeDeLArret = (resultat: Fin, lancement: number): "stop" | null => {
    if (resultat.arret?.reason === "stop") return "stop";
    if (!mortParSigterm(resultat)) return null;
    const arrets = base.lire<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'kitchen.stopped' AND seq > ?", lancement)[0]?.n ?? 0;
    return arrets > 0 ? "stop" : null;
  };

  // Écrit la fin d'un cook et, dans la même transaction, ouvre le disjoncteur
  // si elle porte les échecs d'affilée à son seuil.
  const noterFin = (ticket: number | null, run: string, resultat: Fin, outcome: Issue, cause: "stop" | "update" | null = null) => {
    base.transaction(() => {
      noter(ticket, {
        type: "cook.exited",
        payload: {
          run,
          outcome,
          code: resultat.code,
          signal: resultat.signal,
          turns: resultat.turns,
          tokens: resultat.tokens,
          durationMs: resultat.durationMs,
          ...(resultat.erreur === null ? {} : { error: resultat.erreur }),
          ...(cause === null ? {} : { cause }),
          ...(resultat.masques === undefined ? {} : { credentialsMasked: resultat.masques }),
        },
      });
      disjoncter();
    });
  };

  // Le « stop » est écrit par un autre process (la CLI) : le runtime le voit à
  // son prochain réveil, une seconde au plus. Il lit les faits, pas l'état :
  // un « stop » aussitôt suivi d'un « reprendre » arrête quand même les cooks
  // qui tournaient — et eux seuls, pas ceux lancés depuis la reprise.
  const desabonner = runtime.surReveil((cause) => {
    let dernierStop = 0;
    journal.consommer(CONSOMMATEUR, (evenement) => {
      if (evenement.type === "kitchen.stopped") dernierStop = evenement.seq;
    });
    for (const [cook, lancement] of cooks) {
      if (lancement < dernierStop) cook.arreter();
    }
    // Au tick, chaque cook en cours laisse au journal ce qu'il a consommé :
    // c'est là que le chef lit son budget avant la fin. Après le « stop » :
    // un relevé ne retarde jamais un arrêt — et s'il ne peut pas s'écrire, il
    // manque au chef, pas au runtime.
    if (cause === "tick") {
      try {
        base.transaction(() => {
          for (const [cook, { ticket, run }] of releves) {
            noter(ticket, { type: "cook.progressed", payload: { run, ...cook.mesure(), ...(cook.activite === undefined ? {} : { activity: cook.activite() }) } });
          }
        });
      } catch (erreur) {
        console.error(`brigade : relevé des cooks non journalisé — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    }
  });

  // Le lancement gardé, quel que soit l'endroit où le cook tourne : `surveiller`
  // rend ce qui le surveille — un sous-processus ici, ou ce qu'une station
  // distante en rapporte. Tout ce qui s'écrit et se compte passe par ici.
  const partir = <S extends Supervise>(demande: Pick<DemandeCook, "ticket" | "run" | "contexte" | "plafonds" | "juger">, surveiller: (run: string, plafonds: Plafonds, surArret: (arret: Arret) => void) => S): { run: string; cook: S | null; fin: Promise<FinDeCook> } => {
    if (arrete) throw new Error("runtime arrêté : aucun cook ne peut être lancé");
    const run = demande.run ?? nomDeRun(demande.ticket);
    const stream = join("runs", `${run}.jsonl`);
    const plafonds = { ...reglages.plafonds, ...demande.plafonds };
    // Vérifier et écrire l'intention dans une seule transaction : un
    // « stop » qui arrive entre les deux ne peut pas être manqué.
    const lancement = base.transaction(() => {
      const etat = etatDesGardeFous(base);
      if (etat.stoppedAt !== null) {
        throw new LancementRefuse("stopped", `cuisine arrêtée par le chef le ${etat.stoppedAt} : aucun cook n'est lancé avant « resume »`);
      }
      if (etat.breakerOpenedAt !== null) {
        throw new LancementRefuse(
          "breaker",
          `disjoncteur ouvert le ${etat.breakerOpenedAt} après ${etat.failures} échecs d'affilée : aucun cook n'est lancé avant « resume »`,
        );
      }
      return noter(demande.ticket, { type: "cook.launched", payload: { run, limits: plafonds, stream, ...demande.contexte } })?.seq ?? 0;
    });

    let cook: S;
    try {
      cook = surveiller(run, plafonds, (arret) => {
        if (!arrete) noter(demande.ticket, { type: "guard.tripped", payload: { run, ...arret } });
      });
    } catch (erreur) {
      // L'intention est au journal : elle y reçoit sa fin, un échec, plutôt
      // que de passer pour un cook en cours jusqu'au prochain redémarrage.
      const resultat: Fin = {
        code: null,
        signal: null,
        turns: 0,
        tokens: 0,
        durationMs: 0,
        arret: null,
        erreur: erreur instanceof Error ? erreur.message : String(erreur),
      };
      noterFin(demande.ticket, run, resultat, "failed");
      return { run, cook: null, fin: Promise.resolve({ ...resultat, outcome: "failed" }) };
    }
    return { run, cook, fin: suivreLaFin(cook, lancement, demande.ticket, run, demande.juger) };
  };

  // Ce qui suit un cook jusqu'à sa fin, lancé ici ou repris : il compte pour
  // le « stop », laisse ses relevés, et sa fin s'écrit jugée.
  const suivreLaFin = (cook: Supervise, lancement: number, ticket: number | null, run: string, juger: DemandeCook["juger"]): Promise<FinDeCook> => {
    cooks.set(cook, lancement);
    releves.set(cook, { ticket, run });
    return cook.fin.then((resultat): FinDeCook => {
      cooks.delete(cook);
      releves.delete(cook);
      if (arrete) return { ...resultat, outcome: "interrupted" };
      const cause = causeDeLArret(resultat, lancement);
      const outcome = cause === null ? issue(resultat, juger ?? jugerParDefaut) : "stop";
      noterFin(ticket, run, resultat, outcome, cause);
      return { ...resultat, outcome };
    });
  };

  // Les cooks relayés que ce runtime suit : à son arrêt, il les lâche sans
  // les tuer.
  const relayes = new Set<Supervise & { lacher(): void }>();
  const relayer = <S extends Supervise & { lacher(): void }>(cook: S): S => {
    relayes.add(cook);
    void cook.fin.then(() => relayes.delete(cook));
    return cook;
  };

  // Un survivant que personne n'a repris pendant le démarrage ne sera suivi
  // par personne : il est arrêté — son relais transmet —, et son interruption
  // est notée, comme celle d'un cook mort avec le runtime.
  const abandonnerLesSurvivants = () => {
    if (arrete || survivants.size === 0) return;
    try {
      base.transaction(() => {
        for (const { run, ticket, stream } of survivants.values()) {
          arreterParLeRelais(join(dirname(repertoireRuns), stream));
          noter(ticket, { type: "cook.interrupted", payload: { run } });
        }
      });
      survivants.clear();
    } catch (erreur) {
      console.error(`brigade : cooks d'une vie précédente non arrêtés — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  // Tout ce qui reprend se branche dans le même tour que les garde-fous.
  if (survivants.size > 0) setImmediate(abandonnerLesSurvivants);

  return {
    ...runtime,
    lancer(demande) {
      const { run, cook, fin } = partir(demande, (nom, plafonds, surArret) => {
        mkdirSync(repertoireRuns, { recursive: true });
        const commun = { commande: demande.commande, args: demande.args, cwd: demande.cwd, env: demande.env, plafonds, graceMs: reglages.graceMs, flux: join(repertoireRuns, `${nom}.jsonl`), surArret };
        return demande.survivant ? relayer(superviserParRelais({ ...commun, run: nom, secrets: demande.survivant.secrets })) : superviser({ ...commun, masquer: demande.masquer });
      });
      return { run, pid: cook?.pid, arreter: cook?.arreter ?? (() => {}), fin };
    },
    survivants: () => [...survivants.values()].map(({ run, ticket }) => ({ run, ticket })),
    reprendre(run, juger) {
      const connu = survivants.get(run);
      if (arrete || !connu) return null;
      survivants.delete(run);
      const { ticket, stream, limits } = connu;
      const cook = suivreLeRelais({
        flux: join(dirname(repertoireRuns), stream),
        plafonds: limits,
        graceMs: reglages.graceMs,
        surArret: (arret) => {
          if (!arrete) noter(ticket, { type: "guard.tripped", payload: { run, ...arret } });
        },
      });
      // Son relais est mort entre le démarrage et la reprise, sans rien écrire.
      if (cook === null) {
        noter(ticket, { type: "cook.interrupted", payload: { run } });
        return null;
      }
      noter(ticket, { type: "cook.resumed", payload: { run, pid: cook.pid ?? null } });
      const lancement = base.lire<{ seq: number }>("SELECT launched_seq AS seq FROM cook_runs WHERE run = ?", run)[0]?.seq ?? 0;
      const fin = suivreLaFin(relayer(cook), lancement, ticket, run, juger);
      // La cuisine a été arrêtée pendant que personne ne la tenait : le cook
      // repris s'arrête comme s'il avait été là.
      if (etatDesGardeFous(base).stoppedAt !== null) cook.arreter();
      return { run, pid: cook.pid, arreter: cook.arreter, fin };
    },
    lancerDistant(demande) {
      const { run, cook, fin } = partir(demande, (_nom, plafonds, surArret) => superviserADistance({ plafonds, surArret }));
      return { run, arreter: cook?.arreter ?? (() => {}), mesurer: (mesure) => cook?.mesurer(mesure), rendre: (code) => cook?.rendre(code), fin };
    },
    jugerRelance(ticket, run, verdict) {
      base.transaction(() => {
        noter(ticket, { type: "relaunch.judged", payload: { run, verdict } });
        disjoncter();
      });
    },
    arreter(signal) {
      if (!arrete) {
        arrete = true;
        desabonner();
        // Un cook relayé survit au runtime : il est lâché, pas tué. Le
        // runtime suivant le reprendra.
        for (const cook of cooks.keys()) {
          if (relayes.has(cook as Supervise & { lacher(): void })) (cook as Supervise & { lacher(): void }).lacher();
          else cook.abandonner();
        }
      }
      runtime.arreter(signal);
    },
  };
}
