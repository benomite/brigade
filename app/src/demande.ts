// Le geste avec jugement : ce qu'un clic écrit dans le second quand il faut lire, juger,
// rédiger ou arbitrer — une demande en prose, pas une commande, et **rien ne l'envoie** :
// c'est l'Entrée du chef qui la fait partir, jamais l'app (docs/superpowers/specs/
// 2026-10-13-app-poste-de-travail-design.md, « Le modèle, en quatre règles »). Deux clics
// l'écrivent : une carte de T'attend — la carte dit le geste (le bloc `attend` de `status`,
// mot pour mot), le second lit l'issue, l'explique, et c'est lui qui répond dessus ; une
// ligne de la bande d'alertes dont le geste se joue hors de l'app — sur la box, ou après
// lecture. L'app n'explique rien, n'agit sur rien et ne lit pas l'écran : elle écrit une
// phrase, sans Entrée (terminaux.ts, `inscrire`).
import type { Alerte } from "./alertes.ts";
import { CONTROLE } from "./terminaux.ts";

// Pas de contrôle de ce que la file a dit, et pas de `!` ni de `/` en tête : la phrase
// commence par une lettre, le second ne la prend pour aucune commande.
export const REFUS_CONTROLE = "nothing is written: what the queue says about this ticket carries a control character, and a line break would have sent the request";
export const REFUS_CONTROLE_ALERTE = "nothing is written: what the box says about this alert carries a control character, and a line break would have sent the request";

// Ce que la note dit quand la demande est écrite. Le risque n'est pas écarté : devant un
// dialogue (une permission, un choix numéroté), l'app ne peut pas savoir que le texte y
// tombe, et une phrase contient des lettres et des chiffres que certains dialogues
// prennent pour un choix, sans Entrée. Elle ne le prétend donc pas.
export function noteDeLaDemande(demande: string): string {
  return `request written in the second, without Enter: “${demande}” — a sentence, not a command: at \`claude\`'s prompt, it waits for your Enter, after what you were typing if you were typing. In front of a dialog (a permission, a choice) or vim mode, these characters are keystrokes, and a sentence contains some that certain dialogs take for a choice: this risk is not ruled out — look at the second before confirming`;
}

// La demande pour un ticket de ce projet d'après ce que la file en dit — ou pourquoi
// rien n'est écrit. `lignes` : celles du bloc pour ce ticket, mot pour mot ; `titre` :
// celui que `faits` donne, s'il y en a un.
export function demandeDe(projet: string, ticket: number, lignes: readonly string[], titre?: string): { demande: string } | { refus: string } {
  // Rien n'est rogné : un retour chariot en bout de ligne reste, et refuse.
  const dit = lignes.filter((ligne) => ligne.trim() !== "");
  const file = dit.length === 0 ? "the queue says nothing more about it than its number" : `the queue says: “${dit.join(" ; ")}”`;
  const demande =
    `Ticket #${ticket} of ${projet}${titre === undefined ? "" : ` (“${titre}”)`} is awaiting me, and I do not know what to do with it — ${file}. ` +
    `Read issue #${ticket}, explain what is expected of me and why, then tell me again the action the queue names, without inventing another. ` +
    `Once I have decided, you reply on the issue or do the action with me; do not act before I agree.`;
  return CONTROLE.test(demande) ? { refus: REFUS_CONTROLE } : { demande };
}

// La demande pour une ligne de la bande d'alertes de ce projet, d'après ce qu'elle dit — ou
// pourquoi rien n'est écrit. Ce que la box en a écrit est repris mot pour mot, ses lignes
// mises bout à bout : un retour à la ligne y enverrait la demande.
export function demandeDeLAlerte(projet: string, { dit, releve, pourquoi, geste, prix }: Alerte): { demande: string } | { refus: string } {
  const ecrit = releve === undefined ? "" : ` — the box writes: “${releve.split("\n").join(" ; ")}”`;
  const demande =
    `The alert band of ${projet} says: “${dit}”${ecrit}${pourquoi === undefined ? "" : ` (${pourquoi})`}. ` +
    `The action it names: “${geste}” — its cost: ${prix}. ` +
    `Explain what is happening and what this action commits me to, without inventing another; then, once I have decided, help me do it. Do not act before I agree.`;
  return CONTROLE.test(demande) ? { refus: REFUS_CONTROLE_ALERTE } : { demande };
}
