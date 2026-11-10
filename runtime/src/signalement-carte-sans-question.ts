// Une carte de TODO sans question est un défaut de la brigade (#3134, épique
// #3128) : la carte attend le chef, mais ne lui demande rien. Le défaut n'attend
// pas que le chef le voie : la station le dépose sur le dépôt de la brigade, à
// son tour, sans invite ni bouton.
//
// Les cartes viennent du seul endroit qui construit le TODO lu de GitHub
// (`cartesDesIssues`, attente-github/attente-github.ts) : chacune dit ce qui lui
// manque (`manque`), nul quand elle pose sa question. La guérison (guerison/index.ts)
// passe ici les cartes des tickets de son tour.
//
// Un défaut par carte, jamais deux : son corps porte la marque du projet et du
// numéro, et une issue de la brigade qui la porte — ouverte ou fermée, déposée
// depuis `FENETRE_MS` par le dépôt ou par le compte de cette station (#3012) —
// le couvre déjà. Une carte signalée ou couverte ne se relit plus de tout le
// process. Une lecture qui échoue fait échouer le signalement, qui ne dépose
// rien : il reprend au tour suivant, sans doublon.
import { DE_CONFIANCE } from "./alimenter.ts";
import type { CarteDeTodoGitHub } from "./attente-github/attente-github.ts";
import { LABEL_DU_BUG } from "./guerison/cuisine-inerte.ts";
import { marqueDuProjet, type GitHubDeLaBrigade } from "./routage-temps-perdu.ts";

// Jusqu'où, sur la brigade, on cherche le défaut déjà déposé.
export const FENETRE_MS = 30 * 24 * 60 * 60 * 1000;

// La marque cachée d'un défaut : le projet servi et le numéro de la carte.
export const marqueDuSignalement = (servi: string, numero: number) => `<!-- brigade:carte-sans-question ${servi}#${numero} -->`;

// Ce que le signalement lit et écrit sur la brigade, et rien de plus.
export type GitHubDuSignalement = Pick<GitHubDeLaBrigade, "issuesDepuis" | "creerIssue" | "droits">;

// Un défaut déposé : la carte, et l'issue de la brigade qui le dit.
export type Signale = { carte: number; defaut: number };

// Le défaut d'une carte : son titre et son corps, qui nomment le projet, la carte et ce qui lui manque.
export function defautDeLaCarte(servi: string, { numero, titre, manque }: Pick<CarteDeTodoGitHub, "numero" | "titre" | "manque">): { titre: string; corps: string } {
  return {
    titre: `A TODO card asks no question: ${servi}#${numero}`,
    corps: [
      marqueDuSignalement(servi, numero),
      marqueDuProjet(servi),
      "",
      `The TODO card of **${servi}#${numero}** (“${titre}”) awaits the chef but asks no question: ${manque ?? "no question is written"}.`,
      "",
      "A TODO card asks the chef exactly one question — a product choice, a design choice, or a review only the chef can make. " +
        "Find the runtime code that posed this card without its question, and fix it like a bug: the card must carry its question, or not be posed.",
      "",
      "_Filed by the station, with no action from the chef._",
    ].join("\n"),
  };
}

export function ouvrirSignalement({ servi, brigade, maintenant = () => new Date() }: { servi: string; brigade: GitHubDuSignalement; maintenant?: () => Date }) {
  // Les cartes déjà signalées, ou déjà couvertes sur la brigade : plus rien à lire pour elles.
  const vues = new Set<number>();

  // Dépose un défaut pour chaque carte sans question qui n'en a pas ; rend ceux déposés.
  async function signaler(cartes: readonly CarteDeTodoGitHub[]): Promise<Signale[]> {
    const aSignaler = cartes.filter(({ numero, manque }) => manque !== null && !vues.has(numero));
    if (aSignaler.length === 0) return [];
    // Le compte de cette station : une station sans l'écriture sur la brigade voit ainsi son propre défaut.
    const moi = (await brigade.droits?.())?.login.toLowerCase() ?? null;
    const debut = new Date(maintenant().getTime() - FENETRE_MS).toISOString();
    const deja = (await brigade.issuesDepuis(debut)).filter((issue) => DE_CONFIANCE.includes(issue.association) || (moi !== null && issue.author?.toLowerCase() === moi));
    const signales: Signale[] = [];
    for (const carte of aSignaler) {
      const marque = marqueDuSignalement(servi, carte.numero);
      if (!deja.some(({ body }) => body.includes(marque))) {
        const { titre, corps } = defautDeLaCarte(servi, carte);
        signales.push({ carte: carte.numero, defaut: await brigade.creerIssue({ titre, corps, labels: [LABEL_DU_BUG] }) });
      }
      vues.add(carte.numero);
    }
    return signales;
  }

  return { signaler };
}
