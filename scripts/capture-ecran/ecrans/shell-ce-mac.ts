// L'espace de « parade », un shell ouvert par « + shell » sur ce Mac et montré à droite : son bandeau
// (« this Mac · chef »), sa note — un shell persistant, dans sa session `tmux` — et ce qu'il affiche.
// Le pendant Mac de `shell-ce-pc` (#1154).
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
// Ce que terminaux.ts rend d'un shell persistant de ce poste.
export const SHELL_MAC: Terminal = {
  id: 2,
  projet: "parade",
  genre: "shell",
  titre: "shell 1",
  note: "persistent shell on this Mac, in /Users/chef/parade — session `brigade-parade-1`: closing the app only detaches from it, closing this shell destroys it",
  arrete: false,
  bandeau: "this Mac · chef",
};

// Les données d'un espace où `shell` est montré, avec ce que son terminal affiche.
export function avecUnShell(shell: Terminal, ecrit: string, poste?: { nom: string; mac: boolean }) {
  const envois = cuisine(RENDUS);
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: { ...demarrage(configuration(PROJETS)), ...(poste === undefined ? {} : { poste }) }, espace: [SECOND, shell] },
    envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), { sur: "surSortie", args: [shell.id, ecrit] }] } },
  };
}

export const ETAPES = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#terminaux > button:nth-child(2)" }];

export const ecran: Ecran = {
  dit: "L'espace de « parade », un shell persistant de ce Mac montré à droite : son bandeau et sa note (#1154)",
  largeur: 1440,
  hauteur: 900,
  etapes: ETAPES,
  donnees: () => avecUnShell(SHELL_MAC, ["chef@macbook parade % git status --short", " M src/rail.ts", "chef@macbook parade % "].join("\r\n")),
};
