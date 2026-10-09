// Les scripts du projet, joués dans le worktree d'un ticket : son setup, avant
// qu'un cook ou des gates n'y entrent, et ses gates, par lesquelles la pass
// juge une livraison. Le contrat est celui de la V1 :
// `.claude/brigade/worktree-setup.sh <n> <worktree>` n'imprime que des `export`,
// `.claude/brigade/gates.sh <worktree>` a pour verdict son code de sortie. Seul
// module qui lance les scripts du projet.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Gates } from "./evenements/pass.ts";

export const SCRIPT_GATES = ".claude/brigade/gates.sh";
export const SCRIPT_SETUP = ".claude/brigade/worktree-setup.sh";

// Le canal par lequel le setup rend ce qu'il a exporté : ni sa sortie ni sa
// sortie d'erreur, qui sont au projet.
const CANAL = 3;

// Le contrat du setup est `eval "$(worktree-setup.sh N WT)"` : ses exports ne
// se lisent qu'évalués par un shell. Une fois évalués, tout ce que ce shell
// exporte part sur le canal, une variable par enregistrement.
const SETUP = `
set -u
EXPORTS="$("$1" "$2" "$3")" || exit
eval "$EXPORTS" || exit
for nom in $(compgen -e); do printf '%s=%s\\0' "$nom" "\${!nom}"; done >&${CANAL}
`;
const GATES = 'exec "$1" "$2"';
// Ce que le shell du setup exporte de lui-même.
const DU_SHELL = ["_", "OLDPWD", "PWD", "SHLVL"];

const LIGNES_DE_FIN = 40;
// Ce que le verdict garde des gates part au journal, sur l'issue et dans la
// consigne d'un renvoi : borné.
const ECHECS_MAX = 20;
const LIGNE_MAX = 300;
const SORTIE_MAX = 256 * 1024;
// Une mesure déclarée par les gates : `MESURE  <nom>=<nombre>`, seule sur sa
// ligne. Le nombre s'écrit avec un point ou une virgule.
const MESURE = /^MESURE\s+([a-z][a-z0-9_]*)=([0-9]+(?:[.,][0-9]+)?)\s*$/;
const MESURES_MAX = 20;
const FIN_MAX = 4000;
// Ce qu'on laisse à la sortie d'un script pour se fermer une fois qu'il a fini.
const DELAI_DE_FERMETURE_MS = 1000;

export type DemandeScript = {
  worktree: string;
  ticket: number;
  env: NodeJS.ProcessEnv;
  // Le plafond de durée : au-delà, le script est arrêté.
  delaiMs: number;
  // Abandonne le script en cours : le runtime s'arrête.
  signal?: AbortSignal;
};

// `joue` : le projet a un setup. Sans lui, l'environnement est rendu tel quel.
export type Setup =
  | { pret: true; joue: boolean; env: NodeJS.ProcessEnv; sortie: string }
  | { pret: false; depasse: boolean; code: number | null; sortie: string };

export const aDesGates = (worktree: string) => existsSync(join(worktree, SCRIPT_GATES));

type Passage = { code: number | null; depasse: boolean; sortie: string; canal: string };

// Joue un script du projet dans le worktree, sous son plafond. Ne lève pas : un
// script impossible à lancer est un script en échec, et sa sortie dit pourquoi.
function jouer(script: string, args: string[], demande: DemandeScript): Promise<Passage> {
  return new Promise((resoudre) => {
    // Son propre groupe de process : au plafond, le script meurt avec tout ce
    // qu'il a lancé.
    const enfant = spawn("bash", ["-c", script, "brigade", ...args], {
      cwd: demande.worktree,
      env: demande.env,
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      detached: true,
    });
    let sortie = "";
    const noter = (morceau: Buffer) => {
      sortie = (sortie + morceau.toString()).slice(-SORTIE_MAX);
    };
    enfant.stdout?.on("data", noter);
    enfant.stderr?.on("data", noter);
    const canal: Buffer[] = [];
    enfant.stdio[CANAL]?.on("data", (morceau: Buffer) => canal.push(morceau));

    let depasse = false;
    const tuer = () => {
      try {
        if (enfant.pid !== undefined) process.kill(-enfant.pid, "SIGKILL");
      } catch {
        // Déjà mort.
      }
    };
    const plafond = setTimeout(() => {
      depasse = true;
      tuer();
    }, demande.delaiMs);
    demande.signal?.addEventListener("abort", tuer, { once: true });

    let rendu = false;
    const rendre = (code: number | null, erreur?: string) => {
      if (rendu) return;
      rendu = true;
      clearTimeout(plafond);
      demande.signal?.removeEventListener("abort", tuer);
      resoudre({ code, depasse, sortie: erreur ? `${sortie}\n${erreur}` : sortie, canal: Buffer.concat(canal).toString() });
    };
    enfant.on("error", (erreur) => rendre(null, erreur.message));
    // Le verdict est le code de sortie du script, connu dès sa fin — pas la
    // fermeture de sa sortie, qu'un process laissé en arrière-plan tiendrait
    // ouverte jusqu'au plafond. Ce qu'il a laissé meurt avec son groupe ; la
    // sortie se ferme alors, et ce qui restait à lire est lu.
    enfant.on("exit", (code) => {
      clearTimeout(plafond);
      tuer();
      const fini = () => rendre(code);
      enfant.on("close", fini);
      setTimeout(fini, DELAI_DE_FERMETURE_MS);
    });
  });
}

// Rend le worktree exécutable : joue le setup du projet, s'il en a un, et rend
// l'environnement augmenté de ce qu'il exporte — celui dans lequel lancer ce
// qui vient après, cook ou gates. Rejouable : c'est le contrat du script.
export async function jouerSetup(demande: DemandeScript): Promise<Setup> {
  const script = join(demande.worktree, SCRIPT_SETUP);
  if (!existsSync(script)) return { pret: true, joue: false, env: demande.env, sortie: "" };
  const { code, depasse, sortie, canal } = await jouer(SETUP, [script, String(demande.ticket), demande.worktree], demande);
  if (code !== 0 || depasse) return { pret: false, depasse, code, sortie };
  const exports = canal
    .split("\0")
    .filter(Boolean)
    .map((ligne): [string, string] => [ligne.slice(0, ligne.indexOf("=")), ligne.slice(ligne.indexOf("=") + 1)])
    .filter(([nom, valeur]) => !DU_SHELL.includes(nom) && demande.env[nom] !== valeur);
  return { pret: true, joue: true, env: { ...demande.env, ...Object.fromEntries(exports) }, sortie };
}

// Joue les gates et rend ce qu'elles ont dit. Le setup du worktree passe
// d'abord, sous le même plafond, et ce qu'il exporte vaut pour elles. Ne lève
// pas : des gates impossibles à lancer sont des gates rouges, avec leur motif.
export async function jouerGates(demande: DemandeScript): Promise<Gates> {
  const { worktree } = demande;
  const debut = Date.now();
  const setup = await jouerSetup(demande);
  const passage = setup.pret
    ? await jouer(GATES, [join(worktree, SCRIPT_GATES), worktree], { ...demande, env: setup.env, delaiMs: demande.delaiMs - (Date.now() - debut) })
    : { ...setup, sortie: `${setup.sortie}\nFAIL  setup du worktree en échec : ${join(worktree, SCRIPT_SETUP)}` };
  const lignes = [setup.pret ? setup.sortie : "", passage.sortie].join("\n").split("\n").filter((ligne) => ligne.trim() !== "");
  // Déclarée deux fois, une mesure vaut sa dernière valeur.
  const mesures = lignes.flatMap((ligne) => {
    const [, nom, valeur] = MESURE.exec(ligne) ?? [];
    return nom === undefined || valeur === undefined ? [] : [[nom, Number(valeur.replace(",", "."))] as const];
  });
  return {
    outcome: passage.depasse ? "timeout" : passage.code === 0 ? "green" : "red",
    code: passage.code,
    failures: lignes.filter((ligne) => /^FAIL\b/.test(ligne)).slice(0, ECHECS_MAX).map((ligne) => ligne.slice(0, LIGNE_MAX)),
    tail: lignes.slice(-LIGNES_DE_FIN).join("\n").slice(-FIN_MAX),
    ...(mesures.length === 0 ? {} : { measures: Object.fromEntries(mesures.slice(-MESURES_MAX)) }),
  };
}
