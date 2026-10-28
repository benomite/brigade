// La carte de chaque ticket qui attend le chef (épique #1764) : toute entrée de
// la file (attend.ts) qui porte un ticket est une carte de TODO, et chacune a
// la forme unique (forme.ts) — ce qui se passe en deux phrases simples au
// plus, la question, ses choix qui jouent chacun leur geste, la réponse libre,
// et « ask the second » à côté, jamais parmi eux. Une carte à un seul geste —
// merger une livraison verte que la pass ne merge pas — montre ce bouton et ne
// demande rien.
//
// Les sortes, et ce que leurs choix jouent (reponse-carte.ts) :
// - `merge`, une livraison verte que la pass ne merge pas : faute de grant, ou
//   à relire — elle change ses juges ou ce que le projet s'ouvre —, un seul
//   geste, la merger ; refusée par GitHub, la merger, la renvoyer à un cook, ou
//   sortir le ticket du rail ;
// - `remontee`, un ticket rouge remonté par le manager ou la pass : le renvoyer
//   à un cook, merger sa PR telle quelle s'il en a une, ou le sortir du rail ;
// - `fermee`, une PR fermée sans merge : le recommencer, ou le sortir du rail ;
// - `ecartee`, `illisible` — une issue que le manager ne juge pas, ou qu'il n'a
//   pas su lire : un seul geste, la lui rendre avec la réponse du chef ;
// - `question`, la question du manager avant de découper une épique : la
//   découper comme il l'entend, ou en faire un seul ticket ;
// - `carte`, entrée par la porte de TODO (carte-todo.ts) : la sienne, telle
//   qu'elle a été admise.
//
// Aucune carte ne demande au chef de remettre un ticket sur le rail ou de l'en
// sortir quand c'est la cuisine qui l'a mis de côté (#1834) : un tel ticket
// n'attend pas le chef, il reste sur le rail avec sa raison et repart seul
// quand elle tombe (mise-de-cote.ts, `MISES_DE_COTE`).
//
// Rien n'y est complété : chaque carte passe la règle (`carteValide`), et une
// carte qui ne la tient pas lève au lieu d'être montrée. Les textes n'y portent
// que des mots fixes, des numéros et des adresses : un motif ou une cause en
// texte libre reste dans la ligne du bloc `awaiting`, que la fiche montre. Une
// seule exception : ce que le second juge écrit pour la carte d'une livraison à
// relire (`change`), qui n'y entre que s'il en tient la règle — sinon, des mots
// fixes le remplacent.
import { attentesDuChef, type Attente, type AttenteDeTicket } from "../attend.ts";
import type { Base } from "../base.ts";
import { A_RELIRE, declarationsDeLaCause, DU_MANAGER, ENCORE_ROUGE, MERGE_REFUSE, NON_JUGEE, SANS_GRANT, testsInstablesDeLaCause } from "../events/pass.ts";
import { REGLAGES_DU_PROJET } from "../mode-auto.ts";
import { lireRail } from "../projections/rail.ts";
import { DECLARATION_RESEAU } from "../reseau.ts";
import { DECLARATION as DECLARATION_SECRETS } from "../secrets.ts";
import { carteValide, validerCarte, type CarteTodo, type Geste } from "./forme.ts";

// La carte d'un ticket, et sa sorte : celle d'une carte de la porte (`product`,
// `design`), sinon celle de son attente (`merge`, `remontee`, `86`…).
export type CarteDuTicket = CarteTodo & { type: string };

const choix = (texte: string, suite: Geste) => ({ texte, suite });
const RENVOYER = choix("Send it back to a cook", "resume");
const RETIRER = choix("Take it off the rail", "drop");
const RENDRE_AU_MANAGER = choix("Hand it back to the manager with my answer", "resume");

const laPr = (pr: string | null) => pr ?? "its delivery";

// Une livraison à relire (#1877) : ce qu'elle change, dit au chef en mots
// simples, puis ce que sa relecture en a trouvé — rien de bloquant : une
// livraison qui a un bloquant repart à la cuisine, sans carte. Un seul bouton,
// la merger : c'est le geste du chef, que la pass ne fait jamais à sa place.
type AttenteAMerger = Extract<AttenteDeTicket, { quoi: "merge" }>;

// Ce que chaque déclaration ouvre, et ce que chaque juge vérifie.
const DECLARATIONS_DITES: Record<string, string> = {
  [DECLARATION_RESEAU]: "the hosts its cooks may reach",
  [REGLAGES_DU_PROJET]: "the project settings its cooks run with",
  [DECLARATION_SECRETS]: "the secrets its cooks receive",
};
const JUGES_DITS: Array<[string, string]> = [
  [".github/workflows/", "the CI that checks every delivery"],
  [".claude/brigade/", "the gates every delivery must pass"],
];
const CE_QUI_JUGE = "how deliveries are checked";
// Ce que le second juge en dit tient en quelques mots : au-delà, la carte le
// dit en mots fixes.
const CHANGEMENT_MAX = 160;

const enUneListe = (mots: string[]) => (mots.length <= 1 ? mots.join("") : `${mots.slice(0, -1).join(", ")} and ${mots.at(-1)}`);

// Ce que dit le second juge, prêt à suivre « it » : sans son « it », sans point final.
function changementDit(change: string | null | undefined): string | null {
  const dit = change?.replace(/\s+/g, " ").trim().replace(/^it\s+/i, "").replace(/[.\s]+$/, "") ?? "";
  if (dit === "" || dit.length > CHANGEMENT_MAX) return null;
  return /^[A-Z][a-z]/.test(dit) ? `${dit[0]?.toLowerCase()}${dit.slice(1)}` : dit;
}

// Ce que sa relecture en a trouvé, selon son second juge — sans lui, elle ne
// touche qu'à ses déclarations.
const RIEN_DE_BLOQUANT = "Its review found nothing blocking, and only you can merge it.";
const RELU = {
  sans: RIEN_DE_BLOQUANT,
  "not-weakened": RIEN_DE_BLOQUANT,
  weakened: "Its review found nothing blocking, but it loosens a check, which only you can accept.",
  "cannot-establish": "Its review found nothing blocking, but no one could tell whether it loosens a check.",
} as const;

function carteARelire(attente: AttenteAMerger) {
  const { ticket, second } = attente;
  const declarations = (declarationsDeLaCause(attente.cause) ?? "").split(", ").filter((fichier) => fichier !== "");
  const ouvre = [...new Set(declarations.map((fichier) => DECLARATIONS_DITES[fichier] ?? "what the project opens up"))];
  // Ses juges : ceux que la pass a consignés, sinon ce que dit le motif.
  const fichiers = (attente.livraison?.juges ?? []).map(({ fichier }) => fichier);
  const juges = [...new Set(fichiers.flatMap((fichier) => JUGES_DITS.filter(([prefixe]) => fichier.startsWith(prefixe)).map(([, dit]) => dit)))];
  const touchesLesJuges = second !== undefined || declarations.length === 0;
  const relu = RELU[second?.verdict ?? "sans"];
  const merger = [choix("Merge", "merge")];
  const resume = (ceQuiChange: string[]) => `The delivery of #${ticket} changes ${enUneListe(ceQuiChange)}. ${relu}`;

  // Ce que le second juge en a dit, s'il l'a dit en mots simples.
  const change = changementDit(second?.change);
  if (change !== null) {
    const proposee = { resume: resume([...ouvre, `${CE_QUI_JUGE}: it ${change}`]), question: null, choix: merger };
    if (validerCarte(proposee).valide) return proposee;
  }
  const verifie = touchesLesJuges ? (juges.length > 0 ? juges : [CE_QUI_JUGE]) : [];
  return { resume: resume([...ouvre, ...verifie]), question: null, choix: merger };
}

// Ce que la carte d'une attente propose, avant la règle.
function proposition(attente: AttenteDeTicket) {
  const { ticket } = attente;
  switch (attente.quoi) {
    case "merge": {
      const merger = choix(`Merge ${laPr(attente.pr)}`, "merge");
      switch (attente.reason) {
        case SANS_GRANT:
          return {
            resume: attente.expired === null ? `The delivery of #${ticket} is green, but the pass does not merge it without a merge grant.` : `The delivery of #${ticket} is green, but the merge grant lapsed on its own on ${attente.expired}.`,
            question: null,
            choix: [merger],
          };
        case A_RELIRE:
          return carteARelire(attente);
        case MERGE_REFUSE:
          return {
            resume: `The delivery of #${ticket} is green, but GitHub refused to merge it. What GitHub refuses must be lifted before a merge goes.`,
            question: `Try the merge of #${ticket} again, or send it back to a cook?`,
            choix: [choix(`Merge ${laPr(attente.pr)} again`, "merge"), RENVOYER, RETIRER],
          };
        default:
          return { resume: `The delivery of #${ticket} is green, but the pass did not merge it.`, question: null, choix: [merger] };
      }
    }
    case "remontee": {
      const resume = (() => {
        if (attente.why !== undefined) return `#${ticket} was held by the code rename, and its delivery does not carry over onto the renamed tree.`;
        if (attente.reason === ENCORE_ROUGE) return `${attente.cause === DU_MANAGER ? "The manager" : "The pass"} escalated #${ticket}: its delivery is still red after its returns.`;
        if (attente.reason === NON_JUGEE) {
          return testsInstablesDeLaCause(attente.cause) !== null
            ? `The delivery of #${ticket} is red twice on a test it does not touch. The base looks unstable on that test.`
            : `The pass escalated #${ticket}: it could not judge its delivery.`;
        }
        return `#${ticket} was escalated, for a reason the kitchen knows no action for.`;
      })();
      return { resume, question: `What does the kitchen do with #${ticket}?`, choix: [RENVOYER, ...(attente.pr === null ? [] : [choix(`Merge ${attente.pr} as it is`, "merge")]), RETIRER] };
    }
    case "fermee":
      return {
        resume: `The PR of #${ticket} was closed without being merged, and the ticket still holds its place on the rail.`,
        question: `Start #${ticket} over, or take it off the rail?`,
        choix: [choix("Start it over: a cook takes it up again", "resume"), RETIRER],
      };
    case "ecartee": {
      const retenue = attente.reason === "blocked-on-human" ? `#${ticket} is held back by the blocked-on-human label.` : `The manager set #${ticket} aside: its issue carries the ${attente.reason} label.`;
      return { resume: `${retenue} Your answer is written on the issue and the label removed, so the manager judges it again.`, question: null, choix: [RENDRE_AU_MANAGER] };
    }
    case "illisible":
      return {
        resume: `The manager could not read its own ${attente.epique ? `split of the epic #${ticket}` : `judgment of #${ticket}`}. Your answer is written on the issue for it to read.`,
        question: null,
        choix: [choix("Judge it again with what the issue says", "resume")],
      };
    case "question":
      return {
        resume: `The manager asked a question on the epic #${ticket} before splitting it. It splits the epic once your answer is on the issue.`,
        question: `How does the manager split #${ticket}?`,
        choix: [choix("Split it as you think best", "resume"), choix("Do not split it: make it a single ticket", "resume")],
      };
    case "carte": {
      const { resume, question, choix: choisis, captures } = attente.carte;
      // Entrée avant la forme unique avec un seul choix, que la porte admettait
      // alors : un seul geste, qui ne demande rien — sa question devient ce que
      // la carte dit, si elle s'y lit en phrases simples.
      if (choisis.length === 1) return { resume: validerCarte({ resume: question, choix: choisis }).valide ? question : resume, question: null, choix: choisis, captures };
      return { resume, question, choix: choisis, captures };
    }
  }
  return null;
}

// La carte du ticket qui attend, validée : elle lève si elle ne tient pas la
// règle — un oubli de ce module, jamais une carte à moitié montrée.
export function carteDeLAttente(attente: AttenteDeTicket): CarteDuTicket {
  const proposee = proposition(attente);
  if (proposee === null) return { type: attente.quoi, ...carteValide({}) };
  return { type: attente.quoi === "carte" ? attente.carte.type : attente.quoi, ...carteValide(proposee) };
}

// L'attente dont un ticket montre la carte, parmi celles de la file : la carte
// que la porte a admise pour lui, posée pour le chef, prime ; sinon sa première
// entrée. Undefined s'il n'attend pas le chef.
export function attenteDeLaCarte(attentes: readonly Attente[], ticket: number): AttenteDeTicket | undefined {
  const siennes = attentes.filter((autre): autre is AttenteDeTicket => autre.ticket === ticket);
  return siennes.find(({ quoi }) => quoi === "carte") ?? siennes[0];
}

// La carte qu'un ticket montre dans TODO — celle que `faits` donne —, l'attente
// d'où elle vient, et toutes les siennes ; null s'il n'attend pas le chef.
export function carteDuTicket(base: Base, ticket: number): { attente: AttenteDeTicket; carte: CarteDuTicket; attentes: AttenteDeTicket[] } | null {
  const attentes = attentesDuChef(base, lireRail(base)).filter((autre): autre is AttenteDeTicket => autre.ticket === ticket);
  const attente = attenteDeLaCarte(attentes, ticket);
  return attente === undefined ? null : { attente, carte: carteDeLAttente(attente), attentes };
}
