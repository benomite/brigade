// Un projet sur de vrais dépôts git, sans réseau, pour les réglages que son
// dépôt porte (`reglages-projet/en-vigueur.ts`) : `amont` tient lieu du dépôt
// GitHub où les PR se mergent, et le clone est celui que la station en tire.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { FICHIER, texteDuFichier, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { git, repertoireTemporaire } from "../outils.ts";

export const poser = (repertoire: string, chemin: string, texte: string): void => {
  mkdirSync(dirname(join(repertoire, chemin)), { recursive: true });
  writeFileSync(join(repertoire, chemin), texte);
};

// `parDefaut` : la branche par défaut d'amont, celle que le clone extrait ;
// `autres` : des branches de plus, au même commit. `merger` : une PR mergée
// sur une branche d'amont ; `rapatrier` : ce que la station fait avant chaque
// cook et chaque passage de la pass.
// `clone` : où la station le range, par défaut à côté d'amont.
export function projetSurGit(t: TestContext, contenu: { reglages?: ReglagesProjet | string; claudeMd?: string; parDefaut?: string; autres?: string[]; clone?: string } = {}) {
  const racine = repertoireTemporaire(t);
  const amont = join(racine, "amont");
  const clone = contenu.clone ?? join(racine, "clone");
  mkdirSync(amont);
  git(amont, "init", "-q", `--initial-branch=${contenu.parDefaut ?? "v2"}`);
  poser(amont, "LISEZMOI", "le projet\n");
  if (contenu.claudeMd !== undefined) poser(amont, "CLAUDE.md", contenu.claudeMd);
  if (contenu.reglages !== undefined) poser(amont, FICHIER, typeof contenu.reglages === "string" ? contenu.reglages : texteDuFichier(contenu.reglages));
  git(amont, "add", ".");
  git(amont, "commit", "-q", "-m", "amorce");
  for (const branche of contenu.autres ?? []) git(amont, "branch", branche);
  git(racine, "clone", "-q", amont, clone);
  const merger = (branche: string, texte: string) => {
    git(amont, "checkout", "-q", branche);
    poser(amont, FICHIER, texte);
    git(amont, "add", ".");
    git(amont, "commit", "-q", "-m", "réglages du projet");
  };
  const rapatrier = () => void git(clone, "fetch", "-q", "origin");
  return { amont, clone, merger, rapatrier };
}
