// Une installation de test de la station, à part de toute vraie machine : une
// racine d'essai où le paquet s'installe, des doublures de `apt-get`,
// `dpkg-query`, `systemctl`, `getent` et `adduser` qui y jouent ce que la
// machine ferait, et un répertoire où publier des versions. Le vrai `dpkg-deb`
// construit et ouvre les paquets ; le code installé, le postinst et les unités
// sont ceux du paquet.
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { aArreter, repertoireTemporaire } from "../../outils.ts";

const AIDES = import.meta.dirname;
export const CONSTRUIRE = join(AIDES, "../../../paquet/construire.ts");

export const sansDpkgDeb = spawnSync("dpkg-deb", ["--version"]).status !== 0 && "`dpkg-deb` manque sur cette machine : le paquet ne s'y construit pas";

function executable(fichier: string, texte: string): void {
  writeFileSync(fichier, texte);
  chmodSync(fichier, 0o755);
}

// Un `node` qui ne fait que dire sa version : le paquet le porte, la doublure
// de systemd lance celui du test à sa place.
function fauxNode(repertoire: string): string {
  const fichier = join(repertoire, "node");
  executable(fichier, "#!/bin/sh\necho v99.0.0\n");
  return fichier;
}

// Construit le paquet de la station en `version`, depuis ce dépôt.
export function construirePaquet(dossier: string, version: string): string {
  const sortie = join(dossier, `construit-${version}`);
  const rendu = spawnSync(process.execPath, [CONSTRUIRE, "--sortie", sortie, "--version", version, "--node", fauxNode(dossier)], { encoding: "utf8" });
  if (rendu.status !== 0) throw new Error(`construction de ${version} : ${rendu.stdout}${rendu.stderr}`);
  return join(sortie, readdirSync(sortie)[0] ?? "");
}

// Un paquet tiré d'un autre : rouvert, porté à `version`, changé par
// `changer` (qui reçoit son arbre), puis refait.
export function deriverPaquet(dossier: string, depuis: string, version: string, changer: (arbre: string) => void = () => {}): string {
  const ici = mkdtempSync(join(dossier, `${version}-`));
  const arbre = join(ici, "arbre");
  const ouvert = spawnSync("dpkg-deb", ["--raw-extract", depuis, arbre], { encoding: "utf8" });
  if (ouvert.status !== 0) throw new Error(`ouverture de ${depuis} : ${ouvert.stderr}`);
  const control = join(arbre, "DEBIAN/control");
  writeFileSync(control, readFileSync(control, "utf8").replace(/^Version: .*$/m, `Version: ${version}`));
  const paquetJson = join(arbre, "usr/lib/brigade-station/runtime/package.json");
  writeFileSync(paquetJson, `${JSON.stringify({ ...JSON.parse(readFileSync(paquetJson, "utf8")), version }, null, 2)}\n`);
  changer(arbre);
  const fichier = join(ici, `brigade-station_${version}.deb`);
  const refait = spawnSync("dpkg-deb", ["--root-owner-group", "-Zgzip", "--build", arbre, fichier], { encoding: "utf8" });
  if (refait.status !== 0) throw new Error(`construction de ${version} : ${refait.stderr}`);
  return fichier;
}

export type Machine = {
  // La racine d'essai : ce qui serait `/` sur la machine.
  racine: string;
  // Le répertoire de la station (/var/lib/brigade) et celui de la mise à jour
  // (/var/lib/brigade-station), sous la racine.
  station: string;
  miseAJour: string;
  // Ce qu'il faut à un process pour jouer sur cette machine.
  env: Record<string, string>;
  // L'installation du guide : le paquet remis à apt, une seule fois.
  installer(paquet: string): void;
  // Publier une version : poser son paquet là où la station les cherche.
  publier(version: string, paquet: string): void;
  // Le minuteur de la mise à jour qui se déclenche : un passage, sous systemd.
  // Rend le code de sortie du passage.
  declencher(): number;
  // La version installée, selon dpkg.
  installee(): string | null;
  // Le process de la station, selon systemd : son pid, 0 sans process, et son
  // état.
  service(): { pid: number; actif: string };
  // L'environnement avec lequel systemd a lancé la station en dernier.
  envDeLaStation(): Record<string, string>;
  // Les appels faits à apt-get et systemctl, dans l'ordre.
  appels(): string[];
  // Ce que la station et la mise à jour ont écrit sur leur sortie.
  sortie(unite: "brigade-station.service" | "brigade-station-mise-a-jour.service"): string;
};

export function uneMachine(t: TestContext, env: Record<string, string> = {}): Machine {
  const essai = repertoireTemporaire(t);
  const racine = join(essai, "machine");
  const bin = join(essai, "bin");
  const publiees = join(essai, "publiees");
  for (const dossier of [join(racine, "run/systemd/system"), join(racine, "var/lib/brigade"), bin, publiees]) mkdirSync(dossier, { recursive: true });
  executable(join(bin, "systemctl"), `#!/bin/sh\nexec "${process.execPath}" "${join(AIDES, "faux-systemctl.ts")}" "$@"\n`);
  executable(join(bin, "apt-get"), `#!/bin/sh\nexec "${process.execPath}" "${join(AIDES, "faux-apt-get.ts")}" "$@"\n`);
  executable(join(bin, "dpkg-query"), `#!/bin/sh\nf="$FAUSSE_RACINE/var/lib/dpkg-faux/brigade-station"\n[ -f "$f" ] || { echo "dpkg-query: no packages found matching brigade-station" >&2; exit 1; }\nprintf 'ii %s' "$(cat "$f")"\n`);
  // Le compte brigade existe déjà.
  executable(join(bin, "getent"), "#!/bin/sh\nexit 0\n");
  executable(join(bin, "adduser"), "#!/bin/sh\nexit 0\n");
  const etat = join(racine, "run/faux-systemd");
  const lire = (fichier: string) => (existsSync(fichier) ? readFileSync(fichier, "utf8") : "");
  const complet = {
    ...env,
    PATH: `${bin}:${env.PATH ?? process.env.PATH ?? ""}`,
    FAUSSE_RACINE: racine,
    FAUX_SYSTEMD_ENV: JSON.stringify({ BRIGADE_MISE_A_JOUR_SOURCE: publiees, ...JSON.parse(env.FAUX_SYSTEMD_ENV ?? "{}") }),
  };
  const systemctl = (...args: string[]) => spawnSync(join(bin, "systemctl"), args, { env: complet, encoding: "utf8" });
  const pid = () => Number(lire(join(etat, "brigade-station.service.pid")) || 0);
  // La fin du test arrête la station, quelle que soit sa version.
  aArreter(t, () => {
    systemctl("stop", "brigade-station.service");
    // Sans pid — une station jamais démarrée —, rien à tuer : `kill(0)` tuerait
    // le groupe du test.
    if (pid() <= 0) return;
    try {
      process.kill(pid(), "SIGKILL");
    } catch {
      // Déjà arrêtée.
    }
  });
  return {
    racine,
    station: join(racine, "var/lib/brigade"),
    miseAJour: join(racine, "var/lib/brigade-station"),
    env: complet,
    installer(paquet) {
      const rendu = spawnSync(join(bin, "apt-get"), ["install", "-y", "-q", paquet], { env: complet, encoding: "utf8" });
      if (rendu.status !== 0) throw new Error(`installation de ${paquet} : ${rendu.stdout}${rendu.stderr}`);
    },
    publier(version, paquet) {
      mkdirSync(join(publiees, version));
      writeFileSync(join(publiees, version, `brigade-station_${process.arch === "arm64" ? "arm64" : "amd64"}.deb`), readFileSync(paquet));
    },
    declencher() {
      appendFileSync(join(etat, "appels"), "-- minuteur\n");
      return systemctl("start", "brigade-station-mise-a-jour.service").status ?? -1;
    },
    installee() {
      const lu = lire(join(racine, "var/lib/dpkg-faux/brigade-station")).trim();
      return lu === "" ? null : lu;
    },
    service() {
      const lu = systemctl("show", "brigade-station.service").stdout;
      return { pid: Number(/^MainPID=(\d+)$/m.exec(lu)?.[1] ?? 0), actif: /^ActiveState=(\S+)$/m.exec(lu)?.[1] ?? "" };
    },
    envDeLaStation: () => JSON.parse(lire(join(etat, "brigade-station.service.env")) || "{}"),
    appels: () => lire(join(etat, "appels")).split("\n").filter(Boolean),
    sortie: (unite) => lire(join(etat, `${unite}.sortie`)),
  };
}
