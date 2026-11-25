// Une zone tenue par une PR périmée (#4243, épique #4204) : la porte de prise ne compte plus une PR ouverte qui recoupe la
// zone d'un ticket et n'a plus de vie — ni cuite, ni en pass, sans activité depuis le délai de péremption de la porte
// (`claim-gate.ts`, #4242), ou ses changements déjà sur la base. Le superviseur lui pose le label `zone-released`, et le
// dit en une ligne sur le ticket et dans son rapport. Il ne ferme jamais la PR. Celle d'un humain — ni d'un cook, ni du
// second — a de plus UNE carte pour le chef, qui demande s'il faut la fermer : une seule par PR, retrouvée par sa marque
// cachée, ouverte ou fermée, avant d'en ouvrir une.
import { LABEL_ZONE_RELEASED as ZONE_RELEASED, type PRDeLaPorte, STALE_DELAY_MS as DELAI_PERIME_MS, vivante } from "../claim-gate.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";

// Le label et le délai de péremption de la porte de prise, pas des seconds.
export { DELAI_PERIME_MS, ZONE_RELEASED };

// La PR qui tient la zone d'un ticket. `auteur` : « brigade » pour une branche d'un cook (`cook/<n>-…`) ou du second
// (`<type>/<n>-…`), « human » sinon. `miseAJour` : sa dernière activité, telle que GitHub la date. `surLaBase` : ses
// changements sont déjà sur la base, ou la lecture qui le dit. `liberee` : elle porte déjà `zone-released`.
type PRQuiTient = { number: number; auteur: string; miseAJour: string; enCook: boolean; auPass: boolean; surLaBase: NonNullable<PRDeLaPorte["surLaBase"]>; liberee?: boolean };
export type Bloque = { ticket: number; pr: PRQuiTient };

// Une branche d'un cook (`cook/<n>-…`) ou du second (`<type>/<n>-…`, commands/dev.md).
const BRANCHE_DE_LA_BRIGADE = /^[a-z]+\/\d+-/;

// Le ticket et la PR périmée que la porte de prise ne compte plus sur sa zone : elle n'est ni cuite ni en pass.
export function bloqueDe(ticket: number, pr: PRDeLaPorte & { number: number }): Bloque {
  return {
    ticket,
    pr: {
      number: pr.number,
      auteur: BRANCHE_DE_LA_BRIGADE.test(pr.branche) ? "brigade" : "human",
      miseAJour: pr.misAJourLe ?? "",
      enCook: false,
      auPass: false,
      surLaBase: pr.surLaBase ?? false,
      liberee: pr.labels?.includes(ZONE_RELEASED) ?? false,
    },
  };
}

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

// Pourquoi la PR est périmée, ou null quand elle vit : cuite ou en pass, elle vit même sur la base ; sinon, la règle de
// la porte de prise (`vivante`), relue à l'instant. Une date qui ne se lit pas ne la dit pas périmée, une base qui ne se
// compare pas non plus.
async function peremption(pr: PRQuiTient, maintenant: Date): Promise<string | null> {
  if (pr.enCook || pr.auPass) return null;
  if ((await vivante({ branche: "", misAJourLe: pr.miseAJour, surLaBase: pr.surLaBase }, { maintenant: maintenant.getTime(), parSonTicket: async () => null })) !== null) return null;
  return maintenant.getTime() - Date.parse(pr.miseAJour) >= DELAI_PERIME_MS ? `no activity since ${pr.miseAJour}` : "its changes are already on the base";
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
        const pourquoi = await peremption(bloque.pr, maintenant());
        if (pourquoi === null) continue;
        const { number, auteur, liberee = false } = bloque.pr;
        if (!liberee && !liberees.has(number)) lignes.push(...(await liberer(bloque, pourquoi)));
        if (auteur === "human" && (liberee || liberees.has(number)) && !cartes.has(number)) lignes.push(...(await demanderAuChef(bloque)));
      }
      return lignes;
    },
  };
}

