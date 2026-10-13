// Ce que le clic sur une carte de T'attend écrit dans le second : une demande en prose,
// pas une commande. La carte dit le geste (le bloc `attend` de `status`, mot pour mot) ;
// le second lit l'issue, l'explique, et c'est lui qui répond dessus — il a la file, son
// historique et son rôle. L'app n'explique rien, n'agit pas sur l'issue et ne lit pas
// l'écran : elle écrit une phrase, sans Entrée (terminaux.ts, `inscrire`).
import { CONTROLE } from "./terminaux.ts";

// Pas de contrôle de ce que la file a dit, et pas de `!` ni de `/` en tête : la phrase
// commence par une lettre, le second ne la prend pour aucune commande.
export const REFUS_CONTROLE = "rien n'est écrit : ce que la file dit de ce ticket porte un caractère de contrôle, et un retour à la ligne aurait envoyé la demande";

// Ce que la note dit quand la demande est écrite. Le risque n'est pas écarté : devant un
// dialogue (une permission, un choix numéroté), l'app ne peut pas savoir que le texte y
// tombe, et une phrase contient des lettres et des chiffres que certains dialogues
// prennent pour un choix, sans Entrée. Elle ne le prétend donc pas.
export function noteDeLaDemande(demande: string): string {
  return `demande écrite dans le second, sans Entrée : « ${demande} » — une phrase, pas une commande : devant l'invite de \`claude\`, elle attend ton Entrée, à la suite de ta frappe si tu tapais. Devant un dialogue (une permission, un choix) ou le mode vim, ces caractères sont des touches, et une phrase en contient que certains dialogues prennent pour un choix : ce risque n'est pas écarté — regarde le second avant de valider`;
}

// La demande pour un ticket de ce projet d'après ce que la file en dit — ou pourquoi
// rien n'est écrit. `lignes` : celles du bloc pour ce ticket, mot pour mot ; `titre` :
// celui que `faits` donne, s'il y en a un.
export function demandeDe(projet: string, ticket: number, lignes: readonly string[], titre?: string): { demande: string } | { refus: string } {
  // Rien n'est rogné : un retour chariot en bout de ligne reste, et refuse.
  const dit = lignes.filter((ligne) => ligne.trim() !== "");
  const file = dit.length === 0 ? "la file n'en dit rien de plus que son numéro" : `la file en dit : « ${dit.join(" ; ")} »`;
  const demande =
    `Le ticket #${ticket} de ${projet}${titre === undefined ? "" : ` (« ${titre} »)`} m'attend, et je ne sais pas quoi en faire — ${file}. ` +
    `Lis l'issue #${ticket}, explique-moi ce qu'on attend de moi et pourquoi, puis redis-moi le geste que la file nomme, sans en inventer un autre. ` +
    `Quand j'ai décidé, c'est toi qui réponds sur l'issue ou fais le geste avec moi ; n'agis pas avant mon accord.`;
  return CONTROLE.test(demande) ? { refus: REFUS_CONTROLE } : { demande };
}
