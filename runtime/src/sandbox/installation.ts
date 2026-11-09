// Ce qu'un cook du Mac écrit pour installer ses dépendances : le magasin et les
// caches des gestionnaires de paquets, là où pnpm, npm et yarn les posent sur
// macOS. Son `node_modules` est dans son worktree, déjà ouvert en écriture.
// Ces caches sont ceux du compte, communs à tous les cooks. Sans eux, `pnpm install` meurt
// d'« Operation not permitted » (ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR) et
// le setup du worktree laisse `node_modules` incomplet (mirrorlab#674, #675).
//
// Pur : rien n'est lu ni écrit. Les chemins sortent absolus, sous le compte.
import { posix } from "node:path";

// Le magasin et les caches des gestionnaires de paquets, relatifs à `~`.
export const CACHES_DES_PAQUETS = [
  ".npm",
  ".cache/pnpm",
  ".local/share/pnpm",
  ".local/state/pnpm",
  "Library/pnpm",
  "Library/Caches/pnpm",
  ".yarn",
  ".cache/yarn",
  "Library/Caches/Yarn",
];

// Les lieux du compte où l'installation écrit pour ce cook.
export function droitsDInstallation(home: string): string[] {
  return [...CACHES_DES_PAQUETS.map((relatif) => posix.join(home, relatif))];
}
