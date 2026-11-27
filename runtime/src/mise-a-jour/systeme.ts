// La machine, telle que la mise à jour la touche : les versions posées sous
// /opt/brigade-station/<version>/, le lien `current` qui désigne celle qui
// tourne, et le gestionnaire de services — systemd sous Linux, launchd sous
// macOS — qui relance la station. Rien d'autre n'est lancé, et toujours sans
// shell. C'est le seul module de la mise à jour qui lance un programme du
// système.
import { existsSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "../sans-invite.ts";
import { VERSION } from "./versions.ts";

export const SERVICE = "brigade-station.service";
export const ETIQUETTE_LAUNCHD = "brigade.station";
export const OPT = "/opt/brigade-station";
export const COURANTE = "current";

// `actif` : l'ActiveState de systemd (`active`, `activating`, `failed`…).
// `pid` : son MainPID, 0 sans process. `redemarrages` : ceux que le
// gestionnaire a faits seul depuis le dernier démarrage demandé — la station
// est tombée.
export type EtatDuService = { actif: string; pid: number; redemarrages: number };

export type Rendu = { ok: true } | { ok: false; motif: string };

// Le gestionnaire de services de la machine, pour la seule station.
export type Gestionnaire = {
  redemarrer(): Rendu;
  etat(): EtatDuService;
};

export type Systeme = {
  // La version que `current` désigne, nulle sans lien ou s'il ne désigne rien de posé.
  installee(): string | null;
  // Les versions posées sous /opt/brigade-station.
  posees(): string[];
  // Pose une archive : la défait dans le répertoire de sa version, et joue
  // l'`install.sh` de cette version en mode mise à jour, qui rafraîchit les
  // unités ou les plists. Rien ne reste d'une pose qui échoue.
  poser(archive: string, version: string): Rendu;
  // Fait de `version` la version courante, puis relance la station.
  basculer(version: string): Rendu;
  // Retire une version posée.
  retirer(version: string): void;
  service(): EtatDuService;
};

const DELAI_INSTALLATION_MS = 15 * 60_000;
const DELAI_MS = 60_000;

// La dernière ligne qu'un programme a écrite, pour dire son échec.
const derniereLigne = (texte: string) =>
  texte
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .at(-1)
    ?.slice(0, 300) ?? "";

function lancer(programme: string, args: string[], delaiMs = DELAI_MS, env: NodeJS.ProcessEnv = process.env) {
  const rendu = spawnSync(programme, args, { encoding: "utf8", timeout: delaiMs, env, maxBuffer: 16 * 1024 * 1024 });
  return { code: rendu.status, sortie: rendu.stdout ?? "", erreurs: rendu.stderr ?? "", echec: rendu.error ?? null };
}

// Ce qu'un programme lancé a dit de son échec, ou rien s'il a réussi.
function echec(nom: string, lu: ReturnType<typeof lancer>): string | null {
  if (lu.echec !== null) return `${nom} n'a pas pu être lancé ou n'a pas rendu la main (${lu.echec.message})`;
  if (lu.code === 0) return null;
  const ligne = derniereLigne(lu.erreurs || lu.sortie);
  return `${nom} a rendu ${lu.code}${ligne ? ` — « ${ligne} »` : ""}`;
}

export function gestionnaireSystemd(): Gestionnaire {
  return {
    redemarrer() {
      const motif = echec("systemctl restart", lancer("systemctl", ["restart", SERVICE]));
      return motif === null ? { ok: true } : { ok: false, motif };
    },
    etat() {
      const lu = lancer("systemctl", ["show", SERVICE, "--property=ActiveState,MainPID,NRestarts"]);
      const proprietes = Object.fromEntries(lu.sortie.split("\n").map((ligne) => [ligne.split("=", 1)[0], ligne.slice(ligne.indexOf("=") + 1).trim()]));
      return { actif: proprietes.ActiveState || "inconnu", pid: Number(proprietes.MainPID) || 0, redemarrages: Number(proprietes.NRestarts) || 0 };
    },
  };
}

export function gestionnaireLaunchd(): Gestionnaire {
  const cible = `system/${ETIQUETTE_LAUNCHD}`;
  return {
    redemarrer() {
      const motif = echec("launchctl kickstart", lancer("launchctl", ["kickstart", "-k", cible]));
      return motif === null ? { ok: true } : { ok: false, motif };
    },
    etat() {
      const lu = lancer("launchctl", ["print", cible]);
      if (lu.code !== 0) return { actif: "failed", pid: 0, redemarrages: 0 };
      const pid = Number(/^\s*pid = (\d+)$/m.exec(lu.sortie)?.[1] ?? 0);
      return { actif: pid > 0 ? "active" : /^\s*state = (\S+)$/m.exec(lu.sortie)?.[1] ?? "inconnu", pid, redemarrages: 0 };
    },
  };
}

export function systemeDeLaMachine(options: { opt?: string; gestionnaire?: Gestionnaire } = {}): Systeme {
  const opt = options.opt ?? OPT;
  const gestionnaire = options.gestionnaire ?? (process.platform === "darwin" ? gestionnaireLaunchd() : gestionnaireSystemd());
  const courante = join(opt, COURANTE);
  const posees = () => (existsSync(opt) ? readdirSync(opt, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() && VERSION.test(entree.name) ? [entree.name] : [])) : []);
  return {
    installee() {
      let cible: string;
      try {
        cible = basename(readlinkSync(courante));
      } catch {
        return null;
      }
      return posees().includes(cible) ? cible : null;
    },
    posees,
    poser(archive, version) {
      const cible = join(opt, version);
      const enCours = `${cible}.part`;
      rmSync(enCours, { recursive: true, force: true });
      rmSync(cible, { recursive: true, force: true });
      mkdirSync(enCours, { recursive: true, mode: 0o755 });
      const defaite = echec("tar", lancer("tar", ["-xzf", archive, "-C", enCours, "--no-same-owner"], DELAI_INSTALLATION_MS));
      if (defaite !== null) {
        rmSync(enCours, { recursive: true, force: true });
        return { ok: false, motif: `l'archive de ${version} ne se défait pas : ${defaite}` };
      }
      if (!existsSync(join(enCours, "install.sh"))) {
        rmSync(enCours, { recursive: true, force: true });
        return { ok: false, motif: `l'archive de ${version} ne porte pas d'install.sh` };
      }
      renameSync(enCours, cible);
      const installe = echec("install.sh", lancer("sh", [join(cible, "install.sh"), "--update"], DELAI_INSTALLATION_MS, { ...process.env, BRIGADE_OPT: opt }));
      if (installe !== null) {
        rmSync(cible, { recursive: true, force: true });
        return { ok: false, motif: `l'install.sh de ${version} a échoué : ${installe}` };
      }
      return { ok: true };
    },
    basculer(version) {
      if (!posees().includes(version)) return { ok: false, motif: `la version ${version} n'est pas posée sous ${opt}` };
      const lien = `${courante}.tmp`;
      rmSync(lien, { force: true });
      symlinkSync(version, lien);
      renameSync(lien, courante);
      return gestionnaire.redemarrer();
    },
    retirer(version) {
      rmSync(join(opt, version), { recursive: true, force: true });
    },
    service: () => gestionnaire.etat(),
  };
}
