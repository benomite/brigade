// Joue un geste de box (grammaire.ts) par la commande locale qui le porte :
// la même fonction que `npm --prefix runtime run <commande>`, jouée dans ce
// process (appel.ts) sur le journal du projet. Sa sortie est la réponse ; son
// code de sortie dit si elle a fait ce qu'on lui demandait.
import { Sortie, type Appel, type Commande } from "../../appel.ts";
import { principal as base } from "../../base-cli.ts";
import { principal as gardeFous } from "../../garde-fous-cli.ts";
import { principal as grant } from "../../grant-cli.ts";
import { principal as station } from "../../montrer-station.ts";
import type { GesteDeBoite } from "./grammaire.ts";

export type ResultatDeBoite = { done: true; dit: string } | { done: false; reason: string };

const COMMANDES: Record<GesteDeBoite["commande"], Commande> = { base, grant, guardrails: gardeFous, station };

// Ce que la commande dit, sur une ligne : le préfixe `brigade : ` qu'elle met
// devant ses réponses est retiré.
const enUneLigne = (lignes: string[]) =>
  lignes
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/^brigade : /, "")
    .trim();

export async function jouerUnGesteDeBoite(geste: GesteDeBoite, repertoireEtat: string): Promise<ResultatDeBoite> {
  const dit: string[] = [];
  const redit: string[] = [];
  const appel: Appel = { args: geste.args, env: { BRIGADE_STATE_DIR: repertoireEtat }, dire: (ligne) => dit.push(ligne), redire: (ligne) => redit.push(ligne) };
  let code = 0;
  try {
    await COMMANDES[geste.commande](appel);
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) {
      return { done: false, reason: `it failed (${erreur instanceof Error ? erreur.message : String(erreur)})` };
    }
    code = erreur.code;
  }
  if (code === 0) return { done: true, dit: enUneLigne(dit) };
  return { done: false, reason: enUneLigne(redit.length > 0 ? redit : dit) || `the command stopped with code ${code}` };
}
