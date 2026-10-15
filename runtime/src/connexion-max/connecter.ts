// L'étape de connexion Max de l'installation guidée, et le geste qui la refait
// si elle se perd : un login, par le binaire `claude` officiel, sous le compte
// de la station — rien d'autre ne parle à Anthropic. Puis un passage du
// renouvellement, tout de suite, pour que la station le voie sans attendre son
// minuteur ; et l'étape attend que la station l'ait reconnue.
//
// Les commandes se lancent par `lancer`, injectable : sous le compte de la
// station, quel que soit qui lance l'étape. Les tests jouent un faux `claude`.
import { direConnexion, type ConnexionMax } from "./connexion.ts";
import { lireConnexionExposee } from "./veille.ts";

export type Lancement = { code: number | null; sortie: string };

export type OptionsConnexion = {
  // Lance une commande sous le compte de la station. `interactif` : elle
  // parle au chef — entrée et sorties héritées —, et sa sortie n'est pas rendue.
  lancer: (commande: string, args: string[], interactif: boolean) => Promise<Lancement>;
  // Le binaire `claude`, tel que la station le lance.
  claude: string;
  // Le renouvellement : un passage, qui consigne ce qu'il constate.
  renouvellement: string;
  // Ce que la station expose de la connexion.
  exposition: string;
  dire: (ligne: string) => void;
  // Combien de temps attendre que la station reconnaisse la connexion. Une
  // garde, pas une mesure : elle relit toutes les cinq secondes.
  attenteMs?: number;
  pauseMs?: number;
  dormir?: (ms: number) => Promise<void>;
  maintenant?: () => Date;
};

// L'étape a échoué : la ligne dit pourquoi, et ce qu'il reste à faire.
export class ConnexionNonFaite extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnexionNonFaite";
  }
}

const ATTENTE_MS = 90_000;
const PAUSE_MS = 1_000;

// Ce que `claude auth status` dit de la session : ouverte, fermée, ou rien de lisible.
function ouverte(lancement: Lancement): boolean | null {
  const trouve = /"loggedIn"\s*:\s*(true|false)/.exec(lancement.sortie);
  return trouve ? trouve[1] === "true" : null;
}

const derniereLigne = (sortie: string) => sortie.trim().split("\n").findLast((ligne) => ligne.trim() !== "")?.trim() ?? "";

export async function connecterMax(options: OptionsConnexion): Promise<ConnexionMax> {
  const { lancer, claude, dire } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const dormir = options.dormir ?? ((ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms)));

  const statut = async () => {
    const lance = await lancer(claude, ["auth", "status"], false);
    if (lance.code === 127) throw new ConnexionNonFaite(`« ${claude} » ne se lance pas sous le compte de la station — ${derniereLigne(lance.sortie) || "introuvable"}`);
    return ouverte(lance);
  };

  // Une connexion que la station tient pour perdue se refait, quoi qu'en
  // dise `claude` : sa session peut se croire ouverte quand Anthropic l'a
  // refusée.
  const perdue = lireConnexionExposee(options.exposition)?.etat === "perdue";
  if (!perdue && (await statut()) === true) {
    dire("connexion Max déjà ouverte sous le compte de la station : rien à refaire");
  } else {
    dire("connexion Max — `claude` va te donner un lien : ouvre-le, connecte-toi avec ton compte Claude Max, puis recopie ici le code qu'il affiche");
    const login = await lancer(claude, ["auth", "login", "--claudeai"], true);
    if (login.code !== 0) throw new ConnexionNonFaite(`\`claude auth login\` a rendu ${login.code ?? "un signal"} : la connexion n'a pas abouti — relance l'étape pour réessayer`);
    if ((await statut()) !== true) throw new ConnexionNonFaite("`claude auth login` est fini, mais `claude auth status` ne dit pas la session ouverte — relance l'étape pour réessayer");
    dire("connexion Max ouverte");
  }

  // Un passage du renouvellement, tout de suite : il consigne la connexion
  // dans son fichier d'état, que la station relit. Le minuteur l'aurait fait
  // dans la demi-minute.
  const depart = Math.floor(maintenant().getTime() / 1000) * 1000;
  const passage = await lancer(options.renouvellement, [], false);
  if (passage.code !== 0) throw new ConnexionNonFaite(`le renouvellement n'a pas pu la consigner (code ${passage.code ?? "signal"}) — ${derniereLigne(passage.sortie)}`);

  // La station la reconnaît : elle expose une connexion valide, vérifiée par
  // ce passage-là ou un suivant.
  const attente = options.attenteMs ?? ATTENTE_MS;
  const limite = maintenant().getTime() + attente;
  let exposee: ConnexionMax | null = null;
  for (;;) {
    exposee = lireConnexionExposee(options.exposition);
    if (exposee?.etat === "connectee" && exposee.verifiee !== null && Date.parse(exposee.verifiee) >= depart) {
      dire(`la station la reconnaît : ${direConnexion(exposee)}`);
      return exposee;
    }
    if (maintenant().getTime() >= limite) break;
    await dormir(options.pauseMs ?? PAUSE_MS);
  }
  throw new ConnexionNonFaite(
    exposee === null
      ? `la station n'a rien exposé de la connexion en ${Math.round(attente / 1000)} s (${options.exposition}) — tourne-t-elle ? \`systemctl status brigade-station\``
      : `la station ne l'a pas reconnue en ${Math.round(attente / 1000)} s — elle dit : ${direConnexion(exposee)}`,
  );
}
