// La veille de la connexion Max, dans le process de la station : une seule
// pour tous ses projets. Elle relit le fichier d'état du renouvellement toutes
// les quelques secondes, expose ce qu'elle sait dans un fichier que d'autres
// process lisent (`<BRIGADE_STATION_DIR>/connexion-max.json` — l'app, la
// panne dite en une ligne), le dit au journal de service quand ça change, et
// prévient les cuisines de ses projets, qui suspendent ou reprennent.
//
// Sa minuterie et son horloge s'injectent : les tests la jouent sur une
// horloge simulée.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { ConfigInvalide } from "../runtime.ts";
import { direConnexion, evaluer, INCONNUE, lireExposition, lireFichierDuRenouvellement, perdre, type ConnexionMax } from "./connection.ts";

// Ce que la station expose, sous son répertoire. Un point n'entre dans aucun
// nom de projet : aucun ne peut le porter.
export const EXPOSITION = "connexion-max.json";
// Là où le renouvellement tient son fichier d'état, sous le répertoire de la
// station — ce que son unité lui donne (`BRIGADE_SESSION_STATE`).
export const ETAT_DU_RENOUVELLEMENT = join(".session", "renouvellement");
// Entre deux relectures du fichier d'état : le renouvellement passe toutes
// les trente secondes, un login est vu dans la minute.
export const RELECTURE_MS = 5_000;

export type Minuterie = {
  repeter: (faire: () => void, ms: number) => unknown;
  annuler: (poignee: unknown) => void;
};

const MINUTERIE: Minuterie = {
  repeter: (faire, ms) => setInterval(faire, ms),
  annuler: (poignee) => clearInterval(poignee as ReturnType<typeof setInterval>),
};

export type OptionsVeille = {
  // Le fichier d'état du renouvellement.
  renouvellement: string;
  // Un jeton longue durée est configuré : il n'y a plus de renouvellement, son
  // fichier d'état n'est pas lu et ne fait tomber aucune connexion.
  jeton?: boolean;
  // Le fichier où la veille expose la connexion.
  exposition: string;
  dire: (ligne: string) => void;
  maintenant?: () => Date;
  minuterie?: Minuterie;
  relectureMs?: number;
};

export type VeilleConnexionMax = {
  connexion(): ConnexionMax;
  // Relit le fichier d'état tout de suite.
  relire(): void;
  // Un projet a vu la connexion tomber : elle l'est pour toute la machine.
  signalerPerte(raison: string, at: string): void;
  // Abonne une cuisine à ce qui change ; rend de quoi la désabonner.
  surChangement(ecouter: (connexion: ConnexionMax) => void): () => void;
  arreter(): void;
};

// Les deux fichiers, d'après l'environnement et le répertoire de la station.
export function configVeille(env: Record<string, string | undefined>, racine: string): { renouvellement: string; exposition: string } {
  const renouvellement = env.BRIGADE_SESSION_STATE || join(racine, ETAT_DU_RENOUVELLEMENT);
  if (!isAbsolute(renouvellement)) throw new ConfigInvalide(`BRIGADE_SESSION_STATE est un chemin absolu (« ${renouvellement} »)`);
  return { renouvellement, exposition: join(racine, EXPOSITION) };
}

// Ce que la station expose, lu par un autre process : null tant qu'elle n'a
// rien écrit.
export function lireConnexionExposee(exposition: string): ConnexionMax | null {
  try {
    return lireExposition(readFileSync(exposition, "utf8"));
  } catch {
    return null;
  }
}

export function veillerConnexionMax(options: OptionsVeille): VeilleConnexionMax {
  const { dire } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const minuterie = options.minuterie ?? MINUTERIE;
  const ecouteurs = new Set<(connexion: ConnexionMax) => void>();
  // Une perte dite avant un redémarrage de la station le reste : ce qu'elle
  // a exposé est son point de départ.
  let connexion = lireConnexionExposee(options.exposition) ?? INCONNUE;
  let arretee = false;

  const exposer = () => {
    try {
      mkdirSync(dirname(options.exposition), { recursive: true });
      const provisoire = `${options.exposition}.${process.pid}`;
      writeFileSync(provisoire, `${JSON.stringify(connexion, null, 2)}\n`);
      renameSync(provisoire, options.exposition);
    } catch (erreur) {
      dire(`brigade : station — connexion Max non exposée (${options.exposition}) — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };

  const changer = (nouvelle: ConnexionMax, premiere = false) => {
    const avant = connexion;
    connexion = nouvelle;
    if (!premiere && JSON.stringify(avant) === JSON.stringify(nouvelle)) return;
    exposer();
    if (premiere || avant.etat !== nouvelle.etat || avant.raison !== nouvelle.raison) {
      dire(`brigade : station — ${avant.etat === "perdue" && nouvelle.etat === "connectee" ? "connexion Max rétablie, la cuisine reprend — " : ""}${direConnexion(nouvelle)}`);
    }
    for (const ecouter of [...ecouteurs]) {
      try {
        ecouter(nouvelle);
      } catch (erreur) {
        // Une cuisine qui bute n'empêche pas les autres.
        dire(`brigade : station — une cuisine n'a pas pris la connexion Max en compte — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    }
  };

  const lu = () => (options.jeton ? null : lireFichierDuRenouvellement(options.renouvellement));
  const relire = () => {
    if (arretee) return;
    changer(evaluer(lu(), connexion, maintenant()));
  };

  changer(evaluer(lu(), connexion, maintenant()), true);
  const poignee = minuterie.repeter(relire, options.relectureMs ?? RELECTURE_MS);

  return {
    connexion: () => connexion,
    relire,
    signalerPerte(raison, at) {
      if (arretee) return;
      changer(perdre(connexion, raison, at));
    },
    surChangement(ecouter) {
      ecouteurs.add(ecouter);
      return () => ecouteurs.delete(ecouter);
    },
    arreter() {
      if (arretee) return;
      arretee = true;
      minuterie.annuler(poignee);
      ecouteurs.clear();
    },
  };
}
