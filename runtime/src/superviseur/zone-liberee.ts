// Une zone tenue par une PR périmée (#4243, épique #4204) : un ticket cuisinable que la porte de prise saute parce qu'une
// PR ouverte tient sa zone, et cette PR n'a plus de vie — ni cuite, ni en pass, et sans activité depuis plus de
// `DELAI_PERIME_MS`, ou ses changements déjà sur la base. Le superviseur lui pose le label `zone-released`, que la porte
// de prise ne compte plus, et le dit en une ligne sur le ticket retenu et dans son rapport. Il ne ferme jamais la PR.
// Celle d'un humain — ni d'un cook, ni du second — a de plus UNE carte pour le chef, qui demande s'il faut la fermer :
// une seule par PR, retrouvée par sa marque cachée, ouverte ou fermée, avant d'en ouvrir une.
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { DELAI_CLAIM_PERIME_MS as DELAI_PERIME_MS } from "../guerison/claim-perime.ts";

export const ZONE_RELEASED = "zone-released";
// Sans activité depuis ce délai, une PR qui n'est ni cuite ni en pass est périmée : le délai de péremption qui existe
// déjà, celui d'un claim sans cook (`guerison/claim-perime.ts`), pas un second.
export { DELAI_PERIME_MS };

// La PR qui tient la zone d'un ticket sauté. `auteur` : « brigade » pour une branche d'un cook (`cook/<n>-…`) ou du
// second (`<type>/<n>-…`), « human » sinon. `miseAJour` : sa dernière activité, telle que GitHub la date.
// `liberee` : elle porte déjà `zone-released`.
type PRQuiTient = { number: number; auteur: string; miseAJour: string; enCook: boolean; auPass: boolean; surLaBase: boolean; liberee?: boolean };
export type Bloque = { ticket: number; pr: PRQuiTient };

// Ce que les zones lisent et écrivent de GitHub. `ouvertes` : les issues où chercher la carte d'une PR, avec leur corps —
// en production, celles de la dernière année, fermées comprises : une carte que le chef a fermée ne se rouvre pas.
export type GitHubDesZones = {
  labelliser(numero: number, labels: string[]): Promise<void>;
  commenter(numero: number, corps: string): Promise<void>;
  creerIssue(issue: { title: string; body: string; labels: string[] }): Promise<number>;
  ouvertes(): Promise<Array<{ number: number; body: string }>>;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const marqueDeLaCarte = (pr: number) => `<!-- brigade:zone-released pr=${pr} -->`;

// Pourquoi la PR est périmée, ou null quand elle vit. Une date qui ne se lit pas ne la dit pas périmée.
function peremption(pr: PRQuiTient, maintenant: Date): string | null {
  if (pr.enCook || pr.auPass) return null;
  if (pr.surLaBase) return "its changes are already on the base";
  const depuis = Date.parse(pr.miseAJour);
  if (!(maintenant.getTime() - depuis > DELAI_PERIME_MS)) return null;
  return `no activity since ${pr.miseAJour}`;
}

const carteDuChef = (pr: number, ticket: number) => ({
  title: `Close the stale PR #${pr}?`,
  body: [
    marqueDeLaCarte(pr),
    "",
    `PR #${pr} is a human's, and it held the zone of #${ticket} while nothing moved on it. The supervisor released that zone (label \`${ZONE_RELEASED}\`): the kitchen no longer waits for it. The PR stays open: the supervisor never closes it.`,
    "",
    `Should PR #${pr} be closed? Close it yourself, or close this card to keep it open.`,
  ].join("\n"),
  labels: [CHEF_TODO],
});

export type OptionsDesZones = {
  github: GitHubDesZones;
  maintenant?: () => Date;
  // Chaque geste fait, au journal des gestes du superviseur : `auChef` quand il ouvre une carte pour le chef.
  consigner?: (ligne: string, auChef: boolean) => void;
};

export function ouvrirLesZones({ github, maintenant = () => new Date(), consigner = () => undefined }: OptionsDesZones): { cycle(bloques: readonly Bloque[]): Promise<string[]> } {
  // Les PR libérées par ce processus, et celles dont la carte est ouverte ou retrouvée.
  const liberees = new Set<number>();
  const cartes = new Set<number>();

  const liberer = async ({ ticket, pr }: Bloque, pourquoi: string): Promise<string[]> => {
    try {
      await github.labelliser(pr.number, [ZONE_RELEASED]);
    } catch (erreur) {
      return [`the zone of #${ticket}, held by the stale PR #${pr.number}, could not be labelled ${ZONE_RELEASED}: ${message(erreur)} — tried again next cycle`];
    }
    liberees.add(pr.number);
    const ligne = `Released the zone held by the stale PR #${pr.number} (${pourquoi}): the claim gate no longer counts it, and the PR stays open.`;
    consigner(ligne, false);
    try {
      await github.commenter(ticket, ligne);
      return [ligne];
    } catch (erreur) {
      return [ligne, `that line could not be written on #${ticket}: ${message(erreur)}`];
    }
  };

  const demanderAuChef = async ({ ticket, pr }: Bloque): Promise<string[]> => {
    let lues: Array<{ number: number; body: string }>;
    try {
      lues = await github.ouvertes();
    } catch (erreur) {
      return [`no card asks the chef about the stale PR #${pr.number} yet: the issues could not be read to find one — ${message(erreur)}`];
    }
    const deja = lues.find(({ body }) => body.includes(marqueDeLaCarte(pr.number)));
    if (deja) {
      cartes.add(pr.number);
      return [];
    }
    try {
      const carte = await github.creerIssue(carteDuChef(pr.number, ticket));
      cartes.add(pr.number);
      const ligne = `Asked the chef on #${carte} whether to close the human's stale PR #${pr.number}.`;
      consigner(ligne, true);
      return [ligne];
    } catch (erreur) {
      return [`the card that asks the chef about the stale PR #${pr.number} could not be opened: ${message(erreur)}`];
    }
  };

  return {
    async cycle(bloques) {
      const lignes: string[] = [];
      for (const bloque of bloques) {
        const pourquoi = peremption(bloque.pr, maintenant());
        if (pourquoi === null) continue;
        const { number, auteur, liberee = false } = bloque.pr;
        if (!liberee && !liberees.has(number)) lignes.push(...(await liberer(bloque, pourquoi)));
        if (auteur === "human" && (liberee || liberees.has(number)) && !cartes.has(number)) lignes.push(...(await demanderAuChef(bloque)));
      }
      return lignes;
    },
  };
}

// Une branche d'un cook (`cook/<n>-…`) ou du second (`<type>/<n>-…`, commands/dev.md).
const BRANCHE_DE_LA_BRIGADE = /^[a-z]+\/\d+-/;

// Une zone que la porte de prise a dite tenue par une PR : le ticket sauté, la PR, et l'état du ticket de la PR.
export type ZoneTenue = { ticket: number; pr: number; enCook: boolean; auPass: boolean };
export type PROuverte = { number: number; branche: string; sha?: string; externe?: boolean; miseAJour?: string; labels?: string[] };
export type LectureDesBloques = {
  prsOuvertes(): Promise<PROuverte[]>;
  teteDeLaBase(branche: string): Promise<string>;
  fichiersEntre?(de: string, a: string): Promise<{ fichiers: string[]; complet: boolean } | null>;
};

// Les tickets sautés et la PR qui tient leur zone, lus des PR ouvertes. Une PR qui n'est plus ouverte ne tient plus rien.
// Une PR n'est « sur la base » que si la comparaison de la base à sa tête se lit et ne lui laisse aucun fichier : une
// comparaison qui ne se lit pas ne la dit pas.
export async function lireLesBloques(tenues: readonly ZoneTenue[], github: LectureDesBloques, branche: string, maintenant: Date): Promise<Bloque[]> {
  if (tenues.length === 0) return [];
  const ouvertes = await github.prsOuvertes();
  let tete: Promise<string | null> | undefined;
  const bloques: Bloque[] = [];
  for (const { ticket, pr: numero, enCook, auPass } of tenues) {
    const pr = ouvertes.find(({ number }) => number === numero);
    if (pr === undefined) continue;
    const lue: PRQuiTient = {
      number: numero,
      auteur: pr.externe === true || !BRANCHE_DE_LA_BRIGADE.test(pr.branche) ? "human" : "brigade",
      miseAJour: pr.miseAJour ?? "",
      enCook,
      auPass,
      surLaBase: false,
      liberee: (pr.labels ?? []).includes(ZONE_RELEASED),
    };
    if (peremption(lue, maintenant) === null && !enCook && !auPass && pr.sha !== undefined && github.fichiersEntre !== undefined) {
      tete ??= github.teteDeLaBase(branche).catch(() => null);
      const base = await tete;
      const comparee = base === null ? null : await github.fichiersEntre(base, pr.sha).catch(() => null);
      lue.surLaBase = comparee !== null && comparee.complet && comparee.fichiers.length === 0;
    }
    bloques.push({ ticket, pr: lue });
  }
  return bloques;
}
