// Le GitHub du superviseur (#3914) : ses six gestes, et les lectures du
// dossier du manager, sur le client du tour. Rien qui ne soit l'un des six
// gestes ne s'écrit ici.
import { RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { corpsDeLAttente, poserLAttente } from "../attente-github/attente-github.ts";
import { LABEL_WAITING } from "../github-etat/etats.ts";
import type { Check } from "../events/pass.ts";
import { jobDuCheck, LABEL, MIS_DE_COTE, type GitHub } from "../github.ts";
import { poserCarte, type Carte } from "../github-seul/carte-todo/carte-todo.ts";
import type { EtapeEnEchec } from "./dossier.ts";
import type { GitHubDuSuperviseur } from "./gestes.ts";
import { sortieDErreur } from "./journal-du-job.ts";
import { estInformatif } from "./declenchement.ts";

// Ce que le superviseur demande au client du tour, et rien de plus.
export type ClientDuSuperviseur = Pick<GitHub, "issue" | "commenter" | "labelliser" | "delabelliser" | "creerIssue" | "fermerIssue" | "relancerLesEchecs" | "etatDuRun"> &
  Partial<Pick<GitHub, "etapesEnEchec" | "journalDuCheck">> & {
    commentaires(numero: number): Promise<{ body: string; association: string; createdAt: string }[]>;
    // Les issues modifiées depuis `instant`, ouvertes ou fermées, avec leur corps.
    issuesDepuis(instant: string): Promise<{ number: number; state?: string; body?: string | null }[]>;
    checksDeLaBase(): Promise<(Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>)[]>;
  };

// La marque cachée de la cause d'un correctif, en tête de son corps.
const MARQUE_DE_CAUSE = /^<!-- brigade:cause (\S+) -->/m;
export const marqueDeCause = (cause: string) => `<!-- brigade:cause ${cause} -->`;
// Le correctif d'un check rouge de la base : ce que la base rouge ne retient pas.
export const estUnCorrectifDeLaCi = (corps: string): boolean => MARQUE_DE_CAUSE.exec(corps)?.[1]?.startsWith("ci:") === true;

// Le label d'un correctif : le manager le juge comme tout ticket neuf.
export const LABEL_DU_CORRECTIF = "fix";

// Combien de temps un correctif se cherche parmi les tickets ouverts.
const MOIS_MS = 30 * 24 * 3_600_000;
// La relance attendue : un sondage toutes les 30 s, 40 min au plus.
export const SONDAGE_DE_LA_RELANCE_MS = 30_000;
export const RELANCE_MAX_MS = 40 * 60_000;
// Les lignes d'historique d'un ticket que le dossier garde.
export const LIGNES_D_HISTORIQUE = 30;

export type OptionsDuGitHub = {
  client: ClientDuSuperviseur;
  // Le dépôt servi, que nomme une mise en WAITING.
  depot: string;
  maintenant?: () => Date;
  // Attend `ms` millisecondes : le sondage de la relance. Absent, un minuteur.
  attendre?: ((ms: number) => Promise<void>) | undefined;
};

const rougesDe = (checks: Awaited<ReturnType<ClientDuSuperviseur["checksDeLaBase"]>>) => checks.filter((check) => check.outcome === "red" && !estInformatif(check));
const runDe = (check: { name?: string; url?: string | null }) => jobDuCheck({ name: check.name ?? "", outcome: "red", conclusion: "failure", url: check.url ?? null })?.run;

export function githubDuSuperviseur({ client, depot, maintenant = () => new Date(), attendre = (ms) => new Promise((fin) => setTimeout(fin, ms)) }: OptionsDuGitHub): GitHubDuSuperviseur {
  return {
    // Les jobs en échec de chaque run rouge relancés, puis attendus jusqu'à leur
    // fin : la base relue dit le verdict. Sans run à relancer — un check qui
    // n'est pas un job de GitHub Actions —, elle reste rouge.
    async relancerLesJobs() {
      const runs = [...new Set(rougesDe(await client.checksDeLaBase()).map(runDe).filter((run): run is number => run !== undefined))];
      if (runs.length === 0) return "rouge";
      // La tentative que chaque run avait : sa relance en fait une de plus. Un
      // run qui tourne encore ne se relance pas — GitHub le refuserait — : sa
      // fin est le verdict.
      const avant = new Map<number, number>();
      for (const run of runs) {
        const { tentative, termine } = await client.etatDuRun(run);
        if (termine) await client.relancerLesEchecs(run);
        avant.set(run, termine ? tentative : tentative - 1);
      }
      const fin = maintenant().getTime() + RELANCE_MAX_MS;
      let restants = runs;
      while (restants.length > 0 && maintenant().getTime() < fin) {
        await attendre(SONDAGE_DE_LA_RELANCE_MS);
        const etats = await Promise.all(restants.map(async (run) => ({ run, ...(await client.etatDuRun(run)) })));
        restants = etats.filter(({ run, termine, tentative }) => tentative <= (avant.get(run) ?? 0) || !termine).map(({ run }) => run);
      }
      return rougesDe(await client.checksDeLaBase()).length === 0 ? "vert" : "rouge";
    },
    async remettreSurLeRail(ticket, note) {
      const issue = await client.issue(ticket);
      if (issue === null) throw new Error(`#${ticket} does not exist`);
      await client.commenter(ticket, `<!-- brigade:superviseur-remis -->\nPut back on the rail by the supervisor.\n\n**Note for the next cook:** ${note}`);
      if (!issue.labels.includes(LABEL)) await client.labelliser(ticket, [LABEL]);
      for (const label of [...MIS_DE_COTE, LABEL_WAITING]) if (issue.labels.includes(label)) await client.delabelliser(ticket, label);
    },
    async mettreEnAttente(ticket, tiers) {
      const followUp = new Date(maintenant().getTime() + RELANCE_PAR_DEFAUT_MS).toISOString();
      await poserLAttente(client, ticket, corpsDeLAttente({ what: `what ${tiers} must give or do, named in the supervisor's comment`, who: tiers, followUp }), `#${ticket} of ${depot}`, "the next supervisor run decides again");
    },
    async fermer(ticket, doublonDe) {
      await client.commenter(ticket, `Closed by the supervisor as a duplicate of #${doublonDe}.`);
      await client.fermerIssue(ticket);
    },
    async ticketsOuverts() {
      const lues = await client.issuesDepuis(new Date(maintenant().getTime() - MOIS_MS).toISOString());
      return lues.flatMap(({ number, state, body }) => {
        const cause = state === "open" ? MARQUE_DE_CAUSE.exec(body ?? "")?.[1] : undefined;
        return cause === undefined ? [] : [{ numero: number, cause }];
      });
    },
    async ouvrirCorrectif({ titre, corps, cause }) {
      return client.creerIssue({ titre, corps: `${marqueDeCause(cause)}\n${corps}`, labels: [LABEL_DU_CORRECTIF] });
    },
    async poserCarte({ nature, question, ticket }) {
      if (ticket === undefined) throw new Error("a TODO card goes on a ticket, and none was named");
      const carte: Carte = { sorte: "product-question", texte: `The kitchen has a ${nature === "produit" ? "product" : "design"} question on #${ticket}:\n\n> ${question.split("\n").join("\n> ")}\n\nAnswer on this issue, and the kitchen goes on with your answer.` };
      await poserCarte(ticket, carte, { ...client, commentaires: async (numero) => (await client.commentaires(numero)).map((commentaire) => ({ ...commentaire, author: "" })) });
    },
    commenter: (ticket, texte) => client.commenter(ticket, texte),
  };
}

// L'étape en échec du premier check rouge de la base, et la fin utile de son
// journal (`journal-du-job.ts`). Nulle quand rien n'y est rouge.
export async function etapeEnEchec(client: ClientDuSuperviseur): Promise<EtapeEnEchec | null> {
  const [rouge] = rougesDe(await client.checksDeLaBase());
  if (rouge === undefined) return null;
  const nom = rouge.name ?? "unnamed check";
  const etapes = (await client.etapesEnEchec?.({ name: nom, url: rouge.url ?? null })) ?? [];
  const journal = (await client.journalDuCheck?.({ name: nom, outcome: "red", conclusion: "failure", url: rouge.url ?? null })) ?? null;
  return { etape: `${nom}${etapes.length === 0 ? "" : ` › ${etapes.join(", ")}`}`, lignes: journal === null ? ["(the log of this job could not be read)"] : sortieDErreur(journal).split("\n") };
}

// L'historique d'un ticket : ses commentaires, du plus ancien au plus récent,
// chacun par sa date et sa première ligne lisible.
export async function historique(client: ClientDuSuperviseur, ticket: number, lignes = LIGNES_D_HISTORIQUE): Promise<string[]> {
  const commentaires = await client.commentaires(ticket);
  return commentaires.slice(-lignes).map(({ body, createdAt }) => `${createdAt} ${body.split("\n").find((ligne) => ligne.trim() !== "" && !ligne.startsWith("<!--"))?.trim() ?? body.split("\n")[0]}`);
}
