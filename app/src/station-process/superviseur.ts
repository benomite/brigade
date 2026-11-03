// Le process de la station, remplaçable seul (#2190) : l'app tient la station de l'ordinateur comme
// avant (poste/station.ts), mais le runtime qu'elle joue n'est plus forcément celui du paquet de
// l'app. Quand la station demande « redémarre-moi sur la version X » — sa mise à jour a téléchargé X
// et ses cooks ont fini (#2189) —, seul ce process est arrêté, et X démarre à sa place : ni
// réinstallation, ni Gatekeeper, ni relance de l'app. La fenêtre, les onglets du second, les shells
// et leurs sessions `claude` sont des process de l'app, pas de la station : rien ne les touche.
//
// - **Les versions sont dans les données de l'app.** Une version X de la station est un dossier de
//   runtime, `<versions>/<X>/` (son `src/station/main.ts`, son `package.json`), posé là par la mise
//   à jour de la station. L'app n'écrit jamais dans son propre paquet, et ne lance que ce qui est
//   sous ce dossier : la demande ne porte qu'un numéro de version, pas un chemin.
// - **La demande est un fichier.** La station écrit `<BRIGADE_STATION_DIR>/redemarrage`
//   (`{"version":"X"}`) ; l'app le lit, l'efface, et joue le redémarrage. Le contrat est dans le
//   README de ce dossier.
// - **Une version est gardée quand la station s'y est dite en service** — `en-service` porte X,
//   sous un pid neuf et vivant, depuis le redémarrage, et sert au moins les projets que la version
//   d'avant servait —, comme sur la box (runtime/src/mise-a-jour/mettre-a-jour.ts). Sinon la
//   version d'avant est relancée, et l'issue le dit. Une version ratée n'est pas réessayée.
// - **Ce qui est gardé survit à l'app.** La version retenue est notée sous `<versions>/` : l'app
//   rouverte relance la station sur elle, sauf si son paquet en porte une plus récente.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PRINCIPAL } from "../poste/role.ts";
import { tenirStationLocale, type EtatStationLocale, type OptionsStationLocale, type StationLocale } from "../poste/station.ts";

// Ce que la station écrit pour demander son redémarrage, dans son répertoire.
export const DEMANDE = "redemarrage";
// Ce que la station écrit d'elle-même quand elle a démarré (runtime/src/mise-a-jour/en-service.ts).
export const EN_SERVICE = "en-service";
// Ce que l'app retient des versions de la station, sous leur dossier.
export const ETAT = "etat.json";
// La variable qui dit à la station où poser les versions qu'elle télécharge.
export const VARIABLE_DES_VERSIONS = "BRIGADE_STATION_VERSIONS";

// Un numéro de version tel qu'une publication `station-<version>` le porte : jamais un chemin.
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,99}$/;

// L'issue d'un redémarrage : passée sur X, ou revenue sur la version d'avant — `retour` dit
// pourquoi celle-ci n'a pas redémarré non plus, nul sinon.
export type Issue =
  | { quoi: "passee"; version: string; depuis: string; le: string }
  | { quoi: "revenue"; visee: string; restauree: string; motif: string; le: string; retour: string | null }
  | { quoi: "refusee"; visee: string; motif: string; le: string };

// `retenue` : la version des données de l'app sur laquelle la station tourne — nulle, celle du paquet.
export type EtatDesVersions = { retenue: string | null; ratees: string[]; derniere: Issue | null };

export type OptionsProcessDeStation = Omit<OptionsStationLocale, "principal"> & {
  // Le point d'entrée du runtime livré dans le paquet de l'app : la station de départ.
  embarque: string;
  // Le dossier des versions téléchargées, dans les données de l'app.
  versions: string;
  // Le temps laissé à une version pour se dire en service.
  demarrageMs?: number;
  // Entre deux regards sur la station qui démarre, et sur la demande.
  pasMs?: number;
  veilleMs?: number;
  // Un redémarrage s'est conclu.
  surIssue?: (issue: Issue) => void;
  maintenant?: () => Date;
  // Ce qui tient un process de station : poste/station.ts.
  tenir?: (options: OptionsStationLocale) => StationLocale;
};

export type ProcessDeStation = StationLocale & {
  // La version qui tourne, telle que son `package.json` la dit.
  version(): string;
  // Redémarre la station sur la version `version` des données de l'app. Rend l'issue, ou nul quand
  // rien n'a été arrêté parce qu'il n'y avait rien à faire.
  redemarrer(version: string): Promise<Issue | null>;
  etatDesVersions(): EtatDesVersions;
};

type EnService = { version: string; pid: number; depuis: string; servis: string[]; refuses: Record<string, string> };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const pause = (ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms));

// Compare deux versions par leurs nombres, dans l'ordre — ce qui suit un `+` n'ordonne rien.
export function comparerVersions(a: string, b: string): number {
  const nombres = (v: string) => (v.split("+")[0] ?? "").split(/[^0-9]+/).filter((n) => n !== "").map(Number);
  const [x, y] = [nombres(a), nombres(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const ecart = (x[i] ?? 0) - (y[i] ?? 0);
    if (ecart !== 0) return Math.sign(ecart);
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

// La version d'un runtime : celle de son `package.json`, à côté de `src/`.
export function versionDuRuntime(principal: string): string {
  try {
    const lu = JSON.parse(readFileSync(join(dirname(dirname(dirname(principal))), "package.json"), "utf8")) as { version?: unknown };
    return typeof lu.version === "string" && lu.version !== "" ? lu.version : "unknown";
  } catch {
    return "unknown";
  }
}

export const principalDe = (versions: string, version: string) => join(versions, version, PRINCIPAL);

// La demande de la station, ou nulle. Illisible, elle est nulle aussi : `motif` dit pourquoi.
export function lireDemande(racine: string): { version: string } | { motif: string } | null {
  let texte: string;
  try {
    texte = readFileSync(join(racine, DEMANDE), "utf8");
  } catch {
    return null;
  }
  try {
    const { version } = JSON.parse(texte) as { version?: unknown };
    if (typeof version === "string" && VERSION.test(version)) return { version };
    return { motif: `it names no valid version (${JSON.stringify(version ?? null).slice(0, 100)})` };
  } catch (erreur) {
    return { motif: `it is not JSON: ${message(erreur)}` };
  }
}

// Le geste de la station, pour sa mise à jour et pour les essais : écrit d'un coup.
export function demanderRedemarrage(racine: string, version: string): void {
  const fichier = join(racine, DEMANDE);
  writeFileSync(`${fichier}.${process.pid}`, `${JSON.stringify({ version })}\n`);
  renameSync(`${fichier}.${process.pid}`, fichier);
}

export function lireEtatDesVersions(versions: string): EtatDesVersions {
  try {
    const lu = JSON.parse(readFileSync(join(versions, ETAT), "utf8")) as Partial<EtatDesVersions>;
    return {
      retenue: typeof lu.retenue === "string" && VERSION.test(lu.retenue) ? lu.retenue : null,
      ratees: Array.isArray(lu.ratees) ? lu.ratees.filter((v): v is string => typeof v === "string") : [],
      derniere: typeof lu.derniere === "object" && lu.derniere !== null ? lu.derniere : null,
    };
  } catch {
    return { retenue: null, ratees: [], derniere: null };
  }
}

function lireEnService(racine: string): EnService | null {
  try {
    const lu = JSON.parse(readFileSync(join(racine, EN_SERVICE), "utf8")) as Partial<EnService>;
    if (typeof lu.version !== "string" || typeof lu.pid !== "number" || typeof lu.depuis !== "string" || !Array.isArray(lu.servis)) return null;
    return { version: lu.version, pid: lu.pid, depuis: lu.depuis, servis: lu.servis.filter((n): n is string => typeof n === "string"), refuses: typeof lu.refuses === "object" && lu.refuses !== null ? lu.refuses : {} };
  } catch {
    return null;
  }
}

function vivant(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function tenirProcessDeStation(options: OptionsProcessDeStation): ProcessDeStation {
  const { racine, versions, dire } = options;
  const tenir = options.tenir ?? tenirStationLocale;
  const demarrageMs = options.demarrageMs ?? 120_000;
  const pasMs = options.pasMs ?? 250;
  const veilleMs = options.veilleMs ?? 2_000;
  const maintenant = options.maintenant ?? (() => new Date());
  const { embarque } = options;
  // Ce que chaque process de la station reçoit : ce que poste/station.ts attend, et où poser les versions.
  const communes: Omit<OptionsStationLocale, "principal"> = {
    node: options.node,
    racine,
    env: { ...options.env, [VARIABLE_DES_VERSIONS]: versions },
    dire,
    appairer: options.appairer,
    ...(options.pid === undefined ? {} : { pid: options.pid }),
    ...(options.relanceMs === undefined ? {} : { relanceMs: options.relanceMs }),
    ...(options.reessaiMs === undefined ? {} : { reessaiMs: options.reessaiMs }),
    ...(options.gardeMs === undefined ? {} : { gardeMs: options.gardeMs }),
    ...(options.avantLancement === undefined ? {} : { avantLancement: options.avantLancement }),
    ...(options.surChangement === undefined ? {} : { surChangement: options.surChangement }),
  };

  let etatDesVersions = lireEtatDesVersions(versions);
  const ecrireEtat = () => {
    try {
      mkdirSync(versions, { recursive: true });
      const fichier = join(versions, ETAT);
      writeFileSync(`${fichier}.neuf`, `${JSON.stringify(etatDesVersions, null, 2)}\n`);
      renameSync(`${fichier}.neuf`, fichier);
    } catch (erreur) {
      dire(`brigade: the station versions could not be remembered (${join(versions, ETAT)}) — ${message(erreur)}`);
    }
  };

  // Au départ : la version retenue, si elle est encore là et plus récente que celle du paquet.
  const versionEmbarquee = versionDuRuntime(embarque);
  const retenue = etatDesVersions.retenue;
  let principal = embarque;
  if (retenue !== null && existsSync(principalDe(versions, retenue)) && comparerVersions(retenue, versionEmbarquee) > 0) principal = principalDe(versions, retenue);
  let version = principal === embarque ? versionEmbarquee : (retenue ?? versionEmbarquee);

  const lancer = (point: string) => tenir({ ...communes, principal: point });
  let station = lancer(principal);
  let arretee = false;
  let enCours: Promise<Issue | null> | null = null;

  const conclure = (issue: Issue): Issue => {
    etatDesVersions = { ...etatDesVersions, derniere: issue };
    ecrireEtat();
    options.surIssue?.(issue);
    return issue;
  };

  // Attend que la station se dise en service en `visee`, sous un pid neuf, depuis `debut`, en
  // servant encore `servis`. Rend l'instant de son démarrage, ou pourquoi elle n'a pas démarré.
  const attendreEnService = async (tenue: StationLocale, visee: string, debut: number, ancien: number | undefined, servis: string[]): Promise<{ le: string } | { motif: string }> => {
    const fin = Date.now() + demarrageMs;
    let attente = `it did not say it was in service in ${visee}`;
    let lancee = false;
    for (;;) {
      const etat: EtatStationLocale = tenue.etat();
      if (etat === "refusee") return { motif: `it refused to start in ${visee}` };
      // Morte après son lancement : poste/station.ts la relancerait, la version ne tient pas.
      if (etat === "relancee" || (lancee && !tenue.tourne())) return { motif: `it stopped in ${visee} right after its launch` };
      lancee ||= tenue.tourne();
      const dite = lireEnService(racine);
      if (dite !== null && dite.version === visee && dite.pid !== ancien && Date.parse(dite.depuis) >= debut && vivant(dite.pid)) {
        const perdus = servis.filter((projet) => !dite.servis.includes(projet));
        if (perdus.length === 0) return { le: dite.depuis };
        attente = perdus.map((projet) => `project ${projet} is no longer served in ${visee}${dite.refuses[projet] ? `: ${dite.refuses[projet]}` : ""}`).join("; ");
      }
      if (arretee) return { motif: "the app closed during the restart" };
      if (Date.now() >= fin) return { motif: `${attente} within ${demarrageMs / 1000} s` };
      await pause(pasMs);
    }
  };

  // Arrête le process de la station, puis en lance un sur `point` : rien d'autre ne s'arrête.
  const remplacer = async (point: string): Promise<{ tenue: StationLocale; debut: number }> => {
    await station.arreter();
    // L'horloge de la machine, celle dont la station date son démarrage.
    const debut = Date.now();
    station = lancer(point);
    return { tenue: station, debut };
  };

  const jouer = async (visee: string): Promise<Issue | null> => {
    const le = () => maintenant().toISOString();
    if (visee === version) {
      dire(`brigade: this computer's station is already on ${visee} — nothing is restarted`);
      return null;
    }
    const refuser = (motif: string) => {
      dire(`brigade: this computer's station is not restarted on ${visee} — ${motif}; it stays on ${version}`);
      return conclure({ quoi: "refusee", visee, motif, le: le() });
    };
    if (etatDesVersions.ratees.includes(visee)) return refuser("that version did not start at its try, it is not tried again");
    const point = principalDe(versions, visee);
    if (!existsSync(point)) return refuser(`its runtime is not in ${join(versions, visee)}`);

    const depuis = version;
    const pointAvant = principal;
    const avant = lireEnService(racine);
    const servis = avant?.servis ?? [];
    dire(`brigade: this computer's station restarts on ${visee} (from ${depuis}) — only its process; the window, the seconds and the shells keep running`);
    const essai = await remplacer(point);
    const constat = await attendreEnService(essai.tenue, visee, essai.debut, avant?.pid, servis);
    if ("le" in constat) {
      principal = point;
      version = visee;
      etatDesVersions = { ...etatDesVersions, retenue: visee };
      dire(`brigade: this computer's station now runs ${visee}`);
      return conclure({ quoi: "passee", version: visee, depuis, le: constat.le });
    }
    if (arretee) return null;
    etatDesVersions = { ...etatDesVersions, ratees: [...new Set([...etatDesVersions.ratees, visee])] };
    dire(`brigade: this computer's station did not start on ${visee} (${constat.motif}) — back to ${depuis}`);
    const rate = lireEnService(racine)?.pid;
    const retour = await remplacer(pointAvant);
    const revenue = await attendreEnService(retour.tenue, depuis, retour.debut, rate, servis);
    dire(`brigade: this computer's station ${"le" in revenue ? `runs ${depuis} again` : `did not start again on ${depuis} either: ${revenue.motif}`}`);
    return conclure({ quoi: "revenue", visee, restauree: depuis, motif: constat.motif, le: le(), retour: "le" in revenue ? null : revenue.motif });
  };

  const redemarrer = (visee: string): Promise<Issue | null> => {
    if (arretee) return Promise.resolve(null);
    if (enCours !== null) return enCours;
    enCours = jouer(visee)
      .catch((erreur) => {
        dire(`brigade: this computer's station restart on ${visee} failed — ${message(erreur)}`);
        return null;
      })
      .finally(() => {
        enCours = null;
      });
    return enCours;
  };

  // La demande de la station : lue par l'app qui la fait tourner, puis effacée.
  let ditIllisible = "";
  const veiller = () => {
    if (arretee || enCours !== null || station.etat() === "tenue-ailleurs") return;
    const demande = lireDemande(racine);
    if (demande === null) return;
    rmSync(join(racine, DEMANDE), { force: true });
    if ("motif" in demande) {
      if (demande.motif !== ditIllisible) dire(`brigade: this computer's station asked for a restart the app cannot read — ${demande.motif}`);
      ditIllisible = demande.motif;
      return;
    }
    void redemarrer(demande.version);
  };
  const veille = setInterval(veiller, veilleMs);
  veille.unref();

  return {
    etat: () => station.etat(),
    tourne: () => station.tourne(),
    version: () => version,
    etatDesVersions: () => etatDesVersions,
    redemarrer,
    async arreter() {
      arretee = true;
      clearInterval(veille);
      await enCours;
      await station.arreter();
    },
  };
}
