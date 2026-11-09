// Un ticket `blocked-on-human` qui ne dit pas la décision qu'il attend encombre
// la file du chef sans rien lui demander. Le manager le relit, une fois par
// état de l'issue, et en tire l'une de trois issues :
//   - la décision attendue est écrite dans le ticket : rien ne change, il reste
//     retenu comme avant ;
//   - une vraie question s'en dérive — un choix de produit, un écran à valider,
//     un geste que seul le chef peut faire : elle entre dans TODO en carte
//     typée, et l'énoncé de la carte est la question dérivée ;
//   - rien n'attend le chef : la cuisine reprend le ticket, le label s'en va
//     et le manager le juge au même tour.
// Chaque issue est écrite au journal (`manager.requalified`), avec l'empreinte
// de ce qui a été lu : le même état ne se requalifie pas deux fois.
import { cartesEnTodo, entrerDansTodo, sortirDeTodo, TYPES_PROPOSES, type TypePropose } from "./carte-todo.ts";
import { gesteGit, reparationDuGeste } from "./garde-todo/geste-git.ts";
import type { Reponse } from "./decoupage.ts";
import type { FaitManager } from "./events/manager.ts";
import type { GitHub, IssueOuverte } from "./github.ts";
import type { Journal } from "./journal.ts";
import { empreinte, issueEnDonnee, MARQUEUR_MANAGER, objet, parmi, phrase } from "./juger.ts";

export const RETENUE = "blocked-on-human";
const AUTEUR_DE_CARTE = "manager";

export type Requalification =
  | { issue: "enoncee"; motif: string }
  // `enonceEn` : la même question qu'`enonce`, en anglais — celle que l'issue
  // cite ; `enonce` reste la carte du chef.
  | { issue: "carte"; motif: string; carte: { type: TypePropose; enonce: string; enonceEn: string; capture: string | null } }
  | { issue: "reprise"; motif: string };

export function consigneDeRequalification(mission: { depot: string; issue: { number: number; title: string; body: string; labels: string[] }; commentaires: string[] }): string {
  const { depot, issue, commentaires } = mission;
  return [
    `Tu es le manager de la brigade sur le dépôt ${depot}. Le chef a posé \`blocked-on-human\` sur une issue : elle attend un humain. Tu cherches une seule chose : l'issue dit-elle quelle décision, ou quel geste, elle attend de lui ?`,
    "",
    "## Ce que tu peux répondre",
    "",
    "- `enoncee` — la décision ou le geste attendu est écrit dans l'issue ou ses commentaires (qui doit trancher quoi, ou quoi faire). Rien ne change : elle reste retenue.",
    "- `carte` — elle ne le dit pas, mais tu en dérives une vraie question pour le chef, d'un de ces types :",
    "  - `product` : un choix entre plusieurs voies, qui change ce que l'utilisateur obtient ;",
    "  - `design` : un écran ou un rendu à valider — `capture` (un chemin ou une adresse, une seule ligne) est alors exigée ;",
    "  - `gesture` : un accès, un secret, une action que seul le chef peut faire — jamais un geste git (merger, rebaser, fetch, mettre une branche à jour, relancer une CI) : la cuisine le fait, ce n'est pas une carte (`reprise`).",
    "  `enonce` est la question dérivée, en une seule ligne.",
    "- `reprise` — elle ne dit rien d'attendu, et tu n'en dérives aucune question : aucun choix ni geste ne s'y cache, la cuisine peut la reprendre. Le label est alors retiré et le ticket jugé.",
    "",
    "Dans le doute entre `carte` et `reprise`, ne reprends pas : un ticket repris à tort brûle le quota du chef. N'invente jamais une question que l'issue ne contient pas.",
    "",
    "## Ta réponse",
    "",
    "Un seul objet JSON, et rien après lui :",
    "",
    "```json",
    '{"issue": "carte", "motif": "why, in English", "type": "product", "enonce": "la question, en une ligne", "enonce_en": "the same question, in English, on one line", "capture": null}',
    "```",
    "",
    `\`issue\` : \`enoncee\`, \`carte\` ou \`reprise\`. \`type\`, \`enonce\`, \`enonce_en\` et \`capture\` ne servent que pour \`carte\` (\`type\` : ${TYPES_PROPOSES.join(", ")}). \`motif\` est posté sur l'issue, que le chef lit : en anglais, deux ou trois phrases, précises. \`enonce\` est la carte du chef dans l'app : en français ; \`enonce_en\` est le même énoncé traduit en anglais, celui que l'issue cite.`,
    "",
    ...issueEnDonnee(issue, commentaires),
  ].join("\n");
}

const surUneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();

export function lireRequalification(message: string | null): { valeur: Requalification } | { illisible: string } {
  if (message === null || message.trim() === "") return { illisible: "no answer" };
  const lu = objet(message);
  if (!lu) return { illisible: "no JSON object in the answer" };
  const issue = parmi(lu.issue, ["enoncee", "carte", "reprise"]);
  if (!issue) return { illisible: `unknown outcome ${JSON.stringify(lu.issue)} — expected enoncee, carte or reprise` };
  const motif = phrase(lu.motif);
  if (!motif) return { illisible: "no `motif`" };
  if (issue !== "carte") return { valeur: { issue: issue as "enoncee" | "reprise", motif } };
  const type = parmi(lu.type, TYPES_PROPOSES) as TypePropose | null;
  if (!type) return { illisible: `unknown card type ${JSON.stringify(lu.type)} — expected ${TYPES_PROPOSES.join(", ")}` };
  const enonce = phrase(lu.enonce);
  if (!enonce) return { illisible: "a card with no `enonce`" };
  // L'énoncé tel que l'issue le cite : en anglais, jamais la carte française.
  const enonceEn = phrase(lu.enonce_en);
  if (!enonceEn) return { illisible: "a card with no `enonce_en`, the English the issue quotes" };
  const capture = phrase(lu.capture);
  if (type === "design" && capture === null) return { illisible: "a design card with no `capture`" };
  return { valeur: { issue: "carte", motif, carte: { type, enonce: surUneLigne(enonce), enonceEn: surUneLigne(enonceEn), capture: capture === null ? null : surUneLigne(capture) } } };
}

// Ce que le manager prête aux relectures de son tour : la requalification
// ci-dessous et le suivi d'un verdict `incomplete` (manager/verdict-incomplet.ts).
export type AtelierDuManager = {
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

export function ouvrirRequalification(atelier: AtelierDuManager) {
  const { journal, projet, github, noter, avertir, arrete } = atelier;
  const { base } = journal;

  const derniere = (ticket: number) => journal.duTicket(ticket).findLast((evenement) => evenement.type === "manager.requalified");

  const commenter = async (ticket: number, corps: string[]) => {
    try {
      await github.commenter(ticket, [MARQUEUR_MANAGER, ...corps].join("\n"));
    } catch (erreur) {
      if (!arrete()) avertir(`brigade : commentaire non posé sur l'issue #${ticket} — ${message(erreur)}`);
    }
  };

  return {
    // Les cartes posées par une requalification quittent TODO dès que l'issue
    // n'est plus retenue : label retiré par le chef, ou issue fermée.
    suivre(ouvertes: IssueOuverte[]): void {
      for (const carte of cartesEnTodo(base)) {
        const requalifiee = derniere(carte.ticket);
        if ((requalifiee?.payload as { outcome?: string } | undefined)?.outcome !== "card") continue;
        const issue = ouvertes.find((autre) => autre.number === carte.ticket);
        if (issue?.labels.includes(RETENUE)) continue;
        sortirDeTodo(journal, projet, carte.ticket, "the issue no longer carries blocked-on-human, or is closed", AUTEUR_DE_CARTE);
      }
    },

    // Requalifie l'issue retenue, si son état n'a pas encore été lu. Rend
    // `reprise` quand le label est parti et que le ticket est à juger ; sinon
    // `retenue` — elle reste écartée, comme avant.
    async traiter(issue: IssueOuverte, commentaires: string[]): Promise<"reprise" | "retenue" | "attente"> {
      const etat = empreinte(issue, commentaires);
      if ((derniere(issue.number)?.payload as { fingerprint?: string } | undefined)?.fingerprint === etat) return "retenue";
      if (!atelier.peutJuger()) return "attente";
      const reponse = await atelier.demander<Requalification>(
        { numero: issue.number, prefixe: "requalifie", nom: "requalification" },
        consigneDeRequalification({ depot: atelier.depotGitHub, issue, commentaires }),
        lireRequalification,
      );
      if (!reponse || arrete()) return "attente";
      if (!("valeur" in reponse)) {
        noter(issue.number, { type: "manager.requalified", payload: { run: reponse.run, fingerprint: etat, outcome: "unreadable", reason: reponse.illisible } });
        avertir(`brigade : requalification illisible sur l'issue #${issue.number} (${reponse.illisible}) — elle reste retenue`);
        return "retenue";
      }
      const { run, valeur } = reponse;
      const signature = atelier.signature(run, "Read");
      if (valeur.issue === "enoncee") {
        noter(issue.number, { type: "manager.requalified", payload: { run, fingerprint: etat, outcome: "stated", reason: valeur.motif } });
        return "retenue";
      }
      if (valeur.issue === "carte") {
        const { carte } = valeur;
        // Elle entre dans TODO, ou va au triage : une proposition n'est jamais perdue.
        const proposition = { type: carte.type, enonce: carte.enonce, capture: carte.capture };
        const entree = base.transaction(() => {
          const entree = entrerDansTodo(journal, projet, issue.number, proposition, AUTEUR_DE_CARTE);
          noter(issue.number, { type: "manager.requalified", payload: { run, fingerprint: etat, outcome: "card", reason: valeur.motif, card: { kind: carte.type, statement: carte.enonce } } });
          return entree;
        });
        if (entree.porte === "reparation") {
          // Un geste git n'est pas une carte : le ticket `fix` de la cuisine la remplace.
          try {
            // Le ticket `fix` cite l'énoncé anglais : il est posté sur GitHub.
            const fix = await github.creerIssue(reparationDuGeste(gesteGit(proposition) ?? "", { ...proposition, enonce: carte.enonceEn }, issue.number));
            await commenter(issue.number, ["**Manager — `blocked-on-human` on a git gesture: no card for the chef, the kitchen does it.**", "", valeur.motif, "", `The \`fix\` ticket #${fix} is open: ${carte.enonceEn}`, "", signature]);
          } catch (erreur) {
            // Une empreinte vide : le même état est relu au tour suivant.
            noter(issue.number, { type: "manager.requalified", payload: { run, fingerprint: "", outcome: "unreadable", reason: `fix ticket not opened: ${message(erreur)}` } });
            avertir(`brigade : ticket \`fix\` du geste git non ouvert pour l'issue #${issue.number}, repris au tour suivant — ${message(erreur)}`);
            return "attente";
          }
          return "retenue";
        }
        await commenter(issue.number, [
          "**Manager — `blocked-on-human` with no written decision: a card is proposed to the chef.**",
          "",
          valeur.motif,
          "",
          `**${entree.porte === "todo" ? "Card in TODO" : "Card proposed, which the triage reads first"}** (${carte.type}). ${carte.enonceEn}`,
          "",
          "The issue stays held; the card leaves TODO when you remove `blocked-on-human` or close the issue.",
          "",
          signature,
        ]);
        return "retenue";
      }
      // La cuisine reprend le ticket : le label s'en va, puis le fait est écrit.
      try {
        await github.delabelliser(issue.number, RETENUE);
      } catch (erreur) {
        if (!arrete()) avertir(`brigade : \`${RETENUE}\` non retiré de l'issue #${issue.number}, reprise au tour suivant — ${message(erreur)}`);
        return "attente";
      }
      if (arrete()) return "attente";
      noter(issue.number, { type: "manager.requalified", payload: { run, fingerprint: etat, outcome: "taken-back", reason: valeur.motif } });
      await commenter(issue.number, [
        "**Manager — `blocked-on-human` with no awaited decision: the kitchen takes the ticket back.**",
        "",
        valeur.motif,
        "",
        "The label is removed and the manager judges the issue. To hold it again, set `blocked-on-human` again and say the awaited decision.",
        "",
        signature,
      ]);
      return "reprise";
    },
  };
}
