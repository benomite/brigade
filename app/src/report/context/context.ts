// Le contexte d'un signalement (épique #1973) : ce que l'app sait déjà d'une panne et qu'un signalement doit porter —
// la version de l'app, celle du runtime, le système. Rien n'est lu dans le dépôt de l'utilisateur, et rien n'est masqué
// ici : le masquage est un module à part, appliqué ensuite. Le journal de la station n'y entre plus (#4678).
//
// Les sources sont celles que l'app a déjà, passées par l'appelant : `appVersion` est `app.getVersion()` (ce que
// mise-a-jour/etat.ts dit à la vue), `runtimeVersion` est `versionDuRuntime()`.
import { arch, release, type as nameOfSystem, version as versionOfSystem } from "node:os";

// La panne, par ce qui la désigne : une station, un ticket, une passe (son identifiant), ou une ligne d'erreur.
export type Reference =
  | { station: string }
  | { ticket: number }
  | { pass: string }
  | { ligne: string };

export type System = { name: string; version: string; release: string; arch: string };
export type Context = { appVersion: string; runtimeVersion: string; system: System };

export type SourcesOfContext = {
  appVersion: string;
  runtimeVersion: () => string;
};

export function systemOfWorkstation(): System {
  let version = "unknown";
  try {
    version = versionOfSystem();
  } catch {
    // le système ne la dit pas : le reste du contexte part quand même
  }
  return { name: nameOfSystem(), version, release: release(), arch: arch() };
}

export async function contextOfReport(sources: SourcesOfContext): Promise<Context> {
  let runtimeVersion = "unknown";
  try {
    runtimeVersion = sources.runtimeVersion();
  } catch {
    // la version du runtime ne se lit pas : le signalement part sans elle
  }
  return { appVersion: sources.appVersion, runtimeVersion, system: systemOfWorkstation() };
}
