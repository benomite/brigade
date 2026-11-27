// L'entrée d'aide de l'app (#3258) : un menu « Help » dont l'entrée ouvre les GitHub Discussions du dépôt — le lieu où
// poser une question, partager et proposer — dans le navigateur du poste. Le menu garde les rôles d'édition d'Electron
// (copier, coller…) : poser un menu à soi remplace celui par défaut.
import type { MenuItemConstructorOptions } from "electron";

export const URL_OF_DISCUSSIONS = "https://github.com/benomite/brigade/discussions";
export const WORDING_OF_THE_HELP = "Ask, share and propose ideas (GitHub Discussions)";

export function menuOfTheApp(open: (url: string) => Promise<unknown>, mac: boolean): MenuItemConstructorOptions[] {
  return [
    ...(mac ? [{ role: "appMenu" } as const] : [{ role: "fileMenu" } as const]),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [{ label: WORDING_OF_THE_HELP, click: () => void open(URL_OF_DISCUSSIONS).catch(() => undefined) }],
    },
  ];
}
