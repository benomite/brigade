// L'entrée d'aide de l'app (#3258) : un menu « Help » dont l'entrée ouvre les GitHub Discussions du dépôt — le lieu où
// poser une question, partager et proposer — dans le navigateur du poste. Le menu garde les rôles d'édition d'Electron
// (copier, coller…) : poser un menu à soi remplace celui par défaut.
import type { MenuItemConstructorOptions } from "electron";

export const URL_DES_DISCUSSIONS = "https://github.com/benomite/brigade/discussions";
export const LIBELLE_DE_L_AIDE = "Ask, share and propose ideas (GitHub Discussions)";

export function menuDeLApp(ouvrir: (url: string) => Promise<unknown>, mac: boolean): MenuItemConstructorOptions[] {
  return [
    ...(mac ? [{ role: "appMenu" } as const] : [{ role: "fileMenu" } as const]),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [{ label: LIBELLE_DE_L_AIDE, click: () => void ouvrir(URL_DES_DISCUSSIONS).catch(() => undefined) }],
    },
  ];
}
