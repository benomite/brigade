// Le ticket de temps perdu resté `served-elsewhere` (#2786, épique #2782) : un
// ticket « Tickets lose too much time » (`temps-max/correction.ts`) ouvert sur
// un projet servi mesure la cuisine, pas le code du projet. Sa cause est dans
// la station : ses cooks ratent trois fois, et il sort de la cuisine
// (espace#824, mirrorscreen#1132) pour un humain qui n'a rien à y décider.
//
// La station le traite seule, à chaque tour : quand la perte est réelle, elle
// le redépose une fois sur le dépôt de brigade, avec un lien vers l'original ;
// puis elle dit pourquoi sur l'original, et le ferme. Une perte qui n'est plus
// au-dessus du seuil ferme l'original sans rien redéposer. Tout autre ticket
// `served-elsewhere` reste tel quel.
//
// Idempotent : le redépôt porte la marque cachée de l'original, cherchée sur
// le dépôt de brigade avant d'en créer un ; le commentaire porte la sienne,
// cherchée avant d'en poster un. Une fermeture ratée se rejoue au tour suivant
// sans rien doubler.
//
// L'appel vient du tour de la station (`brigade-github.ts`), sur les tickets
// qu'il vient de lire.
import { DE_CONFIANCE } from "./alimenter.ts";
import { ECHECS_ATTEINTS, estMisDeCote, HORS_CUISINE, ouvrirGitHub, type IssueOuverte } from "./github.ts";
import { MARQUE_CORRECTION } from "./temps-max/correction.ts";

export const DEPOT_DE_BRIGADE = "benomite/brigade";
export const TITRE_DU_TEMPS_PERDU = "Tickets lose too much time";
export const MARQUE_DU_COMMENTAIRE = "<!-- brigade:refile-served-elsewhere -->";
// La marque du redépôt : l'original qu'il porte, `<owner>/<repo>#<n>`.
export const marqueDuRedepot = (depot: string, numero: number) => `<!-- brigade:refile ${depot}#${numero} -->`;
// Jusqu'où, sur le dépôt de brigade, on cherche un redépôt déjà fait.
export const FENETRE_MS = 30 * 24 * 60 * 60 * 1000;

// Ce que la règle lit et écrit du projet servi.
export type GitHubDuProjet = {
  corpsDuTicket(numero: number): Promise<string>;
  commentaires(numero: number): Promise<{ body: string }[]>;
  commenter(numero: number, corps: string): Promise<void>;
  fermerIssue(numero: number): Promise<void>;
};

// Ce que la règle lit et écrit du dépôt de brigade.
export type GitHubDeBrigade = {
  issuesDepuis(instant: string): Promise<Pick<IssueOuverte, "number" | "body" | "association">[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
};

export type TicketHorsCuisine = { number: number; title: string; labels: readonly string[] };

export type DecisionDuRedepot = { ticket: number; issue: "redepose"; redepot: number } | { ticket: number; issue: "ferme" };

export type OptionsDuRedepot = {
  // `<owner>/<repo>` du projet servi.
  depot: string;
  github: GitHubDuProjet;
  // Le client du dépôt de brigade, ouvert au premier redépôt. Par défaut, le
  // `gh` de la machine.
  brigade?: () => GitHubDeBrigade;
  // La perte est-elle réelle, lue à chaque ticket ? Par défaut, oui.
  perteReelle?: () => boolean;
  maintenant?: () => Date;
};

// Un ticket de temps perdu : son titre, et la marque que son corps porte.
export const estDuTempsPerdu = (ticket: TicketHorsCuisine) => estMisDeCote(ticket.labels) && ticket.title.startsWith(TITRE_DU_TEMPS_PERDU);

const lien = (depot: string, numero: number) => `https://github.com/${depot}/issues/${numero}`;

// Le corps du redépôt : le lien vers l'original, puis son corps — sans la
// marque du ticket de correction, que la correction du temps de brigade
// prendrait pour la sienne.
export function corpsDuRedepot(depot: string, numero: number, corps: string): string {
  return [
    marqueDuRedepot(depot, numero),
    "",
    `Re-filed from ${depot}#${numero} (${lien(depot, numero)}): that ticket was taken off the kitchen (\`${ECHECS_ATTEINTS}\`, or \`${HORS_CUISINE}\` on an older ticket) after its cooks failed, because the time it measures is lost in the station, not in ${depot}'s code. Its cause is corrected here.`,
    "",
    "---",
    "",
    corps.replaceAll(MARQUE_CORRECTION, "").trim(),
  ].join("\n");
}

// La règle, liée au projet servi. Rend ce qu'elle a fait de chaque ticket
// qu'elle a pris en charge.
export function redeposerHorsCuisine(options: OptionsDuRedepot) {
  const { depot, github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const perteReelle = options.perteReelle ?? (() => true);
  let brigade: GitHubDeBrigade | null = null;
  const deBrigade = () => (brigade ??= (options.brigade ?? (() => ouvrirGitHub({ depot: DEPOT_DE_BRIGADE })))());

  // Le redépôt déjà fait de cet original, ou celui qu'on crée.
  const redeposer = async (ticket: TicketHorsCuisine, corps: string): Promise<number> => {
    const client = deBrigade();
    const marque = marqueDuRedepot(depot, ticket.number);
    const debut = new Date(maintenant().getTime() - FENETRE_MS);
    debut.setUTCHours(0, 0, 0, 0);
    const deja = (await client.issuesDepuis(debut.toISOString())).filter((issue) => DE_CONFIANCE.includes(issue.association) && issue.body.includes(marque)).map((issue) => issue.number);
    if (deja.length > 0) return Math.min(...deja);
    return client.creerIssue({ titre: `${ticket.title} (${depot}#${ticket.number})`, corps: corpsDuRedepot(depot, ticket.number, corps), labels: [] });
  };

  return async (tickets: readonly TicketHorsCuisine[]): Promise<DecisionDuRedepot[]> => {
    // Sur le dépôt de brigade, le ticket est déjà là où sa cause se corrige.
    if (depot === DEPOT_DE_BRIGADE) return [];
    const decisions: DecisionDuRedepot[] = [];
    for (const ticket of tickets.filter(estDuTempsPerdu)) {
      const corps = await github.corpsDuTicket(ticket.number);
      if (!corps.includes(MARQUE_CORRECTION)) continue;
      const redepot = perteReelle() ? await redeposer(ticket, corps) : null;
      const pourquoi =
        redepot === null
          ? `This ticket measures the kitchen's lost time, and its cooks failed because that cause is in the station, not in this project's code. The median lost time is no longer over the threshold: closed, with nothing to re-file.`
          : `This ticket measures the kitchen's lost time, and its cooks failed because that cause is in the station, not in this project's code. Re-filed on ${DEPOT_DE_BRIGADE} as ${DEPOT_DE_BRIGADE}#${redepot} (${lien(DEPOT_DE_BRIGADE, redepot)}), where it is corrected; closed here.`;
      if (!(await github.commentaires(ticket.number)).some((commentaire) => commentaire.body.includes(MARQUE_DU_COMMENTAIRE))) await github.commenter(ticket.number, `${MARQUE_DU_COMMENTAIRE}\n${pourquoi}`);
      await github.fermerIssue(ticket.number);
      decisions.push(redepot === null ? { ticket: ticket.number, issue: "ferme" } : { ticket: ticket.number, issue: "redepose", redepot });
    }
    return decisions;
  };
}
