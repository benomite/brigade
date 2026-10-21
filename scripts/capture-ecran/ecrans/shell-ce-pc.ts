// L'espace de « parade » sur un PC sous Windows (#1154), un shell ouvert par « + shell » sur ce PC et
// montré à droite : le `bash` de Git for Windows, son bandeau (« this PC · chef ») et sa note — pas de
// session : ni `tmux` ni `screen` sous Windows, le shell finit avec son terminal.
import type { Terminal } from "../../../app/src/terminaux.ts";
import type { Ecran } from "./commun.ts";
import { avecUnShell, ETAPES, SHELL_MAC } from "./shell-ce-mac.ts";

// Ce que terminaux.ts rend d'un shell de ce poste sous Windows (`persistantIci` faux).
const SHELL_PC: Terminal = {
  ...SHELL_MAC,
  note: "shell on this PC, in C:\\Users\\chef\\parade — not persistent: neither tmux nor screen runs on Windows, this shell ends with its terminal",
  bandeau: "this PC · chef",
};

export const ecran: Ecran = {
  dit: "L'espace de « parade » sur un PC sous Windows, le shell de ce PC montré à droite : son bandeau et sa note (#1154)",
  largeur: 1440,
  hauteur: 900,
  etapes: ETAPES,
  donnees: () =>
    avecUnShell(SHELL_PC, ["\x1b[32mchef@PC \x1b[35mMINGW64 \x1b[33m~/parade\x1b[36m (main)\x1b[0m", "$ git status --short", " M src/rail.ts", "", "\x1b[32mchef@PC \x1b[35mMINGW64 \x1b[33m~/parade\x1b[36m (main)\x1b[0m", "$ "].join("\r\n"), { nom: "this PC", mac: false }),
};
