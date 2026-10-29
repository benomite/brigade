// Les décisions du chef, envoyées depuis une app comme commentaires du tableau de la cuisine d'un projet (« Kitchen board »),
// dans la grammaire de docs/tableau-gestes.md : la box les lit à son tick et y répond d'une ligne. Ce module compose le
// commentaire, le poste par l'accès GitHub de l'app (ce que la plateforme donne : `ClientDesGestes`), puis suit le geste :
// `pending` tant que ni la réponse de la box ni le bloc machine ne le disent pris en compte, puis `taken` ou `refused`,
// avec la ligne de la box. Aucun écran ici, et aucune box jointe : ni ssh ni lien direct, rien que GitHub.
import { lireLeTableau, type GesteDuTableau } from "../../../runtime/src/tableau/rendu/bloc.ts";

// Les quatre décisions du chef, plus le choix d'une carte (`choose`, que la grammaire connaît aussi) et « c'est arrivé »
// (`arrived`), qui renvoie en cuisine un ticket de WAITING, ou revenu de WAITING ; et le « yes » ou le « no » à une
// correction ou à un profil proposés de la file (`correction`, `profile`), qui portent le numéro de leur proposition, pas
// un ticket. Et ce qui partait par `ssh` sur la box (#1845) : le commentaire du chef sur l'issue d'une carte (`comment`),
// la demande au second (`ask`, son contexte facultatif), le plafond de cooks (`cooks`, un nombre ou `auto`) et la cuisine
// d'une station, arrêtée ou relancée (`station`) — ces deux-là sans ticket.
export type DecisionDuChef =
  | { geste: "merge" | "set-aside" | "arrived"; ticket: number }
  | { geste: "send-back"; ticket: number; raison?: string }
  | { geste: "answer"; ticket: number; reponse: string }
  | { geste: "choose"; ticket: number; choix: number }
  | { geste: "comment"; ticket: number; commentaire: string }
  | { geste: "ask"; ticket: number; contexte?: string }
  | { geste: "correction" | "profile"; proposition: number; reponse: "yes" | "no" }
  | { geste: "cooks"; plafond: string }
  | { geste: "station"; action: "stop" | "start"; station: string };

export type CommentairePoste = { id: number; url: string | null };

// Ce que la plateforme donne : poster un commentaire sur l'issue du tableau, et lire les gestes que le bloc machine du
// tableau porte (`null` quand le tableau ne se lit pas). Chacun lève quand GitHub ne répond pas ou refuse.
export type ClientDesGestes = {
  poster: (depot: string, tableau: number, corps: string) => Promise<CommentairePoste>;
  gestesDuTableau: (depot: string, tableau: number) => Promise<GesteDuTableau[] | null>;
};

// `lu` : le geste tel que le bloc machine le porte — la demande au second d'un `ask` (`demande`), et ce qu'il en est quand
// la box tient le second (`second`).
export type EtatDuGeste =
  | { etat: "failed"; raison: string }
  | { etat: "pending"; commentaire: CommentairePoste }
  | { etat: "taken"; commentaire: CommentairePoste; reponse: string; lu: GesteDuTableau }
  | { etat: "refused"; commentaire: CommentairePoste; reponse: string; lu: GesteDuTableau };

// Les gestes du bloc machine d'un corps de tableau ; nul quand le bloc ne se lit pas.
export function gestesDuCorps(corps: string): GesteDuTableau[] | null {
  const lu = lireLeTableau(corps);
  return lu.lu ? (lu.tableau.gestes ?? []) : null;
}

// Le commentaire de la décision : sa première ligne est le geste, la raison et la réponse courent jusqu'au bout.
export function corpsDuGeste(d: DecisionDuChef): string {
  if ("proposition" in d) {
    if (!Number.isInteger(d.proposition) || d.proposition < 1) throw new Error(`"${d.proposition}" is not a proposal number.`);
    if (d.reponse !== "yes" && d.reponse !== "no") throw new Error(`"${String(d.reponse)}" is neither “yes” nor “no”.`);
    // Sans `#` : GitHub ferait du numéro d'une proposition le lien d'une issue.
    return `/brigade ${d.geste} ${d.reponse} ${d.proposition}`;
  }
  if (d.geste === "cooks") {
    if (!PLAFOND.test(d.plafond)) throw new Error(`"${d.plafond}" is not a cap: a number of cooks — 0 for no limit — or “auto”.`);
    return `/brigade cooks ${d.plafond}`;
  }
  if (d.geste === "station") {
    if (d.action !== "stop" && d.action !== "start") throw new Error(`"${String(d.action)}" is neither “stop” nor “start”.`);
    if (!STATION.test(d.station)) throw new Error(`"${d.station}" is not a station name.`);
    return `/brigade station ${d.action} ${d.station}`;
  }
  if (!Number.isInteger(d.ticket) || d.ticket < 1) throw new Error(`"${d.ticket}" is not a ticket number.`);
  switch (d.geste) {
    case "merge":
    case "set-aside":
    case "arrived":
      return `/brigade ${d.geste} #${d.ticket}`;
    case "send-back": {
      const raison = (d.raison ?? "").trim();
      return raison === "" ? `/brigade send-back #${d.ticket}` : `/brigade send-back #${d.ticket} ${raison}`;
    }
    case "answer": {
      const reponse = d.reponse.trim();
      if (reponse === "") throw new Error("An answer needs words.");
      return `/brigade answer #${d.ticket} ${reponse}`;
    }
    case "choose":
      if (!Number.isInteger(d.choix) || d.choix < 1) throw new Error(`"${d.choix}" is not a choice number (counted from 1).`);
      return `/brigade choose #${d.ticket} ${d.choix}`;
    case "comment": {
      const commentaire = d.commentaire.trim();
      if (commentaire === "") throw new Error("A comment needs words.");
      return `/brigade comment #${d.ticket} ${commentaire}`;
    }
    case "ask": {
      const contexte = (d.contexte ?? "").trim();
      return contexte === "" ? `/brigade ask #${d.ticket}` : `/brigade ask #${d.ticket} ${contexte}`;
    }
  }
}

// Ce que la grammaire de la box accepte (runtime/src/tableau/gestes-boite/grammaire.ts) : un plafond, et un nom de
// station en un mot.
const PLAFOND = /^(?:0|[1-9][0-9]{0,5}|auto)$/;
const STATION = /^[^\s]+$/;

// La ligne que la box a répondue sous un geste (runtime/src/tableau/gestes/gestes.ts, `direLaReponse`), en clair : sans
// son verdict en gras ni le lien du geste, ses caractères d'échappement retirés.
const enClair = (markdown: string) => markdown.replaceAll("\u2060", "").replace(/\\([\\`*_[\]<>~&])/g, "$1");
// `**Done** — [cooks 4](…): <ce que la commande a dit> — cost: <prix>`, `**Not done** — [merge #12](…): <raison>`.
const REPONSE = /^\*\*[^*]+\*\* — (?:\[(?:[^\]\\]|\\.)*\]\([^)]*\)|[^:—]*?)(?:: (.*?))?(?: — cost: (.*))?$/;
export function ditParLaBox(reponse: string): { dit: string; prix: string } {
  const [, dit = "", prix = ""] = reponse.trim().match(REPONSE) ?? [];
  return { dit: enClair(dit).trim(), prix: enClair(prix).trim() };
}

// Une raison d'échec, prête à suivre « nothing was posted: » : sans son point final, ni la majuscule de son « The ».
export const enSuite = (raison: string) => raison.replace(/[.\s]+$/, "").replace(/^The /, "the ");

function raisonDe(erreur: unknown, depot: string): string {
  const dit = (erreur instanceof Error ? erreur.message : String(erreur)).trim().split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
  return `The gesture could not be posted on the Kitchen board of ${depot}${dit === "" ? "" : `: ${dit}`}.`;
}

export type OptionsDesGestes = { depot: string; tableau: number; client: ClientDesGestes };

// Les gestes d'un tableau. Un geste posté est retenu par son texte : le renvoyer rend le commentaire déjà posté, jamais
// un second ; seul un échec se rejoue. Pour rendre un même geste une seconde fois, il faut un autre objet `Gestes`.
export type Gestes = {
  envoyer: (decision: DecisionDuChef) => Promise<EtatDuGeste>;
  suivre: (commentaire: CommentairePoste) => Promise<EtatDuGeste>;
};

export function gestesDuTableau({ depot, tableau, client }: OptionsDesGestes): Gestes {
  const postes = new Map<string, CommentairePoste>();
  const enCours = new Map<string, Promise<EtatDuGeste>>();

  async function suivre(commentaire: CommentairePoste): Promise<EtatDuGeste> {
    let gestes: GesteDuTableau[] | null;
    try {
      gestes = await client.gestesDuTableau(depot, tableau);
    } catch {
      // Le tableau qui ne se lit pas ne dit pas que le geste est refusé : il reste en attente.
      return { etat: "pending", commentaire };
    }
    const trouve = gestes?.find((g) => g.commentaire === commentaire.id);
    if (trouve === undefined) return { etat: "pending", commentaire };
    return { etat: trouve.etat === "pris" ? "taken" : "refused", commentaire, reponse: trouve.reponse, lu: trouve };
  }

  async function poster(corps: string): Promise<EtatDuGeste> {
    const deja = postes.get(corps);
    if (deja !== undefined) return suivre(deja);
    try {
      const commentaire = await client.poster(depot, tableau, corps);
      postes.set(corps, commentaire);
      return { etat: "pending", commentaire };
    } catch (erreur) {
      return { etat: "failed", raison: raisonDe(erreur, depot) };
    }
  }

  return {
    suivre,
    envoyer(decision) {
      let corps: string;
      try {
        corps = corpsDuGeste(decision);
      } catch (erreur) {
        return Promise.resolve({ etat: "failed", raison: `${(erreur as Error).message.replace(/[.\s]+$/, "")}.` });
      }
      // Deux envois du même geste à la fois n'en postent qu'un.
      const lance = enCours.get(corps);
      if (lance !== undefined) return lance;
      const suite = poster(corps).finally(() => enCours.delete(corps));
      enCours.set(corps, suite);
      return suite;
    },
  };
}

// Comment attendre la box : `essais` relectures du tableau au plus, `dormir` entre deux. La box lit le tableau à chaque
// tick, une fois la minute, et le réécrit dès qu'elle a joué un geste.
export type Attente = { essais: number; dormir: () => Promise<void> };

// Un geste posté, suivi jusqu'à ce que la box l'ait joué ou refusé — ou encore `pending` quand elle ne l'a pas lu à la
// fin de l'attente. Ce qui n'est pas parti est rendu tel quel.
export async function jusquALaBox(gestes: Gestes, envoye: EtatDuGeste, { essais, dormir }: Attente): Promise<EtatDuGeste> {
  let etat = envoye;
  for (let essai = 0; etat.etat === "pending" && essai < essais; essai++) {
    await dormir();
    etat = await gestes.suivre(etat.commentaire);
  }
  return etat;
}
