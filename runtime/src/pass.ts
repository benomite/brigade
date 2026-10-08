// La pass : elle juge ce qu'un cook a livré — les gates du projet dans son
// worktree, la CI de son commit — puis décide. Verte, elle merge si le grant
// `merge` est actif, et s'arrête en le disant sinon ; rouge, elle renvoie les
// findings à un cook, deux fois au plus, puis remonte au chef. Mécanique, pas
// jugement : elle ne lance aucun modèle.
//
// Elle ne garde rien en mémoire qui compte : ce qu'il lui reste à faire se lit
// dans sa projection, donc tient après un redémarrage. Le merge est un effet
// sur le monde — son intention (`grant.used`) est écrite avant l'appel, son
// résultat après, et une intention sans résultat se réconcilie sur GitHub.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { RuntimeAvecRail } from "./alimenter.ts";
import { environnementCook } from "./claude.ts";
import type { Depot } from "./depot.ts";
import { JUGES_MODIFIES, SANS_GRANT, type CI, type FaitPass, type Gates, type MotifDeRemontee } from "./evenements/pass.ts";
import { aDesGates, jouerGates, SCRIPT_GATES } from "./gates.ts";
import type { GitHub, PR } from "./github.ts";
import { grantActif, lirePass, passDuTicket, type PassDeTicket } from "./projections/pass.ts";
import { ticketDuRail } from "./projections/rail.ts";
import { GesteRefuse } from "./rail.ts";
import { ConfigInvalide } from "./runtime.ts";

const AUTEUR = "pass";
// Règle V1 conservée : au deuxième renvoi resté rouge, la pass cesse de renvoyer.
export const RENVOIS_MAX = 2;
// Le motif sous lequel un ticket rouge revient sur le rail.
export const PASS_ROUGE = "pass-red";
// Ce par quoi une livraison est jugée : qui y touche peut se rendre vert seul.
const JUGES = [".claude/brigade/", ".github/workflows/"];
const WORKFLOWS = ".github/workflows";

const DELAI_PAR_DEFAUT_S = 1800;

export type ConfigPass = {
  // Le plafond de durée des gates : au-delà, elles sont arrêtées et rouges.
  delaiGatesMs: number;
  // L'attente tolérée d'une CI qui ne conclut pas, avant de remonter au chef.
  attenteCiMs: number;
};

export function configPass(env: Record<string, string | undefined>): ConfigPass {
  const secondes = (variable: string): number => {
    const valeur = env[variable] || String(DELAI_PAR_DEFAUT_S);
    if (!/^[1-9][0-9]*$/.test(valeur)) throw new ConfigInvalide(`${variable} invalide : « ${valeur} » — attendu un nombre entier de secondes`);
    return Number(valeur) * 1000;
  };
  return { delaiGatesMs: secondes("BRIGADE_GATES_TIMEOUT_SECONDS"), attenteCiMs: secondes("BRIGADE_CI_WAIT_SECONDS") };
}

export type OptionsPass = ConfigPass & {
  repertoireEtat: string;
  depot: Depot;
  github: GitHub;
  // La branche d'intégration : la seule base sur laquelle la pass merge.
  base: string;
  // L'environnement dont part celui des gates. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  maintenant?: () => Date;
  // Où va ce que la pass a à dire hors du journal (journald).
  avertir?: (message: string) => void;
};

export type Pass = {
  // Fait repasser la pass sans attendre le tick : un cook vient de livrer.
  reveillerPass(): void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const court = (sha: string | null) => (sha ?? "?").slice(0, 7);
const minutes = (ms: number) => `${(ms / 60_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min`;

function findingDesGates(gates: Gates, delaiMs: number): string {
  const titre =
    gates.outcome === "timeout"
      ? `Gates arrêtées : \`${SCRIPT_GATES}\` a dépassé son plafond de ${minutes(delaiMs)}.`
      : `Gates rouges : \`${SCRIPT_GATES}\` est sorti en ${gates.code ?? "erreur"}.`;
  return [titre, ...gates.failures, ...(gates.tail === "" ? [] : ["Fin de sortie :", "```", gates.tail, "```"])].join("\n");
}

function resume(gates: Gates, ci: CI): string {
  const dites = { green: "vertes", red: "rouges", timeout: "arrêtées au plafond", skipped: "non jouées" }[gates.outcome];
  const lue = {
    green: `verte (${ci.checks.length} check${ci.checks.length > 1 ? "s" : ""})`,
    red: "rouge",
    none: "aucun check sur ce commit — le verdict repose sur les seules gates",
    skipped: "non lue",
  }[ci.outcome];
  return `gates ${dites} · CI : ${lue}`;
}

// La consigne d'un cook relancé sur un ticket que la pass a jugé rouge : il
// retrouve le travail, pas la conversation.
export function consigneDeRenvoi(mission: { ticket: number; titre: string; depot: string; base: string; branche: string; n: number; findings: string[] }): string {
  const { ticket, titre, depot, base, branche, n, findings } = mission;
  return [
    `Tu es un cook de la brigade : tu reprends un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    `Un cook a déjà livré ce ticket sur la branche \`${branche}\`, partie de \`${base}\`. La pass — les gates du dépôt et sa CI — a refusé sa livraison : c'est le renvoi ${n} sur ${RENVOIS_MAX}. Tu es dans son worktree, sur sa branche, avec ses commits.`,
    "",
    "Ce que la pass a trouvé :",
    "",
    ...findings.flatMap((finding) => [finding, ""]),
    `1. Relis le ticket : \`gh issue view ${ticket} --repo ${depot} --comments\`, et ce qui est déjà commité : \`git log origin/${base}..HEAD\`. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    "2. Corrige ce que la pass a trouvé, et rien d'autre. Un finding que tu tiens pour faux : ne le contourne pas, dis-le dans ton compte-rendu.",
    "3. Rejoue toi-même ce qui a échoué (les gates du dépôt), puis commite sur cette branche.",
    "4. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    "5. Termine par ton compte-rendu, en clair : ce que tu as corrigé, ce que tu as vérifié et comment, ce qui reste. Ce dernier message est publié tel quel sur le ticket.",
    "",
    "Personne ne te répondra. S'il te manque une décision, ne la devine pas : arrête-toi et dis laquelle dans ton compte-rendu.",
  ].join("\n");
}

// Ce que la décision laisse à faire une fois sa transaction refermée.
type Suite = { commentaire: string } | { merge: { pr: string; number: number; sha: string } } | null;

// Rend le runtime, augmenté de sa pass. Son `arreter` l'emporte avec lui.
export function brancherPass<R extends RuntimeAvecRail>(runtime: R, options: OptionsPass): R & Pass {
  const { journal, projet, rail } = runtime;
  const { base } = journal;
  const { depot, github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const envGates = environnementCook(options.env ?? process.env);
  const noter = (ticket: number, fait: FaitPass) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

  let arrete = false;
  const abandon = new AbortController();
  // Cache, pas état : les gates déjà jouées sur un commit, le temps que sa CI
  // conclue. Le perdre coûte de les rejouer.
  const gatesJouees = new Map<number, { sha: string; gates: Gates }>();
  // Les issues déjà fermées, le temps que le sondage les sorte du rail.
  const fermees = new Set<number>();

  const commenter = async (ticket: number, corps: string) => {
    try {
      await github.commenter(ticket, corps);
    } catch (erreur) {
      if (!arrete) avertir(`brigade : commentaire de la pass non posté sur le ticket #${ticket} — ${message(erreur)}`);
    }
  };

  const enPass = (ticket: number) => ticketDuRail(base, ticket)?.state === "pass";

  // Le ticket mergé est servi, et son issue fermée par la pass : `Closes`
  // n'agit que sur la branche par défaut du dépôt.
  const finir = async (ticket: number) => {
    try {
      rail.servir(ticket);
    } catch (erreur) {
      // Déjà servi, ou remonté au chef (86) avant qu'il ne merge lui-même.
      if (!(erreur instanceof GesteRefuse)) throw erreur;
    }
    if (fermees.has(ticket)) return;
    await github.fermerIssue(ticket);
    fermees.add(ticket);
  };

  const constaterMerge = async (connu: PassDeTicket, pr: PR, par: "pass" | "outside", reconcilie: boolean) => {
    noter(connu.ticket, { type: "merge.done", payload: { pr: pr.url, sha: pr.sha, by: par, reconciled: reconcilie } });
    await finir(connu.ticket);
  };

  const remonter = async (connu: PassDeTicket, motif: MotifDeRemontee, pourquoi: string) => {
    const { ticket } = connu;
    base.transaction(() => {
      noter(ticket, { type: "pass.escalated", payload: { reason: motif } });
      rail.quatreVingtSix(ticket, { motif: `pass:${motif}` });
    });
    gatesJouees.delete(ticket);
    avertir(`brigade : la pass remonte le ticket #${ticket} au chef (${motif})`);
    await commenter(
      ticket,
      [
        `**Pass — remontée au chef (\`${motif}\`).** ${pourquoi}`,
        "",
        `Rien n'est mergé, et aucun cook n'est relancé : le ticket est 86.${connu.pr ? ` PR : ${connu.pr}.` : ""} Mergée à la main, la pass le verra et fermera le ticket ; retirer \`fire\` le sort du rail.`,
      ].join("\n"),
    );
  };

  // Décide de ce que devient une livraison jugée. Le grant est lu dans la
  // transaction qui écrit l'intention de merger : une révocation ne peut pas
  // se glisser entre les deux.
  const decider = async (ticket: number) => {
    const suite = base.transaction((): Suite => {
      const connu = passDuTicket(base, ticket);
      if (!connu || !enPass(ticket) || (connu.phase !== "green" && connu.phase !== "red")) return null;
      const { pr, number, sha } = connu;
      const livraison = `\`${court(sha)}\`${pr ? ` · ${pr}` : ""}`;

      if (connu.phase === "red") {
        const constat = ["", ...connu.findings.flatMap((finding) => [finding, ""])];
        if (connu.returns < RENVOIS_MAX) {
          const n = connu.returns + 1;
          noter(ticket, { type: "pass.returned", payload: { n, findings: connu.findings } });
          rail.rendre(ticket, PASS_ROUGE);
          return {
            commentaire: [
              `**Pass — rouge, renvoi ${n}/${RENVOIS_MAX}.** ${livraison}`,
              ...constat,
              "Le ticket est revenu en attente : la station relance un cook dessus, dans le même worktree et sur la même branche.",
            ].join("\n"),
          };
        }
        noter(ticket, { type: "pass.escalated", payload: { reason: "returns-exhausted" } });
        rail.quatreVingtSix(ticket, { motif: "pass:returns-exhausted" });
        return {
          commentaire: [
            `**Pass — rouge après ${RENVOIS_MAX} renvois : remontée au chef.** ${livraison}`,
            ...constat,
            "Rien n'est mergé, et aucun cook n'est relancé : le ticket est 86. Mergée à la main, la pass le verra et fermera le ticket ; retirer `fire` le sort du rail.",
          ].join("\n"),
        };
      }

      // Un verdict vert porte toujours sa PR et son commit.
      if (pr === null || number === null || sha === null) return null;
      if (connu.judgeModified) {
        noter(ticket, { type: "pass.held", payload: { reason: JUGES_MODIFIES } });
        return {
          commentaire: [
            `**Pass — verte, non mergée (\`${JUGES_MODIFIES}\`).** ${livraison}`,
            "",
            `Cette livraison touche à ce qui la juge (${JUGES.map((juge) => `\`${juge}\``).join(", ")}) : la pass ne la merge jamais elle-même, grant ou pas. À relire et merger à la main — la pass le verra et servira le ticket.`,
          ].join("\n"),
        };
      }
      if (!grantActif(base, "merge")) {
        noter(ticket, { type: "pass.held", payload: { reason: SANS_GRANT } });
        return {
          commentaire: [
            `**Pass — verte, non mergée (\`${SANS_GRANT}\`).** ${livraison}`,
            "",
            "Le grant `merge` n'est pas actif : la pass s'arrête là. À merger à la main — la pass le verra et servira le ticket. Activer le grant (`npm --prefix runtime run grant -- activer merge`) vaudra pour les livraisons suivantes, pas pour celle-ci.",
          ].join("\n"),
        };
      }
      noter(ticket, { type: "grant.used", payload: { action: "merge", pr, number, sha, base: options.base, verdict: connu.verdictSeq ?? 0 } });
      return { merge: { pr, number, sha } };
    });
    if (suite === null) return;
    if ("commentaire" in suite) return commenter(ticket, suite.commentaire);

    const { pr, number, sha } = suite.merge;
    let merge;
    try {
      merge = await github.merger(number, sha);
    } catch (erreur) {
      // Rien ne dit si le merge a eu lieu : l'intention reste sans résultat, et
      // se réconcilie au réveil suivant.
      if (!arrete) avertir(`brigade : merge du ticket #${ticket} sans réponse (${pr}) — ${message(erreur)}`);
      return;
    }
    if (arrete) return;
    if (!merge.fait) {
      const { motif } = merge;
      base.transaction(() => {
        noter(ticket, { type: "merge.failed", payload: { pr, sha, reason: motif } });
        noter(ticket, { type: "pass.held", payload: { reason: `merge-refused: ${motif}` } });
      });
      avertir(`brigade : merge du ticket #${ticket} refusé par GitHub (${pr}) — ${motif}`);
      return commenter(
        ticket,
        [`**Pass — verte, merge refusé par GitHub.** \`${court(sha)}\` · ${pr}`, "", `${motif}. La pass ne le retente pas : à merger à la main — elle le verra et servira le ticket.`].join("\n"),
      );
    }
    noter(ticket, { type: "merge.done", payload: { pr, sha, by: "pass", reconciled: false } });
    await finir(ticket);
    await commenter(ticket, `**Pass — verte, mergée sur \`${options.base}\` sous le grant \`merge\`.** \`${court(sha)}\` · ${pr}`);
  };

  // Juge une livraison. Tant qu'un juge n'a pas conclu (CI en cours, GitHub
  // injoignable), rien n'est écrit : le réveil suivant y revient.
  const juger = async (connu: PassDeTicket) => {
    const { ticket, run, branch } = connu;
    if (branch === null || connu.worktree === null) return;
    const worktree = resolve(options.repertoireEtat, connu.worktree);

    let pr = await github.prDeBranche(branch);
    if (pr === null) {
      // Son ouverture avait échoué à la fin du cook.
      const titre = ticketDuRail(base, ticket)?.title ?? "";
      await github.ouvrirPR({ branche: branch, base: options.base, titre: `#${ticket} — ${titre}`, corps: `Ticket #${ticket}.` });
      pr = await github.prDeBranche(branch);
    }
    if (arrete || pr === null) return;
    if (pr.merged) return constaterMerge(connu, pr, "outside", false);
    // Fermée sans merge : le chef a dit non. Le ticket reste en pass.
    if (pr.state === "closed") return;
    if (pr.base !== options.base) {
      return remonter(connu, "wrong-base", `La PR ${pr.url} vise \`${pr.base}\` : la pass ne juge et ne merge que vers \`${options.base}\`.`);
    }
    if (!aDesGates(worktree)) {
      return remonter(connu, "no-gates", `Le projet n'a pas de \`${SCRIPT_GATES}\` sur cette branche : sans gates, « vert » voudrait dire que personne n'a regardé.`);
    }

    const sha = depot.tete(worktree);
    if (connu.phase !== "judging" || connu.sha !== sha) noter(ticket, { type: "pass.started", payload: { run, pr: pr.url, number: pr.number, sha } });

    const findings: string[] = [];
    let gates: Gates;
    let ci: CI = { outcome: "skipped", checks: [] };
    const connues = gatesJouees.get(ticket);
    if (connues?.sha === sha) gates = connues.gates;
    else if (!depot.propre(worktree)) {
      // Les gates jugeraient autre chose que ce qui sera mergé.
      gates = { outcome: "skipped", code: null, failures: [], tail: "" };
      findings.push(
        "Le worktree porte des modifications non commitées sur des fichiers suivis : la pass ne juge que ce qui est commité. Commite ce qui fait partie de la livraison, annule le reste.",
      );
    } else {
      gates = await jouerGates({ worktree, ticket, env: envGates, delaiMs: options.delaiGatesMs, signal: abandon.signal });
      if (arrete) return;
      gatesJouees.set(ticket, { sha, gates });
    }

    if (gates.outcome === "green") {
      if (pr.mergeable === false) {
        findings.push(
          `Conflit avec \`${options.base}\` : la branche ne s'y merge plus telle quelle. Rapatrie la base (\`git fetch origin ${options.base}\`), rebase ta branche sur \`origin/${options.base}\`, résous, et rejoue les gates.`,
        );
      } else {
        const checks = await github.ci(sha);
        if (arrete) return;
        // Des workflows sans aucun check : la CI n'a pas encore démarré.
        const attendue = checks.length === 0 && aDesWorkflows(worktree);
        if (attendue || checks.some((check) => check.outcome === "pending")) {
          const depuis = Date.parse(passDuTicket(base, ticket)?.startedAt ?? "");
          if (!(maintenant().getTime() - depuis > options.attenteCiMs)) return;
          return remonter(
            connu,
            "ci-silent",
            `La CI du commit \`${court(sha)}\` n'a pas conclu en ${minutes(options.attenteCiMs)}${attendue ? " (aucun check, alors que la branche porte des workflows)" : ""}. Les gates, elles, sont vertes.`,
          );
        }
        const rouges = checks.filter((check) => check.outcome === "red");
        ci = { outcome: checks.length === 0 ? "none" : rouges.length > 0 ? "red" : "green", checks };
        findings.push(...rouges.map((check) => `CI rouge — job « ${check.name} » : ${check.conclusion}${check.url ? ` (${check.url})` : ""}.`));
      }
    } else if (gates.outcome !== "skipped") {
      findings.push(findingDesGates(gates, options.delaiGatesMs));
    }

    const judgeModified = depot.changes(worktree).some((fichier) => JUGES.some((juge) => fichier.startsWith(juge)));
    gatesJouees.delete(ticket);
    const verdict = findings.length === 0 ? "green" : "red";
    noter(ticket, { type: "pass.judged", payload: { run, pr: pr.url, number: pr.number, sha, verdict, gates, ci, findings, judgeModified } });
    if (verdict === "red") avertir(`brigade : pass rouge sur le ticket #${ticket} (${resume(gates, ci)})`);
    await decider(ticket);
  };

  // Une intention de merger restée sans résultat : GitHub dit ce qu'il en est.
  const reconcilier = async (connu: PassDeTicket) => {
    if (connu.branch === null) return;
    const pr = await github.prDeBranche(connu.branch);
    if (arrete || pr === null) return;
    if (pr.merged) return constaterMerge(connu, pr, "pass", true);
    noter(connu.ticket, { type: "merge.failed", payload: { pr: pr.url, sha: connu.sha ?? pr.sha, reason: "interrupted" } });
    await decider(connu.ticket);
  };

  // Un ticket que la pass a arrêté : si le chef a mergé sa PR, il est servi.
  const surveiller = async (connu: PassDeTicket) => {
    if (connu.branch === null) return;
    const pr = await github.prDeBranche(connu.branch);
    if (!arrete && pr?.merged) await constaterMerge(connu, pr, "outside", false);
  };

  const traiter = async (connu: PassDeTicket, tick: boolean) => {
    switch (connu.phase) {
      case "delivered":
      case "judging":
        if (enPass(connu.ticket)) await juger(connu);
        return;
      // Jugé, mais le runtime est mort avant de décider.
      case "green":
      case "red":
        return decider(connu.ticket);
      case "merging":
        return reconcilier(connu);
      case "merged":
        return finir(connu.ticket);
      // GitHub n'est relu qu'au tick : une fois par minute suffit.
      case "held":
      case "escalated":
        if (tick) await surveiller(connu);
        return;
      case "cooking":
      case "returned":
        return;
    }
  };

  // Une seule passe à la fois. Un réveil qui arrive pendant qu'elle juge n'est
  // pas perdu : elle repasse aussitôt finie.
  let enCours = false;
  let aRefaire = false;
  let tickDemande = false;
  const passer = (tick: boolean) => {
    if (arrete) return;
    tickDemande ||= tick;
    if (enCours) {
      aRefaire = true;
      return;
    }
    enCours = true;
    void (async () => {
      try {
        do {
          aRefaire = false;
          const avecTick = tickDemande;
          tickDemande = false;
          // Un ticket sorti du rail peut y revenir (issue rouverte) : son issue
          // sera alors à refermer.
          for (const ticket of fermees) if (ticketDuRail(base, ticket) === null) fermees.delete(ticket);
          for (const { ticket } of lirePass(base)) {
            if (arrete) return;
            try {
              const connu = passDuTicket(base, ticket);
              if (connu) await traiter(connu, avecTick);
            } catch (erreur) {
              // GitHub injoignable, worktree disparu : la livraison reste où
              // elle en est, et le tick suivant y revient.
              if (!arrete) avertir(`brigade : la pass a buté sur le ticket #${ticket} — ${message(erreur)}`);
            }
          }
        } while (aRefaire && !arrete);
      } catch (erreur) {
        if (!arrete) avertir(`brigade : la pass a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
      } finally {
        enCours = false;
      }
    })();
  };

  const desabonner = runtime.surReveil((cause) => passer(cause === "tick"));
  // Ce qui était en cours se retrouve : une intention de merger sans résultat
  // n'attend pas le premier tick.
  passer(true);

  return {
    ...runtime,
    reveillerPass: () => passer(false),
    arreter(signal) {
      arrete = true;
      abandon.abort();
      desabonner();
      runtime.arreter(signal);
    },
  };
}

function aDesWorkflows(worktree: string): boolean {
  try {
    return readdirSync(resolve(worktree, WORKFLOWS)).some((fichier) => /\.ya?ml$/.test(fichier));
  } catch {
    return false;
  }
}
