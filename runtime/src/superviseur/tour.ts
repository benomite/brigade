// Un tour du superviseur (#3914) : les gestes que le manager a choisis, joués
// par la porte des six gestes (`gestes.ts`), puis une trace — un seul
// commentaire sur chaque ticket sur lequel le tour a agi, avec ce qu'il a vu et
// ce qu'il a fait. Les gestes ne commentent pas : la trace est le seul
// commentaire du tour sur un ticket (`github.ts`).
//
// Sur une base rouge, les jobs en échec se relancent d'abord, avant tout autre
// geste : un correctif de la CI ne s'ouvre que si la relance reste rouge, et un
// seul par check rouge — à ce tour comme aux suivants, qu'un ticket ouvert de
// même cause fait taire. Le tour n'ouvre jamais de ticket de lui-même : seul le
// geste « correctif » que le manager choisit en ouvre un. Un tour qui n'a agi
// sur aucun ticket n'en a aucun où écrire : sa trace est la ligne du runtime.
import { direDeclenchement, type Declenchement } from "./declenchement.ts";
import { executer, lireGeste, type Geste, type GitHubDuSuperviseur, type Reponse } from "./gestes.ts";

const MARQUE_DU_SUPERVISEUR = "<!-- brigade:superviseur -->";

// Ce que le tour a fait : les tickets qui portent sa trace (aucun s'il n'a agi
// sur aucun), une ligne par geste, et les traces qui n'ont pas pu s'écrire.
export type Bilan = { tickets: number[]; fait: string[]; trace: string | null; echecDeLaTrace?: string };

// Un geste joué par la porte des six (`executer`), et ce que GitHub en a rendu :
// ce que la CI dit après la relance, le numéro du correctif ouvert.
type Joue = Reponse & { apresRelance?: "vert" | "rouge"; correctif?: number };
async function jouer(github: GitHubDuSuperviseur, action: Geste, deposees?: Set<string>): Promise<Joue> {
  const rendu: { apresRelance?: "vert" | "rouge"; correctif?: number } = {};
  const lu: GitHubDuSuperviseur = {
    ...github,
    relancerLesJobs: async () => (rendu.apresRelance = await github.relancerLesJobs()),
    ouvrirCorrectif: async (correctif) => (rendu.correctif = await github.ouvrirCorrectif(correctif)),
  };
  const reponse = await executer(lu, action, deposees);
  return reponse.fait ? { ...reponse, ...rendu } : reponse;
}

// Ce que le geste a fait, en une ligne.
function direGeste(action: Geste, joue: Joue): string {
  if (!joue.fait) return "refus" in joue ? `refused ${action.geste}: ${joue.refus}` : `${action.geste} failed: ${joue.echec}`;
  switch (action.geste) {
    case "relancer-les-jobs":
      return `failed jobs of main rerun: ${joue.apresRelance === "vert" ? "green after the rerun" : "still red after the rerun"}`;
    case "remettre-sur-le-rail":
      return `#${action.ticket} put back on the rail. Note for the next cook: ${action.note.trim()}`;
    case "mettre-en-attente":
      return `#${action.ticket} set aside in WAITING for ${action.tiers.trim()}`;
    case "fermer-un-doublon":
      return `#${action.ticket} closed as a duplicate of #${action.doublonDe}`;
    case "ouvrir-un-correctif":
      return `fix ticket #${joue.correctif} filed: ${action.titre.trim()}`;
    case "poser-une-carte-todo":
      return `TODO card posted on #${action.ticket} (${action.nature} question): ${action.question.trim()}`;
  }
}

// Le ticket sur lequel le geste a agi, ou null.
function ticketDe(action: Geste, joue: Joue): number | null {
  if (!joue.fait) return null;
  if (action.geste === "ouvrir-un-correctif") return joue.correctif ?? null;
  return "ticket" in action ? (action.ticket ?? null) : null;
}

export async function tourDuSuperviseur({ github, declenchement, vu, actions }: { github: GitHubDuSuperviseur; declenchement: Declenchement; vu: string; actions: readonly unknown[] }): Promise<Bilan> {
  const fait: string[] = [];
  const deposees = new Set<string>();
  const tickets = new Set<number>();
  const fautif = declenchement.cause === "prises-sans-livraison" ? declenchement.ticket : undefined;
  // Les actions lues par la porte : un refus se dit sans rien jouer. Une carte
  // qui ne nomme pas son ticket va sur le ticket fautif, s'il y en a un.
  let restantes: Geste[] = [];
  for (const action of actions) {
    const lue = lireGeste(action);
    if ("refus" in lue) fait.push(`refused: ${lue.refus}`);
    else restantes.push(lue.geste === "poser-une-carte-todo" && lue.ticket === undefined && fautif !== undefined ? { ...lue, ticket: fautif } : lue);
  }
  if (declenchement.cause === "base-rouge") {
    const relance = await jouer(github, { geste: "relancer-les-jobs" });
    fait.push(direGeste({ geste: "relancer-les-jobs" }, relance));
    // La relance est faite : le manager ne la redemande pas. Verte, ou sans
    // verdict, aucun correctif de la CI ne s'ouvre.
    const resteRouge = relance.fait && relance.apresRelance === "rouge";
    restantes = restantes.filter((action) => action.geste !== "relancer-les-jobs" && (resteRouge || action.geste !== "ouvrir-un-correctif" || action.cause.genre !== "ci"));
  }
  for (const action of restantes) {
    const joue = await jouer(github, action, deposees);
    fait.push(direGeste(action, joue));
    const ticket = ticketDe(action, joue);
    if (ticket !== null) tickets.add(ticket);
  }
  if (tickets.size === 0 && fautif !== undefined) tickets.add(fautif);
  if (tickets.size === 0) return { tickets: [], fait, trace: null };
  const trace = [MARQUE_DU_SUPERVISEUR, `**Supervisor run** — ${direDeclenchement(declenchement)}.`, "", "**What it saw:**", "", vu.trim(), "", "**What it did:**", "", ...(fait.length === 0 ? ["- nothing: no gesture was needed"] : fait.map((ligne) => `- ${ligne}`))].join("\n");
  const echecs: string[] = [];
  for (const ticket of tickets) {
    try {
      await github.commenter(ticket, trace);
    } catch (erreur) {
      echecs.push(`#${ticket}: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return { tickets: [...tickets], fait, trace, ...(echecs.length === 0 ? {} : { echecDeLaTrace: echecs.join("; ") }) };
}
