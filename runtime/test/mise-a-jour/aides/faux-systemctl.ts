// Doublure de `systemctl` pour une machine d'essai : un systemd réduit à ce que
// le paquet de la station et sa mise à jour lui demandent, sur une machine
// posée sous $FAUSSE_RACINE. Il lance pour de vrai ce que les unités du
// paquet décrivent — leur ExecStart, depuis leur WorkingDirectory, avec leur
// Environment —, les chemins de la machine ramenés sous $FAUSSE_RACINE et le
// `node` du paquet remplacé par celui du test.
//
// Comme systemd, il ne lit les unités qu'à `daemon-reload` : une unité changée
// par un paquet n'est prise qu'après lui. Un service `oneshot` est joué
// jusqu'au bout ; un autre est lancé détaché, et seul son process principal
// reçoit SIGTERM à l'arrêt (`KillMode=process`). Un service dont le process est
// mort sans qu'on l'ait arrêté est `failed`.
//
// $FAUX_SYSTEMD_ENV (JSON) s'ajoute à l'environnement de chaque unité lancée.
// Chaque appel est noté, une ligne, dans <racine>/run/faux-systemd/appels.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const racine = process.env.FAUSSE_RACINE ?? "";
if (racine === "") {
  console.error("faux systemctl : FAUSSE_RACINE n'est pas défini");
  process.exit(1);
}
const etat = join(racine, "run/faux-systemd");
const chargees = join(etat, "chargees");
const activees = join(etat, "activees");
mkdirSync(chargees, { recursive: true });
mkdirSync(activees, { recursive: true });
const args = process.argv.slice(2);
appendFileSync(join(etat, "appels"), `systemctl ${args.join(" ")}\n`);

const options = args.filter((arg) => arg.startsWith("--"));
const [verbe, ...unites] = args.filter((arg) => !arg.startsWith("--"));
const silencieux = options.includes("--quiet");

// Les chemins de la machine, sous la racine d'essai.
const ramener = (valeur: string) => valeur.replace(/\/(usr\/lib\/brigade-station|var\/lib\/brigade)/g, (trouve) => `${racine}${trouve}`);

function lireUnite(unite: string): Map<string, string[]> | null {
  const fichier = join(chargees, unite);
  if (!existsSync(fichier)) return null;
  const cles = new Map<string, string[]>();
  for (const ligne of readFileSync(fichier, "utf8").split("\n")) {
    const trouve = /^([A-Za-z]+)=(.*)$/.exec(ligne.trim());
    if (trouve) cles.set(trouve[1] ?? "", [...(cles.get(trouve[1] ?? "") ?? []), trouve[2] ?? ""]);
  }
  return cles;
}

const fichierDe = (unite: string, quoi: string) => join(etat, `${unite}.${quoi}`);
const pidDe = (unite: string): number => (existsSync(fichierDe(unite, "pid")) ? Number(readFileSync(fichierDe(unite, "pid"), "utf8")) : 0);
const vivant = (pid: number) => {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // Un zombie n'est plus la station.
  try {
    return !/^\S+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return true;
  }
};

function etatDe(unite: string): { actif: string; pid: number } {
  const pid = pidDe(unite);
  if (vivant(pid)) return { actif: "active", pid };
  if (existsSync(fichierDe(unite, "actif"))) return { actif: "active", pid: 0 };
  if (pid > 0 && !existsSync(fichierDe(unite, "arrete"))) return { actif: "failed", pid: 0 };
  return { actif: "inactive", pid: 0 };
}

function demarrer(unite: string): number {
  const cles = lireUnite(unite);
  if (cles === null) {
    console.error(`Failed to start ${unite}: Unit ${unite} not found.`);
    return 5;
  }
  rmSync(fichierDe(unite, "arrete"), { force: true });
  for (const voulue of (cles.get("Wants") ?? []).flatMap((liste) => liste.split(/\s+/))) if (voulue.startsWith("brigade-")) demarrer(voulue);
  const [commande] = cles.get("ExecStart") ?? [];
  if (commande === undefined) {
    writeFileSync(fichierDe(unite, "actif"), "");
    return 0;
  }
  if (vivant(pidDe(unite))) return 0;
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const affectation of cles.get("Environment") ?? []) {
    const egal = affectation.indexOf("=");
    env[affectation.slice(0, egal)] = ramener(affectation.slice(egal + 1));
  }
  Object.assign(env, JSON.parse(process.env.FAUX_SYSTEMD_ENV ?? "{}"));
  for (const repertoire of cles.get("StateDirectory") ?? []) mkdirSync(join(racine, "var/lib", repertoire), { recursive: true });
  const [binaire = "", ...arguments_] = commande.split(/\s+/).map(ramener);
  const programme = binaire.endsWith("/node/bin/node") ? process.execPath : binaire;
  const [dossier] = cles.get("WorkingDirectory") ?? [];
  writeFileSync(fichierDe(unite, "env"), JSON.stringify(env));
  const sortie = openSync(fichierDe(unite, "sortie"), "a");
  if (cles.get("Type")?.[0] === "oneshot") {
    const rendu = spawnSync(programme, arguments_, { cwd: dossier === undefined ? undefined : ramener(dossier), env, stdio: ["ignore", sortie, sortie] });
    return rendu.status ?? 1;
  }
  const enfant = spawn(programme, arguments_, { cwd: dossier === undefined ? undefined : ramener(dossier), env, stdio: ["ignore", sortie, sortie], detached: true });
  writeFileSync(fichierDe(unite, "pid"), String(enfant.pid));
  enfant.unref();
  return 0;
}

async function arreter(unite: string): Promise<void> {
  writeFileSync(fichierDe(unite, "arrete"), "");
  rmSync(fichierDe(unite, "actif"), { force: true });
  const pid = pidDe(unite);
  if (!vivant(pid)) return;
  process.kill(pid, "SIGTERM");
  const limite = Date.now() + 30_000;
  while (vivant(pid) && Date.now() < limite) await new Promise((resoudre) => setTimeout(resoudre, 20));
  if (vivant(pid)) process.kill(pid, "SIGKILL");
}

let code = 0;
switch (verbe) {
  case "daemon-reload":
    for (const nom of readdirSync(chargees)) rmSync(join(chargees, nom));
    for (const dossier of ["usr/lib/systemd/system", "etc/systemd/system"]) {
      if (!existsSync(join(racine, dossier))) continue;
      for (const nom of readdirSync(join(racine, dossier), { withFileTypes: true })) if (nom.isFile()) copyFileSync(join(racine, dossier, nom.name), join(chargees, nom.name));
    }
    break;
  case "enable":
    for (const unite of unites) {
      writeFileSync(join(activees, unite), "");
      if (options.includes("--now")) code ||= demarrer(unite);
    }
    break;
  case "is-enabled":
    code = unites.every((unite) => existsSync(join(activees, unite))) ? 0 : 1;
    if (!silencieux) console.log(code === 0 ? "enabled" : "disabled");
    break;
  case "is-active":
    code = unites.every((unite) => etatDe(unite).actif === "active") ? 0 : 3;
    if (!silencieux) console.log(code === 0 ? "active" : "inactive");
    break;
  case "start":
    for (const unite of unites) code ||= demarrer(unite);
    break;
  case "stop":
    for (const unite of unites) await arreter(unite);
    break;
  case "restart":
    for (const unite of unites) {
      await arreter(unite);
      code ||= demarrer(unite);
    }
    break;
  case "show": {
    const [unite = ""] = unites;
    const { actif, pid } = etatDe(unite);
    console.log([`MainPID=${pid}`, `NRestarts=0`, `ActiveState=${actif}`].join("\n"));
    break;
  }
  default:
    console.error(`faux systemctl : « ${verbe} » n'est pas joué`);
    code = 1;
}
process.exit(code);
