// Un ticket jugé `incomplete` ne reste jamais sur un commentaire que personne
// ne lit (#2692) : le 2026-11-07, #2672 et #2689 l'ont été, et le rail est
// resté à sec plus de deux heures. Au tour qui suit le verdict, le manager
// relit l'issue avec ce qu'il a dit lui manquer, et en tire l'une de deux
// issues :
//   - le manque ne demande aucune décision de produit ou de design — un seuil,
//     un nom, un fichier, un essai manuel à changer en test, un découpage : il
//     réécrit lui-même les critères d'acceptation, à partir de son « ce qui le
//     rendrait exécutable », en gardant l'intention de l'auteur, le dit en
//     commentaire, et qualifie le ticket au même tour ;
//   - il en demande une : le ticket devient une carte TODO qui porte une seule
//     question au chef, et l'issue reçoit le label `product-question`.
// Chaque issue est écrite au journal (`manager.completed`), avec l'empreinte
// du verdict qu'elle suit : le même verdict ne se relit pas deux fois.
import { entrerDansTodo } from "../carte-todo.ts";
import { uneQuestion } from "../carte-todo/forme.ts";
import type { Reponse } from "../decoupage.ts";
import type { FaitManager } from "../events/manager.ts";
import type { GitHub, IssueOuverte } from "../github.ts";
import type { Journal } from "../journal.ts";
import { EFFORT_HIGH_AU_RENVOI, EFFORTS_DU_MANAGER, empreinte, issueEnDonnee, MARQUEUR_MANAGER, objet, parmi, phrase } from "../juger.ts";
import { MODELES } from "../calibrage.ts";
import type { IssueDuManager } from "../projections/manager.ts";

export const QUESTION_PRODUIT = "product-question";
const AUTEUR_DE_CARTE = "manager";
// La première ligne de la consigne : ce qui distingue une complétion d'un
// jugement, pour qui lit les lancements.
export const MARQUE_DE_COMPLETION = "<!-- brigade:completion -->";
// Les réponses illisibles qu'un même verdict supporte avant que le manager ne
// pose sa question au chef : une complétion illisible ne clôt jamais le suivi.
// Une seule : chacune compte au disjoncteur comme un échec, et un refus du
// modèle est déjà redemandé par `demander` avant de se lire illisible.
export const ESSAIS_DE_COMPLETION = 1;

// La question que le manager pose quand il n'a pas su compléter le ticket :
// combler le manque lui revient alors, au chef.
export function questionDeRepli(illisible: string): Extract<Completion, { issue: "question" }> {
  return {
    issue: "question",
    motif: `Le manager n'a pas su compléter ce ticket lui-même : sa réponse ne se lisait pas (${illisible}).`,
    resume: "Le manager a jugé ce ticket incomplet et n'a pas su le compléter lui-même.",
    question: "Complètes-tu toi-même les critères d'acceptation de ce ticket ?",
    choix: ["Oui, je réécris ses critères sur l'issue", "Non, je ferme le ticket"],
  };
}

export type Completion =
  | { issue: "complete"; motif: string; criteres: string[]; model: string; effort: string; calibration: string }
  | { issue: "question"; motif: string; resume: string; question: string; choix: string[] };

export function consigneDeCompletion(mission: {
  depot: string;
  issue: { number: number; title: string; body: string; labels: string[] };
  commentaires: string[];
  verdict: { reason: string; missing: string | null };
}): string {
  const { depot, issue, commentaires, verdict } = mission;
  return [
    MARQUE_DE_COMPLETION,
    `Tu es le manager de la brigade sur le dépôt ${depot}. Tu as jugé cette issue \`incomplete\` : une unité de travail, à laquelle il manque de quoi partir. Un ticket qui reste bloqué sur un manque que tu sais combler est un échec de la cuisine : tu le comble toi-même, sauf si le manque demande au chef une décision de produit ou de design.`,
    "",
    "## Ton verdict",
    "",
    `**Pourquoi il n'était pas exécutable.** ${verdict.reason}`,
    "",
    `**Ce qui le rendrait exécutable.** ${verdict.missing ?? "(non dit — tire-le du motif)"}`,
    "",
    "## Ce que tu peux répondre",
    "",
    "- `complete` — le manque ne demande aucun choix de produit ni de design : un seuil, un nom, un fichier où écrire, un essai manuel à changer en test, un découpage en critères vérifiables. Tu réécris les critères d'acceptation à partir de « ce qui le rendrait exécutable », en gardant l'intention de l'auteur : rien de ce qu'il demande n'est retiré, rien de ce qu'il n'a pas demandé n'est ajouté. Chaque critère se vérifie seul. Tu calibres alors le ticket ainsi complété.",
    "- `question` — le manque est un choix entre plusieurs voies qui changent ce que l'utilisateur obtient, ou un rendu à valider : seul le chef tranche. Tu poses une seule question, sur une ligne, qui finit par son seul « ? », avec au moins deux réponses possibles.",
    "",
    "Dans le doute, complète : un seuil raisonnable que tu dis vaut mieux qu'un rail à sec. N'invente jamais une question que l'issue ne contient pas.",
    "",
    "## Le calibrage, pour `complete`",
    "",
    `\`modele\` : ${MODELES.join(", ")} ; \`effort\` : ${EFFORTS_DU_MANAGER.join(", ")}. Le plus bas qui suffit. ${EFFORT_HIGH_AU_RENVOI}`,
    "",
    "## Ta réponse",
    "",
    "Un seul objet JSON, et rien après lui :",
    "",
    "```json",
    '{"issue": "complete", "motif": "ce que tu as complété, et pourquoi aucune décision n\'y manque", "criteres": ["un critère vérifiable", "un autre"], "modele": "sonnet", "effort": "medium", "calibrage": "pourquoi ce modèle et cet effort"}',
    "```",
    "",
    "ou :",
    "",
    "```json",
    '{"issue": "question", "motif": "la décision qui manque, et pourquoi elle est au chef", "resume": "ce qui se passe, en une ou deux phrases simples", "question": "la question, en une ligne ?", "choix": ["une voie", "une autre"]}',
    "```",
    "",
    "`motif`, `criteres`, `resume`, `question` et `choix` sont lus par le chef : en anglais pour `criteres` (ils entrent dans le corps de l'issue), en français pour le reste.",
    "",
    ...issueEnDonnee(issue, commentaires),
  ].join("\n");
}

const surUneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();
const lignes = (valeur: unknown): string[] => (Array.isArray(valeur) ? valeur.map(phrase).filter((texte): texte is string => texte !== null).map(surUneLigne) : []);

export function lireCompletion(message: string | null): { valeur: Completion } | { illisible: string } {
  if (message === null || message.trim() === "") return { illisible: "aucune réponse" };
  const lu = objet(message);
  if (!lu) return { illisible: "aucun objet JSON dans la réponse" };
  const issue = parmi(lu.issue, ["complete", "question"]);
  if (!issue) return { illisible: `issue inconnue : ${JSON.stringify(lu.issue)} — attendu complete ou question` };
  const motif = phrase(lu.motif);
  if (!motif) return { illisible: "motif absent" };
  if (issue === "complete") {
    const criteres = lignes(lu.criteres);
    if (criteres.length === 0) return { illisible: "aucun critère d'acceptation" };
    const model = parmi(lu.modele, MODELES);
    if (!model) return { illisible: `modele inconnu : ${JSON.stringify(lu.modele)} — attendu ${MODELES.join(", ")}` };
    const effort = parmi(lu.effort, EFFORTS_DU_MANAGER);
    if (!effort) return { illisible: `effort hors de ce que le manager pose : ${JSON.stringify(lu.effort)} — attendu ${EFFORTS_DU_MANAGER.join(", ")}` };
    const calibration = phrase(lu.calibrage);
    if (!calibration) return { illisible: "calibrage non justifié" };
    return { valeur: { issue: "complete", motif, criteres, model, effort, calibration } };
  }
  const resume = phrase(lu.resume);
  if (!resume) return { illisible: "question sans résumé" };
  const question = phrase(lu.question);
  if (!question || !uneQuestion(surUneLigne(question))) return { illisible: "pas exactement une question, finie par son seul « ? »" };
  const choix = [...new Set(lignes(lu.choix))];
  if (choix.length < 2) return { illisible: "moins de deux réponses à la question" };
  return { valeur: { issue: "question", motif, resume: surUneLigne(resume), question: surUneLigne(question), choix } };
}

// La section des critères d'acceptation d'un corps d'issue : son titre, et ce
// qui le suit jusqu'au titre suivant d'un rang égal ou supérieur, ou jusqu'à
// une ligne `---`.
const TITRE_DES_CRITERES = /^(#{1,6})\s*(crit[eè]res d['’]acceptation|acceptance criteria)\s*:?\s*$/i;

// Le corps, ses critères d'acceptation remplacés par ceux-ci ; le reste — le
// contexte, l'intention de l'auteur — tel quel. Sans section de critères, elle
// s'ajoute à la fin.
function sectionDesCriteres(lues: readonly string[]): { debut: number; fin: number } | null {
  const debut = lues.findIndex((ligne) => TITRE_DES_CRITERES.test(ligne.trim()));
  if (debut === -1) return null;
  const rang = (TITRE_DES_CRITERES.exec(lues[debut]?.trim() ?? "")?.[1] ?? "##").length;
  const fin = lues.findIndex((ligne, index) => {
    if (index <= debut) return false;
    const titre = /^(#{1,6})\s/.exec(ligne.trim());
    return (titre !== null && (titre[1]?.length ?? 7) <= rang) || /^-{3,}\s*$/.test(ligne.trim());
  });
  return { debut, fin: fin === -1 ? lues.length : fin };
}

// Les critères d'acceptation d'un corps d'issue, sans leur titre. Sans
// section de critères, null.
export function criteresDuCorps(corps: string): string | null {
  const lues = corps.split("\n");
  const section = sectionDesCriteres(lues);
  return section === null ? null : lues.slice(section.debut + 1, section.fin).join("\n");
}

export function reecrireCriteres(corps: string, criteres: readonly string[]): string {
  const liste = criteres.map((critere) => `- ${critere}`);
  const lues = corps.split("\n");
  const section = sectionDesCriteres(lues);
  if (section === null) return [corps.trimEnd(), "", "## Acceptance criteria", "", ...liste].join("\n").trimStart();
  return [...lues.slice(0, section.debut + 1), "", ...liste, "", ...lues.slice(section.fin)].join("\n").trimEnd();
}

export type AtelierDeVerdictIncomplet = {
  journal: Journal;
  projet: string;
  github: GitHub;
  depotGitHub: string;
  noter: (ticket: number | null, fait: FaitManager) => unknown;
  demander: <T>(
    sujet: { numero: number; prefixe: string; nom: string },
    consigne: string,
    lire: (message: string | null) => { valeur: T } | { illisible: string },
  ) => Promise<Reponse<T> | null>;
  peutJuger: () => boolean;
  arrete: () => boolean;
  avertir: (message: string) => void;
  signature: (run: string | null, verbe: string) => string;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirVerdictIncomplet(atelier: AtelierDeVerdictIncomplet) {
  const { journal, projet, github, noter, avertir, arrete } = atelier;

  const derniere = (ticket: number) => journal.duTicket(ticket).findLast((evenement) => evenement.type === "manager.completed");

  const commenter = async (ticket: number, corps: string[]) => {
    try {
      await github.commenter(ticket, [MARQUEUR_MANAGER, ...corps].join("\n"));
    } catch (erreur) {
      if (!arrete()) avertir(`brigade : commentaire non posé sur l'issue #${ticket} — ${message(erreur)}`);
    }
  };

  return {
    // Suit un verdict `incomplete`, s'il ne l'a pas encore été. Rend
    // `qualifie` quand le ticket est complété et jugé `fire` au journal — il
    // reste à poser ses labels ; `question` quand une carte est posée, ou que
    // le verdict est déjà suivi ; `attente` quand c'est à refaire au tour
    // suivant.
    async traiter(issue: IssueOuverte, commentaires: string[], verdict: IssueDuManager): Promise<"qualifie" | "question" | "attente"> {
      const suivi = verdict.fingerprint ?? empreinte(issue, commentaires);
      // Ce verdict, déjà suivi d'une carte ou d'une complétion, ne se relit
      // plus ; ses réponses illisibles, elles, se comptent.
      const suivis = journal.duTicket(issue.number).flatMap((evenement) => {
        const payload = evenement.payload as { run: string; fingerprint?: string; outcome?: string; reason: string };
        return evenement.type === "manager.completed" && payload.fingerprint === suivi ? [payload] : [];
      });
      if (suivis.some(({ outcome }) => outcome !== "unreadable")) return "question";
      let illisibles = suivis.length;
      const precedente = suivis.at(-1);
      // Essais épuisés à un tour précédent, sans que la carte ait pu se poser.
      let lue: { run: string; valeur: Completion } | null =
        precedente && illisibles >= ESSAIS_DE_COMPLETION ? { run: precedente.run, valeur: questionDeRepli(precedente.reason) } : null;
      while (lue === null) {
        if (!atelier.peutJuger()) return "attente";
        const reponse = await atelier.demander<Completion>(
          { numero: issue.number, prefixe: "complete", nom: "complétion" },
          consigneDeCompletion({ depot: atelier.depotGitHub, issue, commentaires, verdict }),
          lireCompletion,
        );
        if (!reponse || arrete()) return "attente";
        if ("valeur" in reponse) {
          lue = reponse;
          break;
        }
        noter(issue.number, { type: "manager.completed", payload: { run: reponse.run, fingerprint: suivi, outcome: "unreadable", reason: reponse.illisible } });
        illisibles += 1;
        if (illisibles >= ESSAIS_DE_COMPLETION) {
          // Les essais épuisés : la question passe au chef, jamais un
          // avertissement seul.
          avertir(`brigade : complétion illisible sur l'issue #${issue.number} (${reponse.illisible}), ${illisibles} fois — la question passe au chef`);
          lue = { run: reponse.run, valeur: questionDeRepli(reponse.illisible) };
        } else avertir(`brigade : complétion illisible sur l'issue #${issue.number} (${reponse.illisible}), essai ${illisibles}/${ESSAIS_DE_COMPLETION} — elle est redemandée`);
      }
      const { run, valeur } = lue;
      const signature = atelier.signature(run, "Complété");

      if (valeur.issue === "question") {
        // Le label d'abord : sans lui, rien n'est écrit, et tout se refait.
        try {
          if (!issue.labels.includes(QUESTION_PRODUIT)) await github.labelliser(issue.number, [QUESTION_PRODUIT]);
        } catch (erreur) {
          if (!arrete()) avertir(`brigade : \`${QUESTION_PRODUIT}\` non posé sur l'issue #${issue.number}, repris au tour suivant — ${message(erreur)}`);
          return "attente";
        }
        if (arrete()) return "attente";
        const entree = journal.base.transaction(() => {
          const entree = entrerDansTodo(
            journal,
            projet,
            issue.number,
            { type: "product", resume: valeur.resume, enonce: valeur.question, capture: null, choix: valeur.choix.map((texte) => ({ texte, suite: "resume" })) },
            AUTEUR_DE_CARTE,
          );
          noter(issue.number, { type: "manager.completed", payload: { run, fingerprint: suivi, outcome: "question", reason: valeur.motif, question: valeur.question } });
          return entree;
        });
        await commenter(issue.number, [
          "**Manager — ticket incomplet : il attend une décision de produit, une question est posée au chef.**",
          "",
          valeur.motif,
          "",
          `**${entree.porte === "todo" ? "Carte dans TODO" : "Carte proposée, que le triage lit d'abord"}** (\`${QUESTION_PRODUIT}\`). ${valeur.question}`,
          "",
          "Ta réponse sur l'issue la fait rejuger.",
          "",
          signature,
        ]);
        return "question";
      }

      // Le corps réécrit d'abord : le ticket complété est ce que le jugement
      // `fire` lit, et l'empreinte sous laquelle il ne se rejuge pas.
      const corps = reecrireCriteres(issue.body, valeur.criteres);
      try {
        await github.ecrireCorps(issue.number, corps);
      } catch (erreur) {
        if (!arrete()) avertir(`brigade : critères non réécrits sur l'issue #${issue.number}, repris au tour suivant — ${message(erreur)}`);
        return "attente";
      }
      if (arrete()) return "attente";
      const complete = empreinte({ ...issue, body: corps }, commentaires);
      journal.base.transaction(() => {
        noter(issue.number, { type: "manager.completed", payload: { run, fingerprint: suivi, outcome: "completed", reason: valeur.motif, criteria: valeur.criteres } });
        noter(issue.number, {
          type: "manager.judged",
          payload: { run, fingerprint: complete, verdict: "fire", kind: "ticket", reason: valeur.motif, missing: null, model: valeur.model, effort: valeur.effort, calibration: valeur.calibration },
        });
      });
      await commenter(issue.number, [
        "**Manager — ticket incomplet complété par le manager.** Le manque ne demandait aucune décision de produit : ses critères d'acceptation sont réécrits dans le corps de l'issue, et il est qualifié.",
        "",
        `**Ce qui manquait.** ${verdict.missing ?? verdict.reason}`,
        "",
        `**Ce qui est complété.** ${valeur.motif}`,
        "",
        ...valeur.criteres.map((critere) => `- ${critere}`),
        "",
        "Ce ticket est à toi : réécris un critère, le manager le rejugera.",
        "",
        signature,
      ]);
      return "qualifie";
    },
  };
}
