// La livraison d'une correction acceptée : le « oui » du chef en fait une
// branche, qui porte le diff proposé et lui seul, et une PR — que la pass juge
// et merge comme celle d'un ticket : la fusion avec la base, les gates, le
// reviewer, la CI, le grant `merge`. C'est le chemin de la passe de fermeture
// (`closing/run.ts`), hors du rail : rien ici ne merge, et rien n'est poussé
// sur la branche d'intégration.
//
// Le diff est appliqué sur le commit où la garde de portée l'a vérifié (`base`
// de la proposition) : la branche porte exactement ce que le chef a lu, et
// c'est la pass qui la fusionne avec la base du moment — un conflit y est un
// rouge, qui remonte au chef.
//
// Une correction acceptée a une PR au plus. Une livraison morte avec le
// runtime est relue au démarrage suivant : sa PR, si GitHub la porte, est la
// sienne ; sinon une autre part.
import { execFileSync } from "../sans-invite.ts";
import { randomUUID } from "node:crypto";
import type { Depot } from "../depot.ts";
import type { Evenement } from "../evenements.ts";
import type { GitHub } from "../github.ts";
import type { Journal } from "../journal.ts";
import type { Pass } from "../pass.ts";
import type { Runtime } from "../runtime.ts";
import { propositionMontree } from "./decision.ts";
import type { CorrectionLivree, CorrectionNonLivree, FaitCorrectif } from "./evenements.ts";
import type { Proposee } from "./proposer.ts";

// Le run d'une livraison de correction : c'est par lui que la pass reconnaît
// sa PR, et la fait relire comme une correction des consignes.
const PREFIXE = "correction-";
export const estUneLivraisonDeCorrection = (run: string): boolean => run.startsWith(PREFIXE);

const IDENTITE = ["-c", "user.name=brigade", "-c", "user.email=brigade@localhost", "-c", "commit.gpgsign=false"];
const DELAI_MS = 60_000;

export type OptionsDeLivraison = {
  // Le dépôt de la station : la branche d'une correction se prépare et se
  // pousse comme celle d'un cook.
  depot: Pick<Depot, "preparer" | "retirer" | "ranger" | "pousser">;
  github: Pick<GitHub, "ouvrirPR" | "prDeBranche">;
  // La branche d'intégration : celle que vise la PR.
  base: string;
  // L'environnement de `git`. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  // Où va ce que la livraison a à dire hors du journal (journald).
  avertir?: (message: string) => void;
};

type Partie = Extract<Evenement, { type: "correction.started" }>;

// Les « oui » qui attendent leur PR, le plus ancien d'abord : acceptés, sans
// livraison conclue. `partie` : la dernière livraison partie pour lui, s'il y
// en a une — elle n'a rien conclu.
export function aLivrer(journal: Journal): Array<{ proposee: Proposee; partie: Partie | null }> {
  const conclues = new Set([...journal.duType("correction.delivered", Number.MAX_SAFE_INTEGER), ...journal.duType("correction.undelivered", Number.MAX_SAFE_INTEGER)].map(({ payload }) => payload.proposal));
  const parties = journal.duType("correction.started", Number.MAX_SAFE_INTEGER);
  return journal.duType("correction.accepted", Number.MAX_SAFE_INTEGER).flatMap(({ payload }) => {
    const proposee = propositionMontree(journal, payload.proposal);
    if (conclues.has(payload.proposal) || proposee === null) return [];
    return [{ proposee, partie: parties.findLast((partie) => partie.payload.proposal === payload.proposal) ?? null }];
  });
}

// Une clôture de bloc de code plus longue que toute suite d'accents graves du diff.
const cloture = (texte: string) => "`".repeat(Math.max(3, ...[...texte.matchAll(/`+/g)].map(([suite]) => suite.length + 1)));

export function titreDeLaPR(proposee: Proposee): string {
  return `Correction des consignes — ${proposee.payload.title}`;
}

// Le corps de la PR : c'est lui que le reviewer lit à la place d'un ticket.
export function corpsDeLaPR(proposee: Proposee): string {
  const { cause, title, tickets, reason, diff, files, base, tokens } = proposee.payload;
  const bloc = cloture(diff);
  return [
    "**Correction des consignes du projet**, proposée par le correctif de la brigade et acceptée par le chef. Elle passe par la pass comme une livraison : gates, relecture, CI, grant `merge`.",
    "",
    `- **Cause** : ${title} (\`${cause}\`), sur ${tickets.map((ticket) => `#${ticket}`).join(", ")}.`,
    `- **Fichiers** : ${files.map((fichier) => `\`${fichier}\``).join(", ")}.`,
    `- **Proposée** sur \`${base.slice(0, 7)}\`, pour ${tokens.toLocaleString("fr-FR")} tokens.`,
    "",
    "### Pourquoi",
    "",
    reason ?? "_Le modèle n'en a rien dit._",
    "",
    "### Le diff proposé",
    "",
    `${bloc}diff`,
    diff.trimEnd(),
    bloc,
  ].join("\n");
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const sortieDeGit = (erreur: unknown) => String((erreur as { stderr?: unknown }).stderr ?? "").trim().split("\n")[0] || message(erreur);

// Rend le runtime, augmenté de la livraison des corrections acceptées. À
// brancher après la pass : c'est à elle que la PR est remise.
export function brancherCorrectif<R extends Runtime & Pass>(runtime: R, options: OptionsDeLivraison): R {
  const { journal, projet } = runtime;
  const { depot, github } = options;
  const env = options.env ?? process.env;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const noter = (fait: FaitCorrectif, dedupKey?: string) => journal.ajouter({ project: projet, ticket: null, author: "runtime", ...fait, dedupKey });
  // Une livraison conclue l'est une fois : livrée ou non, une PR au plus.
  const conclusion = (proposition: number) => `correction.delivery:${proposition}`;
  const nonLivree = (payload: CorrectionNonLivree) => {
    noter({ type: "correction.undelivered", payload }, conclusion(payload.proposal));
    avertir(`brigade : la correction ${payload.proposal}, acceptée, n'est pas partie — ${payload.reason}`);
  };
  // Livrée, elle entre en pass du même geste : une correction dite livrée dont
  // la PR ne serait jugée par personne aurait un chemin à elle vers la base.
  const remettre = (payload: CorrectionLivree) =>
    journal.base.transaction(() => {
      if (noter({ type: "correction.delivered", payload }, conclusion(payload.proposal)) === null) return;
      runtime.prendreHorsRail({ run: payload.run, branche: payload.branch, pr: payload.pr, numero: payload.number });
    });

  let arrete = false;
  // Une livraison à la fois.
  let occupee = false;

  const livrer = async (proposee: Proposee): Promise<void> => {
    const proposition = proposee.seq;
    const run = `${PREFIXE}${proposition}-${randomUUID().slice(0, 8)}`;
    let worktree: string;
    let branche: string;
    try {
      ({ worktree, branche } = await depot.preparer(run));
    } catch (erreur) {
      return nonLivree({ proposal: proposition, run, branch: null, reason: `branche non préparée — ${message(erreur)}` });
    }
    if (arrete) return depot.retirer(worktree, branche);
    noter({ type: "correction.started", payload: { proposal: proposition, run, branch: branche } });

    const git = (args: string[], entree?: string) => execFileSync("git", args, { cwd: worktree, env, input: entree, timeout: DELAI_MS, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    let sha: string;
    try {
      git(["reset", "--hard", "--quiet", `${proposee.payload.base}^{commit}`]);
      git(["apply", "--index"], proposee.payload.diff);
      git([...IDENTITE, "commit", "--quiet", "--no-verify", "-m", `${titreDeLaPR(proposee)}\n\nAcceptée par le chef (proposition ${proposition}).`]);
      sha = git(["rev-parse", "HEAD"]);
    } catch (erreur) {
      depot.retirer(worktree, branche);
      return nonLivree({ proposal: proposition, run, branch: branche, reason: `le diff ne se commite pas sur \`${proposee.payload.base.slice(0, 7)}\` — ${sortieDeGit(erreur)}` });
    }
    try {
      depot.pousser(branche);
    } catch (erreur) {
      depot.retirer(worktree, branche);
      return nonLivree({ proposal: proposition, run, branch: branche, reason: `branche non poussée — ${message(erreur)}` });
    }
    try {
      const pr = await github.ouvrirPR({ branche, base: options.base, titre: titreDeLaPR(proposee), corps: corpsDeLaPR(proposee) });
      const ouverte = await github.prDeBranche(branche);
      if (ouverte === null) throw new Error(`GitHub ne rend pas la PR qu'il vient d'ouvrir (${pr})`);
      if (!arrete) remettre({ proposal: proposition, run, branch: branche, pr, number: ouverte.number, sha });
    } catch (erreur) {
      if (!arrete) nonLivree({ proposal: proposition, run, branch: branche, reason: `PR non ouverte — ${message(erreur)}` });
    }
    // La branche reste, poussée : c'est elle que la pass juge.
    await depot.ranger(worktree, branche).catch((erreur) => avertir(`brigade : worktree de la correction ${run} non rangé — ${message(erreur)}`));
  };

  // Une livraison partie dans une autre vie, sans rien conclure : sa PR, si
  // GitHub la porte, est la sienne — et entre en pass. Rend vrai si elle l'a
  // trouvée. Lève si GitHub ne répond pas : rien ne part, le réveil suivant
  // relira.
  const reprendre = async ({ payload }: Partie): Promise<boolean> => {
    const ouverte = await github.prDeBranche(payload.branch);
    if (ouverte === null || arrete) return false;
    remettre({ ...payload, pr: ouverte.url, number: ouverte.number, sha: ouverte.sha });
    return true;
  };

  const passer = () => {
    if (arrete || occupee) return;
    const suivante = aLivrer(journal)[0];
    if (suivante === undefined) return;
    occupee = true;
    void (async () => {
      if (suivante.partie !== null && (await reprendre(suivante.partie))) return;
      if (!arrete) await livrer(suivante.proposee);
    })()
      .catch((erreur) => {
        if (!arrete) avertir(`brigade : la livraison d'une correction a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
      })
      .finally(() => {
        occupee = false;
      });
  };

  const desabonner = runtime.surReveil(passer);
  passer();

  return {
    ...runtime,
    arreter(signal) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}
