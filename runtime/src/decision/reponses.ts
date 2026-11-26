// La décision que le manager pose au chef (#4219, épique #4114) : ses réponses, et la route que chacune donne à l'issue.
// Le jugement `decision` est stocké une fois, dans le refus que le manager écrit sur l'issue (manager.ts, `dire`) : sa
// question, une ligne `- [<geste>] <réponse>` par réponse, la recommandée d'abord, puis `**Recommended:**`. La carte de
// TODO (`chef-todo`, github-seul/carte-todo/carte-todo.ts) en est tirée, par le manager comme par la réparation des
// limbes (limbo/), et l'app la répond d'un clic (app : tableau-gestes/reponse-github.ts). Quatre routes :
// - `wait` : en attente du tiers que la question attend (« Wait for <qui> ») — l'app parque l'issue pour lui ;
// - `split` : découpée en tickets (« Split it … ») — le manager y pose `epic` et la découpe (`reponseQuiDecoupe`) ;
// - `resume` : rendue à la cuisine — le manager la rejuge avec la réponse ;
// - `close` : fermée (« Close it … »).
// Une réponse `split` est un bouton `resume` de la carte : l'app poste la réponse et rend l'issue au manager, qui lit la
// route dans les mots de la réponse. Aucun geste de plus dans l'app, aucun copier-coller dans l'onglet du second.

type Route = "wait" | "split" | "resume" | "close";

// La route qu'une réponse donne à l'issue, lue de ses premiers mots.
function routeDeLaReponse(reponse: string): Route {
  const lue = reponse.trim();
  if (/^wait for\b/i.test(lue)) return "wait";
  if (/^split it\b/i.test(lue)) return "split";
  if (/^close it\b/i.test(lue)) return "close";
  return "resume";
}

// Le geste du bouton de la carte, que l'app joue (GESTES_DU_CHEF) : `split` y est un `resume`, que le manager route.
const gesteDuBouton = (reponse: string): "wait" | "resume" | "close" => {
  const route = routeDeLaReponse(reponse);
  return route === "split" ? "resume" : route;
};

// La ligne d'une réponse sur la carte, dans la forme que l'app lit (tableau/todo-github.ts, `formeDuChef`).
export const ligneDeReponse = (reponse: string): string => `- [${gesteDuBouton(reponse)}] ${reponse.trim()}`;

// Les réponses dans l'ordre de la carte : la recommandée d'abord, puis les autres dans l'ordre du jugement. Une
// recommandée qui n'est pas mot pour mot une des réponses ne change pas l'ordre.
export function ordonnerLesReponses(reponses: readonly string[], recommandee: string | null): string[] {
  const rang = recommandee === null ? -1 : reponses.indexOf(recommandee);
  return rang < 0 ? [...reponses] : [reponses[rang] as string, ...reponses.filter((_, i) => i !== rang)];
}

const MARQUE_DE_REPONSE = /^\s*<!--\s*brigade:reponse\b[^>]*-->\s*/;

// La réponse que le chef a donnée à sa carte et qui demande le découpage : la plus récente réponse de la carte
// (`<!-- brigade:reponse … -->`, app : `commentaireDeReponse`) parmi les commentaires de confiance de l'issue, du plus
// ancien au plus récent, si ses mots sont ceux d'une route `split`. Nulle sinon.
export function reponseQuiDecoupe(commentaires: readonly string[]): string | null {
  const derniere = commentaires.findLast((corps) => MARQUE_DE_REPONSE.test(corps));
  if (derniere === undefined) return null;
  const reponse = derniere.replace(MARQUE_DE_REPONSE, "").trim();
  return routeDeLaReponse(reponse) === "split" ? reponse : null;
}

// La raison qu'un refus du manager dit sur l'issue (manager.ts, `dire`) — `**Manager — not a workable ticket: <nature>.**`,
// puis la raison, première ligne écrite qui suit — quand ce refus n'est pas une décision stockée : ni `a decision issue`,
// ni `a question` (leur carte revient), ni `an epic` (le manager la découpe). Nulle pour tout autre commentaire, ou un
// refus qui ne dit aucune raison.
export function raisonDuRefus(lignes: readonly string[]): string | null {
  const debut = lignes.findIndex((ligne) => ligne.trim() !== "");
  const entete = /^\*\*Manager — not a workable ticket: ([^*]+?)\.\*\*/.exec(lignes[debut]?.trim() ?? "");
  if (entete === null || /^(a decision issue|a question|an epic)$/.test(entete[1] ?? "")) return null;
  const raison = lignes.slice(debut + 1).find((ligne) => ligne.trim() !== "")?.trim() ?? "";
  return raison === "" || raison.startsWith("**") || raison.startsWith("_") ? null : raison;
}

// La recommandée qu'un refus stocke (`**Recommended:** <réponse> — <pourquoi>`), ou nulle.
export function recommandeeDuRefus(lignes: readonly string[]): string | null {
  const ligne = lignes.find((l) => l.trim().startsWith("**Recommended:** "));
  return ligne === undefined ? null : (ligne.trim().slice("**Recommended:** ".length).split(" — ")[0]?.trim() ?? null) || null;
}
