// Les faits de la session Max du compte, vue sans ses identifiants : ce que le
// runtime lit du fichier d'état que le renouvellement
// (`deploy/brigade-renouvellement`) tient à jour — jamais du fichier
// d'identifiants —, et la reconnexion que le chef dit avoir faite.

// Combien vit un jeton, faute de réglage : huit heures, mesurées le 2026-10-13
// — la valeur que le renouvellement prend aussi (BRIGADE_SESSION_LIFETIME).
export const VIE_PAR_DEFAUT_S = 8 * 3600;
// Combien de temps avant l'échéance estimée le chef est prévenu, faute de
// réglage : assez pour qu'il se reconnecte quand ça l'arrange.
export const PREAVIS_PAR_DEFAUT_S = 3 * 3600;
// Le renouvellement passe chaque minute : sans passage depuis ce délai, il ne
// tourne plus.
export const VIVANT_MS = 10 * 60_000;

// Ce que le renouvellement a consigné de son dernier échec : quand, sa nature
// (`session-refusee`, `non-renouvele`…), et ce qu'il en dit, sur une ligne.
export type EchecDeRenouvellement = { at: string; nature: string; detail: string | null };

export type ObservationDeSession = {
  // Le fichier d'état lu. `file` : `read`, ou ce qui a empêché de le lire —
  // `absent` : aucun renouvellement n'est posé sur cette box, ou il n'a pas
  // encore fait de passage.
  state: string;
  file: "read" | "absent" | "unreadable";
  // Le dernier renouvellement réussi ; la dernière écriture des identifiants
  // qu'un passage réussi a vue — connexion ou renouvellement. Nuls quand le
  // fichier ne les porte pas.
  renewed: string | null;
  written: string | null;
  // Le dernier échec consigné, tant qu'aucun passage réussi ne l'a suivi.
  // `at` : le premier passage d'une suite d'échecs de même nature — un
  // passage par minute n'en fait pas un échec neuf par minute.
  failure: EchecDeRenouvellement | null;
  // Le renouvellement a fait un passage — réussi ou non — dans les
  // `VIVANT_MS` qui précèdent la lecture : il tourne. L'échéance s'annonce
  // quand même : il peut échouer.
  live: boolean;
  // Combien vit un jeton, et combien de temps avant son échéance estimée le
  // chef est prévenu — en secondes, tels que le runtime les a reçus.
  lifetimeS: number;
  warningS: number;
};

export type FaitRenouvellement =
  // Écrit au démarrage, puis quand ce qui est lu change — pas à chaque tick :
  // un passage réussi par minute ne change que sa propre date, qui n'est pas
  // gardée.
  | { type: "session.observed"; payload: ObservationDeSession }
  // Le chef dit s'être reconnecté (`claude /login`, puis « reprendre ») alors
  // que la session était annoncée près de son échéance ou en échec de
  // renouvellement. Écrit par « reprendre ».
  | { type: "session.reconnected"; payload: Record<string, never> }
  // Le renouvellement a réussi un passage après la chute de la connexion :
  // elle est rétablie, sans que le chef dise rien. `stations` : celles dont
  // l'arrêt est levé ; `verified` : la dernière réécriture des identifiants, postérieure à la chute.
  | { type: "session.restored"; payload: { stations: string[]; verified: string } };
