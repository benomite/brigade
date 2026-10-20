// La livraison du carnet : quand l'histoire des rétros décide une promotion,
// une rétrogradation, une disparition — ou constate un retrait par revert —,
// le runtime écrit le carnet mis à jour sur une branche qui ne porte que lui,
// ouvre une PR et la remet à la pass, qui la juge et la merge comme celle d'un
// ticket : la fusion avec la base, les gates, le reviewer, la CI, le grant
// `merge`. C'est le chemin des corrections acceptées (`correctif/livrer.ts`),
// hors du rail — sans leur « oui » : le chef n'est pas consulté avant, la PR
// ne l'attend pas. Rien ici ne merge, et rien n'est poussé sur la branche
// d'intégration.
//
// Une PR du carnet à la fois : tant que la dernière livrée n'est ni mergée ni
// fermée, aucune autre ne part — le carnet de la base ne dit pas encore ce
// qu'elle décide, et la même décision repartirait. Le carnet jugé est celui
// de la base fraîchement rapatriée : un premier jugement se fait sur le carnet
// que le clone porte déjà, sans rien préparer ; s'il trouve un changement, la
// branche est préparée — la base rapatriée — et le jugement refait sur son
// carnet. Comme rien ne change sans un ticket servi de plus ou une livraison
// du carnet conclue, le jugement n'est refait qu'à l'un ou l'autre.
//
// Une livraison morte avec le runtime est relue au réveil suivant : sa PR, si
// GitHub la porte, est la sienne ; sinon elle est dite non livrée, et le
// jugement suivant la refait.
import { execFileSync } from "../sans-invite.ts";
import { randomUUID } from "node:crypto";
import { CARNET_PATH, CarnetError, parseCarnet, readCarnet, saveCarnet, type Carnet } from "../carnet/carnet.ts";
import { candidatesDuProjet, retrosDuProjet } from "../apprentissage/provisoires.ts";
import type { Depot } from "../depot.ts";
import type { GitHub } from "../github.ts";
import type { Journal } from "../journal.ts";
import type { Pass } from "../pass.ts";
import type { Runtime } from "../runtime.ts";
import type { Seuils } from "../seuils/seuils.ts";
import { changementDuCarnet, type Fusionnee } from "./changement.ts";
import type { CarnetLivre, CarnetNonLivre, FaitCarnet, LivraisonDuCarnet } from "./evenements.ts";

// Le run d'une livraison du carnet : c'est par lui que la pass reconnaît sa
// PR, et la fait relire comme un changement du carnet.
const PREFIXE = "carnet-";
export const estUneLivraisonDuCarnet = (run: string): boolean => run.startsWith(PREFIXE);

const IDENTITE = ["-c", "user.name=brigade", "-c", "user.email=brigade@localhost", "-c", "commit.gpgsign=false"];
const DELAI_MS = 60_000;

export type OptionsDuCarnet = {
  // Le dépôt de la station : la branche du carnet se prépare et se pousse
  // comme celle d'un cook.
  depot: Pick<Depot, "preparer" | "retirer" | "ranger" | "pousser">;
  github: Pick<GitHub, "ouvrirPR" | "prDeBranche">;
  // La branche d'intégration : celle que vise la PR.
  base: string;
  // Les seuils du projet (`seuils/seuils.ts`).
  seuils: Seuils;
  // Le carnet tel que le clone le porte sur la branche d'intégration, d'après
  // son dernier rapatriement (`lireALaBase`) ; null, la base n'en a pas.
  carnetALaBase: () => string | null;
  // Le jour des sorties écrites. Par défaut, l'horloge.
  maintenant?: () => Date;
  // L'environnement de `git`. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  // Où va ce que la livraison a à dire hors du journal (journald).
  avertir?: (message: string) => void;
};

// Ce qu'un passage a fait : rien à livrer, une PR du carnet encore en pass,
// rien de neuf depuis le jugement d'avant, une livraison faite ou ratée.
export type Passage = "rien" | "en-pass" | "inchange" | "livree" | "non-livree" | "arrete";

type Livree = Extract<FaitCarnet, { type: "carnet.delivered" }>;
type Partie = Extract<FaitCarnet, { type: "carnet.started" }>;

const TOUS = Number.MAX_SAFE_INTEGER;

// La PR d'une livraison est-elle conclue : mergée, ou fermée sans merge ?
function conclusion(journal: Journal, numero: number): "merged" | "closed" | null {
  for (const e of journal.duTicket(numero).reverse()) {
    if (e.type === "merge.done") return "merged";
    if (e.type === "pass.pr-closed") return "closed";
  }
  return null;
}

// Les livraisons du carnet mergées, dans l'ordre de leur livraison.
export function fusionnees(journal: Journal): Fusionnee[] {
  return journal
    .duType("carnet.delivered", TOUS)
    .filter(({ payload }) => conclusion(journal, payload.number) === "merged")
    .map(({ payload }) => ({ pr: payload.pr, lessons: payload.lessons }));
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const sortieDeGit = (erreur: unknown) => String((erreur as { stderr?: unknown }).stderr ?? "").trim().split("\n")[0] || message(erreur);

// Le livreur du carnet : un passage à la fois, que `brancherCarnet` lance à
// chaque réveil. Rend ce que le passage a fait.
export function livreurDuCarnet(runtime: Runtime & Pick<Pass, "prendreHorsRail">, options: OptionsDuCarnet): { passer(): Promise<Passage>; arreter(): void } {
  const { journal, projet } = runtime;
  const { depot, github } = options;
  const env = options.env ?? process.env;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const maintenant = options.maintenant ?? (() => new Date());
  const noter = (fait: FaitCarnet, dedupKey?: string) => journal.ajouter({ project: projet, ticket: null, author: "runtime", ...fait, dedupKey });
  const conclue = (run: string) => `carnet.delivery:${run}`;
  const nonLivree = (payload: CarnetNonLivre): Passage => {
    noter({ type: "carnet.undelivered", payload }, conclue(payload.run));
    avertir(`brigade : le carnet des leçons n'est pas parti — ${payload.reason}`);
    return "non-livree";
  };
  // Livrée, elle entre en pass du même geste : un carnet dit livré dont la PR
  // ne serait jugée par personne aurait un chemin à lui vers la base. Aucun
  // geste du chef n'est attendu entre les deux.
  const remettre = (payload: CarnetLivre): Passage =>
    journal.base.transaction(() => {
      if (noter({ type: "carnet.delivered", payload }, conclue(payload.run)) === null) return "rien";
      runtime.prendreHorsRail({ run: payload.run, branche: payload.branch, pr: payload.pr, numero: payload.number });
      return "livree";
    });

  let arrete = false;
  // L'état du journal au dernier jugement : tickets servis, livraisons du
  // carnet conclues. Le même état rend le même jugement.
  let juge: string | null = null;

  // La dernière livraison partie sans rien conclure, s'il y en a une.
  const enSuspens = (): Partie | null => {
    const parties = journal.duType("carnet.started", TOUS);
    const derniere = parties.at(-1);
    if (derniere === undefined) return null;
    const finie = journal.duType("carnet.delivered", TOUS).some((e) => e.payload.run === derniere.payload.run) || journal.duType("carnet.undelivered", TOUS).some((e) => e.payload.run === derniere.payload.run);
    return finie ? null : derniere;
  };
  const enPass = (): Livree | null => {
    const derniere = journal.duType("carnet.delivered", 1)[0];
    return derniere !== undefined && conclusion(journal, derniere.payload.number) === null ? derniere : null;
  };

  // Une livraison partie dans une autre vie : sa PR, si GitHub la porte, est
  // la sienne. Lève si GitHub ne répond pas : le réveil suivant relira.
  const reprendre = async ({ payload }: Partie): Promise<Passage> => {
    const ouverte = await github.prDeBranche(payload.branch);
    if (arrete) return "arrete";
    if (ouverte === null) return nonLivree({ run: payload.run, branch: payload.branch, reason: "partie dans une vie du runtime qui s'est arrêtée avant d'ouvrir sa PR" });
    return remettre({ ...payload, pr: ouverte.url, number: ouverte.number, sha: ouverte.sha });
  };

  const livrer = async (): Promise<Passage> => {
    const servis = retrosDuProjet(journal.base, projet).length;
    const conclues = journal.duType("carnet.delivered", TOUS).filter(({ payload }) => conclusion(journal, payload.number) !== null).length;
    const etat = `${servis}:${conclues}`;
    if (etat === juge) return "inchange";
    juge = etat;
    const aujourdhui = maintenant().toISOString().slice(0, 10);
    const juger = (carnet: Carnet) => changementDuCarnet({ carnet, retros: retrosDuProjet(journal.base, projet), candidates: candidatesDuProjet(journal.base, projet), seuils: options.seuils, aujourdhui, fusionnees: fusionnees(journal) });

    // D'abord sur ce que le clone porte : sans changement, rien ne se prépare.
    try {
      const texte = options.carnetALaBase();
      if (juger(texte === null ? { lessons: [] } : parseCarnet(texte)) === null) return "rien";
    } catch (erreur) {
      // Le clone n'a pas encore la base : le réveil suivant rejugera. Un
      // carnet illisible, lui, est relu sur la base rapatriée, et dit.
      if (!(erreur instanceof CarnetError)) {
        juge = null;
        return "rien";
      }
    }

    const run = `${PREFIXE}${randomUUID().slice(0, 8)}`;
    let worktree: string;
    let branche: string;
    try {
      ({ worktree, branche } = await depot.preparer(run));
    } catch (erreur) {
      return nonLivree({ run, branch: null, reason: `branche non préparée — ${message(erreur)}` });
    }
    if (arrete) return (depot.retirer(worktree, branche), "arrete");

    // Refait une fois la base rapatriée : sur son carnet, et ce que le
    // journal a écrit pendant ce temps.
    let changement: ReturnType<typeof changementDuCarnet>;
    try {
      changement = juger(readCarnet(worktree));
    } catch (erreur) {
      depot.retirer(worktree, branche);
      return nonLivree({ run, branch: null, reason: `carnet de la base illisible, rien n'est décidé — ${message(erreur)}` });
    }
    if (changement === null) {
      depot.retirer(worktree, branche);
      return "rien";
    }

    const livraison: LivraisonDuCarnet = { run, branch: branche, decisions: changement.decisions, lessons: changement.lessons };
    noter({ type: "carnet.started", payload: livraison });
    const git = (args: string[]) => execFileSync("git", args, { cwd: worktree, env, timeout: DELAI_MS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    let sha: string;
    try {
      saveCarnet(worktree, changement.carnet);
      // Le carnet, et lui seul : rien d'autre du worktree n'entre au commit.
      git(["add", "--", CARNET_PATH]);
      git([...IDENTITE, "commit", "--quiet", "--no-verify", "-m", `${changement.titre}\n\nDécidé de l'histoire des rétros par le runtime (${run}).`, "--", CARNET_PATH]);
      sha = git(["rev-parse", "HEAD"]);
    } catch (erreur) {
      depot.retirer(worktree, branche);
      return nonLivree({ run, branch: branche, reason: `le carnet ne se commite pas — ${sortieDeGit(erreur)}` });
    }
    try {
      depot.pousser(branche);
    } catch (erreur) {
      depot.retirer(worktree, branche);
      return nonLivree({ run, branch: branche, reason: `branche non poussée — ${message(erreur)}` });
    }
    let passage: Passage;
    try {
      const pr = await github.ouvrirPR({ branche, base: options.base, titre: changement.titre, corps: changement.corps });
      const ouverte = await github.prDeBranche(branche);
      if (ouverte === null) throw new Error(`GitHub ne rend pas la PR qu'il vient d'ouvrir (${pr})`);
      passage = arrete ? "arrete" : remettre({ ...livraison, pr, number: ouverte.number, sha });
    } catch (erreur) {
      passage = arrete ? "arrete" : nonLivree({ run, branch: branche, reason: `PR non ouverte — ${message(erreur)}` });
    }
    // La branche reste, poussée : c'est elle que la pass juge.
    await depot.ranger(worktree, branche).catch((erreur) => avertir(`brigade : worktree du carnet ${run} non rangé — ${message(erreur)}`));
    return passage;
  };

  // Un passage à la fois : un réveil pendant un passage n'en lance pas un autre.
  let enCours: Promise<Passage> | null = null;
  const passer = (): Promise<Passage> => {
    if (arrete) return Promise.resolve("arrete");
    enCours ??= (async (): Promise<Passage> => {
      const suspendue = enSuspens();
      if (suspendue !== null) return reprendre(suspendue);
      if (enPass() !== null) return "en-pass";
      return livrer();
    })().finally(() => {
      enCours = null;
    });
    return enCours;
  };

  return {
    passer,
    arreter() {
      arrete = true;
    },
  };
}

// Rend le runtime, augmenté de la livraison du carnet. À brancher après la
// pass : c'est à elle que la PR est remise.
export function brancherCarnet<R extends Runtime & Pass>(runtime: R, options: OptionsDuCarnet): R {
  const livreur = livreurDuCarnet(runtime, options);
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const passer = () =>
    void livreur.passer().catch((erreur) => avertir(`brigade : la livraison du carnet a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`));
  const desabonner = runtime.surReveil(passer);
  passer();
  return {
    ...runtime,
    arreter(signal) {
      livreur.arreter();
      desabonner();
      runtime.arreter(signal);
    },
  };
}
