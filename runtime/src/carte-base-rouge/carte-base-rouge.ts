// La carte du chef quand la cuisine ne sait pas rendre la base verte (#3816,
// épique #3812) : les tickets de réparation d'un même rouge — titre
// `Repair <base>:`, label `repair-main`, la marque du commit rouge dans leur
// corps — échouent l'un après l'autre et la cuisine reste retenue sans que
// personne ne le sache. À `SEUIL_DE_LA_CARTE` réparations mises de côté
// (`set-aside:failures`) pour ce rouge, la station pose une carte de TODO pour
// le chef : depuis quand la base est rouge, ce qui échoue avec son erreur, et
// ce qui a été essayé, une ligne par réparation.
//
// Une seule carte à la fois, retrouvée sur GitHub par sa marque : un tour de
// plus, ou une station redémarrée, la retrouve et la réécrit si son texte
// change — jamais une seconde. Fermée à la main tant que la base est rouge, elle
// se rouvre : la TODO du chef n'en est jamais vide. La base verte la ferme.
// Ce module ne crée aucune réparation : un autre les ouvre.
//
// L'appel vient du tour (`brigade-github.ts`), sur les checks que la relance
// de la base rend, à côté de l'ouverture de sa réparation.
import { DE_CONFIANCE } from "../alimenter.ts";
import { shaDeBaseRouge, sortieDErreur, type CheckDeLaBase } from "../base-rouge/ouvre-reparation.ts";
import type { Check } from "../events/pass.ts";
import { CHEF_TODO, marqueur } from "../github-seul/carte-todo/carte-todo.ts";
import { etatDeLaBase } from "../github-etat/etats.ts";
import { ECHECS_ATTEINTS, type Commentaire, type IssueDepuis } from "../github.ts";
import { LimiteGitHubAtteinte } from "../limite-github.ts";

// Le label des tickets de réparation que ce module compte.
const LABEL_REPARATION_MAIN = "repair-main";
// Le nombre de réparations mises de côté pour un même rouge qui pose la carte.
const SEUIL_DE_LA_CARTE = 3;
// La sorte de la carte, telle que le commentaire de TODO l'écrit
// (`github-seul/carte-todo/carte-todo.ts`) : la cuisine est bloquée.
const SORTE_DE_LA_CARTE = "blocked";

// Une issue telle que le module la lit : une réparation ou la carte.
type IssueDeLaCarte = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed" };

// Ce que la carte lit et écrit de GitHub.
type GitHubDeLaCarte = {
  // Le dernier commit de la branche d'intégration.
  teteDeLaBase(): Promise<string>;
  // L'instant du commit, tel que GitHub le date, ou null s'il ne le dit pas.
  instantDuCommit(sha: string): Promise<string | null>;
  // Le journal du job d'un check, ou null.
  journalDuCheck(check: Check): Promise<string | null>;
  // Les tickets de réparation, ouverts ou fermés.
  reparations(): Promise<IssueDeLaCarte[]>;
  // Pourquoi la réparation a été mise de côté, en une phrase, ou null.
  motifDeLaMiseDeCote(numero: number): Promise<string | null>;
  // Les cartes du chef, ouvertes ou fermées : une carte qui ne porte plus
  // `chef-todo` n'est plus dans sa TODO, et se lit fermée.
  cartes(): Promise<IssueDeLaCarte[]>;
  // Crée la carte ; rend son numéro.
  creerCarte(carte: { titre: string; corps: string }): Promise<number>;
  ecrireCorps(numero: number, corps: string): Promise<void>;
  fermerIssue(numero: number): Promise<void>;
  // Remet la carte dans la TODO du chef. Absente, une carte fermée à la main
  // tant que la base est rouge ne se rouvre pas, et le tour le dit.
  rouvrirIssue?(numero: number): Promise<void>;
};

// La marque cachée de la carte : le commit rouge qu'elle dit, et depuis quand
// la base est rouge, gardé d'un commit rouge au suivant.
const MARQUE = /^<!-- brigade:carte-base-rouge sha=([0-9A-Za-z._-]+) since=(\S*) -->$/m;
const marqueDeLaCarte = (sha: string, depuis: string | null) => `<!-- brigade:carte-base-rouge sha=${sha} since=${depuis ?? ""} -->`;
const lireLaMarque = (corps: string): { sha: string; depuis: string | null } | null => {
  const lue = MARQUE.exec(corps);
  return lue === null ? null : { sha: lue[1] as string, depuis: lue[2] === "" ? null : (lue[2] as string) };
};

// Le texte de la carte, sans sa marque : ce que le chef lit.
const texteDeLaCarte = (corps: string): string => corps.replace(MARQUE, "").trim();

const court = (sha: string) => sha.slice(0, 7);
const enUTC = (instant: string): string | null => {
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? null : `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
};
const enUneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();
const cloture = (texte: string) => "`".repeat(Math.max(3, ...[...texte.matchAll(/`+/g)].map(([suite]) => suite.length + 1)));
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

type EchecDeLaCarte = { nom: string; url: string | null; sortie: string | null; illisible?: string };
type EssaiDeLaCarte = { numero: number; motif: string };

function titreDeLaCarte(base: string): string {
  return `\`${base}\` stays red: the kitchen could not repair it`;
}

function corpsDeLaCarte({ base, sha, depuis, echecs, essais }: { base: string; sha: string; depuis: string | null; echecs: EchecDeLaCarte[]; essais: EssaiDeLaCarte[] }): string {
  const lu = depuis === null ? null : enUTC(depuis);
  const sorties = echecs.flatMap(({ nom, url, sortie, illisible }) => {
    const titre = `### \`${nom}\``;
    if (sortie === null || sortie === "") return [titre, "", `_GitHub gives no output for this check${illisible === undefined ? "" : ` (${enUneLigne(illisible)})`}${url === null ? "" : `: ${url}`}_`, ""];
    const bloc = cloture(sortie);
    return [titre, "", ...(url === null ? [] : [url, ""]), bloc, sortie, bloc, ""];
  });
  return [
    marqueDeLaCarte(sha, depuis),
    `The kitchen cannot make \`${base}\` green: ${essais.length} repair tickets were set aside. How should it be repaired?`,
    "",
    `- Red since: ${lu ?? `unknown — GitHub did not give the date of commit \`${court(sha)}\``}`,
    `- Red commit: \`${sha}\``,
    "- While it is red, the kitchen merges nothing. This card closes when it is green again.",
    "",
    "## What fails",
    "",
    ...(sorties.length === 0 ? ["(GitHub names no failing check)", ""] : sorties),
    "## What was tried",
    "",
    ...essais.map(({ numero, motif }) => `- #${numero} — set aside: ${enUneLigne(motif)}`),
  ].join("\n");
}

type OptionsDeLaCarte = {
  github: GitHubDeLaCarte;
  base: string;
  // L'horloge du tour, comme pour l'ouverture de la réparation : la règle n'en
  // lit rien, la fenêtre de lecture est celle du client (`githubDeLaCarte`).
  maintenant?: () => Date;
};

type TourDeLaCarte = { carte: number | null };

export function carteBaseRouge({ github, base }: OptionsDeLaCarte) {
  // Cache, pas état : vrai dès qu'un tour rouge a lu ou posé la carte, faux une
  // fois la base verte et les cartes fermées. La base verte ne lit rien de plus
  // sans lui : un tour vert ne coûte aucun appel. Limite : une station arrêtée
  // pendant que la base redevient verte ne ferme pas la carte d'avant son arrêt ;
  // le prochain rouge au seuil la reprend, et le chef peut la fermer.
  let peutEtreOuverte = false;
  const lesNotres = async () => (await github.cartes()).filter((carte) => lireLaMarque(carte.body) !== null).sort((x, y) => x.number - y.number);

  const echecsDe = async (rouges: CheckDeLaBase[]): Promise<EchecDeLaCarte[]> => {
    const echecs: EchecDeLaCarte[] = [];
    for (const check of rouges) {
      const nom = check.name ?? "unnamed check";
      const url = check.url ?? null;
      try {
        const journal = await github.journalDuCheck({ name: nom, outcome: "red", conclusion: "failure", url });
        echecs.push({ nom, url, sortie: journal === null ? null : sortieDErreur(journal, 3_000) });
      } catch (erreur) {
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
        echecs.push({ nom, url, sortie: null, illisible: `its log could not be read: ${message(erreur)}` });
      }
    }
    return echecs;
  };

  const motifDe = async (numero: number): Promise<string> => {
    try {
      return (await github.motifDeLaMiseDeCote(numero)) ?? "no reason found on the ticket";
    } catch (erreur) {
      if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      return `its reason could not be read: ${message(erreur)}`;
    }
  };

  const fermer = async () => {
    if (!peutEtreOuverte) return;
    for (const carte of await lesNotres()) if (carte.state === "open") await github.fermerIssue(carte.number);
    peutEtreOuverte = false;
  };

  // Les checks de la base, tels que la relance les rend. Verte, la carte se
  // ferme ; rouge, elle se pose ou se met à jour dès le seuil atteint ; en
  // cours ou inconnue, rien n'est lu ni touché. Une lecture ou une écriture
  // qui échoue lève : le tour le dit, et le suivant réessaie.
  return async (checks: CheckDeLaBase[]): Promise<TourDeLaCarte> => {
    const etat = etatDeLaBase(checks);
    if (etat === "green") {
      await fermer();
      return { carte: null };
    }
    if (etat !== "red") return { carte: null };
    const sha = await github.teteDeLaBase();
    const ecartees = (await github.reparations())
      .filter((issue) => issue.title.startsWith(`Repair ${base}:`) && issue.labels.includes(LABEL_REPARATION_MAIN) && issue.labels.includes(ECHECS_ATTEINTS) && shaDeBaseRouge(issue.body) === sha)
      .sort((x, y) => x.number - y.number);
    // Sous le seuil, rien ne s'écrit ; une carte ouverte pour un commit rouge
    // d'avant reste : la base n'est pas verte.
    if (ecartees.length < SEUIL_DE_LA_CARTE) return { carte: null };
    peutEtreOuverte = true;
    const cartes = await lesNotres();
    // La carte : l'ouverte, celle d'un commit rouge d'avant compris ; sinon
    // celle de ce rouge, fermée à la main.
    const carte = cartes.find((c) => c.state === "open") ?? cartes.find((c) => lireLaMarque(c.body)?.sha === sha);
    const depuis = (carte === undefined ? null : lireLaMarque(carte.body)?.depuis) ?? (await github.instantDuCommit(sha));
    const essais: EssaiDeLaCarte[] = [];
    for (const { number } of ecartees) essais.push({ numero: number, motif: await motifDe(number) });
    const corps = corpsDeLaCarte({ base, sha, depuis, echecs: await echecsDe(checks.filter((check) => check.outcome === "red")), essais });
    if (carte === undefined) return { carte: await github.creerCarte({ titre: titreDeLaCarte(base), corps }) };
    // Fermée à la main tant que la base est rouge, elle revient dans la TODO.
    if (carte.state !== "open") {
      if (github.rouvrirIssue === undefined) throw new Error(`the TODO card #${carte.number} of the red base was closed, and this GitHub client cannot reopen it`);
      await github.rouvrirIssue(carte.number);
    }
    if (carte.body !== corps) await github.ecrireCorps(carte.number, corps);
    return { carte: carte.number };
  };
}

// Le client de GitHub du tour, tel que la carte le lit : les réparations et
// la carte se lisent parmi les issues modifiées depuis `FENETRE_JOURS` jours,
// de confiance ; la carte est une issue au label `chef-todo` dont un
// commentaire de TODO dit le texte — celui que l'app montre.
const FENETRE_JOURS = 90;

type IssueLue = Pick<IssueDepuis, "number" | "body" | "association"> & Partial<Pick<IssueDepuis, "title" | "state" | "labels">>;
type GitHubDuTourDeLaCarte = {
  teteDeLaBase(): Promise<string>;
  instantDuCommit?(sha: string): Promise<string | null>;
  journalDuCheck?(check: Check): Promise<string | null>;
  // Absente, ce client ne lit ni réparation ni carte : aucune ne se pose.
  issuesDepuis?(instant: string): Promise<IssueLue[]>;
  commentaires(numero: number): Promise<Pick<Commentaire, "body" | "association">[]>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  ecrireCorps?(numero: number, corps: string): Promise<void>;
  fermerIssue(numero: number): Promise<void>;
  rouvrirIssue?(numero: number): Promise<void>;
};

// Le motif d'une mise de côté : la première ligne du dernier commentaire de
// confiance qui pose `set-aside:failures`, sans sa marque ni le nom de la station.
function motifDuCommentaire(commentaires: Pick<Commentaire, "body" | "association">[]): string | null {
  const dernier = commentaires.findLast(({ body, association }) => DE_CONFIANCE.includes(association) && body.includes(`\`${ECHECS_ATTEINTS}\``));
  if (dernier === undefined) return null;
  const ligne = dernier.body
    .replace(/^<!--[^\n]*-->\s*/, "")
    .split("\n")
    .find((l) => l.trim() !== "");
  return ligne === undefined ? null : ligne.replace(/^Station `[^`]*`:\s*/, "").trim();
}

export function githubDeLaCarte(github: GitHubDuTourDeLaCarte, maintenant: () => Date = () => new Date()): GitHubDeLaCarte {
  // Le corps de chaque carte lue, que sa réouverture repose dans son commentaire.
  const corpsLus = new Map<number, string>();
  const lire = async (): Promise<IssueDeLaCarte[]> => {
    // Au jour près : la même adresse de tour en tour, que GitHub sert sous condition.
    const depuis = `${new Date(maintenant().getTime() - FENETRE_JOURS * 24 * 3600 * 1000).toISOString().slice(0, 10)}T00:00:00Z`;
    if (github.issuesDepuis === undefined) return [];
    return (await github.issuesDepuis(depuis))
      .filter((issue) => DE_CONFIANCE.includes(issue.association))
      .map(({ number, title, body, labels, state }) => ({ number, title: title ?? "", body, labels: labels ?? [], state: state ?? "open" }));
  };
  // Le commentaire de TODO de la carte, puis son label : posé dans cet ordre,
  // une carte dont le commentaire a échoué n'a pas le label, se lit fermée, et
  // le tour suivant la repose en entier.
  const poser = async (numero: number, corps: string) => {
    await github.commenter(numero, `${marqueur(SORTE_DE_LA_CARTE)}\n${texteDeLaCarte(corps)}`);
    await github.labelliser(numero, [CHEF_TODO]);
  };
  return {
    teteDeLaBase: () => github.teteDeLaBase(),
    instantDuCommit: async (sha) => (github.instantDuCommit === undefined ? null : github.instantDuCommit(sha)),
    journalDuCheck: async (check) => (github.journalDuCheck === undefined ? null : github.journalDuCheck(check)),
    reparations: async () => (await lire()).filter((issue) => issue.labels.includes(LABEL_REPARATION_MAIN)),
    motifDeLaMiseDeCote: async (numero) => motifDuCommentaire(await github.commentaires(numero)),
    cartes: async () => {
      const cartes = (await lire()).filter((issue) => lireLaMarque(issue.body) !== null);
      for (const { number, body } of cartes) corpsLus.set(number, body);
      return cartes.map((issue) => ({ ...issue, state: issue.state === "open" && issue.labels.includes(CHEF_TODO) ? "open" : "closed" }));
    },
    creerCarte: async ({ titre, corps }) => {
      const numero = await github.creerIssue({ titre, corps, labels: [] });
      await poser(numero, corps);
      return numero;
    },
    // Le commentaire d'abord : si le corps échoue ensuite, il diffère encore au
    // tour suivant, qui réécrit les deux.
    ecrireCorps: async (numero, corps) => {
      if (github.ecrireCorps === undefined) throw new Error("this GitHub client cannot rewrite an issue");
      await github.commenter(numero, `${marqueur(SORTE_DE_LA_CARTE)}\n${texteDeLaCarte(corps)}`);
      await github.ecrireCorps(numero, corps);
    },
    fermerIssue: (numero) => github.fermerIssue(numero),
    ...(github.rouvrirIssue === undefined
      ? {}
      : {
          rouvrirIssue: async (numero: number) => {
            await github.rouvrirIssue?.(numero);
            await poser(numero, corpsLus.get(numero) ?? "");
          },
        }),
  };
}
