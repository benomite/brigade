// La station contributrice (#2935, épique #2927) : une station qui sert un
// projet public sans en avoir l'écriture. Elle cuisine dans sa fourche et livre
// par une PR de la fourche vers le projet ; ce qui arrive ensuite à la PR — sa
// relecture, son merge — est le chemin des PR du dehors, pas le sien.
//
// Son tour : la fourche créée ou retrouvée, les prises de ses cooks en vol
// renouvelées, puis, tant qu'elle a des places, un ticket prenable pris
// (`reclamation.ts`) et son cook lancé, sans l'attendre. Prenable : sur le
// rail (`fire`), ni épique, ni tenu par une station du dépôt (`taken`,
// `in-pass`), ni en attente (`waiting`, `blocked-on-human`, `hors-cuisine`),
// calibré, sans dépendance ouverte, sans PR ouverte de sa branche, et que
// personne ne tient. Un cook qui ne livre pas lâche le ticket — la station ne
// le reprend plus s'il était bloqué, ni après `ECHECS_MAX` cooks sans
// livraison — ; un cook qui
// livre garde sa prise jusqu'à son échéance, et sa PR ouverte le retient
// ensuite : le ticket ne s'offre plus aux autres stations.
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { brancheDuTicket, dependancesDuCorps, ECHECS_MAX, runDuTicket, A_LA_MAIN, type Lancer, type StationGitHub } from "../brigade-github.ts";
import { environnementHorsGitHub, ticketJoint } from "../bac-a-sable/hors-github.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "../bac-a-sable/local.ts";
import { calibrage as calibrageDesLabels, complet, type Calibrage } from "../calibrage.ts";
import { argumentsClaude, consigne, environnementCook, lireFlux, verdict } from "../claude.ts";
import { envelopper, type Cloison } from "../cloison.ts";
import type { Depot } from "../depot.ts";
import type { Plafonds } from "../events/guardrails.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import type { GardesDuTour } from "../github-seul/garde-fous/garde-fous.ts";
import { HORS_CUISINE, type GitHub, type Issue } from "../github.ts";
import { environnementClaude } from "../jeton-claude.ts";
import { lireBlocage } from "../livrable.ts";
import { superviser } from "../superviseur.ts";
import { oublierLaBranche, pousserDansLaFourche, type Fourche } from "./fourche.ts";
import { estUneReclamation, reclamer, rendre, renouveler, type ContexteDeReclamation, type GitHubDeLaReclamation } from "./reclamation.ts";

// Les labels qui retirent un ticket de ceux qu'une station contributrice prend.
const NON_PRENABLES = [LABEL_TAKEN, LABEL_IN_PASS, LABEL_WAITING, A_LA_MAIN, HORS_CUISINE];

type TicketDuRail = Pick<Issue, "number" | "title" | "labels" | "epique" | "pr">;

// Ce que la station contributrice demande à GitHub : lire, commenter, créer sa
// fourche, ouvrir sa PR — rien qui demande l'écriture sur le dépôt.
export type GitHubDeLaContributrice = GitHubDeLaReclamation &
  Pick<GitHub, "tickets" | "issue" | "ouvrirPR"> & {
    // Les PR ouvertes sur le projet, par la branche dont chacune est la tête.
    prsOuvertes(): Promise<{ branche: string }[]>;
    // Crée la fourche du compte, ou rend celle qu'il a déjà.
    fourcher(): Promise<Fourche>;
  };

export type OptionsContributrice = {
  nom: string;
  // Le compte GitHub de la station : il signe ses prises et possède sa fourche.
  login: string;
  places: number;
  base: string;
  // `owner/name` du projet.
  depotGitHub: string;
  github: GitHubDeLaContributrice;
  depot: Pick<Depot, "preparer" | "ranger" | "retirer" | "commits">;
  // Le clone du projet, d'où la branche du cook part vers la fourche.
  clone: string;
  claude: string;
  env: NodeJS.ProcessEnv;
  cloison: Cloison | null;
  bacASable?: BacASableLocal | null;
  plafonds: Plafonds;
  graceMs: number;
  // Où s'écrit le flux de chaque cook.
  flux: string;
  lancer?: Lancer;
  // Le « stop », le disjoncteur, le quota et l'arbitre (#2213), comme au tour GitHub seul.
  gardes?: GardesDuTour;
  avertir?: (message: string) => void;
  maintenant?: () => Date;
  bailMs?: number;
  // Les stations que le chef refuse (`refus.ts`), relues à chaque prise. Une liste
  // qui ne se lit pas retient la station : elle ne prend rien tant qu'elle ne se lit pas.
  refusees?: () => readonly string[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function stationContributrice(options: OptionsContributrice): StationGitHub {
  const { nom, login, base, depotGitHub, github, depot, clone, gardes } = options;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const maintenant = options.maintenant ?? (() => new Date());
  // Lue une fois par tour : la liste peut changer entre deux tours, pas pendant l'un.
  let refusees: readonly string[] = [];
  const contexte: ContexteDeReclamation = { github, station: nom, login, maintenant, refusees: () => refusees, ...(options.bailMs === undefined ? {} : { bailMs: options.bailMs }) };
  const lancer: Lancer = options.lancer ?? gardes?.lancer ?? (({ commande, args, cwd, env, flux }) => superviser({ commande, args, cwd, env, plafonds: options.plafonds, graceMs: options.graceMs, flux }));
  const envDuCook = () => environnementClaude(environnementHorsGitHub(environnementCook(options.env), { bacASable: Boolean(options.bacASable) }), options.env);
  mkdirSync(options.flux, { recursive: true });

  let fourche: Fourche | null = null;
  // Le dernier sondage lu : rendu tel quel quand GitHub dit que rien n'a changé.
  let derniers: TicketDuRail[] = [];
  const enVol = new Map<number, Promise<void>>();
  // Les cooks sans livraison de chaque ticket, et les tickets que la station ne
  // prend plus : bloqués sur une question qu'elle ne peut pas poser au chef du
  // projet, ou sans livraison `ECHECS_MAX` fois. Sans eux, elle reprendrait le
  // même ticket à chaque tour. Le compte vit avec la station.
  const echecs = new Map<number, number>();
  const ecartes = new Set<number>();

  const dire = (numero: number, texte: string) => avertir(`brigade : #${numero} sur ${nom} (contributor) — ${texte}`);
  const lacher = async (numero: number, pourquoi: string, { ecarter = false } = {}) => {
    const fois = (echecs.get(numero) ?? 0) + 1;
    echecs.set(numero, fois);
    const ecarte = ecarter || fois >= ECHECS_MAX;
    if (ecarte) ecartes.add(numero);
    const suite = ecarte ? `; this station no longer takes it (${ecarter ? "blocked" : `${fois} cooks without a delivery`})` : "";
    try {
      await rendre(numero, contexte);
      dire(numero, `${pourquoi}; the ticket is released${suite}`);
    } catch (erreur) {
      dire(numero, `${pourquoi}; the release could not be posted (${message(erreur)}): the claim lapses at its expiry${suite}`);
    }
  };

  // Le cook d'un ticket pris, de son worktree à sa PR.
  const cuire = async (ticket: TicketDuRail, calibrage: Calibrage, issue: { body: string }, sa: Fourche): Promise<void> => {
    const run = runDuTicket(ticket.number);
    const branche = brancheDuTicket(ticket.number);
    let joint: string;
    try {
      const commentaires = (await github.commentaires(ticket.number)).filter(({ body }) => !estUneReclamation(body));
      joint = ticketJoint({ number: ticket.number, title: ticket.title, body: issue.body, commentaires });
    } catch (erreur) {
      return lacher(ticket.number, `its comments could not be read on GitHub (${message(erreur)})`);
    }
    let worktree: string;
    try {
      oublierLaBranche({ clone, branche, env: options.env });
      ({ worktree } = await depot.preparer(run));
    } catch (erreur) {
      return lacher(ticket.number, `its worktree could not be prepared (${message(erreur)})`);
    }
    const flux = join(options.flux, `${run}.flux.jsonl`);
    const texte = consigne({ ticket: ticket.number, titre: ticket.title, depot: depotGitHub, base, joint });
    const lancement = envelopper(options.cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsClaude(texte, calibrage), worktree) }, { cwd: worktree, depot: "ecriture" });
    const lance = lancer({ ...lancement, cwd: worktree, env: envDuCook(), flux });
    const fin = await lance.fin;
    const fichier = lance.flux ?? flux;
    const lu = lireFlux(existsSync(fichier) ? readFileSync(fichier, "utf8") : "");
    const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lu, fin.code);
    if (conclusion !== "done") {
      depot.retirer(worktree, branche);
      return lacher(ticket.number, `the cook ended without a delivery (${conclusion})`);
    }
    await depot.ranger(worktree, branche);
    const question = lireBlocage(lu.message);
    if (question !== null) return lacher(ticket.number, `the cook is blocked: ${question}`, { ecarter: true });
    if (depot.commits(branche) === 0) return lacher(ticket.number, "the cook committed nothing");
    try {
      pousserDansLaFourche({ clone, fourche: sa, branche, env: options.env });
    } catch (erreur) {
      return lacher(ticket.number, `\`${branche}\` could not be pushed to the fork ${sa.url} (${message(erreur)})`);
    }
    let pr: string;
    try {
      pr = await github.ouvrirPR({ branche: `${sa.proprietaire}:${branche}`, base, titre: `#${ticket.number} — ${ticket.title}`, corps: `Closes #${ticket.number}\n\nCooked by contributor station \`${nom}\` (@${login}), from the fork \`${sa.proprietaire}\`.` });
    } catch (erreur) {
      return lacher(ticket.number, `GitHub refused the pull request from the fork (${message(erreur)})`);
    }
    dire(ticket.number, `delivered from the fork: ${pr}`);
  };

  // Ce qui retient un ticket d'être pris par cette station, ou null.
  const prenable = (ticket: TicketDuRail, ouvertes: ReadonlySet<string>): Calibrage | null => {
    if (ticket.pr || ticket.epique || enVol.has(ticket.number) || ecartes.has(ticket.number)) return null;
    if (ticket.labels.some((label) => NON_PRENABLES.includes(label))) return null;
    if (ouvertes.has(brancheDuTicket(ticket.number))) return null;
    const calibrage = calibrageDesLabels(ticket.labels);
    return complet(calibrage) ? calibrage : null;
  };

  const station: StationGitHub = {
    async tour() {
      fourche ??= await github.fourcher();
      const sa = fourche;
      for (const numero of enVol.keys()) {
        try {
          if (!(await renouveler(numero, contexte))) dire(numero, "its claim was released or expired while its cook runs: another station may take it");
        } catch (erreur) {
          dire(numero, `its claim could not be renewed (${message(erreur)})`);
        }
      }
      if (enVol.size >= options.places) return;
      try {
        refusees = options.refusees?.() ?? [];
      } catch (erreur) {
        avertir(`brigade : ${nom} (contributor) takes nothing this turn — the list of refused stations is not read (${message(erreur)})`);
        return;
      }
      if (refusees.includes(nom)) {
        avertir(`brigade : ${nom} (contributor) is refused by the chef — it takes no ticket`);
        return;
      }
      const sonde = await github.tickets();
      if (!sonde.inchange) {
        derniers = sonde.issues;
        sonde.confirmer();
      }
      const ouvertes = new Set((await github.prsOuvertes()).map(({ branche }) => branche));
      for (const ticket of derniers) {
        if (enVol.size >= options.places) break;
        const calibrage = prenable(ticket, ouvertes);
        if (calibrage === null) continue;
        const issue = await github.issue(ticket.number);
        if (issue === null || issue.state !== "open") continue;
        const dependances = dependancesDuCorps(issue.body ?? "").filter((dependance) => dependance !== ticket.number);
        const etats = await Promise.all(dependances.map(async (dependance) => (await github.issue(dependance))?.state));
        if (etats.includes("open")) continue;
        if (gardes !== undefined && (await gardes.retenue(enVol.size)) !== null) break;
        const { prise } = await reclamer(ticket.number, contexte);
        if (!prise) continue;
        const cook = cuire(ticket, calibrage, { body: issue.body ?? "" }, sa)
          .catch((erreur: unknown) => lacher(ticket.number, `its cook failed (${message(erreur)})`))
          .finally(() => {
            enVol.delete(ticket.number);
            // Une place vient de se libérer : le rail se relit sans attendre l'intervalle.
            station.presser?.(true);
          });
        enVol.set(ticket.number, cook);
      }
      await gardes?.redire(enVol.size);
    },
    enCuisine: () => [...enVol.keys()],
    calme: async () => {
      while (enVol.size > 0) await Promise.all([...enVol.values()]);
    },
    relu: async () => {},
    quitter: async () => {
      await gardes?.quitter();
    },
  };
  return station;
}
