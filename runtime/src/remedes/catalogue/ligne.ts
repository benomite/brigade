// Les gestes sur la configuration de la station (`station/configuration.ts`)
// que les remèdes du catalogue partagent : retirer la ligne d'un projet, ou un
// réglage de sa ligne. La configuration se remplace d'un coup, comme le fait
// la station (`projets/tenir.ts`) : elle ne lit jamais une moitié.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEBUT, FIN } from "../../projets/bloc.ts";
import { CONFIGURATION } from "../../station/configuration.ts";
import type { ContexteDuRemede } from "../registre.ts";

// Où est la ligne : dans le bloc que l'app écrit, ou hors de lui, écrite à la main.
export type OuEstLaLigne = "dans-le-bloc" | "hors-du-bloc";

const estUneLigneDe = (nom: string, ligne: string) => {
  const champs = ligne.trim().split(/\s+/);
  return champs[0] === nom && !nom.startsWith("#");
};

// Le texte, ligne après ligne, avec pour chacune si elle est dans le bloc.
function parcourir(texte: string): { ligne: string; dansLeBloc: boolean }[] {
  let dedans = false;
  return texte.split("\n").map((ligne) => {
    if (ligne === DEBUT) {
      dedans = true;
      return { ligne, dansLeBloc: false };
    }
    if (ligne === FIN) {
      dedans = false;
      return { ligne, dansLeBloc: false };
    }
    return { ligne, dansLeBloc: dedans };
  });
}

// Le texte sans la ligne de ce projet, là où elle est — ou null s'il n'y en a pas.
export function sansLaLigne(texte: string, projet: string, ou: OuEstLaLigne): string | null {
  const lignes = parcourir(texte);
  const reste = lignes.filter(({ ligne, dansLeBloc }) => !(estUneLigneDe(projet, ligne) && dansLeBloc === (ou === "dans-le-bloc")));
  if (reste.length === lignes.length) return null;
  return reste.map(({ ligne }) => ligne).join("\n");
}

// Le texte, sans ce réglage sur la ligne de ce projet, où qu'elle soit — ou
// null si cette ligne ne le porte pas.
export function sansLeReglage(texte: string, projet: string, reglage: string): string | null {
  let change = false;
  const neuf = texte.split("\n").map((ligne) => {
    if (!estUneLigneDe(projet, ligne)) return ligne;
    const champs = ligne.trim().split(/\s+/);
    const reste = champs.filter((champ) => !champ.startsWith(`${reglage}=`));
    if (reste.length === champs.length) return ligne;
    change = true;
    return reste.join(" ");
  });
  return change ? neuf.join("\n") : null;
}

// Réécrit la configuration de la station avec ce que `modifier` en fait, puis
// la fait relire. `modifier` rend null : rien à changer, le geste dit pourquoi.
export function reecrireLaConfiguration(contexte: ContexteDuRemede, modifier: (texte: string) => string | null, rienAChanger: string): void {
  const fichier = join(contexte.racine, CONFIGURATION);
  let texte: string;
  try {
    texte = readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") throw new Error(rienAChanger);
    throw erreur;
  }
  const neuf = modifier(texte);
  if (neuf === null) throw new Error(rienAChanger);
  writeFileSync(`${fichier}.remede`, neuf);
  renameSync(`${fichier}.remede`, fichier);
  contexte.relireLaConfiguration();
}
