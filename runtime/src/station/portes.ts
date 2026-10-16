// Les portes d'une station : une par projet de sa configuration, et une pour
// la station elle-même. Elles tournent dans leur propre unité
// (`brigade-station-porte.service`), hors du filtre de celle de la station —
// ce sont elles, la sortie —, et ne lancent rien. La station, elle, ne joint
// que la boucle locale : ce que lance un projet sort par la porte de ce
// projet, et n'y trouve que la liste blanche de ce projet.
//
// Chaque porte écoute sur un port de la boucle locale que personne ne choisit :
// elle reprend celui qu'elle avait, ou en prend un libre. Ces ports sont
// écrits dans un fichier (`BRIGADE_STATION_PORTES`), que la station relit pour
// donner à chaque projet le sien. La bascule y écrit, avant le premier
// démarrage, ceux des portes de l'ancienne installation : un cook en vol à la
// bascule retrouve sa porte au port qu'il connaît.
import { chownSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { AUTRES_HOTES, compterLesRefus, ouvrirPorte, type OptionsPorte, type Porte } from "../porte.ts";
import { listeDuJournal, refusAuJournal } from "../porte-journal.ts";
import { REGLES_DE_BASE } from "../reseau.ts";
import { ConfigInvalide } from "../runtime.ts";
import { CONFIGURATION, ETATS, lireFichierDeConfiguration } from "./configuration.ts";

export const VARIABLE_PORTES = "BRIGADE_STATION_PORTES";
// Où le paquet le pose, sous le répertoire de la station : c'est là que la
// bascule écrit les ports qu'elle reprend.
export const FICHIER_PORTES = "portes.json";
// L'unité qui tient les portes : c'est elle que la station nomme quand une
// porte manque.
export const UNITE_DES_PORTES = "brigade-station-porte.service";

// Le port de chaque porte ouverte. `station` : celle de la station elle-même.
export type Portes = { station: number | null; projets: Record<string, number> };

const AUCUNE: Portes = { station: null, projets: {} };

const estUnPort = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 1 && valeur <= 65535;

// Lit `BRIGADE_STATION_PORTES` : le fichier des ports des portes. Sans lui, la
// station ne tient aucune porte — chaque projet a celle que sa ligne nomme,
// ou aucune.
export function configPortes(env: Record<string, string | undefined>): string | null {
  const fichier = env[VARIABLE_PORTES];
  if (fichier === undefined || fichier === "") return null;
  if (!isAbsolute(fichier)) throw new ConfigInvalide(`${VARIABLE_PORTES} vaut « ${fichier} » — attendu un chemin absolu`);
  return fichier;
}

// Les ports écrits. Absent ou illisible, aucun : une porte qui n'a pas dit son
// port n'est pas ouverte.
export function lirePortes(fichier: string): Portes {
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch {
    return AUCUNE;
  }
  if (typeof lu !== "object" || lu === null) return AUCUNE;
  const { station, projets } = lu as { station?: unknown; projets?: unknown };
  const lus: Record<string, number> = {};
  if (typeof projets === "object" && projets !== null) for (const [nom, port] of Object.entries(projets)) if (estUnPort(port)) lus[nom] = port;
  return { station: estUnPort(station) ? station : null, projets: lus };
}

export function ecrirePortes(fichier: string, portes: Portes, proprietaire?: { uid: number; gid: number }): void {
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}`;
  writeFileSync(provisoire, `${JSON.stringify(portes)}\n`, { mode: 0o644 });
  // La bascule l'écrit sous root ; les portes le réécriront sous le compte.
  if (proprietaire) chownSync(provisoire, proprietaire.uid, proprietaire.gid);
  renameSync(provisoire, fichier);
}

export type OptionsPortes = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`) : sa configuration, et
  // l'état de chaque projet, où sa porte lit sa liste et écrit ses refus.
  racine: string;
  // Le fichier des ports (`BRIGADE_STATION_PORTES`).
  fichier: string;
  dire: (ligne: string) => void;
  // Entre deux relectures de la configuration.
  relectureMs?: number;
  ouvrir?: (options: OptionsPorte) => Promise<Porte>;
};

export type PortesTenues = {
  // Relit la configuration, ouvre la porte d'un projet ajouté, ferme celle
  // d'un projet retiré.
  relire(): Promise<void>;
  ports(): Portes;
  // Ferme toutes les portes.
  arreter(): Promise<void>;
};

const RELECTURE_MS = 2000;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const auNomDe = (projet: string, ligne: string) => `brigade [${projet}] : ${ligne.replace(/^brigade : /, "")}`;

// Ouvre les portes de la station et les tient : la sienne, puis celle de
// chaque projet de sa configuration. Rend quand la première relecture est
// faite, ses ports écrits.
export async function tenirPortes(options: OptionsPortes): Promise<PortesTenues> {
  const { racine, fichier, dire } = options;
  const ouvrir = options.ouvrir ?? ouvrirPorte;
  // Les ports d'avant — ceux de la dernière fois, ou ceux que la bascule a
  // repris de l'ancienne installation : chaque porte reprend le sien.
  const avant = lirePortes(fichier);
  const ouvertes = new Map<string, Porte>();
  let station: Porte | null = null;
  let arretee = false;
  // Les échecs déjà dits : une porte qui ne s'ouvre pas ne se répète pas à
  // chaque relecture.
  const dits = new Map<string, string>();

  const ouvrirSur = async (nom: string, voulu: number | null, regles: OptionsPorte["regles"], surRefus: OptionsPorte["surRefus"], dit: (ligne: string) => void): Promise<Porte> => {
    if (voulu !== null) {
      try {
        return await ouvrir({ port: voulu, projet: nom, regles, surRefus });
      } catch (erreur) {
        const code = (erreur as NodeJS.ErrnoException).code;
        if (code !== "EADDRINUSE" && code !== "EACCES") throw erreur;
        dit(`le port ${voulu} de sa porte est pris (${code}) : elle en prend un autre`);
      }
    }
    return ouvrir({ port: 0, projet: nom, regles, surRefus });
  };

  const ports = (): Portes => ({
    station: station?.port ?? null,
    projets: Object.fromEntries([...ouvertes].sort(([a], [b]) => a.localeCompare(b)).map(([nom, porte]) => [nom, porte.port])),
  });

  const unTour = async () => {
    if (arretee) return;
    let change = false;
    if (station === null) {
      const surRefus = compterLesRefus((refus) =>
        dire(`brigade : sortie de la station refusée — ${refus.host === AUTRES_HOTES ? "d'autres hôtes encore" : `${refus.host}:${refus.port}`}${refus.count > 1 ? ` (${refus.count} tentatives)` : ""}`),
      );
      station = await ouvrirSur("la station", avant.station, () => REGLES_DE_BASE, surRefus, dire);
      change = true;
      dire(`brigade : porte de la station ouverte — 127.0.0.1:${station.port} (Anthropic et GitHub seulement)`);
    }
    const { projets } = lireFichierDeConfiguration(join(racine, CONFIGURATION));
    const voulus = new Set(projets.map((projet) => projet.nom));
    for (const [nom, porte] of [...ouvertes]) {
      if (voulus.has(nom)) continue;
      ouvertes.delete(nom);
      await porte.fermer();
      change = true;
      dire(auNomDe(nom, "retiré de la configuration : sa porte est fermée"));
    }
    for (const nom of [...dits.keys()]) if (!voulus.has(nom)) dits.delete(nom);
    for (const { nom } of projets) {
      if (ouvertes.has(nom) || arretee) continue;
      const dit = (ligne: string) => dire(auNomDe(nom, ligne));
      const etat = join(racine, ETATS, nom);
      try {
        const porte = await ouvrirSur(nom, avant.projets[nom] ?? null, listeDuJournal(etat, { avertir: dit }), refusAuJournal(etat, nom, { dire: dit }), dit);
        ouvertes.set(nom, porte);
        dits.delete(nom);
        change = true;
        dit(`porte ouverte — 127.0.0.1:${porte.port}, liste blanche lue dans ${etat}`);
      } catch (erreur) {
        const pourquoi = message(erreur);
        if (dits.get(nom) !== pourquoi) dit(`sa porte ne s'ouvre pas, ses cooks ne partiront pas — ${pourquoi}`);
        dits.set(nom, pourquoi);
      }
    }
    if (change && !arretee) ecrirePortes(fichier, ports());
  };

  // Un tour à la fois : deux relectures qui se chevauchent ouvriraient deux
  // portes au même projet.
  let file: Promise<void> = Promise.resolve();
  const relire = () => {
    file = file.then(unTour).catch((erreur) => dire(`brigade : portes de la station — relecture en échec : ${message(erreur)}`));
    return file;
  };

  await file.then(unTour);
  const veille = setInterval(() => void relire(), options.relectureMs ?? RELECTURE_MS);

  return {
    relire,
    ports,
    async arreter() {
      if (arretee) return;
      arretee = true;
      clearInterval(veille);
      await file;
      const toutes = [...ouvertes.values(), ...(station ? [station] : [])];
      ouvertes.clear();
      station = null;
      await Promise.all(toutes.map((porte) => porte.fermer()));
    },
  };
}

// La porte de la station, attendue : elle ne joint rien sans elle. Rend son
// port dès que le fichier le porte.
export async function attendrePorteDeLaStation(fichier: string, options: { dire: (ligne: string) => void; pasMs?: number; patienceMs?: number }): Promise<number> {
  const pas = options.pasMs ?? 200;
  const debut = Date.now();
  let dit = false;
  for (;;) {
    const { station } = lirePortes(fichier);
    if (station !== null) return station;
    if (!dit && Date.now() - debut >= (options.patienceMs ?? 3000)) {
      options.dire(`brigade : la station attend sa porte — ${UNITE_DES_PORTES} n'a pas encore écrit son port dans ${fichier} (journalctl -u ${UNITE_DES_PORTES})`);
      dit = true;
    }
    await new Promise((resoudre) => setTimeout(resoudre, pas));
  }
}
