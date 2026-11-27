// La machine, telle que la mise à jour la touche : dpkg pour la version
// installée et le contenu d'un paquet, apt pour l'installer, systemd pour la
// station. Rien d'autre n'est lancé, et toujours sans shell. C'est le seul
// module de la mise à jour qui lance un programme du système.
import { spawnSync } from "../sans-invite.ts";

export const PAQUET = "brigade-station";
export const SERVICE = "brigade-station.service";

// `actif` : l'ActiveState de systemd (`active`, `activating`, `failed`…).
// `pid` : son MainPID, 0 sans process. `redemarrages` : ceux que systemd a
// faits seul depuis le dernier démarrage demandé — la station est tombée.
export type EtatDuService = { actif: string; pid: number; redemarrages: number };

export type Rendu = { ok: true } | { ok: false; motif: string };

export type Systeme = {
  // La version installée du paquet, nulle s'il ne l'est pas tout à fait.
  installee(): string | null;
  // Ce que dit le paquet d'un fichier : son nom et sa version.
  lirePaquet(fichier: string): { paquet: string; version: string } | null;
  // Installe un paquet, plus récent ou plus ancien. dpkg y joue le postinst
  // du paquet, qui relance la station sur le nouveau code.
  installer(fichier: string): Rendu;
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

export function systemeDeLaMachine(): Systeme {
  return {
    installee() {
      const lu = lancer("dpkg-query", ["--show", "--showformat=${db:Status-Abbrev}${Version}", PAQUET]);
      const [, etat, version] = /^(\S+)\s*(\S*)$/.exec(lu.sortie.trim()) ?? [];
      return lu.code === 0 && etat === "ii" && version ? version : null;
    },
    lirePaquet(fichier) {
      const lu = lancer("dpkg-deb", ["--field", fichier, "Package", "Version"]);
      if (lu.code !== 0) return null;
      const champs = Object.fromEntries(lu.sortie.split("\n").map((ligne) => [ligne.split(":", 1)[0]?.trim(), ligne.slice(ligne.indexOf(":") + 1).trim()]));
      return champs.Package && champs.Version ? { paquet: champs.Package, version: champs.Version } : null;
    },
    installer(fichier) {
      const lu = lancer("apt-get", ["install", "-y", "-q", "--allow-downgrades", fichier], DELAI_INSTALLATION_MS, { ...process.env, DEBIAN_FRONTEND: "noninteractive" });
      if (lu.echec !== null) return { ok: false, motif: `apt-get n'a pas pu être lancé ou n'a pas rendu la main (${lu.echec.message})` };
      if (lu.code !== 0) return { ok: false, motif: `apt-get a rendu ${lu.code}${derniereLigne(lu.erreurs || lu.sortie) ? ` — « ${derniereLigne(lu.erreurs || lu.sortie)} »` : ""}` };
      return { ok: true };
    },
    service() {
      const lu = lancer("systemctl", ["show", SERVICE, "--property=ActiveState,MainPID,NRestarts"]);
      const proprietes = Object.fromEntries(lu.sortie.split("\n").map((ligne) => [ligne.split("=", 1)[0], ligne.slice(ligne.indexOf("=") + 1).trim()]));
      return { actif: proprietes.ActiveState || "inconnu", pid: Number(proprietes.MainPID) || 0, redemarrages: Number(proprietes.NRestarts) || 0 };
    },
  };
}
