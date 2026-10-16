// L'étape de connexion Max de l'installation guidée : un jeton longue durée,
// créé une fois par `claude setup-token` — le binaire officiel, sous le compte
// de la station —, rangé là où le runtime le lit (`BRIGADE_CLAUDE_TOKEN_FILE`,
// src/jeton-claude.ts), avec la date de sa création à côté. Ensuite la station
// ne demande plus aucune reconnexion.
//
// Le jeton ne se montre nulle part : `claude setup-token` parle au chef par son
// entrée et sa sortie d'erreur, sa sortie standard est lue ici, et le jeton n'y
// est repris que pour être rangé. Aucune phrase de l'étape ne le cite, pas même
// celle d'un échec.
//
// Les commandes se lancent par `lancer`, injectable : sous le compte de la
// station, quel que soit qui lance l'étape. Les tests jouent un faux `claude`.
export type Lancement = { code: number | null; sortie: string };

// `herite` : la commande parle au chef — entrée et sorties héritées —, sa
// sortie n'est pas rendue. `capture` : seule sa sortie standard est lue, le
// reste parle au chef. `silencieux` : tout est lu.
export type ModeDeLancement = "herite" | "capture" | "silencieux";

export type OptionsConnexion = {
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
export class ConnexionNonFaite extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnexionNonFaite";
  }
}

// Le jeton que `claude setup-token` imprime : `sk-ant-oat01-…`, sur une ligne,
// possiblement entouré des codes d'écran du terminal.
const JETON = /sk-ant-[A-Za-z0-9_-]{20,}/;
// eslint-disable-next-line no-control-regex
const CODES_ECRAN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export function extraireLeJeton(sortie: string): string | null {
  return JETON.exec(sortie.replace(CODES_ECRAN, ""))?.[0] ?? null;
}

export async function connecterMax(options: OptionsConnexion): Promise<void> {
  const { lancer, claude, dire } = options;
  const maintenant = options.maintenant ?? (() => new Date());

  if (options.jetonRange()) {
    dire("connexion Max déjà faite : le jeton de la station est rangé, rien à refaire");
    return;
  }

  dire("connexion Max — `claude setup-token` va te donner un lien : ouvre-le, connecte-toi avec ton compte Claude Max, puis recopie ici le code qu'il affiche. Il ne se fait qu'une fois");
  const creation = maintenant().toISOString();
  const lance = await lancer(claude, ["setup-token"], "capture");
  if (lance.code === 127) throw new ConnexionNonFaite(`« ${claude} » ne se lance pas sous le compte de la station`);
  if (lance.code !== 0) throw new ConnexionNonFaite(`\`claude setup-token\` a rendu ${lance.code ?? "un signal"} : la connexion n'a pas abouti — relance l'étape pour réessayer`);
  const jeton = extraireLeJeton(lance.sortie);
  if (jeton === null) throw new ConnexionNonFaite("`claude setup-token` est fini, mais n'a donné aucun jeton que l'étape sache lire — relance l'étape pour réessayer");

  await options.ranger(jeton, creation);
  dire("connexion Max faite : le jeton est rangé, lisible du seul compte de la station, avec sa date de création à côté — la station n'a plus à se reconnecter");
}
