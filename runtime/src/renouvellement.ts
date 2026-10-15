// La session Max du compte, suivie sans ses identifiants. Le renouvellement
// (`deploy/brigade-renouvellement`), hors cloison, laisse `claude` rafraîchir
// le jeton et consigne ce qu'il a constaté dans un fichier d'état : des lignes
// `clé=valeur`, des dates, jamais un jeton. Le runtime relit ce fichier — et
// lui seul : le fichier d'identifiants n'est jamais ouvert ici, ni nulle part
// dans le runtime — au démarrage puis à chaque tick, et écrit au journal ce
// qui a changé. La file du chef en tire l'annonce de l'échéance
// (`projections/renouvellement.ts`).
import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { FICHIER_DES_IDENTIFIANTS } from "./identifiants.ts";
import { PREAVIS_PAR_DEFAUT_S, VIE_PAR_DEFAUT_S, VIVANT_MS, type EchecDeRenouvellement, type ObservationDeSession } from "./evenements/renouvellement.ts";
import { derniereReconnexion, sessionObservee } from "./projections/renouvellement.ts";
import { etatStation, stationsDeconnectees } from "./projections/stations.ts";
import { ConfigInvalide, type Runtime } from "./runtime.ts";

const AUTEUR = "runtime";
// Là où `brigade-renouvellement.service` tient son fichier d'état : à côté
// des répertoires d'état des projets (`/var/lib/brigade/.session/renouvellement`).
const SESSION = ".session";
const FICHIER = "renouvellement";

export type ConfigSession = { etat: string; vieS: number; preavisS: number };

const secondes = (env: NodeJS.ProcessEnv, variable: string, defaut: number): number => {
  const brut = env[variable];
  if (brut === undefined || brut === "") return defaut;
  if (!/^\d+$/.test(brut)) throw new ConfigInvalide(`${variable} se compte en secondes entières (« ${brut} »)`);
  return Number(brut);
};

// `BRIGADE_SESSION_STATE` : le fichier d'état du renouvellement, celui que son
// unité lui donne ; par défaut, celui qu'elle pose à côté du répertoire d'état
// du projet. `BRIGADE_SESSION_LIFETIME` : combien vit un jeton, comme pour le
// renouvellement. `BRIGADE_SESSION_WARNING` : combien de temps avant
// l'échéance estimée le chef est prévenu.
export function configSession(env: NodeJS.ProcessEnv, repertoireEtat: string): ConfigSession {
  const etat = env.BRIGADE_SESSION_STATE || join(dirname(repertoireEtat), SESSION, FICHIER);
  if (!isAbsolute(etat)) throw new ConfigInvalide(`BRIGADE_SESSION_STATE est un chemin absolu (« ${etat} »)`);
  if (basename(etat) === FICHIER_DES_IDENTIFIANTS) {
    throw new ConfigInvalide(`BRIGADE_SESSION_STATE désigne un fichier d'identifiants (${etat}) : le runtime lit le fichier d'état du renouvellement, jamais les identifiants`);
  }
  const vieS = secondes(env, "BRIGADE_SESSION_LIFETIME", VIE_PAR_DEFAUT_S);
  const preavisS = secondes(env, "BRIGADE_SESSION_WARNING", PREAVIS_PAR_DEFAUT_S);
  if (vieS === 0) throw new ConfigInvalide("BRIGADE_SESSION_LIFETIME ne peut pas valoir 0 : un jeton vit quelques heures");
  if (preavisS > vieS) throw new ConfigInvalide(`BRIGADE_SESSION_WARNING (${preavisS} s) dépasse la vie d'un jeton (BRIGADE_SESSION_LIFETIME, ${vieS} s) : l'échéance serait annoncée avant même la connexion`);
  return { etat, vieS, preavisS };
}

// Une date du fichier, ou rien si elle ne se lit pas comme une date.
const date = (valeur: string | undefined) => (valeur !== undefined && valeur !== "" && Number.isFinite(Date.parse(valeur)) ? new Date(Date.parse(valeur)).toISOString() : null);

const lireCles = (texte: string) =>
  new Map(texte.split("\n").flatMap((ligne) => (ligne.includes("=") ? [[ligne.slice(0, ligne.indexOf("=")), ligne.slice(ligne.indexOf("=") + 1)] as const] : [])));

// La dernière écriture des identifiants par `claude`, telle que le fichier
// d'état la porte (`renouvele`, ou à défaut `ecrits`) — nulle quand le fichier
// manque, ou qu'un échec le suit. `verifie` n'en est pas la preuve : un
// passage réussi s'écrit aussi quand les identifiants n'ont pas été réécrits.
// Elle ne s'écrit pas au journal : le fichier change à chaque minute.
function identifiantsReecrits(config: ConfigSession): string | null {
  try {
    const cles = lireCles(readFileSync(config.etat, "utf8"));
    const verifie = date(cles.get("verifie"));
    const echec = date(cles.get("echec"));
    if (verifie === null || (echec !== null && Date.parse(verifie) < Date.parse(echec))) return null;
    const ecritures = [date(cles.get("renouvele")), date(cles.get("ecrits"))].flatMap((instant) => (instant === null ? [] : [instant]));
    return ecritures.length === 0 ? null : ecritures.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
  } catch {
    return null;
  }
}

// Ce que le fichier d'état dit à `maintenant`. `precedente` : ce que le runtime
// en a écrit en dernier — un échec qui continue, de même nature, garde sa
// première date.
export function lireSession(config: ConfigSession, maintenant: Date, precedente: ObservationDeSession | null = null): ObservationDeSession {
  const commun = { state: config.etat, lifetimeS: config.vieS, warningS: config.preavisS };
  let texte: string;
  try {
    texte = readFileSync(config.etat, "utf8");
  } catch (erreur) {
    const absent = (erreur as NodeJS.ErrnoException).code === "ENOENT";
    return { ...commun, file: absent ? "absent" : "unreadable", renewed: null, written: null, failure: null, live: false };
  }
  const cles = lireCles(texte);
  const verifie = date(cles.get("verifie"));
  const echec = date(cles.get("echec"));
  // Un passage réussi garde le dernier échec : c'est sa date, face à
  // `verifie`, qui dit s'il est derrière.
  const enEchec = echec !== null && (verifie === null || Date.parse(echec) > Date.parse(verifie));
  const nature = cles.get("echec_nature") || "inconnue";
  const suite = precedente?.failure && precedente.failure.nature === nature ? precedente.failure : null;
  const failure: EchecDeRenouvellement | null = !enEchec ? null : (suite ?? { at: echec, nature, detail: cles.get("echec_detail") || null });
  const passages = [verifie, echec].flatMap((instant) => (instant === null ? [] : [Date.parse(instant)]));
  const live = passages.length > 0 && maintenant.getTime() - Math.max(...passages) <= VIVANT_MS;
  return { ...commun, file: "read", renewed: date(cles.get("renouvele")), written: date(cles.get("ecrits")), failure, live };
}

// Lit le fichier d'état d'emblée, puis à chaque tick, et écrit au journal ce
// qui change par rapport à ce que le journal en porte : un redémarrage qui ne
// voit rien de neuf n'écrit rien.
export function brancherSession<R extends Runtime>(runtime: R, config: ConfigSession, maintenant: () => Date = () => new Date()): R {
  let ecrite = sessionObservee(runtime.journal.base);
  const lire = () => {
    try {
      // Un échec qui continue après la reconnexion du chef n'est plus le même :
      // il s'annonce à nouveau.
      const reconnectee = derniereReconnexion(runtime.journal.base);
      const suite = ecrite?.failure && (reconnectee === null || Date.parse(ecrite.failure.at) > Date.parse(reconnectee)) ? ecrite : null;
      const observation = lireSession(config, maintenant(), suite);
      if (JSON.stringify(observation) === JSON.stringify(ecrite)) return;
      runtime.journal.ajouter({ project: runtime.projet, ticket: null, author: AUTEUR, type: "session.observed", payload: observation });
      ecrite = observation;
    } catch (erreur) {
      // Une lecture qui ne s'écrit pas n'arrête pas la cuisine : la suivante la reprend.
      console.error(`brigade : session Max non relue — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  // Une connexion tombée se rétablit d'elle-même : des identifiants
  // réécrits après la chute, relevés par un passage réussi du renouvellement,
  // disent que `claude /login` a eu lieu — pas la seule fraîcheur du passage.
  // Aucun « resume » n'est alors nécessaire ; les autres arrêts n'y sont pas
  // touchés.
  const rouvrir = () => {
    try {
      const base = runtime.journal.base;
      const tombees = stationsDeconnectees(base);
      if (tombees.length === 0) return;
      const verifie = identifiantsReecrits(config);
      if (verifie === null) return;
      const chute = Math.max(...tombees.map((station) => Date.parse(etatStation(base, station)?.disconnectedAt ?? "")));
      if (!(Date.parse(verifie) > chute)) return;
      runtime.journal.ajouter({ project: runtime.projet, ticket: null, author: AUTEUR, type: "session.restored", payload: { stations: tombees, verified: verifie } });
      console.log(`brigade : connexion Max rétablie à ${verifie.slice(11, 16)}, la cuisine a repris (${tombees.join(", ")})`);
    } catch (erreur) {
      console.error(`brigade : reprise de la connexion Max non écrite — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  lire();
  rouvrir();
  runtime.surReveil((cause) => {
    if (cause !== "tick") return;
    lire();
    rouvrir();
  });
  return runtime;
}
