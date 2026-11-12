// « Resume », sur la ligne du disjoncteur de TODO (#2140, épique #2134) : la cuisine retenue par son disjoncteur reprend
// d'un clic, par GitHub — ni `ssh`, ni commande à recopier. Le clic poste un commentaire dont le corps est exactement
// `/resume` sur l'issue ouverte du dépôt qui porte le label `brigade:breaker-open` : la station la publie quand le
// disjoncteur s'ouvre (#2138), et sa veille lit le commentaire et referme le disjoncteur (#2139).
// Ce module compose les demandes, avec les mêmes en-têtes et le même jeton que les autres appels de l'app à GitHub
// (tableau/client.ts) ; ce qui les porte est donné par la plateforme. Il ne parle qu'à GitHub :
// aucune box, aucune station n'est jointe.
import { clientGitHub, refusDe, type AppelGitHub, type Poste } from "../tableau/client.ts";
import { dureeEn } from "../tableau/rail.ts";

// Le label de l'issue que la station ouvre avec le disjoncteur, et le corps exact que sa veille attend.
export const LABEL_DU_DISJONCTEUR = "brigade:breaker-open";
export const CORPS_DE_LA_REPRISE = "/resume";

// Une issue ouverte du dépôt qui porte le label : son numéro, son adresse — nulle quand GitHub ne la donne pas —, et son
// corps, où la station dit pourquoi le disjoncteur s'est ouvert (runtime/src/breaker-issue.ts, `corpsDeLIssue`).
export type IssueDuDisjoncteur = { numero: number; url: string | null; corps?: string | null };
// Ce que le geste demande à GitHub : les issues ouvertes qui portent un label, la plus récente d'abord ; poster un
// commentaire sur l'une, et rendre son adresse. Chacun lève quand GitHub refuse, ou ne répond pas.
export type ClientDuDisjoncteur = {
  issuesOuvertes(depot: string, label: string): Promise<IssueDuDisjoncteur[]>;
  commenter(depot: string, issue: number, corps: string): Promise<{ url: string | null }>;
};

// Ce que le geste rend : la reprise demandée — l'issue commentée et l'adresse du commentaire —, ou pourquoi rien n'est
// parti, en une ligne (`refus`), et ce que GitHub en a dit (`detail`, au survol).
export type RenduDeLaReprise = { demandee: { issue: number; url: string | null } } | { refus: string; detail: string };

const messageDe = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Poste `/resume`, une seule fois, sur l'issue du disjoncteur de ce dépôt — la plus récente, s'il y en a plusieurs.
// Aucune issue ouverte ne porte le label : rien n'est posté, et la ligne le dit.
export async function reprendreLeDisjoncteur(depot: string, client: ClientDuDisjoncteur): Promise<RenduDeLaReprise> {
  let issues: IssueDuDisjoncteur[];
  try {
    issues = await client.issuesOuvertes(depot, LABEL_DU_DISJONCTEUR);
  } catch (erreur) {
    return { refus: "resume not requested: GitHub could not be read", detail: messageDe(erreur) };
  }
  const issue = issues[0];
  if (issue === undefined) return { refus: "resume not requested: no breaker issue is open on GitHub", detail: `no open issue of ${depot} carries the label \`${LABEL_DU_DISJONCTEUR}\`: the station publishes it when the breaker opens` };
  try {
    const { url } = await client.commenter(depot, issue.numero, CORPS_DE_LA_REPRISE);
    return { demandee: { issue: issue.numero, url } };
  } catch (erreur) {
    return { refus: "resume not requested: GitHub did not take the comment", detail: messageDe(erreur) };
  }
}

export type OptionsDuClient = {
  // Le jeton GitHub de l'app ; nul sans lui — GitHub refuse alors le commentaire, et le dit.
  jeton: () => Promise<string | null>;
  poster: Poste;
  // Le `GET` des lectures de l'app (tableau/client.ts).
  appeler: AppelGitHub;
};

const objet = (valeur: unknown): Record<string, unknown> => (typeof valeur === "object" && valeur !== null ? (valeur as Record<string, unknown>) : {});

// Les issues ouvertes du dépôt qui portent ce label, la plus récente d'abord — lues par le `GET` de l'app. Lève quand GitHub
// refuse, ou ne répond pas.
export async function lireLesIssuesDuDisjoncteur(appeler: AppelGitHub, depot: string, label: string): Promise<IssueDuDisjoncteur[]> {
  // GitHub les rend de la plus récente à la plus ancienne ; une PR qui porterait le label n'est pas une issue.
  const reponse = await appeler(`/repos/${depot}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=10`);
  if (reponse.status !== 200) throw refusDe(`the reading of the issues labeled \`${label}\``, reponse);
  if (!Array.isArray(reponse.data)) throw new Error("GitHub's answer is not a list of issues");
  return reponse.data.flatMap((brute): IssueDuDisjoncteur[] => {
    const { number, html_url, pull_request, body } = objet(brute);
    if (typeof number !== "number" || pull_request !== undefined) return [];
    return [{ numero: number, url: typeof html_url === "string" ? html_url : null, corps: typeof body === "string" ? body : null }];
  });
}

// La valeur de la ligne `kitchen` de `status` que le disjoncteur ouvert fait dire (runtime/src/etat.ts, `decrireCuisine`),
// d'après l'issue que la station a ouverte : depuis quand, et pourquoi — le ticket qui a échoué et son code de sortie, tels
// que le corps de l'issue les écrit. Un corps qui ne les dit pas laisse la ligne sans eux, et nomme l'issue.
export function cuisineRetenueParLeDisjoncteur(issue: IssueDuDisjoncteur, lu: string): string {
  const corps = issue.corps ?? "";
  const champ = (nom: string) => new RegExp(`^- \\*\\*${nom}\\*\\*: (.+)$`, "m").exec(corps)?.[1]?.trim();
  const ouvert = champ("Opened at");
  const depuis = ouvert === undefined || Number.isNaN(Date.parse(ouvert)) ? undefined : dureeEn(Date.parse(lu) - Date.parse(ouvert));
  const compte = /(\d+ failures? in a row)/.exec(corps)?.[1];
  const ticket = champ("Failing ticket");
  const code = champ("Exit code");
  const pourquoi = [compte, ticket === undefined ? undefined : `failing ticket ${ticket}`, code === undefined ? undefined : `exit code ${code}`].filter((dit) => dit !== undefined).join(", ");
  return `open · breaker OPEN${depuis === undefined ? "" : ` for ${depuis}`} (${pourquoi === "" ? `see issue #${issue.numero}` : pourquoi})`;
}

export function clientDuDisjoncteurGitHub({ jeton, poster, appeler }: OptionsDuClient): ClientDuDisjoncteur {
  return {
    issuesOuvertes: (depot, label) => lireLesIssuesDuDisjoncteur(appeler, depot, label),
    async commenter(depot, issue, corps) {
      // Les en-têtes et le jeton de la lecture : le même client, porté par un `POST`.
      const envoi = clientGitHub({ jeton, envoyer: (adresse, entetes) => poster(adresse, { ...entetes, "Content-Type": "application/json" }, { body: corps }) });
      const reponse = await envoi(`/repos/${depot}/issues/${issue}/comments`);
      if (reponse.status !== 201) throw refusDe("the comment", reponse);
      const { html_url } = objet(reponse.data);
      return { url: typeof html_url === "string" ? html_url : null };
    },
  };
}
