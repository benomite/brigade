// Les tickets ordinaires sur une station distante — le Mac du chef. Une
// station sans cloison ne prend que les tickets qui demandent une de ses
// capacités ; déclarée `distante+ordinaires` (`stations-declarees.ts`), elle
// prend aussi ceux qui ne demandent rien, à une condition : que son poste ait
// le bac à sable de Claude Code. Son cook part alors dedans, avec la
// configuration de `configuration.ts`. Sans bac à sable, elle n'en prend
// aucun, et le dit — avec la raison.
//
// Le bac à sable se constate sur le poste (`detection.ts`), qui le dit à la
// box quand il s'annonce ou réclame (`BacASableDeLaStation`) ; la box en tire
// la configuration de chaque cook — c'est elle qui tient la liste réseau du
// projet — et la remet avec la mission, dans les arguments de `claude`.
//
// Pur : rien n'est lu ni écrit ici.
import { posix } from "node:path";
import type { BacASableDeLaStation } from "../events/remote.ts";
import type { Regle } from "../reseau.ts";
import { argumentsDuBacASable, BacASableInvalide, configurer, type ConfigDeBacASable } from "./configuration.ts";
import type { Detection } from "./detection.ts";

// Ce que la box retient d'un poste dont le bac à sable est là : de quoi
// configurer celui de chacun de ses cooks.
export type Workstation = { version: string; home: string; worktrees: string; caches: string[] };

export type Constat = { disponible: true; poste: Workstation } | { disponible: false; raison: string };

// La station prend les tickets ordinaires, et n'a rien dit de son bac à
// sable : une app d'avant ce réglage, qui ne le sonde pas.
export const NON_DIT = "the station did not say whether its workstation has the Claude Code sandbox — its app does not probe for it yet";

const RAISON_MAX = 300;
const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur.trim() !== "";
const absolu = (valeur: unknown): valeur is string => texte(valeur) && posix.isAbsolute(valeur);

// Le run d'essai d'un poste : la configuration d'un cook ne dépend de son run
// que par le nom de son worktree, un nom sans motif ni séparateur.
const ESSAI = "essai";

// Ce que la box tient du bac à sable d'une station, d'après ce qu'elle en dit.
// Disponible n'est retenu que si la configuration d'un cook s'en écrit : un
// poste qui pose ses worktrees là où un cook ne doit rien lire est
// indisponible, et la raison le dit.
export function constater(dit: unknown, hotes: Regle[]): Constat {
  if (dit === undefined || dit === null) return { disponible: false, raison: NON_DIT };
  const { available, reason, version, home, worktrees, caches } = dit as Record<string, unknown>;
  if (available === false) return { disponible: false, raison: texte(reason) ? reason.trim().slice(0, RAISON_MAX) : "the station says it is unavailable, without saying why" };
  const lisibles = Array.isArray(caches) && caches.every(absolu);
  if (available !== true || !texte(version) || !absolu(home) || !absolu(worktrees) || !lisibles) {
    return { disponible: false, raison: "what the station says about its sandbox cannot be read: it needs its `claude` version, and absolute paths for the account, the worktrees and the caches" };
  }
  const workstation: Workstation = { version: version.trim().slice(0, 40), home, worktrees, caches: caches as string[] };
  try {
    configurerLeCook(workstation, ESSAI, hotes);
  } catch (erreur) {
    if (!(erreur instanceof BacASableInvalide)) throw erreur;
    return { disponible: false, raison: `the sandbox configuration does not hold on this workstation — ${erreur.message}`.slice(0, RAISON_MAX) };
  }
  return { disponible: true, poste: workstation };
}

// La configuration du bac à sable du cook de ce run, sur ce poste.
export function configurerLeCook(workstation: Workstation, run: string, hotes: Regle[]): ConfigDeBacASable {
  return configurer({ worktree: posix.join(workstation.worktrees, run), caches: workstation.caches, hotes, home: workstation.home });
}

// Les arguments d'un cook (`argumentsClaude`), lancé dans le bac à sable : son
// `--permission-mode` cède la place à celui de la configuration et à ses
// réglages. Rien d'autre ne change.
export function dansLeBacASable(args: readonly string[], config: ConfigDeBacASable): string[] {
  const place = args.indexOf("--permission-mode");
  if (place === -1 || place + 1 >= args.length) throw new Error("arguments du cook sans `--permission-mode` : le bac à sable ne s'y pose pas");
  return [...args.slice(0, place), ...argumentsDuBacASable(config), ...args.slice(place + 2)];
}

// La station prend-elle les tickets ordinaires, d'après sa déclaration et ce
// que la box sait de son bac à sable ? Une station d'ici, toujours. Une
// distante qui les prend n'en reçoit que quand la box sature (`station.ts`,
// `boxSaturee`).
export function prendLesOrdinaires(station: { distante?: boolean; ordinaires?: boolean }, bacASable: { available: boolean } | null): boolean {
  return station.distante !== true || (station.ordinaires === true && bacASable?.available === true);
}

// Ce que le poste dit à la box de son bac à sable, d'après sa détection. Les
// lieux sont ceux du poste : son compte, où il pose les worktrees des cooks
// du projet, les caches du projet.
export function pourLaBox(detection: Detection, lieux: { home: string; worktrees: string; caches: string[] }): BacASableDeLaStation {
  return detection.disponible ? { available: true, version: detection.version, ...lieux } : { available: false, reason: detection.raison };
}

// Ce que la station fait des tickets ordinaires, tel que le chef le lit — en
// anglais : ce que dit `station`.
export function direOrdinairesEn(etat: { ordinary: boolean; sandbox: { available: boolean; reason: string | null; version: string | null; at: string } | null }): string {
  if (!etat.ordinary) return "not taken — it only takes the tickets that ask for one of its capabilities";
  if (etat.sandbox === null) return "taken as soon as the station says its workstation has the Claude Code sandbox — it has not said anything yet";
  if (!etat.sandbox.available) return `NONE TAKEN — sandbox unavailable since ${etat.sandbox.at}: ${etat.sandbox.reason ?? "no reason given"}`;
  return `taken when the box is saturated, each cook inside the Claude Code sandbox (claude ${etat.sandbox.version ?? "?"}) — it writes only in its worktree and the project's caches, reaches only the project's hosts`;
}

// Ce que la station fait des tickets ordinaires, tel que le chef le lit.
export function direOrdinaires(etat: { ordinary: boolean; sandbox: { available: boolean; reason: string | null; version: string | null; at: string } | null }): string {
  if (!etat.ordinary) return "non pris — elle ne prend que les tickets qui demandent une de ses capacités";
  if (etat.sandbox === null) return "pris dès que la station dit que son poste a le bac à sable de Claude Code — elle n'en a encore rien dit";
  if (!etat.sandbox.available) return `AUCUN PRIS — bac à sable indisponible depuis le ${etat.sandbox.at} : ${etat.sandbox.reason ?? "sans raison dite"}`;
  return `pris quand la box sature, chaque cook dans le bac à sable de Claude Code (claude ${etat.sandbox.version ?? "?"}) — il n'écrit que dans son worktree et les caches du projet, ne joint que les hôtes du projet`;
}
