// La livraison qui a rendu la base rouge, nommée sur son ticket (#3817, épique
// #3812). Le ticket dont la livraison a cassé la base n'en disait rien. Quand la base est rouge,
// ce module retrouve le commit où ses checks rouges ont échoué la
// première fois, la PR mergée qui l'a posé, et le ticket de cette PR ; il y
// poste un commentaire qui nomme la PR, le commit de merge, chaque check rouge
// et le lien de son run. Sans ticket lié, le commentaire va sur la PR.
//
// Un seul commentaire par rouge, quelles que soient les stations et leurs
// redémarrages : il porte la marque cachée du commit de merge, relue sur
// GitHub avant d'écrire. Rien n'est tenu hors de GitHub qu'un cache par
// station. Une lecture ou une écriture qui échoue est dite, une fois, et le
// tour suivant réessaie : elle n'arrête jamais la cuisine.
//
// L'appel vient du tour (`brigade-github.ts`), sur les checks de la base qu'il
// lit ; le client vient de `github-de-la-livraison.ts`.
import { estInformatif, type CheckDeLaBase } from "../checks-de-la-branche.ts";

// Le commit rouge et les checks rouges qu'il porte.
export type PremierRouge = { sha: string; rouges: CheckDeLaBase[] };

// Ce que le module lit et écrit de GitHub.
export type GitHubDeLaLivraison = {
  // Le commit de la base où ces checks rouges ont échoué la première fois — un
  // sha seul, et les checks sont ceux qu'on lui donne —, ou null s'il ne se lit pas.
  commitDuPremierRouge(rouges: CheckDeLaBase[]): Promise<string | PremierRouge | null>;
  // La PR mergée dont ce commit est le merge, ou null s'il n'en est aucun.
  prDuCommit(sha: string): Promise<number | null>;
  // Les tickets que la PR livre : sa branche de cook, ceux qu'elle ferme.
  ticketsLiesALaPR(pr: number): Promise<number[]>;
  // Les corps des commentaires de confiance d'une issue ou d'une PR.
  commentairesDe(numero: number): Promise<string[]>;
  commenter(numero: number, corps: string): Promise<void>;
};

export type OptionsDuNommage = {
  github: GitHubDeLaLivraison;
  base: string;
  avertir?: (texte: string) => void;
};

const MARQUE = "brigade:livraison-rouge";
export const marqueDeLivraisonRouge = (sha: string) => `<!-- ${MARQUE} sha=${sha} -->`;

const court = (sha: string) => sha.slice(0, 7);
const nomDe = (check: CheckDeLaBase) => check.name ?? "unnamed check";
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function commentaireDeLivraisonRouge({ base, sha, pr, rouges, surLaPR }: { base: string; sha: string; pr: number; rouges: CheckDeLaBase[]; surLaPR: boolean }): string {
  return [
    marqueDeLivraisonRouge(sha),
    `\`${base}\` turned red after the merge of PR #${pr} (merge commit \`${sha}\`).`,
    "",
    rouges.length === 1 ? "Failing check:" : "Failing checks:",
    ...rouges.map((check) => `- \`${nomDe(check)}\`: ${check.url ?? "(GitHub gives no link for this check run)"}`),
    ...(surLaPR ? ["", "No ticket links to this PR, so the delivery is named here."] : []),
  ].join("\n");
}

// Les checks de la base, tels que le tour les lit : rouges, la livraison
// qui les a cassés est nommée. Ne rejette jamais.
export function nommeLaLivraison({ github, base, avertir = (texte) => console.error(texte) }: OptionsDuNommage) {
  // Cache, pas état : les rouges déjà nommés, ou que rien ne livre.
  const faits = new Set<string>();
  // Ce qui a déjà été dit : un échec qui se répète à chaque tour ne l'est qu'une fois.
  const dits = new Set<string>();
  const dire = (texte: string) => {
    if (dits.has(texte)) return;
    dits.add(texte);
    avertir(texte);
  };
  // Deux appels à la fois se suivent : le second lit ce que le premier a écrit.
  let file: Promise<void> = Promise.resolve();

  const nommer = async (checks: CheckDeLaBase[]): Promise<void> => {
    const rouges = checks.filter((check) => check.outcome === "red" && !estInformatif(check));
    if (rouges.length === 0) return;
    const signature = rouges
      .map((check) => `${nomDe(check)} ${check.url ?? ""}`)
      .sort()
      .join("\n");
    if (faits.has(signature)) return;
    try {
      const lu = await github.commitDuPremierRouge(rouges);
      if (lu === null) throw new Error("the commit where its checks first failed is unreadable");
      const { sha, rouges: aNommer } = typeof lu === "string" ? { sha: lu, rouges } : lu;
      const pr = await github.prDuCommit(sha);
      if (pr === null) {
        dire(`brigade : ${base} turned red on ${court(sha)}, which no merged PR put there — no delivery to name`);
        faits.add(signature);
        return;
      }
      const tickets = await github.ticketsLiesALaPR(pr);
      const surLaPR = tickets.length === 0;
      const corps = commentaireDeLivraisonRouge({ base, sha, pr, rouges: aNommer, surLaPR });
      for (const cible of surLaPR ? [pr] : tickets) {
        if ((await github.commentairesDe(cible)).some((commentaire) => commentaire.includes(marqueDeLivraisonRouge(sha)))) continue;
        await github.commenter(cible, corps);
      }
      faits.add(signature);
    } catch (erreur) {
      dire(`brigade : ${base} is red, but the delivery that turned it red could not be named on its ticket — ${message(erreur)}; retried next turn`);
    }
  };

  return (checks: CheckDeLaBase[]): Promise<void> => {
    const suite = file.then(() => nommer(checks));
    file = suite;
    return suite;
  };
}
