// Le manager d'un projet : il décide ce qui entre sur le rail, le calibre, et
// découpe les épiques en tickets. Sa boucle est du code — le sondage des
// issues ouvertes, le tri de ce qui n'est pas une unité de travail, la mémoire
// de ce qui est déjà tranché, la pose des labels, la création des tickets — et
// il n'appelle un LLM que pour juger et pour découper : une issue, une fois
// par état.
//
// Il est éteint tant que le chef ne l'a pas allumé, et ne garde rien en
// mémoire : ce qu'il a décidé, posé et dit se relit dans le journal. Le geste
// du chef est toujours plus fort que le sien — il ne retire aucun label, n'en
// pose jamais dans une dimension qui en porte un, et ne pose rien deux fois
// sur la même issue.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DE_CONFIANCE, priorite } from "./alimenter.ts";
import { calibrage as calibragePose, complet, EFFORTS, MODELES, type Calibrage } from "./calibrage.ts";
import { environnementCook, lireFlux, verdict, type Lecture } from "./claude.ts";
import { ouvrirDecoupage, type Reponse } from "./decoupage.ts";
import { neDUnDecoupage } from "./decouper.ts";
import { porteListe } from "./epique.ts";
import { NOMS_DE_NATURE, type Ecart, type FaitManager, type Nature } from "./evenements/manager.ts";
import type { FaitStation } from "./evenements/station.ts";
import { LancementRefuse, type GardeFous, type Verdict } from "./garde-fous.ts";
import { LABEL, type GitHub, type IssueOuverte } from "./github.ts";
import { argumentsJuge, consigneDeJugement, empreinte, lireDecision, MARQUEUR_MANAGER, type Decision } from "./juger.ts";
import { decoupageDe, ticketDEpique } from "./projections/decoupages.ts";
import { etatDesGardeFous } from "./projections/garde-fous.ts";
import { issueDuManager, managerAllume, type IssueDuManager } from "./projections/manager.ts";
import { cookDeRun, etatStation } from "./projections/stations.ts";
import { ConfigInvalide, type Runtime } from "./runtime.ts";
import { STATION } from "./station.ts";
import type { Fin } from "./superviseur.ts";

// Le nom sous lequel les jugements figurent au journal, à la place d'une
// station : c'est par lui que le chef lit ce que le manager lui coûte.
export const MANAGER = "manager";
const AUTEUR = "manager";

// Les labels par lesquels le chef dit lui-même qu'une issue n'est pas une
// unité de travail. Reconnus s'ils sont là, jamais exigés.
const RETENUE = "blocked-on-human";
const LABELS_ECARTES: Ecart[] = [RETENUE, "question", "decision"];
// Celui par lequel il dit qu'elle est à découper. Jamais exigé non plus : le
// jugement reconnaît une épique sans lui.
const LABEL_EPIQUE = "epic";
// Les écarts que le manager dit sur l'issue quand le chef y a posé `fire`.
const ECARTS_DITS: Ecart[] = ["roadmap", "already-split", ...LABELS_ECARTES];

// Un quota épuisé qui ne dit pas quand il revient est retenté une heure après.
const REPLI_QUOTA_MS = 3_600_000;
const QUOTA = "quota";

export type ConfigManager = {
  // Le modèle et l'effort de ses jugements.
  calibrage: Calibrage;
  // Le numéro de l'issue de roadmap du projet, s'il en a une.
  roadmap: number | null;
  // Les fichiers suivis du dépôt : le plan dont un découpage tire les zones
  // de ses tickets. Sans lui, il découpe à l'aveugle.
  fichiers?: () => string[];
};

const liste = (valeurs: readonly string[]) => `${valeurs.slice(0, -1).join(", ")} ou ${valeurs.at(-1)}`;

// Lit la configuration du manager dans l'environnement. Son calibrage n'a pas
// de défaut, pas plus que celui d'un cook : c'est le quota du chef.
export function configManager(env: Record<string, string | undefined>): ConfigManager {
  const exiger = (variable: string, admis: readonly string[]): string => {
    const valeur = env[variable];
    if (!valeur) throw new ConfigInvalide(`${variable} n'est pas défini — le calibrage des jugements du manager n'a pas de défaut : ${liste(admis)}`);
    if (!admis.includes(valeur)) throw new ConfigInvalide(`${variable} invalide : « ${valeur} » — attendu ${liste(admis)}`);
    return valeur;
  };
  const calibrage = { model: exiger("BRIGADE_MANAGER_MODEL", MODELES), effort: exiger("BRIGADE_MANAGER_EFFORT", EFFORTS) };
  const roadmap = env.BRIGADE_ROADMAP_ISSUE;
  if (roadmap && !/^[1-9][0-9]*$/.test(roadmap)) {
    throw new ConfigInvalide(`BRIGADE_ROADMAP_ISSUE invalide : « ${roadmap} » — attendu un numéro d'issue (1)`);
  }
  return { calibrage, roadmap: roadmap ? Number(roadmap) : null };
}

export type OptionsManager = ConfigManager & {
  github: GitHub;
  // `<owner>/<repo>`, pour la consigne du jugement.
  depotGitHub: string;
  repertoireEtat: string;
  // Le binaire `claude`.
  bin: string;
  // L'environnement dont part celui des jugements. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  maintenant?: () => Date;
  // Où va ce que le manager a à dire hors du journal (journald).
  avertir?: (message: string) => void;
};

const RAISONS: Partial<Record<Ecart, string>> = {
  roadmap: "c'est la roadmap du projet",
  epic: "elle porte le label `epic`",
  question: "elle porte le label `question`",
  decision: "elle porte le label `decision`",
  "blocked-on-human": "elle porte le label `blocked-on-human`",
  "already-split": "c'est une épique dont le corps liste déjà les tickets",
};

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const duree = (ms: number) =>
  ms >= 60_000 ? `${(ms / 60_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min` : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const code = (labels: string[]) => labels.map((label) => `\`${label}\``).join(", ");

// Ce que le code décide d'une issue, sans LLM.
type Tri =
  // Plus rien à décider : elle est lancée et calibrée, ou ce qui lui manque
  // n'est pas au manager.
  | { quoi: "rien" }
  // Une épique découpée, ou un ticket né d'un découpage : ce que le manager
  // avait à y faire est fait, et ce qu'ils portent depuis est au chef.
  | { quoi: "fini" }
  | { quoi: "ecart"; raison: Ecart; fired: boolean }
  | { quoi: "juger" }
  // Une épique : elle se découpe, elle ne se lance pas.
  | { quoi: "decouper" };

const dimension = (labels: string[], prefixe: string) => labels.filter((label) => label.startsWith(prefixe));

// Rend le runtime, augmenté de son manager. Son `arreter` l'emporte avec lui.
export function brancherManager<R extends Runtime & GardeFous>(runtime: R, options: OptionsManager): R {
  const { journal, projet } = runtime;
  const { base } = journal;
  const { github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const envJuge = environnementCook(options.env ?? process.env);
  const noter = (ticket: number | null, fait: FaitManager | FaitStation) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

  let arrete = false;
  // Les commentaires de confiance de chaque issue, tels que lus à sa dernière
  // modification. Cache, pas état : le perdre coûte une lecture par issue.
  const lus = new Map<number, { updatedAt: string; corps: string[] }>();

  const trier = (issue: IssueOuverte, connue: IssueDuManager | null): Tri => {
    const fired = issue.labels.includes(LABEL);
    // Une épique découpée ne se rejuge plus ; il peut rester à finir ce que le
    // découpage a commencé.
    const decoupee = decoupageDe(base, issue.number);
    if (decoupee?.state === "split") {
      if (decoupee.done && decoupee.commented) return { quoi: "fini" };
      // Retenue par le chef au milieu des créations : elles attendent.
      return issue.labels.includes(RETENUE) ? { quoi: "ecart", raison: RETENUE, fired } : { quoi: "decouper" };
    }
    // Un ticket né d'un découpage est déjà jugé et calibré.
    if (ticketDEpique(base, issue.number)?.index != null || neDUnDecoupage(issue.body)) return { quoi: "fini" };
    if (fired && complet(calibragePose(issue.labels))) return { quoi: "rien" };
    // Le manager a déjà posé sur cette issue, et il y manque quelque chose : le
    // chef l'a retiré. Tout ce qu'elle porte est désormais à lui.
    if (connue && connue.posed.length > 0) return { quoi: "ecart", raison: "chef-changed", fired };
    if (!DE_CONFIANCE.includes(issue.association)) return { quoi: "ecart", raison: "untrusted-author", fired };
    if (issue.number === options.roadmap) return { quoi: "ecart", raison: "roadmap", fired };
    const label = LABELS_ECARTES.find((ecarte) => issue.labels.includes(ecarte));
    if (label) return { quoi: "ecart", raison: label, fired };
    // La liste de ses tickets est déjà dans son corps, et le journal ne sait
    // rien d'un découpage : il a été fait à la main.
    if (porteListe(issue.body)) return { quoi: "ecart", raison: "already-split", fired };
    if (issue.labels.includes(LABEL_EPIQUE)) return { quoi: "decouper" };
    // Lancée, et chaque dimension porte déjà un label — illisible, ou en
    // double : le chef n'a pas fini de trancher, la station le lui dit.
    if (fired && dimension(issue.labels, "model:").length > 0 && dimension(issue.labels, "effort:").length > 0) return { quoi: "rien" };
    return { quoi: "juger" };
  };

  // Ce qui pèse dans un jugement : les commentaires de ceux qui ont la main
  // sur le dépôt, moins ceux du manager.
  const commentaires = async (issue: IssueOuverte): Promise<string[]> => {
    const connus = lus.get(issue.number);
    if (connus?.updatedAt === issue.updatedAt) return connus.corps;
    const corps = (await github.commentaires(issue.number))
      .filter((commentaire) => DE_CONFIANCE.includes(commentaire.association) && !commentaire.body.includes(MARQUEUR_MANAGER))
      .map((commentaire) => commentaire.body);
    lus.set(issue.number, { updatedAt: issue.updatedAt, corps });
    return corps;
  };

  // Un jugement consomme le quota du compte : il n'a pas lieu si le chef a dit
  // « stop », si le disjoncteur est ouvert, ou si la station dit le compte
  // épuisé ou déconnecté.
  const peutJuger = (): boolean => {
    const garde = etatDesGardeFous(base);
    if (garde.stoppedAt !== null || garde.breakerOpenedAt !== null) return false;
    const station = etatStation(base, STATION);
    if (station?.disconnectedAt) return false;
    return !(station?.quotaUntil && station.quotaUntil > maintenant().toISOString());
  };

  const signature = (run: string | null, verbe = "Jugé"): string => {
    const cook = run === null ? null : cookDeRun(base, run);
    const calibrage = cook?.model && cook.effort ? ` en \`${cook.model}\` / \`${cook.effort}\`` : "";
    const mesure = cook?.turns == null ? "" : ` · ${pluriel(cook.turns, "tour")} · ${nombre(cook.tokens ?? 0)} tokens · ${duree(cook.durationMs ?? 0)}`;
    return `_${verbe} par le manager${calibrage}${mesure}._`;
  };

  const dire = (issue: IssueOuverte, connue: IssueDuManager): string => {
    const fired = issue.labels.includes(LABEL);
    switch (connue.decision) {
      case "fire": {
        const poses = connue.labels ?? [];
        // Ce qui était là avant le manager : ce qu'il n'a pas posé lui-même.
        const laisses = [
          ...(poses.includes(LABEL) ? [] : [LABEL]),
          ...(poses.some((label) => label.startsWith("model:")) ? [] : dimension(issue.labels, "model:")),
          ...(poses.some((label) => label.startsWith("effort:")) ? [] : dimension(issue.labels, "effort:")),
        ];
        return [
          MARQUEUR_MANAGER,
          `**Manager — ticket mis sur le rail.** ${poses.length === 0 ? "Rien à poser : tout y était." : `Posé : ${code(poses)}.`}`,
          "",
          `**Pourquoi il est exécutable.** ${connue.reason}`,
          "",
          `**Pourquoi \`${connue.model}\` / \`${connue.effort}\`.** ${connue.calibration ?? ""}`,
          ...(laisses.length === 0 ? [] : ["", `${code(laisses)} ${laisses.length > 1 ? "étaient déjà posés : laissés tels quels" : "était déjà posé : laissé tel quel"}.`]),
          "",
          "C'est ton quota : remplace un label de calibrage, le manager ne le réécrira pas ; retire `fire`, il ne le reposera pas.",
          "",
          signature(connue.run),
        ].join("\n");
      }
      case "refused":
        return [
          MARQUEUR_MANAGER,
          `**Manager — pas un ticket exécutable : ${NOMS_DE_NATURE[connue.kind as Nature] ?? connue.kind}.** Rien n'est posé, aucun cook ne partira.`,
          "",
          connue.reason,
          ...(connue.missing === null ? [] : ["", `**Ce qui le rendrait exécutable.** ${connue.missing}`]),
          "",
          `L'issue sera rejugée dès qu'elle changera — corps édité, ou réponse en commentaire.${fired ? " `fire` y est posé : il reste, mais sans calibrage aucun cook ne part." : ""}`,
          "",
          signature(connue.run),
        ].join("\n");
      case "failed":
        return [
          MARQUEUR_MANAGER,
          `**Manager — jugement illisible.** Le jugement de cette issue n'a rendu aucune décision lisible (${connue.reason}) : rien n'est posé.`,
          "",
          "Elle sera rejugée quand elle changera ; d'ici là, `fire` et le calibrage se posent à la main.",
          "",
          signature(connue.run),
        ].join("\n");
      case "aside":
        return [
          MARQUEUR_MANAGER,
          `**Manager — \`fire\` laissé, ticket non calibré.** Pour le manager, cette issue n'est pas une unité de travail — ${RAISONS[connue.reason as Ecart] ?? connue.reason}. Il ne retire pas ton \`fire\`, et ne pose aucun calibrage.`,
          "",
          "Sans `model:` ni `effort:`, aucun cook ne part. Pose-les toi-même si tu veux qu'elle soit cuisinée.",
        ].join("\n");
    }
  };

  // Note qu'une issue est écartée, si ce n'est pas déjà ce que le journal dit.
  const ecarter = (numero: number, tri: Extract<Tri, { quoi: "ecart" }>, connue: IssueDuManager | null) => {
    if (connue?.decision !== "aside" || connue.reason !== tri.raison || connue.fired !== tri.fired) {
      noter(numero, { type: "manager.set-aside", payload: { reason: tri.raison, fired: tri.fired } });
    }
  };

  // Porte une décision sur GitHub : les labels, puis le commentaire. Chaque
  // pas est noté une fois fait — ce qui échoue se reprend au réveil suivant,
  // sans rejuger. Rend vrai quand il ne reste rien à faire.
  const appliquer = async (lue: IssueOuverte): Promise<boolean> => {
    let issue = lue;
    let connue = issueDuManager(base, issue.number);
    if (!connue) return true;
    if (connue.decision === "fire" && connue.labels === null) {
      const { model, effort } = connue;
      let aPoser: string[] = [];
      try {
        // Les labels lus en début de tour ont l'âge des jugements qui ont
        // précédé celui-ci : des minutes, sur un backlog. Le chef a pu retenir
        // l'issue, ou la lancer et la calibrer lui-même. Ils se relisent juste
        // avant d'écrire, et le tri repasse sur ce qu'ils disent.
        const fraiche = await github.issue(issue.number);
        if (arrete) return false;
        // Fermée ou disparue : il n'y a plus rien à poser, ni à dire.
        if (!fraiche || fraiche.state !== "open") return true;
        issue = { ...issue, labels: fraiche.labels };
        const tri = trier(issue, connue);
        if (tri.quoi === "ecart") ecarter(issue.number, tri, connue);
        else {
          aPoser = [
            ...(issue.labels.includes(LABEL) ? [] : [LABEL]),
            ...(dimension(issue.labels, "model:").length > 0 ? [] : [`model:${model}`]),
            ...(dimension(issue.labels, "effort:").length > 0 ? [] : [`effort:${effort}`]),
          ];
          if (aPoser.length > 0) await github.labelliser(issue.number, aPoser);
          if (arrete) return false;
          noter(issue.number, { type: "manager.labeled", payload: { labels: aPoser } });
        }
      } catch (erreur) {
        if (!arrete) avertir(`brigade : labels non posés sur l'issue #${issue.number}${aPoser.length === 0 ? "" : ` (${aPoser.join(", ")})`} — ${message(erreur)}`);
        return false;
      }
      connue = issueDuManager(base, issue.number) ?? connue;
    }
    const aDire = connue.decision !== "aside" || (connue.fired && ECARTS_DITS.includes(connue.reason as Ecart));
    if (!aDire || connue.commented) return true;
    try {
      await github.commenter(issue.number, dire(issue, connue));
    } catch (erreur) {
      if (!arrete) avertir(`brigade : décision du manager non commentée sur l'issue #${issue.number} — ${message(erreur)}`);
      return false;
    }
    if (arrete) return false;
    noter(issue.number, { type: "manager.commented", payload: {} });
    return true;
  };

  // Fait répondre le LLM à une consigne, sous les garde-fous : un jugement, ou
  // un découpage. Rend sa réponse lue — ou ce qui la rend illisible —, et null
  // s'il n'a pas abouti : il reste alors à faire.
  const demander = async <T>(
    sujet: { numero: number; prefixe: string; nom: string },
    consigne: string,
    lire: (message: string | null) => { valeur: T } | { illisible: string },
  ): Promise<Reponse<T> | null> => {
    const run = `${sujet.prefixe}-${sujet.numero}-${randomUUID().slice(0, 8)}`;
    let lecture: Lecture | null = null;
    let lue: ReturnType<typeof lire> | null = null;
    const conclure = (fin: Fin): Verdict => {
      let flux = "";
      try {
        flux = readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8");
      } catch {
        // Sans flux, il n'y a pas de décision.
      }
      lecture = lireFlux(flux);
      if (fin.arret) return "failed";
      const comment = verdict(lecture, fin.code);
      if (comment === "86" || comment === "disconnected") return "neutral";
      if (comment !== "done") return "failed";
      lue = lire(lecture.message);
      // Un jugement réussi ne remet pas à zéro les échecs d'affilée des cooks :
      // il ne compte ni pour ni contre.
      return "valeur" in lue ? "neutral" : "failed";
    };

    let lance;
    try {
      lance = runtime.lancer({
        ticket: null,
        run,
        contexte: { station: MANAGER, ...options.calibrage },
        commande: options.bin,
        args: argumentsJuge(consigne, options.calibrage),
        // Hors de tout dépôt : un jugement ne lit que sa consigne.
        cwd: tmpdir(),
        env: envJuge,
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
    const reponse = lue as ReturnType<typeof lire> | null;
    const comment = fin.arret || !flux ? "failed" : verdict(flux, fin.code);
    if (comment === "86") {
      const instant = maintenant();
      const annonce = flux?.quota?.retour ?? null;
      const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
      noter(null, { type: "station.86", payload: { station: STATION, reason: QUOTA, until: retour.toISOString(), window: flux?.quota?.fenetre ?? null } });
      return null;
    }
    if (comment === "disconnected") {
      noter(null, { type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run } });
      avertir(`brigade : connexion Max absente ou expirée, vue par un ${sujet.nom} du manager — \`claude /login\` sous le compte du service, puis « reprendre »`);
      return null;
    }
    // Seul un jugement allé à son terme dit quelque chose de l'issue, que sa
    // réponse se lise ou non : il s'épingle sur son état. Tout le reste —
    // binaire introuvable, panne réseau, arrêt par un garde-fou — dit quelque
    // chose de la machine : rien n'est épinglé ni commenté, il repart au
    // réveil suivant, et c'est le disjoncteur qui borne.
    if (comment === "done" && reponse) return { run, ...reponse };
    const raison = fin.arret
      ? `guard:${fin.arret.reason}`
      : (fin.erreur ?? (fin.code === 0 ? "flux sans résultat" : fin.code === null ? `signal ${fin.signal}` : `code de sortie ${fin.code}`));
    avertir(`brigade : ${sujet.nom} de l'issue #${sujet.numero} non abouti (${raison}) — il sera retenté`);
    return null;
  };

  // Fait juger une issue. Rend vrai si une décision — ou une réponse illisible
  // — est au journal ; faux si le jugement n'a pas abouti, et reste à faire.
  const juger = async (issue: IssueOuverte, corps: string[], etat: string): Promise<boolean> => {
    const reponse = await demander<Decision>(
      { numero: issue.number, prefixe: "juge", nom: "jugement" },
      consigneDeJugement({ depot: options.depotGitHub, issue, commentaires: corps }),
      (texte) => {
        const lue = lireDecision(texte);
        return "decision" in lue ? { valeur: lue.decision } : lue;
      },
    );
    if (!reponse) return false;
    if ("valeur" in reponse) noter(issue.number, { type: "manager.judged", payload: { run: reponse.run, fingerprint: etat, ...reponse.valeur } });
    else {
      noter(issue.number, { type: "manager.failed", payload: { run: reponse.run, fingerprint: etat, reason: reponse.illisible } });
      avertir(`brigade : jugement illisible sur l'issue #${issue.number} (${reponse.illisible}) — rien n'est posé`);
    }
    return true;
  };

  const decoupage = ouvrirDecoupage({
    journal,
    github,
    depotGitHub: options.depotGitHub,
    fichiers: options.fichiers ?? (() => []),
    noter,
    demander,
    peutJuger,
    arrete: () => arrete,
    eteint: () => !managerAllume(base),
    avertir,
    signature,
  });

  const lisible = (issue: IssueOuverte): boolean =>
    Number.isSafeInteger(issue.number) && [issue.title, issue.updatedAt].every((champ) => typeof champ === "string" && champ !== "");

  // L'ordre du rail : `prio:1` d'abord, les issues sans priorité en dernier ;
  // à priorité égale, la plus ancienne.
  const ordre = (a: IssueOuverte, b: IssueOuverte) =>
    (priorite(a.labels) ?? 10) - (priorite(b.labels) ?? 10) || a.createdAt.localeCompare(b.createdAt) || a.number - b.number;

  // Un tour : chaque issue ouverte est triée par le code, et seules celles
  // qu'il ne sait pas trancher, dans un état jamais jugé, vont au LLM.
  const tour = async () => {
    if (!managerAllume(base)) return;
    // Avant le sondage : l'état d'un ticket change sans qu'aucune issue bouge.
    await decoupage.suivre();
    if (arrete) return;
    const sondage = await github.ouvertes();
    if (sondage.inchange) return;
    const presentes = new Set(sondage.issues.map((issue) => issue.number));
    for (const numero of [...lus.keys()]) if (!presentes.has(numero)) lus.delete(numero);
    decoupage.observer(sondage.issues.filter(lisible));

    // Tant qu'une issue attend quelque chose qui ne la modifie pas — un quota,
    // un « reprendre », un GitHub qui répond de nouveau —, le sondage reste
    // inconditionnel.
    let complet = true;
    for (const issue of sondage.issues.filter(lisible).sort(ordre)) {
      if (arrete || !managerAllume(base)) return;
      const connue = issueDuManager(base, issue.number);
      const tri = trier(issue, connue);
      let epique = tri.quoi === "decouper";
      if (tri.quoi === "fini") continue;
      if (tri.quoi === "ecart") ecarter(issue.number, tri, connue);
      else if (tri.quoi === "juger") {
        const corps = await commentaires(issue);
        const etat = empreinte(issue, corps);
        if (connue?.fingerprint !== etat) {
          if (!peutJuger() || !(await juger(issue, corps, etat))) {
            complet = false;
            continue;
          }
        }
        // Le jugement y a reconnu une épique : elle ne se refuse pas, elle se
        // découpe.
        const jugee = issueDuManager(base, issue.number);
        epique = jugee?.decision === "refused" && jugee.kind === LABEL_EPIQUE;
      }
      if (epique) {
        if (arrete || !managerAllume(base)) return;
        if (!(await decoupage.traiter(issue, await commentaires(issue)))) complet = false;
        continue;
      }
      // Éteint pendant le jugement : la décision est au journal, rien n'est
      // posé. Elle le sera, sans rejuger, quand le chef rallumera.
      if (arrete || !managerAllume(base)) return;
      if (!(await appliquer(issue))) complet = false;
    }
    if (complet && !arrete) sondage.confirmer();
  };

  // Un seul tour à la fois. Un réveil qui arrive pendant un jugement n'est pas
  // perdu : le tour repasse une fois le premier fini.
  let enCours = false;
  let aRefaire = false;
  const reveiller = () => {
    if (arrete) return;
    if (enCours) {
      aRefaire = true;
      return;
    }
    enCours = true;
    void (async () => {
      try {
        do {
          aRefaire = false;
          await tour();
        } while (aRefaire && !arrete);
      } catch (erreur) {
        // `gh` en panne : rien n'est décidé, le réveil suivant réessaie.
        if (!arrete) avertir(`brigade : le manager a buté — ${message(erreur)}`);
      } finally {
        enCours = false;
      }
    })();
  };

  const desabonner = runtime.surReveil(reveiller);
  reveiller();

  return {
    ...runtime,
    arreter(signal) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}
