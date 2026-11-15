// Le GitHub d'un geste du chef (#3682) : celui d'une commande que l'app lance
// sur un bouton ou pour relire sa vue. Ses appels ne sont jamais retenus par la
// box (`usage: "geste"`, limite-github.ts) et se comptent sous la sorte
// `gesture` de `status` ; ils ne doivent donc pas manger le budget de la
// cuisine. Deux bornes :
//   - les lectures que les gestes se passent (lectures-des-gestes.ts) : la vue
//     relue N fois dans la fenêtre coûte les appels d'une seule lecture ;
//   - un plafond par geste, quand il est dit (`plafond`) : l'appel de trop est
//     refusé sans partir, et le geste le dit au lieu de dépenser plus.
import { ouvrirGitHub, type OptionsGitHub } from "../github.ts";
import { ouvrirLecturesDesGestes } from "./lectures-des-gestes.ts";

// Le plus d'appels GitHub qu'un geste du rail fait (`brigade <projet> rail …`,
// montrer-rail.ts) — le décompte, geste par geste :
//   - `remove` (geste-ticket.ts) : 1 — le label `fire` retiré ;
//   - `choose`, `answer` (reponse-carte.ts) : 5 au plus — l'issue relue pour le
//     label à lever, l'issue que la réponse relance, le commentaire, le label
//     `fire` posé ou l'issue fermée, le label levé ;
//   - `human` (sortie-attente-capacite/sortie.ts) : 4 au plus — l'issue relue,
//     un label posé, un retiré, le commentaire.
// Aucun ne feuillette de liste : son coût ne grandit pas avec le dépôt.
export const PLAFOND_D_UN_GESTE_DU_RAIL = 5;

export type OptionsGitHubDuGeste = Omit<OptionsGitHub, "usage" | "lecturesDesGestes"> & {
  // L'environnement du geste : `BRIGADE_STATE_DIR` y dit où les lectures se gardent.
  env: Record<string, string | undefined>;
  // `true` : une lecture gardée et fraîche se rend sans appel — la relecture de
  // la vue. Par défaut, le geste lit GitHub, et ne fait que rendre périmées les
  // lectures gardées quand il écrit.
  servir?: boolean;
};

export function ouvrirGitHubDuGeste({ env, servir = false, ...options }: OptionsGitHubDuGeste): ReturnType<typeof ouvrirGitHub> {
  const lecturesDesGestes = ouvrirLecturesDesGestes({ repertoireEtat: env.BRIGADE_STATE_DIR, servir, ...(options.maintenant ? { maintenant: options.maintenant } : {}) });
  return ouvrirGitHub({ ...options, usage: "geste", ...(lecturesDesGestes ? { lecturesDesGestes } : {}) });
}
