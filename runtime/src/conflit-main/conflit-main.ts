// Un conflit avec la base revient au cook du ticket lui-même (#3476, épique
// #3471) : jamais à un ticket neuf, jamais au chef. `cuisinerLeTicket` et
// `cuire` (brigade-github.ts) l'appellent à trois endroits, et le tour une fois :
// - au départ du cook d'une branche reprise, la station y fusionne
//   `origin/<base>` ; si la fusion bute sur des conflits, elle la retente sans
//   commiter et laisse les marqueurs au cook, avec la liste des fichiers
//   (`partirSurLaBase`) : il les résout dans sa branche, joue les gates et suit ;
// - quand un cook arrêté sur la base ne peut pas la recevoir, la station renvoie
//   le ticket à son cook (`corpsDuRenvoiPourConflit`, via `apresLaMiseAJour`) ;
// - quand le cook d'un conflit s'arrête bloqué (`suiteDuConflitBloque`), un
//   geste git lui revient ; seul un choix de produit ou de design va au chef,
//   en mots de produit ;
// - à chaque tour, ce que l'ancien chemin a laissé se défait
//   (`degelerLesConflits`) : un ticket ouvert pour changer la branche d'un
//   autre est fermé et replié dans le renvoi du propriétaire, une carte qui
//   demande au chef un geste git est retirée.
import { poserALaMain } from "../blocages-sans-question.ts";
import type { Avis, ReponseDuManager } from "../blocage-au-manager.ts";
import { A_LA_MAIN, brancheDuTicket, ECHECS_MAX, type GitHubDuTour, type TicketLu } from "../brigade-github.ts";
import type { LanceurGit } from "../integration-base.ts";
import { mettreAJourLaBranche, type MiseAJourDeLaBranche } from "../mise-a-jour-branche/mise-a-jour-branche.ts";
import { consigneDeLIntegration, integrerAvantLeCook } from "../renvoi-conflit.ts";
import { carteDeGesteGit, carteDuChoixDeProduit, cibleDuTravail, corpsDuRenvoiPourConflit, demandeUnGesteGit, fichiersNommes, MARQUE_DU_CONFLIT_MAIN, teteDeCarte } from "./renvoi.ts";

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export type DepartSurLaBase = MiseAJourDeLaBranche | { etat: "conflit"; fichiers: string[]; consigne: string };

// La branche reprise d'un cook, mise à jour de `origin/<base>` avant qu'il n'y
// entre. Sans conflit, la fusion est commitée par la station (`fusionnee`) ;
// en conflit, elle est retentée sans commit et laissée au cook, marqueurs
// compris (`conflit`), avec la consigne qui les lui nomme. Une seconde
// tentative qui ne bute plus sur un conflit (la base a bougé entre les deux, le
// fetch a échoué) est défaite et rend l'échec de la première : le cook part de
// sa branche telle quelle.
export async function partirSurLaBase(git: LanceurGit, worktree: string, base: string): Promise<DepartSurLaBase> {
  const miseAJour = await mettreAJourLaBranche(git, worktree, base);
  if (miseAJour.etat !== "echec" || miseAJour.etape !== "merge" || miseAJour.fichiers.length === 0) return miseAJour;
  const integration = await integrerAvantLeCook(git, worktree, base);
  const consigne = consigneDeLIntegration(integration, base);
  if (integration.etat === "conflit" && consigne !== null) return { etat: "conflit", fichiers: integration.fichiers, consigne };
  if (integration.etat === "propre") await git(["merge", "--abort"], worktree).catch(() => null);
  return miseAJour;
}

export type GitHubDuConflit = Pick<GitHubDuTour, "commentaires" | "commenter" | "labelliser">;

// Les renvois du ticket à son propre cook pour la base (`MARQUE_DU_CONFLIT_MAIN`)
// déjà posés, relus sur GitHub au moment de renvoyer : le même compte, contre
// `ECHECS_MAX`, pour le conflit (`suiteDuConflitBloque`) et pour le geste git
// d'un cook bloqué hors conflit (`confierAuManager`). Illisibles, ils rendent
// l'échec à dire : sans compte, le ticket ne repart pas, il compte pour un
// cook sans livraison plutôt que de boucler.
export async function renvoisPourLaBase(github: Pick<GitHubDuTour, "commentaires">, ticket: number): Promise<number | { echec: string }> {
  try {
    return (await github.commentaires(ticket)).filter((c) => c.body.startsWith(MARQUE_DU_CONFLIT_MAIN)).length;
  } catch (erreur) {
    return { echec: `the ticket's previous send-backs to its own cook could not be read: ${message(erreur)}` };
  }
}

// Ce que devient le ticket dont le cook s'est arrêté bloqué pendant qu'il
// résolvait un conflit avec la base. Un geste git, une question technique, un
// avis illisible : le ticket revient à son cook (`liberee`), le conflit
// toujours nommé. Un choix de produit ou de design que le manager y lit : la
// carte du chef le pose en mots de produit (`retenue`). Au-delà de
// `ECHECS_MAX` renvois de ce genre, le cook compte pour un cook sans livraison.
export async function suiteDuConflitBloque(
  github: GitHubDuConflit,
  { station, ticket, base, branche, fichiers, question, consulter }: { station: string; ticket: number; base: string; branche: string; fichiers: readonly string[]; question: string; consulter?: (question: string) => Promise<ReponseDuManager> },
): Promise<{ suite: "liberee" | "retenue"; dit: string } | { echec: string }> {
  const renvoyer = async (pourquoi: string) => {
    const deja = await renvoisPourLaBase(github, ticket);
    if (typeof deja !== "number") return deja;
    if (deja + 1 > ECHECS_MAX) return { echec: `the cook stopped ${deja + 1} times on the conflict of \`${branche}\` with \`origin/${base}\` without resolving it (${pourquoi})` };
    await github.commenter(ticket, corpsDuRenvoiPourConflit({ station, base, branche, fichiers, question }));
    return { suite: "liberee" as const, dit: `the cook stopped on the conflict with \`origin/${base}\` (${pourquoi}): the ticket goes back to its own cook` };
  };
  if (demandeUnGesteGit(question)) return renvoyer("its question is a git gesture");
  let lu: ReponseDuManager;
  try {
    lu = consulter === undefined ? { illisible: "this station has no manager to consult" } : await consulter(question);
  } catch (erreur) {
    lu = { illisible: message(erreur) };
  }
  if ("illisible" in lu) return renvoyer(`the manager could not read its question: ${lu.illisible}`);
  const avis: Avis = lu.avis;
  if (avis.issue !== "produit" && avis.issue !== "design") return renvoyer(`the manager read a ${avis.issue === "geste" ? "gesture" : "technical question"}, not a choice for the chef`);
  if (demandeUnGesteGit(avis.question)) return renvoyer("the manager's question is a git gesture");
  const pose = await poserALaMain({ github }, ticket, carteDuChoixDeProduit({ station, base, fichiers, question: avis.question, sorte: avis.issue }));
  if (!pose.pose) return renvoyer(pose.echec);
  return { suite: "retenue", dit: `the conflict with \`origin/${base}\` hides a ${avis.issue === "produit" ? "product" : "design"} choice: the chef's card asks it` };
}

export type GitHubDuDegel = Pick<GitHubDuTour, "commentaires" | "commenter" | "corpsDuTicket" | "delabelliser" | "fermerIssue" | "issue">;

// Ce que l'ancien chemin a laissé sur les tickets ouverts du tour, défait sans
// geste du chef (#3476) :
// - un ticket dont le travail est de changer la branche d'un autre ticket est
//   fermé, et replié dans le renvoi de ce ticket à son propre cook, avec les
//   fichiers en conflit qu'il nommait ;
// - une carte du chef (`blocked-on-human`) qui lui demande un geste git est
//   retirée, et le ticket dont elle nomme la branche revient à son cook.
// `enVol` : les tickets qu'un cook de cette station tient, laissés au tour
// suivant. `examinees` : les cartes déjà relues par ce processus, qui ne se
// relisent pas à chaque tour. Un ticket qui échoue est dit, et ne retient pas
// les autres. Rend les tickets fermés, et ceux dont la carte est retirée.
export async function degelerLesConflits(
  github: GitHubDuDegel,
  { station, base, tickets, enVol, examinees, avertir }: { station: string; base: string; tickets: readonly TicketLu[]; enVol: ReadonlySet<number>; examinees: Set<number>; avertir: (texte: string) => void },
): Promise<{ fermes: Set<number>; rendus: Set<number> }> {
  const fermes = new Set<number>();
  const rendus = new Set<number>();
  const renvoyes = new Set<number>();
  const ouvert = async (numero: number) => tickets.some((t) => t.number === numero && t.state === "open") || (await github.issue?.(numero))?.state === "open";
  const renvoyer = async (proprietaire: number, fichiers: string[]) => {
    if (renvoyes.has(proprietaire) || !(await ouvert(proprietaire))) return;
    renvoyes.add(proprietaire);
    await github.commenter(proprietaire, corpsDuRenvoiPourConflit({ station, base, branche: brancheDuTicket(proprietaire), fichiers }));
  };
  for (const ticket of tickets) {
    if (ticket.state !== "open" || enVol.has(ticket.number)) continue;
    try {
      const pourLeTitre = cibleDuTravail({ numero: ticket.number, titre: ticket.title, corps: "" });
      const corps = pourLeTitre !== null || /^Do the git gesture of #/.test(ticket.title.trim()) ? await github.corpsDuTicket(ticket.number) : "";
      const proprietaire = cibleDuTravail({ numero: ticket.number, titre: ticket.title, corps });
      if (proprietaire !== null) {
        await renvoyer(proprietaire, fichiersNommes(corps));
        await github.commenter(
          ticket.number,
          `Station \`${station}\`: this ticket's work was to change the branch of #${proprietaire}, which only #${proprietaire}'s own cook changes. It is folded into #${proprietaire}'s send-back to its cook, which resolves the conflict with \`origin/${base}\` in its own branch, and closed. Nothing here is for the chef.`,
        );
        if (ticket.labels.includes(A_LA_MAIN)) await github.delabelliser(ticket.number, A_LA_MAIN);
        await github.fermerIssue(ticket.number);
        fermes.add(ticket.number);
        avertir(`brigade : #${ticket.number} sur ${station} — its work was to change the branch of #${proprietaire}: closed, and #${proprietaire} goes back to its own cook`);
        continue;
      }
      if (!ticket.labels.includes(A_LA_MAIN) || examinees.has(ticket.number)) continue;
      const carte = (await github.commentaires(ticket.number)).map((c) => teteDeCarte(c.body)).findLast((tete) => tete !== null) ?? null;
      examinees.add(ticket.number);
      if (carte === null || !carteDeGesteGit(carte)) continue;
      const nommee = /\bcook\/([1-9]\d*)-/.exec(carte);
      const cible = nommee ? Number(nommee[1]) : ticket.number;
      await github.delabelliser(ticket.number, A_LA_MAIN);
      rendus.add(ticket.number);
      await github.commenter(
        ticket.number,
        `Station \`${station}\`: the chef's card on this ticket asked for a git gesture on ${cible === ticket.number ? "its branch" : `the branch of #${cible}`} — never a question for the chef. The card is withdrawn and \`${A_LA_MAIN}\` removed: ${cible === ticket.number ? "the ticket goes back to its own cook" : `#${cible} goes back to its own cook`}, which brings its branch up to date with \`origin/${base}\` itself.`,
      );
      await renvoyer(cible, fichiersNommes(carte));
      avertir(`brigade : #${ticket.number} sur ${station} — its chef card asked for a git gesture: withdrawn, #${cible} goes back to its own cook`);
    } catch (erreur) {
      avertir(`brigade : #${ticket.number} sur ${station} — what the old conflict path left on it could not be undone, retried next round: ${message(erreur)}`);
    }
  }
  return { fermes, rendus };
}
