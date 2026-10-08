// La pass : elle juge ce qu'un cook a livré — les gates du projet dans son
// worktree, la relecture de son diff par le reviewer, la CI de son commit —
// puis décide. Verte, elle merge si le grant `merge` est actif, et s'arrête en
// le disant sinon ; rouge, elle renvoie les findings à un cook, deux fois au
// plus, puis remonte au chef. Sa boucle est du code ; elle n'appelle un modèle
// que pour relire, une fois par livraison, et jamais avant des gates vertes.
//
// Un ticket qui n'a produit aucun diff n'a ni gates, ni CI, ni PR : le
// reviewer est son seul juge, et vert, il est servi sans merge ni grant.
//
// Elle ne garde rien en mémoire qui compte : ce qu'il lui reste à faire se lit
// dans sa projection, donc tient après un redémarrage. Le merge est un effet
// sur le monde — son intention (`grant.used`) est écrite avant l'appel, son
// résultat après, et une intention sans résultat se réconcilie sur GitHub.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DE_CONFIANCE, type RuntimeAvecRail } from "./alimenter.ts";
import { environnementCook, lireFlux, verdict as finDuFlux, type Lecture } from "./claude.ts";
import type { Depot } from "./depot.ts";
import { JUGES_MODIFIES, SANS_GRANT, type CI, type FaitPass, type Finding, type Gates, type MotifDeRemontee, type Review } from "./evenements/pass.ts";
import type { FaitStation } from "./evenements/station.ts";
import { LancementRefuse, type GardeFous, type Verdict as VerdictGarde } from "./garde-fous.ts";
import { aDesGates, jouerGates, SCRIPT_GATES } from "./gates.ts";
import type { GitHub, PR } from "./github.ts";
import { etatDesGardeFous } from "./projections/garde-fous.ts";
import { grantActif, lirePass, passDuTicket, type PassDeTicket, type Relue } from "./projections/pass.ts";
import { ticketDuRail } from "./projections/rail.ts";
import { cookDeRun, etatStation } from "./projections/stations.ts";
import { GesteRefuse } from "./rail.ts";
import { argumentsReviewer, consigneDeRelecture, DE_LA_BRIGADE, DIFF_MAX, lireRelecture, REVIEWER, type ConfigReviewer } from "./reviewer.ts";
import { ConfigInvalide } from "./runtime.ts";
import type { Fin } from "./superviseur.ts";

const AUTEUR = "pass";
// Règle V1 conservée : au deuxième renvoi resté rouge, la pass cesse de renvoyer.
export const RENVOIS_MAX = 2;
// Le motif sous lequel un ticket rouge revient sur le rail.
export const PASS_ROUGE = "pass-red";
// Ce par quoi une livraison est jugée : qui y touche peut se rendre vert seul.
const JUGES = [".claude/brigade/", ".github/workflows/"];
const WORKFLOWS = ".github/workflows";
// La station dont les relectures consomment le quota : celle des cooks. Le
// nom est redit ici plutôt qu'importé — la station importe déjà la pass.
const STATION = "box/claude";
// Un quota épuisé qui ne dit pas quand il revient est retenté une heure après.
const REPLI_QUOTA_MS = 3_600_000;

const NON_JOUEES: Gates = { outcome: "skipped", code: null, failures: [], tail: "" };
const NON_RELU: Review = { outcome: "skipped", run: null, summary: null, findings: [] };

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
  // Le calibrage du reviewer.
  reviewer: ConfigReviewer;
  // `<owner>/<repo>`, pour la consigne du reviewer.
  depotGitHub: string;
  // Le binaire `claude`.
  bin: string;
  // L'environnement dont part celui des gates et du reviewer. Par défaut,
  // celui du runtime.
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
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const duree = (ms: number) => (ms >= 60_000 ? minutes(ms) : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`);
const bloquants = (findings: Finding[]) => findings.filter((finding) => finding.severity === "blocking");
const lieu = (finding: Finding) => (finding.file === null ? "" : ` (\`${finding.file}\`)`);

const constatsBloquants = (combien: number) => (combien === 1 ? "1 constat bloquant" : `${nombre(combien)} constats bloquants`);
const ditDuReviewer = (review: Review) =>
  ({ green: "rien de bloquant", red: constatsBloquants(bloquants(review.findings).length), skipped: "non appelé" })[review.outcome];

// Un constat bloquant du reviewer, tel qu'il repart au cook.
const findingDuReviewer = (finding: Finding) => `Relecture — constat bloquant${lieu(finding)} : ${finding.text}`;

function findingDesGates(gates: Gates, delaiMs: number): string {
  const titre =
    gates.outcome === "timeout"
      ? `Gates arrêtées : \`${SCRIPT_GATES}\` a dépassé son plafond de ${minutes(delaiMs)}.`
      : `Gates rouges : \`${SCRIPT_GATES}\` est sorti en ${gates.code ?? "erreur"}.`;
  return [titre, ...gates.failures, ...(gates.tail === "" ? [] : ["Fin de sortie :", "```", gates.tail, "```"])].join("\n");
}

function resume(gates: Gates, ci: CI, review: Review): string {
  const dites = { green: "vertes", red: "rouges", timeout: "arrêtées au plafond", skipped: "non jouées" }[gates.outcome];
  const lue = {
    green: `verte (${ci.checks.length} check${ci.checks.length > 1 ? "s" : ""})`,
    red: "rouge",
    none: "aucun check sur ce commit — le verdict repose sur les seules gates",
    skipped: "non lue",
  }[ci.outcome];
  return `gates ${dites} · CI : ${lue} · reviewer : ${ditDuReviewer(review)}`;
}

// La consigne d'un cook relancé sur un ticket que la pass a jugé rouge : il
// retrouve le travail, pas la conversation.
export function consigneDeRenvoi(mission: { ticket: number; titre: string; depot: string; base: string; branche: string; n: number; findings: string[] }): string {
  const { ticket, titre, depot, base, branche, n, findings } = mission;
  return [
    `Tu es un cook de la brigade : tu reprends un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    `Un cook a déjà livré ce ticket sur la branche \`${branche}\`, partie de \`${base}\`. La pass — les gates du dépôt, sa CI et la relecture du reviewer — a refusé sa livraison : c'est le renvoi ${n} sur ${RENVOIS_MAX}. Tu es dans son worktree, sur sa branche, avec ses commits.`,
    "",
    "Ce que la pass a trouvé :",
    "",
    ...findings.flatMap((finding) => [finding, ""]),
    `1. Relis le ticket : \`gh issue view ${ticket} --repo ${depot} --comments\`, et ce qui est déjà commité : \`git log origin/${base}..HEAD\`. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    "2. Corrige ce que la pass a trouvé, et rien d'autre. Un finding que tu tiens pour faux : ne le contourne pas, dis-le dans ton compte-rendu.",
    "3. Rejoue toi-même ce qui a échoué (les gates du dépôt), puis commite sur cette branche ce que tu as changé.",
    "4. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    "5. Termine par ton compte-rendu, en clair : ce que tu as corrigé, ce que tu as vérifié et comment, ce qui reste. Ce dernier message est publié tel quel sur le ticket.",
    "",
    "Personne ne te répondra. S'il te manque une décision, ne la devine pas : arrête-toi et dis laquelle dans ton compte-rendu.",
  ].join("\n");
}

// Ce que la décision laisse à faire une fois sa transaction refermée.
type Suite = { commentaire: string } | { service: string } | { merge: { pr: string; number: number; sha: string } } | null;

// Rend le runtime, augmenté de sa pass. Son `arreter` l'emporte avec lui.
export function brancherPass<R extends RuntimeAvecRail & GardeFous>(runtime: R, options: OptionsPass): R & Pass {
  const { journal, projet, rail } = runtime;
  const { base } = journal;
  const { depot, github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const envGates = environnementCook(options.env ?? process.env);
  const noter = (ticket: number | null, fait: FaitPass | FaitStation) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

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

  // Une relecture consomme le quota du compte : elle n'a pas lieu si le chef a
  // dit « stop », si le disjoncteur est ouvert, ou si la station dit le compte
  // épuisé ou déconnecté. La livraison attend, sans verdict.
  const peutRelire = (): boolean => {
    const garde = etatDesGardeFous(base);
    if (garde.stoppedAt !== null || garde.breakerOpenedAt !== null) return false;
    const station = etatStation(base, STATION);
    if (station?.disconnectedAt) return false;
    return !(station?.quotaUntil && station.quotaUntil > maintenant().toISOString());
  };

  // Le dernier message du cook qui a livré, tel que la station l'a rapporté.
  const compteRendu = (ticket: number, run: string): string | null => {
    const rapport = journal.duTicket(ticket).findLast((evenement) => evenement.type === "cook.reported" && evenement.payload.run === run);
    return rapport?.type === "cook.reported" ? rapport.payload.summary : null;
  };

  // Ce que le chef lit du reviewer, sur l'issue : chaque constat, bloquant ou
  // non, et ce que la relecture a coûté.
  const direRelecture = (connu: PassDeTicket, sha: string, relue: Relue, sansDiff: boolean): string => {
    const combien = bloquants(relue.findings).length;
    const cook = cookDeRun(base, relue.run);
    const calibrage = cook?.model && cook.effort ? ` en \`${cook.model}\` / \`${cook.effort}\`` : "";
    const mesure = cook?.turns == null ? "" : ` · ${pluriel(cook.turns, "tour")} · ${nombre(cook.tokens ?? 0)} tokens · ${duree(cook.durationMs ?? 0)}`;
    return [
      `**Reviewer — ${combien === 0 ? "rien de bloquant" : constatsBloquants(combien)}.** \`${court(sha)}\`${connu.pr ? ` · ${connu.pr}` : ""}${sansDiff ? " · ticket sans diff : c'est le compte-rendu du cook qui est relu" : ""}`,
      "",
      relue.summary ?? "",
      ...(relue.findings.length === 0 ? [] : [""]),
      ...relue.findings.map((finding) => `- **${finding.severity === "blocking" ? "Bloquant" : "Remarque"}**${lieu(finding)} — ${finding.text}`),
      "",
      `_Relu par le reviewer${calibrage}${mesure} — un autre process que le cook, sans droit d'écriture._`,
    ].join("\n");
  };

  // Fait relire une livraison. Rend la relecture — lisible ou non — une fois
  // qu'elle est au journal ; null si elle n'a pas abouti et reste à faire. La
  // même livraison (le run du cook, son commit) ne se relit jamais deux fois.
  const relire = async (connu: PassDeTicket, worktree: string, sha: string, sansDiff: boolean): Promise<Relue | null> => {
    const { ticket, run } = connu;
    if (connu.review?.cook === run && connu.review.sha === sha) return connu.review;
    if (!peutRelire()) return null;

    const issue = await github.issue(ticket);
    if (arrete || !issue) return null;
    const commentaires = (await github.commentaires(ticket))
      .filter((commentaire) => DE_CONFIANCE.includes(commentaire.association) && !DE_LA_BRIGADE.test(commentaire.body))
      .map((commentaire) => commentaire.body);
    if (arrete) return null;
    const diff = sansDiff ? null : { fichiers: depot.changes(worktree), texte: depot.diff(worktree) };
    const consigne = consigneDeRelecture({
      depot: options.depotGitHub,
      base: options.base,
      ticket: { number: ticket, title: issue.title, body: issue.body ?? "" },
      commentaires,
      compteRendu: compteRendu(ticket, run),
      diff,
    });

    const review = `review-${ticket}-${randomUUID().slice(0, 8)}`;
    let lecture: Lecture | null = null;
    let lue: ReturnType<typeof lireRelecture> | null = null;
    const conclure = (fin: Fin): VerdictGarde => {
      let flux = "";
      try {
        flux = readFileSync(join(options.repertoireEtat, "runs", `${review}.jsonl`), "utf8");
      } catch {
        // Sans flux, il n'y a pas de relecture.
      }
      lecture = lireFlux(flux);
      if (fin.arret) return "failed";
      const comment = finDuFlux(lecture, fin.code);
      if (comment === "86" || comment === "disconnected") return "neutral";
      if (comment !== "done") return "failed";
      lue = lireRelecture(lecture.message);
      // Une relecture réussie ne remet pas à zéro les échecs d'affilée des
      // cooks : elle ne compte ni pour ni contre.
      return "relecture" in lue ? "neutral" : "failed";
    };

    let lance;
    try {
      lance = runtime.lancer({
        // Hors ticket, comme un jugement du manager : le ticket a son cook, et
        // c'est `pass.reviewed` qui rattache cette relecture à sa livraison.
        ticket: null,
        run: review,
        contexte: { station: REVIEWER, ...options.reviewer.calibrage },
        commande: options.bin,
        args: argumentsReviewer(consigne, options.reviewer.calibrage),
        cwd: worktree,
        env: envGates,
        juger: conclure,
      });
    } catch (erreur) {
      // « stop » ou disjoncteur, arrivés depuis le dernier regard.
      if (erreur instanceof LancementRefuse) return null;
      throw erreur;
    }
    const fin = await lance.fin;
    if (arrete || fin.outcome === "stop" || fin.outcome === "interrupted") return null;

    const flux = lecture as Lecture | null;
    const relecture = lue as ReturnType<typeof lireRelecture> | null;
    const comment = fin.arret || !flux ? "failed" : finDuFlux(flux, fin.code);
    if (comment === "86") {
      const instant = maintenant();
      const annonce = flux?.quota?.retour ?? null;
      const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
      noter(null, { type: "station.86", payload: { station: STATION, reason: "quota", until: retour.toISOString(), window: flux?.quota?.fenetre ?? null } });
      return null;
    }
    if (comment === "disconnected") {
      noter(null, { type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: review } });
      avertir(`brigade : connexion Max absente ou expirée, vue par une relecture du reviewer — \`claude /login\` sous le compte du service, puis « reprendre »`);
      return null;
    }
    // Seule une relecture allée à son terme dit quelque chose de la livraison.
    // Tout le reste — binaire introuvable, panne, arrêt par un garde-fou — dit
    // quelque chose de la machine : rien n'est écrit, la relecture repart au
    // réveil suivant, et c'est le disjoncteur qui borne.
    if (comment !== "done" || !relecture) {
      const raison = fin.arret
        ? `guard:${fin.arret.reason}`
        : (fin.erreur ?? (fin.code === 0 ? "flux sans résultat" : fin.code === null ? `signal ${fin.signal}` : `code de sortie ${fin.code}`));
      avertir(`brigade : relecture du ticket #${ticket} non aboutie (${raison}) — elle sera retentée`);
      return null;
    }
    const truncated = diff !== null && diff.texte.length > DIFF_MAX;
    // Le ticket a pu quitter le rail pendant la relecture : elle n'a plus d'objet.
    if (!enPass(ticket) || passDuTicket(base, ticket)?.run !== run) return null;
    if ("illisible" in relecture) {
      noter(ticket, { type: "pass.reviewed", payload: { run, sha, review, outcome: "unreadable", summary: null, findings: [], reason: relecture.illisible, truncated } });
      avertir(`brigade : relecture illisible sur le ticket #${ticket} (${relecture.illisible}) — ni verte ni rouge`);
      return passDuTicket(base, ticket)?.review ?? null;
    }
    const { verdict, summary, findings } = relecture.relecture;
    noter(ticket, { type: "pass.reviewed", payload: { run, sha, review, outcome: verdict, summary, findings, reason: null, truncated } });
    const relue = passDuTicket(base, ticket)?.review ?? null;
    if (relue) await commenter(ticket, direRelecture(connu, sha, relue, sansDiff));
    return relue;
  };

  // Une relecture qui ne se lit pas n'est ni verte ni rouge : aucun cook ne
  // peut la corriger, elle remonte.
  const remonterIllisible = (connu: PassDeTicket, relue: Relue) =>
    remonter(
      connu,
      "review-unreadable",
      `Le reviewer a relu cette livraison, mais sa réponse ne se lit pas (${relue.reason ?? "illisible"}) : ni verte ni rouge. Son flux brut est dans \`runs/${relue.run}.jsonl\`.`,
    );

  // Décide de ce que devient une livraison jugée. Le grant est lu dans la
  // transaction qui écrit l'intention de merger : une révocation ne peut pas
  // se glisser entre les deux.
  const decider = async (ticket: number) => {
    const suite = base.transaction((): Suite => {
      const connu = passDuTicket(base, ticket);
      if (!connu || !enPass(ticket) || (connu.phase !== "green" && connu.phase !== "red")) return null;
      const { pr, number, sha } = connu;
      const livraison = `\`${court(sha)}\`${pr ? ` · ${pr}` : ""}${connu.noDiff ? " · ticket sans diff" : ""}`;

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

      // Sans diff, il n'y a rien à merger : ni grant, ni PR. Le ticket est
      // servi sur la foi de sa relecture.
      if (connu.noDiff) {
        noter(ticket, { type: "pass.served", payload: { verdict: connu.verdictSeq ?? 0 } });
        return {
          service: [
            `**Pass — verte, servie sans merge.** ${livraison}`,
            "",
            "Ce ticket n'a produit aucun diff : il n'y a rien à merger, et ni les gates ni la CI n'avaient rien à en dire. Le reviewer était son seul juge ; il n'a rien trouvé de bloquant. Le livrable est le compte-rendu du cook, plus haut sur cette issue, que la pass ferme.",
          ].join("\n"),
        };
      }
      // Un verdict vert sur un diff porte toujours sa PR et son commit.
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
    if ("service" in suite) {
      await finir(ticket);
      return commenter(ticket, suite.service);
    }

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
    if (arrete) return;
    // Ni PR ni commit : le cook n'a livré que son compte-rendu.
    if (pr === null && depot.commits(worktree) === 0) return jugerSansDiff(connu, worktree);
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
    let review = NON_RELU;
    const connues = gatesJouees.get(ticket);
    if (connues?.sha === sha) gates = connues.gates;
    else if (!depot.propre(worktree)) {
      // Les gates jugeraient autre chose que ce qui sera mergé.
      gates = NON_JOUEES;
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
        // Relu avant de lire la CI : elle conclut pendant ce temps, et un cook
        // renvoyé repart avec tout ce qui a été trouvé, pas la moitié.
        const relue = await relire(connu, worktree, sha, false);
        if (arrete || relue === null) return;
        if (relue.outcome === "unreadable") return remonterIllisible(connu, relue);
        review = { outcome: relue.outcome, run: relue.run, summary: relue.summary, findings: relue.findings };
        const checks = await github.ci(sha);
        if (arrete) return;
        // Des workflows sans aucun check : la CI n'a pas encore démarré.
        const attendue = checks.length === 0 && aDesWorkflows(worktree);
        const enCours = attendue || checks.some((check) => check.outcome === "pending");
        // Un constat bloquant n'attend pas la CI : le verdict est déjà rouge,
        // et elle sera lue sur le commit qui le corrige.
        if (enCours && review.outcome !== "red") {
          const depuis = Date.parse(passDuTicket(base, ticket)?.startedAt ?? "");
          if (!(maintenant().getTime() - depuis > options.attenteCiMs)) return;
          return remonter(
            connu,
            "ci-silent",
            `La CI du commit \`${court(sha)}\` n'a pas conclu en ${minutes(options.attenteCiMs)}${attendue ? " (aucun check, alors que la branche porte des workflows)" : ""}. Les gates, elles, sont vertes.`,
          );
        }
        if (!enCours) {
          const rouges = checks.filter((check) => check.outcome === "red");
          ci = { outcome: checks.length === 0 ? "none" : rouges.length > 0 ? "red" : "green", checks };
          findings.push(...rouges.map((check) => `CI rouge — job « ${check.name} » : ${check.conclusion}${check.url ? ` (${check.url})` : ""}.`));
        }
        findings.push(...bloquants(review.findings).map(findingDuReviewer));
      }
    } else if (gates.outcome !== "skipped") {
      findings.push(findingDesGates(gates, options.delaiGatesMs));
    }

    const judgeModified = depot.changes(worktree).some((fichier) => JUGES.some((juge) => fichier.startsWith(juge)));
    gatesJouees.delete(ticket);
    const verdict = findings.length === 0 ? "green" : "red";
    noter(ticket, { type: "pass.judged", payload: { run, pr: pr.url, number: pr.number, sha, verdict, gates, ci, review, findings, judgeModified, noDiff: false } });
    if (verdict === "red") avertir(`brigade : pass rouge sur le ticket #${ticket} (${resume(gates, ci, review)})`);
    await decider(ticket);
  };

  // Juge un ticket sans diff : ni gates, ni CI, ni PR — le reviewer relit le
  // compte-rendu du cook, et il est le seul juge. Sans lui, pas de verdict.
  const jugerSansDiff = async (connu: PassDeTicket, worktree: string) => {
    const { ticket, run } = connu;
    const sha = depot.tete(worktree);
    if (connu.phase !== "judging" || connu.sha !== sha) noter(ticket, { type: "pass.started", payload: { run, pr: null, number: null, sha } });

    const findings: string[] = [];
    let review = NON_RELU;
    if (compteRendu(ticket, run) === null) {
      findings.push("Ni diff ni compte-rendu : le cook n'a rien livré qui puisse être relu. Le livrable d'un ticket sans diff est ton dernier message — écris-le.");
    } else {
      const relue = await relire(connu, worktree, sha, true);
      if (arrete || relue === null) return;
      if (relue.outcome === "unreadable") return remonterIllisible(connu, relue);
      review = { outcome: relue.outcome, run: relue.run, summary: relue.summary, findings: relue.findings };
      findings.push(...bloquants(review.findings).map(findingDuReviewer));
    }

    const verdict = findings.length === 0 ? "green" : "red";
    const ci: CI = { outcome: "skipped", checks: [] };
    noter(ticket, {
      type: "pass.judged",
      payload: { run, pr: null, number: null, sha, verdict, gates: NON_JOUEES, ci, review, findings, judgeModified: false, noDiff: true },
    });
    if (verdict === "red") avertir(`brigade : pass rouge sur le ticket #${ticket}, sans diff (reviewer : ${ditDuReviewer(review)})`);
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
      case "served":
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
