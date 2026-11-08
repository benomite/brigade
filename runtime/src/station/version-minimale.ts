// Une station d'une version trop ancienne pour le correctif du bac à sable
// (#2888 : le cook d'un ticket de mise en place écrit `.claude/brigade/`) le dit
// d'une ligne à son démarrage, avant qu'aucun cook ne parte : sans elle, ses
// Write/Edit y sont refusés et l'échec ne nomme pas la version en cause.
import { comparerVersions, VERSION } from "../mise-a-jour/versions.ts";

// La première version de la station qui porte le correctif de #2888 : à
// remplacer par celle de la release qui le publie.
export const VERSION_MINIMALE = "0.20261108.111043";

// La ligne à dire, ou null : la version atteint le minimum, ou ne se lit pas
// (un clone, le poste de dev : `versionDuRuntime` rend « inconnue ») — on ne
// prétend pas qu'elle est trop ancienne sans l'avoir comparée.
export function avertissementVersion(version: string, minimum: string = VERSION_MINIMALE): string | null {
  if (!VERSION.test(version) || comparerVersions(version, minimum) >= 0) return null;
  return `brigade : la station ${version} est plus ancienne que le correctif du bac à sable (Write/Edit de .claude/brigade/ refusés) — mettre à jour vers la version ${minimum} ou plus récente`;
}

export function avertirSiTropAncienne(version: string, dire: (ligne: string) => void, minimum: string = VERSION_MINIMALE): void {
  const ligne = avertissementVersion(version, minimum);
  if (ligne !== null) dire(ligne);
}
