// Le travail qu'un cook a laissé sur l'origine sans l'avoir livré : celui d'une
// station distante disparue en pleine cuisson — le Mac fermé, ou en veille. La
// box ne l'entend plus, son bail tombe et son ticket revient au rail ; la
// branche qu'elle avait poussée, elle, reste. Le cook suivant en repart — sur
// la box ou sur une station distante — au lieu de recommencer de zéro.
//
// Le dernier compte-rendu du ticket le dit (`cook.reported`) :
//
// - `kept` : la box a trouvé, sur l'origine, des commits que la branche porte
//   en plus de la base. C'est le travail conservé ;
// - un cook distant arrêté par la box (`guard:…`) sans `kept` : rien n'était
//   poussé quand elle l'a constaté, mais sa station a pu pousser depuis. Une
//   station d'ici, qui peut relire l'origine avant de partir, le vérifie.
//
// Une livraison (`done`) l'efface, comme tout cook reparti d'ailleurs. Un
// renvoi de la pass passe avant : sa branche est celle de la livraison.
import type { Base } from "./base.ts";
import type { Depot } from "./depot.ts";
import { identifiantsLivres } from "./identifiants.ts";

// `kept` : les commits conservés tels que la box les a vus ; nul, à vérifier.
export type TravailLaisse = { run: string; branch: string; kept: number | null };

export function travailLaisse(base: Base, ticket: number): TravailLaisse | null {
  const rapport = base.lire<{ run: unknown; branch: unknown; ending: unknown; reason: unknown; kept: unknown; remote: unknown }>(
    `SELECT json_extract(r.payload, '$.run') AS run, json_extract(r.payload, '$.branch') AS branch, json_extract(r.payload, '$.ending') AS ending,
            json_extract(r.payload, '$.reason') AS reason, json_extract(r.payload, '$.kept') AS kept,
            (SELECT json_extract(l.payload, '$.remote') FROM events l
             WHERE l.ticket = r.ticket AND l.type = 'cook.launched' AND json_extract(l.payload, '$.run') = json_extract(r.payload, '$.run')
             ORDER BY l.seq DESC LIMIT 1) AS remote
     FROM events r WHERE r.ticket = ? AND r.type = 'cook.reported' ORDER BY r.seq DESC LIMIT 1`,
    ticket,
  )[0];
  if (!rapport || typeof rapport.run !== "string" || typeof rapport.branch !== "string" || rapport.branch === "" || rapport.ending === "done") return null;
  const { run, branch } = rapport;
  if (Number.isSafeInteger(rapport.kept) && (rapport.kept as number) > 0) return { run, branch, kept: rapport.kept as number };
  // `json_extract` rend un booléen JSON en entier.
  if (rapport.remote === 1 && typeof rapport.reason === "string" && rapport.reason.startsWith("guard:")) return { run, branch, kept: null };
  return null;
}

// Ce que la branche porte de travail à reprendre, tel que le clone la connaît
// — à lui de l'avoir rapatriée de l'origine (`recevoir`) : ses commits en plus
// de la base. Zéro si elle n'en porte pas, ou si elle porte les identifiants
// de Claude : ils ne partent pas en pass, d'où qu'ils viennent, et aucun cook
// ne repart d'une branche qui les y enverrait.
export function commitsConserves(depot: Depot, branche: string): number {
  if (!depot.connait(branche)) return 0;
  const commits = depot.commits(branche);
  if (commits === 0) return 0;
  return identifiantsLivres(depot.diff(branche)).length > 0 ? 0 : commits;
}
