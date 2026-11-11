// La mise en place qui démarre seule, dans le second d'un projet pas encore
// préparé pour Brigade (#3167, épique #3164). Le second ne répond plus « tape
// `/brigade:init` » : son lancement (`second/lancement.ts`, `planDuSecond`) lui
// donne un premier message qui ouvre la mise en place, avec ce qui a été lu du
// dépôt (`lecture-depot.ts`) — la branche d'intégration, les checks, les zones
// de fichiers —, chacun avec une ou deux phrases sur ce à quoi il sert dans
// Brigade : la mise en place est le tutoriel du projet du chef. Ce qui n'a pas
// pu être lu est dit tel, avec sa raison, et laissé aux questions.
//
// Le message tient sur une ligne : sous Windows, un `claude.cmd` ne reçoit
// aucun argument sur plusieurs lignes (`sans-invite.ts`, `ligneDeCmd`).
import { ACCEPTANCES, questionsInOrder, type UnsettledPoint } from "./questions.ts";
import { etatDuDepot, lireLeDepot, type LectureDuDepot, type Trouvaille } from "./lecture-depot.ts";

// Ce à quoi chaque chose sert dans Brigade, en une ou deux phrases.
export const SERT = {
  branche: "It is where every delivery lands: each cook starts its worktree from it, and the pass merges a ticket into it only once that ticket's checks are green.",
  checks: "They are the gates: the pass runs them on every delivery, and a red one sends the ticket back to a cook instead of merging it. A check that runs nothing would be a false green, so none is guessed.",
  zones: "They split the repository into parts with their own rules: each ticket names the zone it writes in, so that cooks working at the same time do not touch the same files.",
} as const;

const TITRES = { branche: "Integration branch", checks: "Checks", zones: "File zones" } as const;

const enCode = (valeur: string | string[]) => (Array.isArray(valeur) ? valeur : [valeur]).map((mot) => `\`${mot}\``).join(", ");

// Une chose de la proposition : ce qui a été lu et d'où, ou pourquoi rien ne l'a été — puis à quoi elle sert.
function chose(cle: keyof LectureDuDepot, trouvaille: Trouvaille<string | string[]>): string {
  const lu = trouvaille.lu ? `found ${enCode(trouvaille.valeur)} (read from ${trouvaille.source})` : `not read — ${trouvaille.raison.replace(/[.\s]+$/, "")}; leave it for the questions, do not guess it`;
  return `${TITRES[cle]}: ${lu}. What it is for: ${SERT[cle]}`;
}

// La proposition, d'après une lecture du dépôt.
export function proposition(lecture: LectureDuDepot): string {
  return (["branche", "checks", "zones"] as const).map((cle, rang) => `(${rang + 1}) ${chose(cle, lecture[cle])}`).join(" ");
}

// Les points de la mise en place, d'après la lecture : ceux que la lecture a réglés ne sont pas posés,
// les autres le sont, chacun avec la réponse que l'app recommande.
export function pointsDeLaMiseEnPlace(lecture: LectureDuDepot): UnsettledPoint[] {
  const point = (id: keyof LectureDuDepot, question: string, recommended: string): UnsettledPoint => {
    const t = lecture[id];
    return { id, question, recommended, ...(t.lu ? { settled: (Array.isArray(t.valeur) ? t.valeur : [t.valeur]).join(", ") } : {}) };
  };
  return [
    point("branche", "Which branch should every delivery land on?", "main"),
    point("checks", "Which command must pass before a delivery is merged?", "none for now, so that no check runs nothing"),
    point("zones", "How should the repository be split into parts with their own rules?", "one part for the whole repository"),
  ];
}

// La suite du message : ce que le second demande au chef, et comment.
function questions(lecture: LectureDuDepot): string {
  const aPoser = questionsInOrder(pointsDeLaMiseEnPlace(lecture));
  if (aPoser.length === 0) return "Everything was read, so there is nothing to ask: show the chef the three items and carry out the setup yourself with the app's `brigade:init` skill, with those values.";
  const liste = aPoser.map((q, rang) => `(${rang + 1}) ${q.text}`).join(" ");
  return [
    "Ask the chef only what could not be read — never an item that was found — one question at a time, in this order, and wait for the answer before the next one:",
    liste,
    `Each question states its recommended answer, in French for the chef. A reply that is one of ${ACCEPTANCES.map((mot) => `"${mot}"`).join(", ")} alone accepts the recommendation: record the recommended value. Any other reply: record what the chef wrote.`,
    "Once they have answered all of them, carry out the setup yourself with the app's `brigade:init` skill, with the items found and these answers.",
  ].join(" ");
}

// Le premier message du second, une ligne, d'après une lecture du dépôt.
export function messageDeMiseEnPlace(lecture: LectureDuDepot): string {
  return [
    "[Brigade app] This project is not set up for Brigade yet: its `CLAUDE.md` has no `## Équipe multi-agents` section. Start its setup now, the chef has nothing to type — never ask them to type `/brigade:init` or any other command.",
    "Here is what the app read in the repository.",
    proposition(lecture),
    "Tell the chef, in French, each item and what it is for in Brigade, in one or two sentences, so that the setup walks them through their own project. Say plainly which items could not be read, and why.",
    questions(lecture),
    "If this conversation already started the setup, pick it up where it stands instead of starting over.",
  ].join(" ");
}

// Ce que le lancement du second ajoute à ses arguments, dans ce dossier : le
// premier message, quand c'est un dépôt git sans la section des bindings ;
// rien sinon — un dossier hors dépôt, un dépôt préparé, ou un `CLAUDE.md` qui
// ne se lit pas (on ne sait pas, on ne démarre rien). Seulement pour le second
// lancé avec son rôle (`--append-system-prompt-file`) : une session ouverte sur
// une commande (`claude /brigade:init`) a déjà son premier message.
export function argumentsDeMiseEnPlace(dossier: string, args: readonly string[]): string[] {
  if (!args.includes("--append-system-prompt-file")) return [];
  if (etatDuDepot(dossier).etat !== "non-prepare") return [];
  return [messageDeMiseEnPlace(lireLeDepot(dossier))];
}
