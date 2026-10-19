// L'étape de connexion Max de l'installation guidée : un jeton longue durée,
// créé une fois par `claude setup-token` — le binaire officiel, sous le compte
// de la station —, rangé là où le runtime le lit (`BRIGADE_CLAUDE_TOKEN_FILE`,
// src/jeton-claude.ts), avec la date de sa création à côté. Ensuite la station
// ne demande plus aucune reconnexion.
//
// `claude setup-token` dessine son interface — le lien de connexion, le champ
// où coller le code — sur sa sortie standard, là même où il imprime le jeton.
// L'étape la lit donc, et la remontre au chef à mesure, le jeton masqué
// (`MasqueDuJeton`) : il n'est repris que pour être rangé. Aucune phrase de
// l'étape ne le cite, pas même celle d'un échec.
//
// Les commandes se lancent par `lancer`, injectable : sous le compte de la
// station, quel que soit qui lance l'étape. Les tests jouent un faux `claude`.
// `muet` : la commande n'a rien rendu dans le délai, et on l'a arrêtée.
export type Lancement = { code: number | null; sortie: string; muet?: boolean };

// `herite` : la commande parle au chef — entrée et sorties héritées —, sa
// sortie n'est pas rendue. `affiche` : l'entrée est au chef, les sorties sont
// lues et remontrées au chef, le jeton masqué ; une commande qui reste muette
// est arrêtée. `silencieux` : tout est lu, rien n'est montré.
export type ModeDeLancement = "herite" | "affiche" | "silencieux";

export type ConnectionOptions = {
  // Lance une commande sous le compte de la station.
  lancer: (commande: string, args: string[], mode: ModeDeLancement) => Promise<Lancement>;
  // Le binaire `claude`, tel que la station le lance.
  claude: string;
  // Un jeton est-il déjà rangé ?
  jetonRange: () => boolean;
  // Range le jeton (droits 600, au compte de la station) et la date de sa
  // création dans un fichier distinct, qui ne le porte pas.
  ranger: (jeton: string, creation: string) => Promise<void>;
  dire: (ligne: string) => void;
  maintenant?: () => Date;
};

// L'étape a échoué : la ligne dit pourquoi, et ce qu'il reste à faire.
export class ConnectionNotMade extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnexionNonFaite";
  }
}

// Le jeton que `claude setup-token` imprime : `sk-ant-oat01-…`, sur une ligne,
// possiblement entouré des codes d'écran du terminal.
const JETON = /sk-ant-[A-Za-z0-9_-]{20,}/;
// eslint-disable-next-line no-control-regex
const SCREEN_CODES = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export function extraireLeJeton(sortie: string): string | null {
  return JETON.exec(sortie.replace(SCREEN_CODES, ""))?.[0] ?? null;
}

// Remontre au chef ce que `claude setup-token` imprime, sans le jeton : chaque
// jeton complet devient `sk-ant-…`. Les sorties arrivent par morceaux, qui
// peuvent couper un jeton en deux : la fin d'un morceau qui pourrait être le
// début d'un jeton est gardée jusqu'au morceau suivant (ou `fin`).
const DEBUT = "sk-ant-";
const JETON_ENTIER = /sk-ant-[A-Za-z0-9_-]{20,}(?=[^A-Za-z0-9_-])/g;
const JETON_OUVERT = /sk-ant-[A-Za-z0-9_-]*$/;

export class MasqueDuJeton {
  private garde = "";

  // Ce qui peut être montré du morceau, le jeton masqué.
  passer(bloc: string): string {
    const tout = (this.garde + bloc).replace(JETON_ENTIER, `${DEBUT}…`);
    // La fin qui pourrait être un début de jeton : ouvert, ou préfixe de `sk-ant-`.
    let tenu = JETON_OUVERT.exec(tout)?.index ?? tout.length;
    if (tenu === tout.length) {
      for (let n = DEBUT.length - 1; n > 0; n--) {
        if (tout.endsWith(DEBUT.slice(0, n))) {
          tenu = tout.length - n;
          break;
        }
      }
    }
    this.garde = tout.slice(tenu);
    return tout.slice(0, tenu);
  }

  // La fin du flux : ce qui reste n'est montré que s'il n'a rien d'un jeton.
  fin(): string {
    const reste = this.garde;
    this.garde = "";
    return reste.startsWith(DEBUT) ? `${DEBUT}…` : reste;
  }
}

export async function connecterMax(options: ConnectionOptions): Promise<void> {
  const { lancer, claude, dire } = options;
  const maintenant = options.maintenant ?? (() => new Date());

  if (options.jetonRange()) {
    dire("connexion Max déjà faite : le jeton de la station est rangé, rien à refaire");
    return;
  }

  dire("connexion Max — `claude setup-token` va te donner un lien : ouvre-le, connecte-toi avec ton compte Claude Max, puis recopie ici le code qu'il affiche. Il ne se fait qu'une fois");
  const creation = maintenant().toISOString();
  const lance = await lancer(claude, ["setup-token"], "affiche");
  if (lance.muet) throw new ConnectionNotMade("`claude setup-token` n'a rien affiché : pas de lien de connexion — relance l'étape pour réessayer");
  if (lance.code === 127) throw new ConnectionNotMade(`« ${claude} » ne se lance pas sous le compte de la station`);
  if (lance.code !== 0) throw new ConnectionNotMade(`\`claude setup-token\` a rendu ${lance.code ?? "un signal"} : la connexion n'a pas abouti — relance l'étape pour réessayer`);
  const jeton = extraireLeJeton(lance.sortie);
  if (jeton === null) throw new ConnectionNotMade("`claude setup-token` est fini, mais n'a donné aucun jeton que l'étape sache lire — relance l'étape pour réessayer");

  await options.ranger(jeton, creation);
  dire("connexion Max faite : le jeton est rangé, lisible du seul compte de la station, avec sa date de création à côté — la station n'a plus à se reconnecter");
}
