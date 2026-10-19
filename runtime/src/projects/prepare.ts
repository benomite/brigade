// What the station does with a project the app asks for, before writing its
// line: check that its GitHub Apps are authorized on the repo, clone it in its
// place, and record in the project's log the decisions the chef made in the
// walkthrough. None of this asks the chef for a command.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { decisionsPosees, poserDecision } from "../decisions.ts";
import { configIdentites, ouvrirIdentites, ROLES } from "../identites.ts";
import { ouvrirJournal } from "../journal.ts";
import type { RequestedProject } from "./request.ts";

// What the station declares about its engine: `claude` codes and reasons
// (`declarer-stations.ts`).
export const PROVIDES = "code+raisonnement";

// The GitHub page where the chef installs an App on their repos, in one click.
export const installationPage = (slug: string) => `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;

// What GitHub says about the station's Apps on this repo.
export type Authorization = { authorized: true } | { authorized: false; pages: string[] } | { outage: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Without Apps (`BRIGADE_GITHUB_APPS_DIR`), the station acts under the account
// of its `gh`, the chef's: nothing to authorize. With them, each role must have
// its App installed on the repo — otherwise, the page to install it.
export async function checkAuthorization(env: Record<string, string | undefined>, repo: string): Promise<Authorization> {
  let apps;
  try {
    apps = configIdentites(env);
  } catch (error) {
    return { outage: message(error) };
  }
  if (apps === null) return { authorized: true };
  const identities = ouvrirIdentites({ ...apps, depot: repo, avertir: () => {} });
  try {
    const pages: string[] = [];
    for (const role of ROLES) {
      try {
        await identities.jeton(role).frais();
      } catch (error) {
        if (!/n'est pas installée sur/.test(message(error))) return { outage: message(error) };
        pages.push(installationPage((await identities.login(role)).replace(/\[bot\]$/, "")));
      }
    }
    return pages.length === 0 ? { authorized: true } : { authorized: false, pages: [...new Set(pages)] };
  } catch (error) {
    return { outage: message(error) };
  } finally {
    identities.fermer();
  }
}

// Clones the repo in its place, through the machine's `gh` — which
// authenticates on its own. An interrupted clone leaves nothing in place: it is
// made on the side.
export function cloneRepo(options: { gh: string; depot: string; clone: string; timeoutMs?: number }): Promise<void> {
  const { gh, depot, clone } = options;
  if (existsSync(join(clone, ".git"))) return Promise.resolve();
  const aside = `${clone}.clonage`;
  rmSync(aside, { recursive: true, force: true });
  mkdirSync(dirname(clone), { recursive: true });
  return new Promise((resolve, reject) => {
    execFile(gh, ["repo", "clone", depot, aside, "--", "--quiet"], { timeout: options.timeoutMs ?? 15 * 60_000, env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" } }, (error, _, stderr) => {
      if (error !== null) {
        rmSync(aside, { recursive: true, force: true });
        return reject(new Error(`clone de ${depot} en échec — ${stderr.trim().split("\n").at(-1) || error.message}`));
      }
      try {
        renameSync(aside, clone);
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

// The station name, as a declared station carries it: lowercase letters,
// digits and dashes (`stations-declarees.ts`).
export const machineName = (station: string) => station.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station";

// The decisions the chef made in the walkthrough, as the runtime reads them:
// the declared station — this one —, the calibration of the manager and of the
// reviewer.
export function decisionsFor(project: RequestedProject, station: string): Record<string, string> {
  return {
    BRIGADE_STATIONS: `${machineName(station)}/claude:${project.cooks}:${PROVIDES}`,
    BRIGADE_MANAGER_MODEL: project.manager.modele,
    BRIGADE_MANAGER_EFFORT: project.manager.effort,
    BRIGADE_REVIEWER_MODEL: project.reviewer.modele,
    BRIGADE_REVIEWER_EFFORT: project.reviewer.effort,
  };
}

// Records in the project's log those that are not there yet: a decision the
// chef has since changed is not overwritten by the walkthrough's. Returns the
// names recorded.
export function recordDecisions(stateDir: string, project: string, decisions: Record<string, string>): string[] {
  mkdirSync(stateDir, { recursive: true });
  const log = ouvrirJournal(stateDir);
  try {
    const recorded = decisionsPosees(log.base);
    return Object.entries(decisions).flatMap(([name, value]) => (name in recorded ? [] : poserDecision(log, { projet: project, nom: name, valeur: value, auteur: "chef" }) === null ? [] : [name]));
  } finally {
    log.fermer();
  }
}
