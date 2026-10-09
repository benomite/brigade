// La pass : elle juge ce qu'un cook a livré — les gates du projet dans son
// worktree, la relecture de son diff par le reviewer, la CI de son commit —
// puis décide. Verte, elle merge si le grant `merge` est actif, et s'arrête en
// le disant sinon ; rouge, elle renvoie les findings à un cook, deux fois au
// plus, puis remonte au chef. Manager allumé, elle lui passe la main dès le
// second rouge : c'est lui qui monte le calibrage du second renvoi, puis qui
// choisit la suite. Sa boucle est du code ; elle n'appelle un modèle que pour
// relire, une fois par livraison, et jamais avant des gates vertes.
//
// Un ticket qui n'a produit aucun diff n'a ni gates, ni CI, ni PR : le
// reviewer est son seul juge, et vert, il est servi sans merge ni grant.
//
// Ce qu'elle juge est la branche du cook ; ce qu'elle merge rencontre la base
// telle qu'elle est devenue entre-temps. Avant de merger, elle regarde donc si
// la base a avancé : sur d'autres fichiers, elle merge et fait jouer les gates
// sur la base elle-même, après coup et hors ticket ; sur les mêmes, elle
// rejoue d'abord les gates sur le résultat du merge, dans un worktree jetable.
// Tant que la base est rouge, elle ne merge plus rien sous grant.
//
// Un ticket peut quitter le rail sous elle — issue fermée, `fire` retiré. Elle
// lâche alors sa livraison : plus de relecture, plus de renvoi, plus de merge,
// et la relecture en cours est arrêtée. Elle ne ferme ni la PR ni la branche :
// si la PR est encore ouverte, elle le dit une fois sur l'issue, et c'est au
// chef d'en décider.
//
// Elle ne garde rien en mémoire qui compte : ce qu'il lui reste à faire se lit
// dans sa projection, donc tient après un redémarrage. Le merge est un effet
// sur le monde — son intention (`grant.used`) est écrite avant l'appel, son
// résultat après, et une intention sans résultat se réconcilie sur GitHub.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DE_CONFIANCE, type RuntimeAvecRail } from "./alimenter.ts";
import { direRefus, environnementCook, lireFlux, REFUS_MAX, verdict as finDuFlux, type Lecture } from "./claude.ts";
import type { Depot } from "./depot.ts";
import {
  BASE_ROUGE,
  JUGES_MODIFIES,
  MACHINE_SATUREE,
  SANS_GRANT,
  type CI,
  type FaitPass,
  type Finding,
  type Gates,
  type MotifDAttente,
  type MotifDeRemontee,
  type Review,
} from "./evenements/pass.ts";
import type { FaitStation } from "./evenements/station.ts";
import { LancementRefuse, type CookLance, type GardeFous, type Verdict as VerdictGarde } from "./garde-fous.ts";
import { aDesGates, jouerGates, SCRIPT_GATES } from "./gates.ts";
import type { GitHub, PR } from "./github.ts";
import { configMachine, direSaturation, lireMachine, saturation, type Machine, type Saturation, type Seuils } from "./machine.ts";
import { ouvrirNettoyage } from "./nettoyage.ts";
import { etatDesGardeFous } from "./projections/garde-fous.ts";
import { managerAllume } from "./projections/manager.ts";
import { etatDeLaBase, grantActif, lirePass, mergesAVerifier, orphelines, passDuTicket, type Orpheline, type PassDeTicket, type Relue } from "./projections/pass.ts";
import { communsDuRail, ticketDuRail } from "./projections/rail.ts";
import { cookDeRun, etatStation, refusDAffilee } from "./projections/stations.ts";
import { GesteRefuse, nomAbandon } from "./rail.ts";
import { argumentsReviewer, CONSIGNE_MAX, consigneDeRelecture, DE_LA_BRIGADE, diffCoupe, lireRelecture, REVIEWER, type ConfigReviewer } from "./reviewer.ts";
import { ConfigInvalide } from "./runtime.ts";
import type { Fin } from "./superviseur.ts";
import { possede } from "./zones.ts";

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

// Les phases d'une livraison verte qui n'est ni mergée ni arrêtée.
const VERTES = ["green", "replaying", "waiting"];
const NON_JOUEES: Gates = { outcome: "skipped", code: null, failures: [], tail: "" };
const NON_RELU: Review = { outcome: "skipped", run: null, summary: null, findings: [] };

const DELAI_PAR_DEFAUT_S = 1800;
// Les worktrees jetables de la pass : celui d'une rencontre, par ticket, et
// celui de la base.
const essaiDeRencontre = (ticket: number) => `rencontre-${ticket}`;
const ESSAI_DE_BASE = "base";
// Ce qu'un fait garde des fichiers par lesquels une livraison croise la base.
const CROISES_MAX = 20;

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
  // Ce que la machine doit garder pour que la pass rejoue des gates — sur le
  // résultat d'un merge, sur la base —, et de quoi la lire : les seuils et la
  // machine de la station. Par défaut : les seuils par défaut, la vraie machine.
  seuils?: Seuils;
  machine?: () => Machine;
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

// Un renvoi tel qu'il se dit : passé les deux de la pass, c'est une relance
// que le manager a décidée.
const nomDuRenvoi = (n: number) => (n <= RENVOIS_MAX ? `le renvoi ${n} sur ${RENVOIS_MAX}` : `une relance décidée par le manager, après ${RENVOIS_MAX} renvois restés rouges`);

// La consigne d'un cook relancé sur un ticket que la pass a jugé rouge : il
// retrouve le travail, pas la conversation.
export function consigneDeRenvoi(mission: { ticket: number; titre: string; depot: string; base: string; branche: string; n: number; findings: string[] }): string {
  const { ticket, titre, depot, base, branche, n, findings } = mission;
  return [
    `Tu es un cook de la brigade : tu reprends un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    `Un cook a déjà livré ce ticket sur la branche \`${branche}\`, partie de \`${base}\`. La pass — les gates du dépôt, sa CI et la relecture du reviewer — a refusé sa livraison : c'est ${nomDuRenvoi(n)}. Tu es dans son worktree, sur sa branche, avec ses commits.`,
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

// Ce que le chef peut faire d'un ticket remonté : merger sa PR — s'il en a une.
const suiteDuChef = (pr: string | null) =>
  pr
    ? "Mergée à la main, la pass le verra et fermera le ticket ; retirer `fire` le sort du rail."
    : "Il n'a pas de PR, donc rien à merger : retirer `fire` le sort du rail, ou ferme l'issue si le compte-rendu du cook, plus haut, suffit.";

const rebaser = (base: string) => `Rapatrie la base (\`git fetch origin ${base}\`), rebase ta branche sur \`origin/${base}\``;
const findingDeConflit = (base: string) => `Conflit avec \`${base}\` : la branche ne s'y merge plus telle quelle. ${rebaser(base)}, résous, et rejoue les gates.`;
const commits = (combien: number) => pluriel(combien, "commit");
const citer = (fichiers: string[]) => `${fichiers.slice(0, 5).map((fichier) => `\`${fichier}\``).join(", ")}${fichiers.length > 5 ? `, et ${nombre(fichiers.length - 5)} de plus` : ""}`;

// Ce que la décision laisse à faire une fois sa transaction refermée.
// `rencontre` : la livraison est à merger, reste à voir ce que la base est
// devenue.
type Suite = { commentaire: string } | { service: string } | { rencontre: true } | { merge: { pr: string; number: number; sha: string; branche: string | null } } | null;

// Ce que la pass a vu de la base avant de merger. `note` : ce qu'elle en dit
// sur l'issue, une fois la livraison mergée — rien si la base n'avait pas bougé.
type Rencontre = "wait" | "red" | { note: string | null };

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
  let aRefaire = false;
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

  // Un merge fait hors du runtime a atterri sur une base que personne n'a
  // regardée ; celui de la pass, s'il s'est fait sans rejeu sur une base qui
  // avait avancé, non plus.
  const aVerifier = (ticket: number, par: "pass" | "outside") => par === "outside" || passDuTicket(base, ticket)?.unverified === true;

  const constaterMerge = async (connu: PassDeTicket, pr: PR, par: "pass" | "outside", reconcilie: boolean) => {
    noter(connu.ticket, { type: "merge.done", payload: { pr: pr.url, sha: pr.sha, by: par, reconciled: reconcilie, unverified: aVerifier(connu.ticket, par) } });
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
        `Rien n'est mergé, et aucun cook n'est relancé : le ticket est 86.${connu.pr ? ` PR : ${connu.pr}.` : ""} ${suiteDuChef(connu.pr)}`,
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
    const mission = {
      depot: options.depotGitHub,
      base: options.base,
      ticket: { number: ticket, title: issue.title, body: issue.body ?? "" },
      commentaires,
      compteRendu: compteRendu(ticket, run),
      diff,
    };
    const consigne = consigneDeRelecture(mission);
    // Une consigne que le système refuserait de passer à `claude` ne se lance
    // pas : elle échouerait à chaque réveil, sans verdict ni remontée.
    const poids = Buffer.byteLength(consigne);
    if (poids > CONSIGNE_MAX) {
      return remonter(connu, "review-unsendable", `La consigne du reviewer pèse ${nombre(poids)} octets, plus que ce qu'une commande accepte (${nombre(CONSIGNE_MAX)}) : cette livraison ne peut pas être relue par le runtime.`).then(() => null);
    }

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
      if (comment === "refused") return "refused";
      if (comment !== "done") return "failed";
      lue = lireRelecture(lecture.message);
      // Une relecture réussie ne remet pas à zéro les échecs d'affilée des
      // cooks : elle ne compte ni pour ni contre.
      return "relecture" in lue ? "neutral" : "failed";
    };

    // Le ticket a pu quitter le rail pendant les gates : aucune relecture ne
    // part pour lui.
    if (!enPass(ticket)) return null;
    let lance: CookLance;
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
    // Le ticket qui quitte le rail pendant sa relecture l'arrête : elle n'a
    // plus d'objet, et ne consomme plus rien.
    const guetter = runtime.surSondage(() => {
      if (!enPass(ticket)) lance.arreter();
    });
    const fin = await lance.fin.finally(guetter);
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
    // Le modèle a refusé de relire. Ce n'est pas une panne : la relecture
    // repart au réveil suivant, mais pas sans fin — au-delà, elle remonte.
    if (comment === "refused") {
      const refus = refusDAffilee(base, `review-${ticket}-`);
      avertir(`brigade : relecture du ticket #${ticket} refusée par le modèle (${direRefus(flux)}), essai ${Math.min(refus, REFUS_MAX)}/${REFUS_MAX}`);
      if (refus < REFUS_MAX || !enPass(ticket) || passDuTicket(base, ticket)?.run !== run) return null;
      await remonter(
        connu,
        "review-refused",
        `Le modèle a refusé ${refus} fois d'affilée de relire cette livraison — ${direRefus(flux)}, \`stop_reason: refusal\` : ni verte ni rouge. Ce n'est ni une panne ni un échec — le disjoncteur ne le compte pas —, mais la même consigne, relancée à l'identique, serait sans doute refusée encore. Flux brut du dernier refus : \`runs/${review}.jsonl\`.`,
      );
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
    const truncated = diff !== null && diffCoupe(diff);
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

  // Écrit le verdict. Sur la livraison d'une relance du manager, il compte au
  // disjoncteur : rouge, c'est un échec de plus.
  const prononcer = (connu: PassDeTicket, jugement: Extract<FaitPass, { type: "pass.judged" }>["payload"]) => {
    base.transaction(() => {
      noter(connu.ticket, { type: "pass.judged", payload: jugement });
      if (connu.returns > RENVOIS_MAX) runtime.jugerRelance(connu.ticket, connu.run, jugement.verdict);
    });
  };

  // Un verdict vert qui ne tient plus face à la base : il devient rouge, par
  // ces faits. Sur la livraison d'une relance du manager, il compte au
  // disjoncteur comme un verdict rouge.
  const rougir = (connu: PassDeTicket, faits: FaitPass[]) => {
    base.transaction(() => {
      for (const fait of faits) noter(connu.ticket, fait);
      if (connu.returns > RENVOIS_MAX) runtime.jugerRelance(connu.ticket, connu.run, "red");
    });
  };

  // Rejouer des gates consomme la machine, comme un cook : la pass lit celle de
  // la station, sous les mêmes seuils. Illisible, elle ne retient rien.
  const machine = options.machine ?? (() => lireMachine(options.repertoireEtat));
  const seuils = options.seuils ?? configMachine({});
  const sature = (): Saturation | null => {
    try {
      return saturation(machine(), seuils);
    } catch {
      return null;
    }
  };

  // Joue les gates dans un worktree jetable, retiré quoi qu'il arrive — et
  // d'abord celui qu'un rejeu interrompu aurait laissé. Rend null si le
  // worktree ne se fait pas : le merge est en conflit.
  const essayer = async (nom: string, ticket: number, sha?: string): Promise<Gates | null> => {
    try {
      depot.jeter(nom);
      const essai = await depot.essayer(nom, sha);
      if (essai === null) return null;
      if (!aDesGates(essai)) return NON_JOUEES;
      return await jouerGates({ worktree: essai, ticket, env: envGates, delaiMs: options.delaiGatesMs, signal: abandon.signal });
    } finally {
      depot.jeter(nom);
    }
  };

  // La livraison verte attend, et le dit une fois.
  const attendre = async (connu: PassDeTicket, motif: MotifDAttente, pourquoi: string): Promise<"wait"> => {
    if (connu.phase === "waiting" && connu.reason === motif) return "wait";
    noter(connu.ticket, { type: "pass.waiting", payload: { reason: motif } });
    await commenter(connu.ticket, [`**Pass — verte, en attente (\`${motif}\`).** \`${court(connu.sha)}\`${connu.pr ? ` · ${connu.pr}` : ""}`, "", pourquoi].join("\n"));
    return "wait";
  };

  // Regarde ce que la base est devenue sous une livraison verte, avant de la
  // merger. Deux livraisons vertes séparément peuvent casser la base ensemble :
  // les gates n'ont jugé que la branche.
  const rencontrer = async (ticket: number): Promise<Rencontre> => {
    const connu = passDuTicket(base, ticket);
    if (!connu || connu.worktree === null || connu.sha === null) return "wait";
    const { sha } = connu;
    const controle = etatDeLaBase(base);
    if (controle?.outcome === "red") {
      return attendre(
        connu,
        BASE_ROUGE,
        `\`${options.base}\` est rouge : ses gates, jouées sur elle-même après merge, ont échoué sur \`${court(controle.sha)}\`. Tant qu'elle l'est, la pass ne merge rien sous grant. Rien n'est à refaire sur cette livraison : elle sera mergée seule dès que \`${options.base}\` sera réparée — la pass rejoue ses gates dès qu'elle bouge. La merger à la main reste possible.`,
      );
    }
    const worktree = resolve(options.repertoireEtat, connu.worktree);
    if (!depot.present(worktree)) {
      await remonter(connu, "worktree-lost", `Le worktree de cette livraison n'existe plus (\`${connu.worktree}\`) : la pass ne peut plus dire si \`${options.base}\` a avancé sous elle, et ne merge pas à l'aveugle.`);
      return "wait";
    }
    const tete = await depot.rapatrier();
    if (arrete) return "wait";
    const { depart, commits: retard } = depot.retard(worktree);
    if (retard === 0) return { note: null };
    const rejouee = `\`${options.base}\` avait avancé sur des fichiers que cette livraison touche aussi : les gates ont été rejouées sur le résultat du merge avant de merger, et elles sont vertes.`;
    if (connu.checkedBase === tete) return { note: rejouee };

    // Ce que la base a reçu depuis le dernier état où cette livraison a été
    // vérifiée avec elle : son départ, ou un rejeu déjà vert.
    const depuis = connu.checkedBase ?? depart;
    const communs = communsDuRail(base);
    const arrives = new Set(depot.arrives(depuis));
    const croises = depot.changes(worktree).filter((fichier) => arrives.has(fichier) && !communs.some((commun) => possede(commun, fichier)));
    const vu = { sha, base: tete, from: depuis, behind: retard, overlap: croises.slice(0, CROISES_MAX) };
    if (croises.length === 0) {
      if (connu.movedBase !== tete) noter(ticket, { type: "pass.base-moved", payload: { ...vu, replay: false } });
      return {
        note: `\`${options.base}\` avait avancé de ${commits(retard)} depuis le départ de cette branche, sans toucher à aucun de ses fichiers${communs.length === 0 ? "" : " (chemins communs mis à part)"} : mergée sans rejouer les gates. Elles sont jouées sur \`${options.base}\` elle-même après ce merge, et la pass le dira ici si elles sont rouges.`,
      };
    }

    const pleine = sature();
    if (pleine) {
      return attendre(
        connu,
        MACHINE_SATUREE,
        `\`${options.base}\` a avancé sur des fichiers que cette livraison touche aussi (${citer(croises)}) : avant de merger, les gates sont à rejouer sur le résultat du merge. La machine n'a pas de quoi les jouer pour l'instant — ${direSaturation(pleine)}. La pass y revient seule.`,
      );
    }
    if (connu.movedBase !== tete || connu.phase !== "replaying") noter(ticket, { type: "pass.base-moved", payload: { ...vu, replay: true } });
    let gates: Gates | null;
    try {
      gates = await essayer(essaiDeRencontre(ticket), ticket, sha);
    } catch (erreur) {
      // Le worktree jetable ne s'est pas fait, et ce n'est pas un conflit :
      // une panne de la machine ne dit rien de la livraison, aucun cook ne la
      // lèverait, et la retenter à chaque réveil ne finirait pas.
      if (arrete) return "wait";
      await remonter(
        connu,
        "replay-failed",
        `\`${options.base}\` a avancé sur des fichiers que cette livraison touche aussi (${citer(croises)}), et la pass n'a pas pu rejouer les gates sur le résultat du merge : ${message(erreur)}. Ce n'est ni un conflit ni un verdict — la livraison reste verte seule, rien ne dit ce qu'elle vaut avec \`${options.base}\`.`,
      );
      return "wait";
    }
    // Le ticket a pu quitter le rail, ou être rejugé, pendant le rejeu.
    if (arrete || !enPass(ticket) || passDuTicket(base, ticket)?.verdictSeq !== connu.verdictSeq) return "wait";
    if (gates?.outcome === "green") {
      noter(ticket, { type: "pass.replayed", payload: { sha, base: tete, gates, findings: [] } });
      return { note: rejouee };
    }
    const findings =
      gates === null
        ? [findingDeConflit(options.base)]
        : [
            [
              `Rencontre avec \`${options.base}\` : la branche est verte seule, mais les gates ne passent plus sur le résultat de son merge. \`${options.base}\` a reçu ${commits(retard)} depuis son départ, dont des changements sur des fichiers que cette livraison touche aussi (${citer(croises)}). ${rebaser(options.base)}, corrige ce que la rencontre casse, et rejoue les gates.`,
              gates.outcome === "skipped" ? `Le résultat du merge n'a plus de \`${SCRIPT_GATES}\`.` : findingDesGates(gates, options.delaiGatesMs),
            ].join("\n"),
          ];
    rougir(connu, [{ type: "pass.replayed", payload: { sha, base: tete, gates: gates ?? NON_JOUEES, findings } }]);
    avertir(`brigade : pass rouge sur le ticket #${ticket} — ${gates === null ? "conflit avec" : "gates rouges sur le résultat du merge dans"} ${options.base}, qui a avancé de ${commits(retard)}`);
    return "red";
  };
  // Décide de ce que devient une livraison jugée. Le grant est lu dans la
  // transaction qui écrit l'intention de merger : une révocation ne peut pas
  // se glisser entre les deux. `vue` : ce que la pass vient de voir de la base
  // — sans quoi une livraison à merger commence par là.
  const decider = async (ticket: number, vue?: { note: string | null }): Promise<void> => {
    const suite = base.transaction((): Suite => {
      const connu = passDuTicket(base, ticket);
      if (!connu || !enPass(ticket)) return null;
      const verte = VERTES.includes(connu.phase);
      if (!verte && connu.phase !== "red" && connu.phase !== "deferred") return null;
      const { pr, number, sha } = connu;
      const livraison = `\`${court(sha)}\`${pr ? ` · ${pr}` : ""}${connu.noDiff ? " · ticket sans diff" : ""}`;

      if (!verte) {
        const constat = ["", ...connu.findings.flatMap((finding) => [finding, ""])];
        // Dès le second rouge, la suite est au manager, s'il est allumé : le
        // ticket reste en pass, pour qu'aucun cook ne reparte avant lui.
        if (managerAllume(base) && connu.returns >= 1) {
          if (connu.phase === "deferred") return null;
          noter(ticket, { type: "pass.deferred", payload: {} });
          return {
            commentaire: [
              `**Pass — rouge${connu.returns < RENVOIS_MAX ? "" : ` après ${connu.returns} renvois`} : au manager.** ${livraison}`,
              ...constat,
              connu.returns < RENVOIS_MAX
                ? "Avant le second renvoi, le manager monte le calibrage d'un cran s'il le peut : le ticket reste en pass jusque-là."
                : "Les renvois sont épuisés : le manager choisit la suite — monter le calibrage, redécouper le ticket, ou te le remonter — et la dit ici.",
            ].join("\n"),
          };
        }
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
            `Rien n'est mergé, et aucun cook n'est relancé : le ticket est 86. ${suiteDuChef(pr)}`,
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
      if (vue === undefined) return { rencontre: true };
      noter(ticket, { type: "grant.used", payload: { action: "merge", pr, number, sha, base: options.base, verdict: connu.verdictSeq ?? 0 } });
      return { merge: { pr, number, sha, branche: connu.branch } };
    });
    if (suite === null) return;
    if ("commentaire" in suite) return commenter(ticket, suite.commentaire);
    if ("service" in suite) {
      await finir(ticket);
      return commenter(ticket, suite.service);
    }
    if ("rencontre" in suite) {
      const rencontre = await rencontrer(ticket);
      if (arrete || rencontre === "wait") return;
      // Rouge, la décision se reprend sur ce verdict-là ; sinon elle merge,
      // grant relu.
      return decider(ticket, rencontre === "red" ? undefined : rencontre);
    }

    const { pr, number, sha, branche } = suite.merge;
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
      // Le dépôt exige une branche à jour, et celle-ci ne l'est plus : ce
      // refus-là, un cook le lève en rebasant.
      const connu = passDuTicket(base, ticket);
      const relue = branche === null ? null : await github.prDeBranche(branche).catch(() => null);
      if (arrete) return;
      // Le chef l'a mergée entre-temps : GitHub refuse de la merger deux fois.
      if (connu && relue?.merged) {
        noter(ticket, { type: "merge.failed", payload: { pr, sha, reason: motif } });
        return constaterMerge(connu, relue, "outside", false);
      }
      if (connu && relue?.enRetard) {
        rougir(connu, [
          { type: "merge.failed", payload: { pr, sha, reason: motif } },
          {
            type: "pass.outdated",
            payload: {
              sha,
              findings: [
                `Branche en retard sur \`${options.base}\` : le dépôt exige une branche à jour pour merger, et GitHub a refusé (${motif}). ${rebaser(options.base)}, et rejoue les gates.`,
              ],
            },
          },
        ]);
        avertir(`brigade : merge du ticket #${ticket} refusé par GitHub, branche en retard sur ${options.base} (${pr}) — elle repart au cook`);
        return decider(ticket);
      }
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
    noter(ticket, { type: "merge.done", payload: { pr, sha, by: "pass", reconciled: false, unverified: aVerifier(ticket, "pass") } });
    await finir(ticket);
    await commenter(ticket, [`**Pass — verte, mergée sur \`${options.base}\` sous le grant \`merge\`.** \`${court(sha)}\` · ${pr}`, ...(vue?.note ? ["", vue.note] : [])].join("\n"));
  };

  // Juge une livraison. Tant qu'un juge n'a pas conclu (CI en cours, GitHub
  // injoignable), rien n'est écrit : le réveil suivant y revient.
  const juger = async (connu: PassDeTicket) => {
    const { ticket, run, branch } = connu;
    if (branch === null || connu.worktree === null) return;
    const worktree = resolve(options.repertoireEtat, connu.worktree);

    let pr = await github.prDeBranche(branch);
    if (arrete) return;
    // Sans worktree, la pass ne juge rien — mais elle lit encore GitHub : une
    // PR déjà mergée ou fermée se traite comme d'habitude.
    if (pr?.merged) return constaterMerge(connu, pr, "outside", false);
    if (pr?.state === "closed") return;
    if (!depot.present(worktree)) {
      return remonter(
        connu,
        "worktree-lost",
        `Le worktree de cette livraison n'existe plus (\`${connu.worktree}\`) : la pass n'a plus où jouer les gates ni faire relire le diff, et elle ne le recrée pas. Ce que le cook a poussé est sur la branche \`${branch}\`.`,
      );
    }
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
      return remonter({ ...connu, pr: pr.url }, "wrong-base", `La PR ${pr.url} vise \`${pr.base}\` : la pass ne juge et ne merge que vers \`${options.base}\`.`);
    }
    if (!aDesGates(worktree)) {
      return remonter({ ...connu, pr: pr.url }, "no-gates", `Le projet n'a pas de \`${SCRIPT_GATES}\` sur cette branche : sans gates, « vert » voudrait dire que personne n'a regardé.`);
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
      // Parti pendant ses gates, le ticket n'a plus de verdict à recevoir.
      if (arrete || !enPass(ticket)) return;
      gatesJouees.set(ticket, { sha, gates });
    }

    if (gates.outcome === "green") {
      if (pr.mergeable === false) {
        findings.push(findingDeConflit(options.base));
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
          if (!(maintenant().getTime() - depuis > options.attenteCiMs) || !enPass(ticket)) return;
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
    // Le ticket a pu quitter le rail pendant une attente de GitHub : gates et
    // relecture en cache n'y changent rien, il n'a plus de verdict à recevoir.
    if (!enPass(ticket)) return;
    const verdict = findings.length === 0 ? "green" : "red";
    prononcer(connu, { run, pr: pr.url, number: pr.number, sha, verdict, gates, ci, review, findings, judgeModified, noDiff: false });
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
    if (!depot.intact(worktree)) {
      // Du travail jamais commité : le servir le laisserait dans ce worktree,
      // poussé nulle part. Le reviewer n'est pas appelé à le confirmer.
      findings.push(
        "Rien n'est commité, mais le worktree porte des fichiers modifiés ou neufs : ce travail n'est ni poussé ni mergeable, et un ticket sans diff ne laisse rien derrière lui. Commite ce qui fait partie de la livraison, annule le reste.",
      );
    } else if (compteRendu(ticket, run) === null) {
      findings.push("Ni diff ni compte-rendu : le cook n'a rien livré qui puisse être relu. Le livrable d'un ticket sans diff est ton dernier message — écris-le.");
    } else {
      const relue = await relire(connu, worktree, sha, true);
      if (arrete || relue === null) return;
      if (relue.outcome === "unreadable") return remonterIllisible(connu, relue);
      review = { outcome: relue.outcome, run: relue.run, summary: relue.summary, findings: relue.findings };
      findings.push(...bloquants(review.findings).map(findingDuReviewer));
    }

    // Parti pendant sa relecture, ou avant : pas de verdict pour un ticket sorti du rail.
    if (!enPass(ticket)) return;
    const verdict = findings.length === 0 ? "green" : "red";
    const ci: CI = { outcome: "skipped", checks: [] };
    prononcer(connu, { run, pr: null, number: null, sha, verdict, gates: NON_JOUEES, ci, review, findings, judgeModified: false, noDiff: true });
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

  // Un ticket que la pass a arrêté, ou qu'elle fait attendre : si le chef a
  // mergé sa PR, il est servi. Rend vrai s'il l'était.
  const surveiller = async (connu: PassDeTicket): Promise<boolean> => {
    if (connu.branch === null) return false;
    const pr = await github.prDeBranche(connu.branch);
    if (arrete || !pr?.merged) return false;
    await constaterMerge(connu, pr, "outside", false);
    return true;
  };

  // Une livraison que son ticket a laissée en quittant le rail : la pass ne la
  // suit plus. GitHub dit ce qu'il en reste — une PR encore ouverte est dite
  // sur l'issue, une fois : le fait retire la livraison de ce qui reste à dire.
  // Ni la PR ni la branche ne sont touchées : c'est au chef d'en décider.
  // Mergée à la main avant que la pass ait relu GitHub, elle n'a pas été
  // abandonnée : le merge est constaté, et le ticket servi pour qui l'attend.
  // Son issue reste comme le chef l'a laissée.
  const lacher = async ({ ticket, branch, verdict, reason }: Orpheline) => {
    const pr = await github.prDeBranche(branch);
    if (arrete) return;
    if (pr?.merged) {
      base.transaction(() => {
        noter(ticket, { type: "merge.done", payload: { pr: pr.url, sha: pr.sha, by: "outside", reconciled: false, unverified: aVerifier(ticket, "outside") } });
        noter(ticket, { type: "pass.abandoned", payload: { branch, pr: null } });
      });
      return;
    }
    const ouverte = pr !== null && pr.state === "open" ? pr.url : null;
    noter(ticket, { type: "pass.abandoned", payload: { branch, pr: ouverte } });
    if (ouverte === null) return;
    avertir(`brigade : le ticket #${ticket} a quitté le rail (${reason}) en laissant sa PR ouverte, que la pass ne suit plus — ${ouverte}`);
    const jugee = verdict === null ? "La pass n'avait pas encore jugé cette livraison" : `Le dernier verdict de la pass sur cette livraison était ${verdict === "green" ? "vert" : "rouge"}`;
    await commenter(
      ticket,
      [
        `**Pass — ticket sorti du rail (${nomAbandon(reason)}), PR encore ouverte.** ${ouverte} · branche \`${branch}\``,
        "",
        `Ce ticket a quitté le rail alors que sa livraison n'était pas mergée : la pass la lâche. Plus rien ne sera relu, renvoyé à un cook ni mergé, et plus personne ne la suit. ${jugee}.`,
        "",
        `À toi d'en décider : la merger si elle te convient, ou la fermer — la pass ne fait ni l'un ni l'autre, et ne supprime pas la branche. Tant que la PR est ouverte, le worktree de la livraison reste sur la station ; il est retiré une fois la PR mergée ou fermée. Remettre le ticket sur le rail ne la reprend pas : un cook neuf repartirait de \`${options.base}\`, sur une autre branche.`,
      ].join("\n"),
    );
  };

  const traiter = async (connu: PassDeTicket, tick: boolean) => {
    switch (connu.phase) {
      case "delivered":
      case "judging":
        if (enPass(connu.ticket)) await juger(connu);
        return;
      // Jugé, mais le runtime est mort avant de décider — ou pendant un rejeu.
      // En attente, la décision se reprend à chaque réveil : elle voit seule
      // si ce qu'elle attendait est levé.
      case "green":
      case "red":
      case "replaying":
        return decider(connu.ticket);
      // Une livraison qui attend peut être mergée à la main : c'est dit sur
      // son issue. GitHub n'est relu qu'au tick.
      case "waiting":
        if (tick && (await surveiller(connu))) return;
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
      // Entre les mains du manager. Éteint depuis, il ne dira rien : la pass
      // reprend sa règle.
      case "deferred":
        if (!managerAllume(base)) await decider(connu.ticket);
        return;
      case "cooking":
      case "returned":
        return;
    }
  };

  // Joue les gates sur la base elle-même, hors ticket : après des merges que
  // rien n'avait vérifiés ensemble, et — tant qu'elle est rouge — dès qu'elle
  // bouge. Une fois par passe : les merges d'une même passe se vérifient d'un
  // bloc. Rouge, les merges sous grant s'arrêtent ; la réparer est au chef.
  let machineDite = false;
  const controlerBase = async (tick: boolean) => {
    const avant = etatDeLaBase(base);
    const tickets = mergesAVerifier(base);
    // GitHub n'est relu qu'au tick : une base rouge ne bouge pas plus vite.
    if (tickets.length === 0 && !(tick && avant?.outcome === "red")) return;
    const tete = await depot.rapatrier();
    if (arrete || (tickets.length === 0 && tete === avant?.sha)) return;
    const pleine = sature();
    if (pleine) {
      if (!machineDite) avertir(`brigade : gates de ${options.base} à jouer après merge, mais la machine n'en peut plus — ${direSaturation(pleine)}. La pass y revient`);
      machineDite = true;
      return;
    }
    machineDite = false;
    // Sans ticket : le setup du projet reçoit zéro.
    const gates = (await essayer(ESSAI_DE_BASE, 0)) ?? NON_JOUEES;
    if (arrete) return;
    const outcome = gates.outcome === "skipped" ? "skipped" : gates.outcome === "green" ? "green" : "red";
    noter(null, { type: "base.checked", payload: { sha: tete, outcome, gates, tickets } });
    if (outcome !== "red") {
      if (avant?.outcome === "red") avertir(`brigade : ${options.base} n'est plus rouge (${court(tete)}) — les merges sous grant reprennent`);
      // Ce qui attendait la base repart.
      aRefaire = true;
      return;
    }
    const merges = tickets.map((ticket) => `#${ticket}`).join(", ");
    avertir(`brigade : ${options.base} est ROUGE après merge (${court(tete)}${merges === "" ? "" : ` — merges à vérifier : ${merges}`}) — les merges sous grant sont suspendus`);
    for (const ticket of tickets) {
      await commenter(
        ticket,
        [
          `**Pass — \`${options.base}\` est rouge après merge.** \`${court(tete)}\``,
          "",
          `Les gates, jouées sur \`${options.base}\` elle-même après ${tickets.length === 1 ? "ce merge" : `les merges de ${merges}`}, ne passent pas. Chaque livraison était verte seule : c'est leur rencontre — entre elles, ou avec ce que \`${options.base}\` avait reçu — qui casse.`,
          "",
          findingDesGates(gates, options.delaiGatesMs),
          "",
          `La pass ne merge plus rien sous grant tant que \`${options.base}\` est rouge ; les livraisons vertes attendent. À réparer à la main : la pass rejoue les gates dès que \`${options.base}\` bouge, et reprend seule.`,
        ].join("\n"),
      );
    }
  };

  const nettoyer = ouvrirNettoyage({ journal, projet, repertoireEtat: options.repertoireEtat, depot, github, avertir, arrete: () => arrete });

  // Cache, pas état : les départs sur lesquels GitHub n'a pas répondu.
  const butees = new Set<number>();

  // Une seule passe à la fois. Un réveil qui arrive pendant qu'elle juge n'est
  // pas perdu : elle repasse aussitôt finie.
  let enCours = false;
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
          // GitHub en panne : la livraison lâchée reste à dire, et n'y est
          // relue qu'au tick.
          for (const orpheline of orphelines(base)) {
            if (arrete) return;
            if (!avecTick && butees.has(orpheline.seq)) continue;
            try {
              await lacher(orpheline);
              butees.delete(orpheline.seq);
            } catch (erreur) {
              butees.add(orpheline.seq);
              if (!arrete) avertir(`brigade : la pass a buté sur la livraison lâchée du ticket #${orpheline.ticket} — ${message(erreur)}`);
            }
          }
          // En fin de passe, jamais pendant : aucun worktree ne part sous des
          // gates ou un reviewer. La passe du démarrage rattrape le stock.
          try {
            if (!arrete) await nettoyer(avecTick);
          } catch (erreur) {
            if (!arrete) avertir(`brigade : le nettoyage des worktrees a buté — ${message(erreur)}`);
          }
          try {
            if (!arrete) await controlerBase(avecTick);
          } catch (erreur) {
            if (!arrete) avertir(`brigade : la pass a buté sur le contrôle de ${options.base} — ${message(erreur)}`);
          }
        } while (aRefaire && !arrete);
      } catch (erreur) {
        if (!arrete) avertir(`brigade : la pass a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
      } finally {
        enCours = false;
      }
    })();
  };

  // Un runtime tué pendant un rejeu a laissé son worktree jetable.
  try {
    depot.jeter();
  } catch (erreur) {
    avertir(`brigade : worktrees jetables de la pass non retirés — ${message(erreur)}`);
  }
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
