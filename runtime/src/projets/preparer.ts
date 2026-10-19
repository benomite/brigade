// Ce que la station fait d'un projet que l'app lui demande, avant de lui écrire
// sa ligne : vérifier que ses Apps GitHub sont autorisées sur le dépôt, le
// cloner à sa place, et poser au journal du projet les décisions que le chef a
// prises dans le parcours. Rien de cela ne demande de commande au chef.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { decisionsPosees, poserDecision } from "../decisions.ts";
import { configIdentites, ouvrirIdentites, ROLES } from "../identites.ts";
import { openLog } from "../log.ts";
import type { ProjetDemande } from "./demande.ts";

// Ce que la station déclare de son moteur : `claude` code et raisonne
// (`declarer-stations.ts`).
export const FOURNIT = "code+raisonnement";

// La page GitHub où le chef installe une App sur ses dépôts, en un clic.
export const pageDInstallation = (slug: string) => `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;

// Ce que GitHub dit des Apps de la station sur ce dépôt.
export type Autorisation = { autorisee: true } | { autorisee: false; pages: string[] } | { panne: string };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Sans Apps (`BRIGADE_GITHUB_APPS_DIR`), la station agit sous le compte de son
// `gh`, celui du chef : rien à autoriser. Avec, chaque rôle doit avoir son App
// installée sur le dépôt — sinon, la page où l'installer.
export async function verifierAutorisation(env: Record<string, string | undefined>, depot: string): Promise<Autorisation> {
  let apps;
  try {
    apps = configIdentites(env);
  } catch (erreur) {
    return { panne: message(erreur) };
  }
  if (apps === null) return { autorisee: true };
  const identites = ouvrirIdentites({ ...apps, depot, avertir: () => {} });
  try {
    const pages: string[] = [];
    for (const role of ROLES) {
      try {
        await identites.jeton(role).frais();
      } catch (erreur) {
        if (!/n'est pas installée sur/.test(message(erreur))) return { panne: message(erreur) };
        pages.push(pageDInstallation((await identites.login(role)).replace(/\[bot\]$/, "")));
      }
    }
    return pages.length === 0 ? { autorisee: true } : { autorisee: false, pages: [...new Set(pages)] };
  } catch (erreur) {
    return { panne: message(erreur) };
  } finally {
    identites.fermer();
  }
}

// Clone le dépôt à sa place, par le `gh` de la machine — qui s'authentifie
// seul. Un clone interrompu ne laisse rien à sa place : il se fait à côté.
export function cloner(options: { gh: string; depot: string; clone: string; delaiMs?: number }): Promise<void> {
  const { gh, depot, clone } = options;
  if (existsSync(join(clone, ".git"))) return Promise.resolve();
  const aCote = `${clone}.clonage`;
  rmSync(aCote, { recursive: true, force: true });
  mkdirSync(dirname(clone), { recursive: true });
  return new Promise((resoudre, rejeter) => {
    execFile(gh, ["repo", "clone", depot, aCote, "--", "--quiet"], { timeout: options.delaiMs ?? 15 * 60_000, env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" } }, (erreur, _, erreurs) => {
      if (erreur !== null) {
        rmSync(aCote, { recursive: true, force: true });
        return rejeter(new Error(`clone de ${depot} en échec — ${erreurs.trim().split("\n").at(-1) || erreur.message}`));
      }
      try {
        renameSync(aCote, clone);
        resoudre();
      } catch (erreur) {
        rejeter(erreur instanceof Error ? erreur : new Error(String(erreur)));
      }
    });
  });
}

// Le nom de la station, tel qu'une station déclarée le porte : minuscules,
// chiffres et tirets (`stations-declarees.ts`).
export const machineDe = (station: string) => station.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station";

// Les décisions que le chef a prises dans le parcours, telles que le runtime
// les lit : la station déclarée — celle-ci —, le calibrage du manager et du
// reviewer.
export function decisionsDe(projet: ProjetDemande, station: string): Record<string, string> {
  return {
    BRIGADE_STATIONS: `${machineDe(station)}/claude:${projet.cooks}:${FOURNIT}`,
    BRIGADE_MANAGER_MODEL: projet.manager.modele,
    BRIGADE_MANAGER_EFFORT: projet.manager.effort,
    BRIGADE_REVIEWER_MODEL: projet.reviewer.modele,
    BRIGADE_REVIEWER_EFFORT: projet.reviewer.effort,
  };
}

// Pose au journal du projet celles qui n'y sont pas encore : une décision que
// le chef a changée depuis n'est pas écrasée par celle du parcours. Rend les
// noms posés.
export function poserLesDecisions(repertoireEtat: string, projet: string, decisions: Record<string, string>): string[] {
  mkdirSync(repertoireEtat, { recursive: true });
  const log = openLog(repertoireEtat);
  try {
    const posees = decisionsPosees(log.base);
    return Object.entries(decisions).flatMap(([nom, valeur]) => (nom in posees ? [] : poserDecision(log, { projet, nom, valeur, auteur: "chef" }) === null ? [] : [nom]));
  } finally {
    log.fermer();
  }
}
