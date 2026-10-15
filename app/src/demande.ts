// Le geste avec jugement : ce qu'un clic écrit dans le second quand il faut lire, juger,
// rédiger ou arbitrer — une demande en prose, pas une commande, et **rien ne l'envoie** :
// c'est l'Entrée du chef qui la fait partir, jamais l'app (docs/superpowers/specs/
// 2026-10-13-app-poste-de-travail-design.md, « Le modèle, en quatre règles »). Deux clics
// l'écrivent : une carte de T'attend — la carte dit le geste (le bloc `attend` de `status`,
// mot pour mot), le second lit l'issue, en tire une réponse courte (ce qui se passe, la question, sa recommandation, l'offre du détail), et c'est lui qui répond dessus ; une
// ligne de la bande d'alertes dont le geste se joue hors de l'app — sur la box, ou après
// lecture. L'app n'explique rien, n'agit sur rien et ne lit pas l'écran : elle écrit une
// phrase, sans Entrée (terminaux.ts, `inscrire`).
import type { Alerte } from "./alertes.ts";
import { CONTROLE } from "./terminaux.ts";

// Pas de contrôle de ce que la file a dit, et pas de `!` ni de `/` en tête : la phrase
// commence par une lettre, le second ne la prend pour aucune commande.
export const REFUS_CONTROLE = "nothing is written: what the queue says about this ticket carries a control character, and a line break would have sent the request";
export const REFUS_CONTROLE_TICKET = "nothing is written: what the box says about this ticket carries a control character, and a line break would have sent the request";
export const REFUS_CONTROLE_ALERTE = "nothing is written: what the box says about this alert carries a control character, and a line break would have sent the request";

// Ce que la note dit quand la demande est écrite : une ligne, sans la recopier — elle est dans le
// terminal, juste en dessous. Elle disparaît à l'Entrée du chef (terminaux.ts, `ecrire`).
// L'avertissement ne vient que si le second était devant un dialogue (une permission, un choix) au
// moment d'écrire : ces caractères y sont des touches. Sinon, la note ne le dit pas.
export function noteDeLaDemande(devantUnDialogue = false): string {
  return devantUnDialogue
    ? "demande écrite dans le second, qui attend une réponse à un dialogue : ces caractères y sont des touches — regarde le second avant d'appuyer sur Entrée"
    : "demande écrite dans le second — appuie sur Entrée pour l'envoyer";
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
    `Lis l'issue #${ticket}, puis réponds-moi court, en quatre éléments dans cet ordre, sur un écran sans défiler : ` +
    `1. ce qui se passe, en deux phrases au plus, sans jargon du runtime ; ` +
    `2. la question à trancher, posée directement, avec les choix possibles en une ligne chacun ; ` +
    `3. ta recommandation, en une phrase ; ` +
    `4. une ligne qui me dit que je peux te demander le détail. ` +
    `Le geste que la file nomme, cite-le mot pour mot, sans en inventer un autre — mais seulement une fois que j'ai choisi, ou en une ligne s'il n'y a qu'un geste. ` +
    `Ni tableau ni exposé : tu ne développes que si je te demande le détail. ` +
    `Quand j'ai décidé, c'est toi qui réponds sur l'issue ou fais le geste avec moi ; n'agis pas avant mon accord.`;
  return CONTROLE.test(demande) ? { refus: REFUS_CONTROLE } : { demande };
}

// La demande depuis la fiche d'un ticket qui ne t'attend pas (#639) : la file n'en dit rien,
// la phrase nomme ce que le rail en donne — son mot d'état, son titre —, et rien d'autre.
// `etat` : absent, il n'est pas sur le rail que la box donne, et la phrase ne devine pas où il en est.
export function demandeSurLeTicket(projet: string, ticket: number, etat?: string, titre?: string): { demande: string } | { refus: string } {
  const ou = etat === undefined ? "il n'est pas sur le rail que la box donne" : `il est « ${etat} » sur le rail`;
  const demande =
    `Le ticket #${ticket} de ${projet}${titre === undefined ? "" : ` (« ${titre} »)`} : ${ou}. ` +
    `Lis l'issue #${ticket} et ce que \`pass ${ticket}\` en dit sur la box, puis réponds-moi court, sur un écran sans défiler : ` +
    `1. où il en est, en deux phrases au plus, sans jargon du runtime ; ` +
    `2. ce qui pourrait le retenir, s'il y a quelque chose ; ` +
    `3. une ligne qui me dit que je peux te demander le détail. ` +
    `Ni tableau ni exposé, et n'agis pas avant mon accord.`;
  return CONTROLE.test(demande) ? { refus: REFUS_CONTROLE_TICKET } : { demande };
}

// La demande pour une ligne de la bande d'alertes de ce projet, d'après ce qu'elle dit — ou
// pourquoi rien n'est écrit. Ce que la box en a écrit est repris mot pour mot, ses lignes
// mises bout à bout : un retour à la ligne y enverrait la demande.
export function demandeDeLAlerte(projet: string, { dit, releve, pourquoi, geste, prix }: Alerte): { demande: string } | { refus: string } {
  const ecrit = releve === undefined ? "" : ` — la box en écrit : « ${releve.split("\n").join(" ; ")} »`;
  const demande =
    `La bande d'alertes de ${projet} dit : « ${dit} »${ecrit}${pourquoi === undefined ? "" : ` (${pourquoi})`}. ` +
    `Le geste qu'elle nomme : « ${geste} » — son prix : ${prix}. ` +
    `Réponds-moi court, en quatre éléments dans cet ordre, sur un écran sans défiler : ` +
    `1. ce qui se passe, en deux phrases au plus, sans jargon du runtime ; ` +
    `2. la question à trancher, posée directement, avec les choix possibles en une ligne chacun ; ` +
    `3. ta recommandation, en une phrase ; ` +
    `4. une ligne qui me dit que je peux te demander le détail. ` +
    `Le geste nommé ci-dessus, cite-le mot pour mot, sans en inventer un autre — mais seulement une fois que j'ai choisi, ou en une ligne s'il n'y a qu'un geste. ` +
    `Tu ne développes que si je te demande le détail. Quand j'ai décidé, aide-moi à le faire ; n'agis pas avant mon accord.`;
  return CONTROLE.test(demande) ? { refus: REFUS_CONTROLE_ALERTE } : { demande };
}
