// Les faits du jeton longue durée de la connexion Max (`jeton-claude.ts`) :
// la date de sa création, telle que l'étape de connexion Max l'a rangée à côté
// de lui — jamais le jeton.

// Combien vit un jeton que `claude setup-token` a créé : un an. C'est ici, et
// nulle part ailleurs, que le runtime le sait.
export const VIE_DU_JETON_JOURS = 365;
// Combien de temps avant son échéance la file l'annonce : assez pour que le
// chef refasse le jeton quand ça l'arrange.
export const PREAVIS_DU_JETON_JOURS = 30;

export type ObservationDuJeton = {
  // Le fichier du jeton — son chemin, jamais sa valeur —, et celui de la date
  // de sa création, à côté de lui. Nuls quand aucun jeton n'est configuré
  // (`BRIGADE_CLAUDE_TOKEN_FILE` absent) : rien ne s'annonce.
  token: string | null;
  file: string | null;
  // `read` : la date s'est lue. Sinon ce qui l'en a empêché — `absent` : le
  // jeton a été rangé sans elle ; `unreadable` : le fichier ne s'ouvre pas ;
  // `invalid` : ce qu'il porte ne se lit pas comme une date ; `none` : aucun
  // jeton configuré. Son contenu n'est jamais gardé.
  state: "read" | "absent" | "unreadable" | "invalid" | "none";
  // La création du jeton, en ISO 8601 UTC, quand elle s'est lue.
  created: string | null;
  // La vie d'un jeton et le préavis, en jours, tels que le runtime les tenait.
  lifetimeDays: number;
  warningDays: number;
};

export type FaitJeton =
  // Écrit au démarrage, puis quand ce qui est lu change — pas à chaque tick :
  // l'échéance se compte à la lecture de la file, pas au journal.
  { type: "token.observed"; payload: ObservationDuJeton };
