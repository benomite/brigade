// La cloison éprouvée pour de vrai : des sondes lancées dedans, qui disent ce
// qu'un cook y verrait, et la mesure de ce qu'elle coûte par lancement. Aucun
// cook, aucun quota. Ce que cela prouve vaut pour la machine où c'est lancé.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { Cloison, Lancement } from "./cloison.ts";

// `tient` nul : la sonde n'a rien pu prouver.
export type Sonde = { quoi: string; tient: boolean | null; detail: string };

// Les durées sont des médianes, en millisecondes. `memoireKo` : la mémoire
// résidente des process `bwrap` d'un lancement, tant qu'il vit — nulle là où
// elle ne se lit pas (hors Linux).
export type Cout = { essais: number; nuMs: number; cloisonneMs: number; memoireKo: number | null };

const DELAI_MS = 30_000;
const DEPART = "/tmp";

const mediane = (valeurs: number[]) => [...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)] ?? 0;

export function eprouver(cloison: Cloison, options: { claude: string; env: NodeJS.ProcessEnv; essais: number }): Promise<{ sondes: Sonde[]; cout: Cout | null }> {
  const { env } = options;
  const dedans = (commande: string, ...args: string[]): Lancement => cloison.envelopper({ commande, args }, { cwd: DEPART, depot: null });
  const jouer = ({ commande, args }: Lancement) => {
    const rendu = spawnSync(commande, args, { cwd: DEPART, env, encoding: "utf8", timeout: DELAI_MS });
    return { code: rendu.status, sortie: `${rendu.stdout ?? ""}`.trim(), erreur: `${rendu.stderr ?? ""}${rendu.error?.message ?? ""}`.trim() };
  };
  const sh = (script: string, ...args: string[]) => jouer(dedans("sh", "-c", script, "brigade", ...args));
  const sondes: Sonde[] = [];

  const depart = sh("true");
  sondes.push({
    quoi: "un lancement part dans la cloison",
    tient: depart.code === 0,
    detail: depart.code === 0 ? cloison.bin : depart.erreur.slice(-400) || `code de sortie ${depart.code}`,
  });
  // Sans elle, aucune autre sonde ne dirait rien de vrai.
  if (depart.code !== 0) return Promise.resolve({ sondes, cout: null });

  for (const masque of cloison.masques) {
    const vu = sh('ls -A "$1" | wc -l', masque);
    const entrees = Number(vu.sortie);
    sondes.push({ quoi: `${masque} est masqué`, tient: vu.code === 0 && entrees === 0, detail: vu.code === 0 ? (entrees === 0 ? "vide, vu de la cloison" : `${entrees} entrées y sont visibles`) : vu.erreur.slice(-200) });
  }

  if (existsSync(cloison.identifiants)) {
    const lu = sh('[ -r "$1" ] && ! [ -w "$1" ]', cloison.identifiants);
    sondes.push({ quoi: "les identifiants Max sont en lecture seule", tient: lu.code === 0, detail: lu.code === 0 ? cloison.identifiants : `${cloison.identifiants} est inscriptible ou illisible dans la cloison` });
  } else {
    sondes.push({ quoi: "les identifiants Max sont en lecture seule", tient: null, detail: `${cloison.identifiants} n'existe pas : ce compte n'a pas de connexion Max, ou la garde ailleurs` });
  }

  const process_ = sh('ls /proc | grep -c "^[0-9]"');
  sondes.push({ quoi: "les process des autres sont invisibles", tient: process_.code === 0 && Number(process_.sortie) <= 5, detail: `${process_.sortie || "?"} process visibles dans la cloison` });

  const session = jouer(dedans(options.claude, "auth", "status"));
  let connecte: unknown;
  try {
    connecte = JSON.parse(session.sortie).loggedIn;
  } catch {}
  sondes.push({
    quoi: "`claude` y retrouve la connexion Max",
    tient: connecte === true ? true : connecte === false ? false : null,
    detail: connecte === true ? "connecté" : connecte === false ? "il répond qu'aucune session n'est ouverte" : (session.erreur.slice(-200) || "réponse illisible"),
  });

  return mesurer(cloison, options).then((cout) => ({ sondes, cout }));
}

// Les descendants d'un process, lui compris — sous Linux.
function lignee(pid: number): number[] {
  let enfants: number[] = [];
  try {
    enfants = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").split(" ").filter(Boolean).map(Number);
  } catch {}
  return [pid, ...enfants.flatMap(lignee)];
}

const champ = (pid: number, nom: string): string | null => {
  try {
    return new RegExp(`^${nom}:\\s*(.*)$`, "m").exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1] ?? null;
  } catch {
    return null;
  }
};

async function mesurer(cloison: Cloison, { env, essais }: { env: NodeJS.ProcessEnv; essais: number }): Promise<Cout> {
  const duree = ({ commande, args }: Lancement) => {
    const debut = performance.now();
    spawnSync(commande, args, { cwd: DEPART, env, stdio: "ignore", timeout: DELAI_MS });
    return performance.now() - debut;
  };
  const nu: Lancement = { commande: "true", args: [] };
  const cloisonne = cloison.envelopper(nu, { cwd: DEPART, depot: null });
  const nus: number[] = [];
  const cloisonnes: number[] = [];
  for (let i = 0; i < essais; i++) {
    nus.push(duree(nu));
    cloisonnes.push(duree(cloisonne));
  }

  // Ce qui reste de la cloison pendant que la commande vit : ses `bwrap`.
  let memoireKo: number | null = null;
  if (existsSync("/proc/self/status")) {
    const dort = cloison.envelopper({ commande: "sleep", args: ["60"] }, { cwd: DEPART, depot: null });
    const enfant = spawn(dort.commande, dort.args, { cwd: DEPART, env, stdio: "ignore", detached: true });
    try {
      const limite = performance.now() + DELAI_MS;
      const pids = () => (enfant.pid === undefined ? [] : lignee(enfant.pid));
      while (!pids().some((pid) => champ(pid, "Name") === "sleep") && performance.now() < limite && enfant.exitCode === null) await new Promise((suite) => setTimeout(suite, 20));
      const residents = pids()
        .filter((pid) => champ(pid, "Name") === "bwrap")
        .map((pid) => Number(/^(\d+) kB$/.exec(champ(pid, "VmRSS") ?? "")?.[1]));
      if (residents.length > 0 && residents.every(Number.isFinite)) memoireKo = residents.reduce((somme, ko) => somme + ko, 0);
    } finally {
      try {
        if (enfant.pid !== undefined) process.kill(-enfant.pid, "SIGKILL");
      } catch {}
    }
  }
  return { essais, nuMs: mediane(nus), cloisonneMs: mediane(cloisonnes), memoireKo };
}
