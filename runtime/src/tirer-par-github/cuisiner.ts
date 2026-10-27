// La station qui a rejoint la cuisine d'une autre (#1789, `projets/rejoindre.ts`)
// y cuit comme une station de plus, par GitHub seulement : elle réclame un
// ticket à la principale, en lance le cook ici, renouvelle son bail tant qu'il
// travaille, pousse sa branche sur l'origine et la rend. Chaque demande passe
// par son gist et le Kitchen board (`demander.ts`) ; c'est la principale qui
// décide, qui tient le rail et dont la pass juge la livraison.
//
// Le cook est celui que la principale décrit dans sa mission : la consigne et
// les arguments de `claude` d'un cook de la box — pour un ticket ordinaire,
// la configuration du bac à sable —, lancés tels quels dans son worktree,
// `<worktrees>/<run>`, le lieu que la station a dit à sa réclamation. Il est
// tenu sous les plafonds de la mission (`superviseur.ts`) ; la principale tient
// les siens de son côté, sur ce que la station lui rapporte.
//
// Rien ici n'ouvre le journal du projet : la station n'a pas de cuisine pour
// lui. Son clone ne sert qu'à poser les worktrees de ses cooks.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Canal } from "../appairage/canal.ts";
import { lireFlux, verdict } from "../claude.ts";
import type { BacASableDeLaStation, Demande, Mission, Reponse } from "../events/remote.ts";
import { clonerEnReparant } from "../installation/clone/clone.ts";
import { envSansInvite, execFile } from "../sans-invite.ts";
import { superviser, type Supervise } from "../superviseur.ts";
import { demanderParGitHub } from "./demander.ts";

// Entre deux réclamations qui n'ont rien rapporté — et entre deux essais quand
// la principale ne répond pas.
export const ENTRE_DEUX_RECLAMATIONS_MS = 60_000;
// Le délai laissé au cook entre SIGTERM et SIGKILL.
const GRACE_MS = 10_000;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export type Demander = (demande: Demande) => Promise<Reponse>;

// `git`, sans invite : un remote qui demanderait un mot de passe échoue.
function git(cwd: string, ...args: string[]): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    execFile("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 64 * 1024 * 1024, env: { ...envSansInvite(), GIT_TERMINAL_PROMPT: "0" } }, (erreur, sortie, erreurs) => {
      if (erreur === null) return resoudre(String(sortie));
      rejeter(new Error(`git ${args[0]} : ${String(erreurs).trim() || erreur.message}`));
    });
  });
}

// L'empreinte du worktree : son commit, ce qui y est modifié et ce qui y est
// neuf. Elle bouge quand le cook travaille — c'est d'elle que dépend le bail.
export async function empreinteDuWorktree(worktree: string): Promise<string | null> {
  try {
    const [tete, etat, ecarts] = await Promise.all([git(worktree, "rev-parse", "HEAD"), git(worktree, "status", "--porcelain=v1", "-uall"), git(worktree, "diff", "HEAD")]);
    return createHash("sha256").update(tete).update(etat).update(ecarts).digest("hex").slice(0, 40);
  } catch {
    return null;
  }
}

export type OptionsDuCook = {
  mission: Mission;
  // `<worktrees>/<run>` : là où le bac à sable de la mission le laisse écrire.
  worktree: string;
  // Le clone du projet sur la station, d'où partent les worktrees.
  clone: string;
  // Le `claude` de la station, et l'environnement de ses cooks.
  claude: string;
  env: NodeJS.ProcessEnv;
  gh: string;
  demander: Demander;
  dire: (ligne: string) => void;
  // Arrêtée : le cook est arrêté, rien n'est rendu — son bail tombe chez la principale.
  signal?: AbortSignal;
  renouvelerToutesLesMs?: number;
  // Surchargés par les tests.
  preparer?: (mission: Mission, worktree: string) => Promise<void>;
  lancer?: (mission: Mission, worktree: string, flux: string) => Supervise;
  pousser?: (worktree: string, branche: string) => Promise<void>;
  ranger?: (worktree: string) => Promise<void>;
};

// Ce que la station a fait d'une mission : rendue (la réponse de la
// principale), ou abandonnée — et pourquoi.
export type IssueDuCook = { rendue: Reponse } | { abandonnee: string };

export async function cuisinerUneMission(options: OptionsDuCook): Promise<IssueDuCook> {
  const { mission, worktree, clone, demander, dire } = options;
  const { run, branch } = mission;
  const preparer =
    options.preparer ??
    (async () => {
      if (!existsSync(join(clone, ".git"))) await clonerEnReparant({ gh: options.gh, depot: mission.repository, clone, env: options.env });
      await git(clone, "fetch", "--quiet", "origin");
      rmSync(worktree, { recursive: true, force: true });
      mkdirSync(dirname(worktree), { recursive: true });
      await git(clone, "worktree", "prune");
      // Une branche reprise — la livraison renvoyée, le travail conservé — part
      // de ce que l'origine en porte ; une neuve, de la base.
      await git(clone, "worktree", "add", "--quiet", "-B", branch, worktree, `origin/${mission.resumes === null ? mission.base : branch}`);
    });
  const lancer =
    options.lancer ??
    ((_mission: Mission, ici: string, flux: string) => superviser({ commande: options.claude, args: mission.args, cwd: ici, env: options.env, plafonds: mission.limits, graceMs: GRACE_MS, flux }));
  const pousser = options.pousser ?? ((ici: string, branche: string) => git(ici, "push", "--quiet", "origin", `HEAD:refs/heads/${branche}`).then(() => {}));
  const ranger =
    options.ranger ??
    (async (ici: string) => {
      await git(clone, "worktree", "remove", "--force", ici).catch(() => {});
      rmSync(ici, { recursive: true, force: true });
    });
  const rendre = async (ending: "delivered" | "failed", reason: string | null, dernier: string | null, mesure: { turns: number; tokens: number }): Promise<IssueDuCook> => ({
    rendue: await demander({ verb: "deliver", run, ending, reason, message: dernier, ...mesure }),
  });

  if (options.signal?.aborted) return { abandonnee: "the station stopped before the cook started" };
  try {
    await preparer(mission, worktree);
  } catch (erreur) {
    dire(`brigade : station — #${mission.ticket} : son worktree n'a pas pu être préparé, elle le rend à la principale : ${message(erreur)}`);
    return rendre("failed", `worktree: ${message(erreur)}`.slice(0, 200), null, { turns: 0, tokens: 0 });
  }
  try {
    const flux = join(dirname(worktree), `${run}.flux.jsonl`);
    const cook = lancer(mission, worktree, flux);
    dire(`brigade : station — #${mission.ticket} : son cook est lancé ici (run ${run}, branche ${branch})`);
    let abandon: string | null = null;
    const abandonner = (pourquoi: string) => {
      if (abandon !== null) return;
      abandon = pourquoi;
      cook.arreter({ reason: "stop", limit: null, observed: null });
    };
    const surArret = () => abandonner("the station stopped");
    options.signal?.addEventListener("abort", surArret, { once: true });

    // Le bail, tant que le cook travaille : renouvelé sur l'empreinte de son
    // worktree. Une principale qui l'a arrêté — bail tombé, garde-fou, chef —
    // le dit à la demande suivante : le cook s'arrête ici aussi.
    let fini = false;
    let reveiller = () => {};
    const renouvellement = (async () => {
      while (!fini) {
        await new Promise<void>((resoudre) => {
          const minuteur = setTimeout(resoudre, options.renouvelerToutesLesMs ?? Math.max(1_000, Math.floor(mission.leaseMs / 3)));
          reveiller = () => {
            clearTimeout(minuteur);
            resoudre();
          };
        });
        if (fini) return;
        const reponse = await demander({ verb: "renew", run, proof: await empreinteDuWorktree(worktree), ...cook.mesure() }).catch((erreur: unknown) => {
          dire(`brigade : station — #${mission.ticket} : son bail n'a pas pu être renouvelé, elle réessaie : ${message(erreur)}`);
          return null;
        });
        if (reponse !== null && !reponse.ok && (reponse.refusal === "stopped" || reponse.refusal === "late" || reponse.refusal === "unknown-run")) abandonner(reponse.said);
      }
    })();
    const fin = await cook.fin;
    fini = true;
    reveiller();
    await renouvellement;
    options.signal?.removeEventListener("abort", surArret);

    const mesure = { turns: fin.turns, tokens: fin.tokens };
    if (abandon !== null) {
      dire(`brigade : station — #${mission.ticket} : son cook est arrêté, rien n'est rendu — ${abandon}`);
      return { abandonnee: abandon };
    }
    const lecture = lireFlux(existsSync(flux) ? readFileSync(flux, "utf8") : "");
    if (fin.arret !== null) return rendre("failed", `guard:${fin.arret.reason}`, lecture.message, mesure);
    const conclusion = verdict(lecture, fin.code);
    if (conclusion !== "done") return rendre("failed", fin.erreur ?? conclusion, lecture.message, mesure);
    try {
      await pousser(worktree, branch);
    } catch (erreur) {
      return rendre("failed", `push: ${message(erreur)}`.slice(0, 200), lecture.message, mesure);
    }
    return rendre("delivered", null, lecture.message, mesure);
  } finally {
    await ranger(worktree);
  }
}

export type OptionsDeLaCuisineRejointe = {
  // Son nom, tel que la principale la déclare : `<machine>/claude`.
  station: string;
  depot: string;
  // Son gist d'appairage, où elle pose ses demandes.
  gist: string;
  canal: Pick<Canal, "ecrire">;
  lireLeTableau: () => Promise<string | null>;
  // Ses cooks à la fois pour ce projet.
  cooks: number;
  clone: string;
  // Où elle pose les worktrees de ses cooks : celui de chacun est `<worktrees>/<run>`.
  worktrees: string;
  claude: string;
  env: NodeJS.ProcessEnv;
  gh: string;
  // Ce qu'elle dit du bac à sable de son poste à chaque réclamation.
  bacASable: () => BacASableDeLaStation;
  dire: (ligne: string) => void;
  maintenant?: () => number;
  attenteMs?: number;
  pasMs?: number;
  entreDeuxReclamationsMs?: number;
  // Surchargés par les tests : ce que `cuisinerUneMission` fait de chaque mission.
  cook?: Pick<OptionsDuCook, "preparer" | "lancer" | "pousser" | "ranger" | "renouvelerToutesLesMs">;
};

export type CuisinePourLaPrincipale = {
  // Les missions rendues ou abandonnées, dans l'ordre.
  issues(): IssueDuCook[];
  // Plus aucune réclamation ; ses cooks en vol sont arrêtés, rien n'en est rendu.
  arreter(): Promise<void>;
};

// Réclame tant qu'elle a de la place, et cuit chaque mission reçue.
export function cuisinerPourLaPrincipale(options: OptionsDeLaCuisineRejointe): CuisinePourLaPrincipale {
  const { station, depot, dire } = options;
  const entre = options.entreDeuxReclamationsMs ?? ENTRE_DEUX_RECLAMATIONS_MS;
  const demander: Demander = (demande) =>
    demanderParGitHub({ station, depot, gist: options.gist, canal: options.canal, lireLeTableau: options.lireLeTableau, ...(options.maintenant === undefined ? {} : { maintenant: options.maintenant }), ...(options.attenteMs === undefined ? {} : { attenteMs: options.attenteMs }), ...(options.pasMs === undefined ? {} : { pasMs: options.pasMs }) }, demande);
  const arret = new AbortController();
  const enCours = new Set<Promise<void>>();
  const issues: IssueDuCook[] = [];
  let reveiller = () => {};
  const dormir = (ms: number) =>
    new Promise<void>((resoudre) => {
      if (arret.signal.aborted) return resoudre();
      const minuteur = setTimeout(resoudre, ms);
      reveiller = () => {
        clearTimeout(minuteur);
        resoudre();
      };
    });
  let dit: string | null = null;
  const direAuChangement = (ligne: string) => {
    if (ligne === dit) return;
    dit = ligne;
    dire(ligne);
  };

  const boucle = (async () => {
    while (!arret.signal.aborted) {
      if (enCours.size >= options.cooks) {
        await dormir(entre);
        continue;
      }
      let reponse: Reponse;
      try {
        reponse = await demander({ verb: "claim", sandbox: options.bacASable() });
      } catch (erreur) {
        direAuChangement(`brigade : station — ${depot} : la principale ne répond pas à sa réclamation, elle réessaie : ${message(erreur)}`);
        await dormir(entre);
        continue;
      }
      if (arret.signal.aborted) break;
      if (!reponse.ok || reponse.verb !== "claim") {
        direAuChangement(`brigade : station — ${depot} : la principale refuse sa réclamation — ${reponse.ok ? reponse.verb : reponse.said}`);
        await dormir(entre);
        continue;
      }
      if (reponse.mission === null) {
        direAuChangement(`brigade : station — ${depot} : rien à prendre pour l'instant${reponse.held === null ? "" : ` (${reponse.held})`}`);
        await dormir(entre);
        continue;
      }
      const mission = reponse.mission;
      dit = null;
      dire(`brigade : station — ${depot} : ${station} prend #${mission.ticket} de la principale (run ${mission.run})`);
      const cook: Promise<void> = cuisinerUneMission({ ...options.cook, mission, worktree: join(options.worktrees, mission.run), clone: options.clone, claude: options.claude, env: options.env, gh: options.gh, demander, dire, signal: arret.signal })
        .then((issue) => void issues.push(issue))
        .catch((erreur: unknown) => dire(`brigade : station — #${mission.ticket} : son cook n'a pas pu être rendu à la principale, son bail y tombera : ${message(erreur)}`))
        .finally(() => {
          enCours.delete(cook);
          reveiller();
        });
      enCours.add(cook);
    }
  })();

  return {
    issues: () => [...issues],
    async arreter() {
      arret.abort();
      reveiller();
      await boucle;
      await Promise.all(enCours);
    },
  };
}

// Une boucle par cuisine rejointe, tenue au fil des lectures de la station
// (`projets/tenir.ts`, `surLesRejointes`) : ouverte pour une cuisine qu'elle
// vient de rejoindre, rouverte quand ce qu'elle en dit change — ses cooks, ce
// qu'elle fournit, sa principale —, fermée pour une qu'elle ne rejoint plus.
export function tenirLesCuisinesRejointes<R extends { depot: string }>(ouvrir: (rejointe: R, gist: string) => CuisinePourLaPrincipale): { tenir(rejointes: readonly R[], gist: string): void; arreter(): Promise<void> } {
  const ouvertes = new Map<string, { cle: string; cuisine: CuisinePourLaPrincipale }>();
  const fermetures = new Set<Promise<void>>();
  const fermer = (depot: string) => {
    const ouverte = ouvertes.get(depot);
    if (ouverte === undefined) return;
    ouvertes.delete(depot);
    const fermeture = ouverte.cuisine.arreter().finally(() => fermetures.delete(fermeture));
    fermetures.add(fermeture);
  };
  return {
    tenir(rejointes, gist) {
      const voulues = new Map(rejointes.map((rejointe) => [rejointe.depot.toLowerCase(), rejointe]));
      for (const depot of [...ouvertes.keys()]) if (!voulues.has(depot)) fermer(depot);
      for (const [depot, rejointe] of voulues) {
        const cle = JSON.stringify([rejointe, gist]);
        if (ouvertes.get(depot)?.cle === cle) continue;
        fermer(depot);
        ouvertes.set(depot, { cle, cuisine: ouvrir(rejointe, gist) });
      }
    },
    async arreter() {
      for (const depot of [...ouvertes.keys()]) fermer(depot);
      await Promise.all(fermetures);
    },
  };
}
