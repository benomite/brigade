// Le manager découpe une épique : il fait juger le découpage, puis porte les
// tickets sur GitHub, un par un, et tient dans l'épique la liste de ce qu'ils
// deviennent.
//
// Créer N issues n'est pas atomique. Le découpage est donc au journal avant
// le premier appel à GitHub, chaque création y est annoncée avant d'être
// tentée, et un runtime tué au milieu reprend là où il en était : ce qui est
// né ne renaît pas. Une épique découpée ne se rejuge plus — ce que le chef
// fait ensuite de ses tickets est à lui.
import { createHash } from "node:crypto";
import { DE_CONFIANCE } from "./alimenter.ts";
import { LABEL_COOK_DESIGN } from "./calibrage.ts";
import { brancheDuTicket } from "./brigade-github.ts";
import { demanderAvecRelance } from "./manager/decoupage-illisible.ts";
import { consigneDeDecoupage, corpsDuTicket, defautsDeDecoupage, empreinteDEpique, ficheDuTicket, lireDecoupage, marqueDe, MARQUEUR_QUESTION, neDUnDecoupage, separer, type Decoupe } from "./decouper.ts";
import { avecListe, epiqueDe, porteListe, reference, rendreListe, ticketsDeLaListe, type LigneDeListe } from "./epique.ts";
import type { FaitManager } from "./events/manager.ts";
import { porteFiche } from "./fiche.ts";
import { LABEL, type GitHub, type IssueOuverte } from "./github.ts";
import type { Journal } from "./journal.ts";
import { MARQUEUR_MANAGER } from "./juger.ts";
import { creationsAnnoncees, decoupageDe, epiquesDecoupees, ticketDEpique, ticketsDEpique, type Decoupage } from "./projections/splits.ts";
import { communsDuRail } from "./projections/rail.ts";
import { capacitesFournies } from "./projections/stations.ts";

// Ce qu'un jugement rend : sa réponse lue, ou ce qui la rend illisible. Null :
// il n'a pas abouti, et reste à faire.
export type Reponse<T> = ({ valeur: T } | { illisible: string }) & { run: string };

export type Atelier = {
  journal: Journal;
  github: GitHub;
  // `<owner>/<repo>`, pour la consigne.
  depotGitHub: string;
  // Les fichiers suivis du dépôt : le plan dont le découpage tire les zones.
  fichiers: () => string[];
  noter: (ticket: number | null, fait: FaitManager) => unknown;
  // Fait répondre le LLM à une consigne, sous les garde-fous.
  demander: <T>(sujet: { numero: number; prefixe: string; nom: string }, consigne: string, lire: (message: string | null) => { valeur: T } | { illisible: string }) => Promise<Reponse<T> | null>;
  peutJuger: () => boolean;
  // Juge une épique comme un ticket seul, quand son découpage reste illisible
  // après une relance. Rend vrai si le jugement a abouti.
  jugerSeul?: (epic: IssueOuverte, commentaires: string[], etat: string) => Promise<boolean>;
  // Le runtime s'arrête : plus rien ne s'écrit.
  arrete: () => boolean;
  // Le chef a éteint le manager : ce qui est décidé reste au journal.
  eteint: () => boolean;
  avertir: (message: string) => void;
  // Ce qu'un jugement a coûté, tel qu'il se signe sur l'issue.
  signature: (run: string | null, verbe: string) => string;
  // Un ticket du découpage vient d'être lancé : la station le prend sans attendre son tour suivant (#2796).
  surLeRail?: () => void;
};

// L'horloge de GitHub n'est pas celle du runtime : un ticket se cherche à
// partir d'un peu avant l'heure du découpage.
// Le commentaire de fermeture d'une épique dont tous les tickets sont fermés
// porte cette marque : s'il y est déjà, il n'est pas reposé. Celle d'avant
// #2618, quand seule une épique toute servie se fermait, vaut aussi.
const MARQUEUR_TERMINEE = "<!-- brigade:epique-terminee -->";
const MARQUEUR_SERVIE = "<!-- brigade:epique-servie -->";

const MARGE_MS = 600_000;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const priorites = (labels: string[]) => labels.filter((label) => /^prio:[1-9]$/.test(label));

// L'état d'un ticket tel que l'épique le montre, lu sur GitHub seul (#2618) :
// ouvert, servi — fermé par une PR mergée —, ou abandonné — fermé sans. `pr` :
// l'adresse de la PR qui l'a servi. Aucune date : la liste ne se réécrit que
// quand un état change.
type LigneLue = LigneDeListe & { ferme: boolean; pr: string | null };

const ouvert = (ticket: number, title: string): LigneLue => ({ ticket, title, state: "open", served: false, ferme: false, pr: null });

export function ouvrirDecoupage(atelier: Atelier) {
  const { journal, github, noter, avertir, arrete } = atelier;
  const { base } = journal;
  // Ce que GitHub a dit d'un ticket fermé, gardé tant qu'il ne rouvre pas : un
  // ticket fermé ne se relit pas à chaque tour. Cache, pas état.
  const fermes = new Map<number, LigneLue>();
  // La liste que chaque épique porte, telle qu'écrite ou trouvée : une liste
  // qui ne change pas ne relit pas l'épique.
  const ecrits = new Map<number, string>();

  // Demande le découpage ; s'il rend des tickets que le code refuse (zone
  // d'un dossier de produit entier, attente entre zones disjointes), le
  // refait une fois en disant pourquoi. Le second rendu fait foi : s'il a
  // encore des défauts, on le garde et on l'avertit — `separer` tient seul le
  // recouvrement, et le chef relit le découpage.
  const demanderDecoupage = async (sujet: { numero: number; prefixe: string; nom: string }, mission: Parameters<typeof consigneDeDecoupage>[0]): Promise<Reponse<Decoupe> | null> => {
    const communs = communsDuRail(base);
    // Le plan lu est celui dont le découpage juge ce qui est d'interface ; un
    // plan illisible est vide, donc inconnu.
    const lire = (message: string | null) => lireDecoupage(message, mission.fichiers.length === 0 ? null : mission.fichiers);
    const reponse = await atelier.demander(sujet, consigneDeDecoupage(mission), lire);
    if (!reponse || "illisible" in reponse || reponse.valeur.quoi !== "tickets") return reponse;
    const defauts = defautsDeDecoupage(reponse.valeur.tickets, communs);
    if (defauts.length === 0 || arrete() || atelier.eteint()) return reponse;
    const refus = `Ton découpage précédent est refusé par le code, à refaire une seule fois :\n${defauts.map((defaut) => `- ${defaut}`).join("\n")}`;
    const seconde = await atelier.demander(sujet, consigneDeDecoupage({ ...mission, commentaires: [...mission.commentaires, refus] }), lire);
    if (!seconde) return reponse;
    if (!("illisible" in seconde) && seconde.valeur.quoi === "tickets") {
      const restes = defautsDeDecoupage(seconde.valeur.tickets, communs);
      if (restes.length > 0) avertir(`brigade : découpage de #${sujet.numero} refait, mais il garde ${restes.length} défaut${restes.length > 1 ? "s" : ""} — ${restes.join(" ; ")}`);
    }
    return seconde;
  };

  const dire = (epic: IssueOuverte, connu: Decoupage): string => {
    switch (connu.state) {
      case "split": {
        const nes = new Map(ticketsDEpique(base, epic.number).map((ticket) => [ticket.index, ticket.ticket]));
        const numero = (rang: number) => `#${nes.get(rang) ?? "?"}`;
        // Les dépendances que le code a posées : des zones qui se recouvraient.
        const raccords = connu.tickets.flatMap((prevu, i) =>
          (prevu.overlaps ?? []).map(({ index, path }) => `- ${numero(i + 1)} awaits ${numero(index)}: both own \`${path}\``),
        );
        return [
          MARQUEUR_MANAGER,
          `**Manager — epic split into ${connu.tickets.length} ticket${connu.tickets.length > 1 ? "s" : ""}.** They are created, calibrated and fired; what becomes of them reads in the list at the bottom of the epic.`,
          "",
          `**Why these tickets.** ${connu.reason}`,
          "",
          `**Why this order.** ${connu.order ?? ""}`,
          "",
          "| # | Ticket | Awaiting | Zone | Calibration |",
          "|---|---|---|---|---|",
          ...connu.tickets.map(
            (prevu, i) =>
              `| ${numero(i + 1)} | ${prevu.title.replace(/\|/g, "\\|")} | ${prevu.waitsFor.map(numero).join(", ") || "none"} | ${prevu.zone.map((chemin) => `\`${chemin}\``).join(", ")} | \`${prevu.model}\` / \`${prevu.effort}\`${prevu.cook === "design" ? " · design cook" : ""} |`,
          ),
          ...(raccords.length === 0
            ? []
            : [
                "",
                "**Zones that overlapped.** Two tickets that can start at the same time do not own the same file: where the split gave one to two tickets without saying which goes first, the second awaits the first.",
                "",
                ...raccords,
              ]),
          "",
          `This split is yours now. Close a ticket: it will not be born again. Add one by writing \`${reference(epic.number)}\` in its body: it enters the list. Change a criterion, a card, a calibration: nothing is rewritten. The manager never splits an epic again.`,
          "",
          atelier.signature(connu.run, "Split"),
        ].join("\n");
      }
      case "asked":
        return [
          MARQUEUR_MANAGER,
          MARQUEUR_QUESTION,
          "**Manager — epic not split: a question.**",
          "",
          connu.reason,
          "",
          "Answer here, or edit the epic: it will be read again, and split if the answer is enough. No ticket is created until then — and nothing else awaits this answer: the rest of the rail goes on.",
          "",
          atelier.signature(connu.run, "Read"),
        ].join("\n");
      case "skipped":
        return [
          MARQUEUR_MANAGER,
          `**Manager — epic already split: no ticket created.** ${connu.reason}`,
          "",
          "If it is not, say so here or edit the epic: it will be read again.",
          "",
          atelier.signature(connu.run, "Read"),
        ].join("\n");
      case "failed":
        return [
          MARQUEUR_MANAGER,
          `**Manager — unreadable split.** The split of this epic gave nothing the code can read (${connu.reason}): no ticket is created.`,
          "",
          "It will be read again when it changes; until then, its tickets are written by hand.",
          "",
          atelier.signature(connu.run, "Read"),
        ].join("\n");
    }
  };

  // Note ce que le jugement a rendu. Un découpage est une intention : rien
  // n'est encore créé.
  const retenir = (epic: number, etat: string, reponse: Reponse<Decoupe>) => {
    const commun = { run: reponse.run, fingerprint: etat };
    if ("illisible" in reponse) {
      noter(epic, { type: "manager.split-failed", payload: { ...commun, reason: reponse.illisible } });
      avertir(`brigade : découpage illisible sur l'épique #${epic} (${reponse.illisible}) — aucun ticket n'est créé`);
      return;
    }
    const { valeur } = reponse;
    if (valeur.quoi === "question") noter(epic, { type: "manager.split-asked", payload: { ...commun, question: valeur.question } });
    else if (valeur.quoi === "deja") noter(epic, { type: "manager.split-skipped", payload: { ...commun, reason: valeur.reason } });
    else noter(epic, { type: "manager.split", payload: { ...commun, reason: valeur.reason, order: valeur.order, tickets: separer(valeur.tickets, communsDuRail(base)) } });
  };

  // Porte sur GitHub les tickets d'un découpage qui n'y sont pas encore, dans
  // l'ordre : l'issue, sa fiche, puis `fire` — une station ne doit pas prendre
  // un ticket dont la dépendance n'est pas encore lisible. Rend vrai quand
  // tous sont nés et lancés.
  const creer = async (epic: IssueOuverte, connu: Decoupage): Promise<boolean> => {
    // Les issues nées depuis le découpage : lues une fois, et seulement si une
    // création annoncée est restée sans suite.
    let recentes: IssueOuverte[] | null = null;
    for (const [i, prevu] of connu.tickets.entries()) {
      const rang = i + 1;
      if (arrete() || atelier.eteint()) return false;
      const nes = ticketsDEpique(base, epic.number);
      const numeroDe = (autre: number) => nes.find((ticket) => ticket.index === autre)?.ticket ?? 0;
      const ne = nes.find((ticket) => ticket.index === rang);
      let numero = ne?.ticket;
      let neuf = false;
      if (numero === undefined) {
        if (creationsAnnoncees(base, epic.number).includes(rang)) {
          recentes ??= await github.issuesDepuis(new Date(Date.parse(connu.at) - MARGE_MS).toISOString());
          if (arrete()) return false;
          // La marque ne vaut que sur une issue de confiance : n'importe qui
          // peut en ouvrir une qui la porte, et elle partirait en cuisine.
          numero = recentes.find((issue) => {
            const marquee = marqueDe(issue.body);
            return DE_CONFIANCE.includes(issue.association) && marquee?.epic === epic.number && marquee.index === rang;
          })?.number;
        } else noter(epic.number, { type: "manager.split-creating", payload: { index: rang } });
        const retrouve = numero !== undefined;
        if (numero === undefined) {
          const labels = [`model:${prevu.model}`, `effort:${prevu.effort}`, ...(prevu.cook === "design" ? [LABEL_COOK_DESIGN] : []), ...priorites(epic.labels)];
          numero = await github.creerIssue({ titre: prevu.title, corps: corpsDuTicket(epic.number, rang, prevu), labels });
          neuf = true;
          if (arrete()) return false;
        }
        noter(numero, { type: "manager.split-created", payload: { epic: epic.number, index: rang, reconciled: retrouve } });
      }
      if (ne?.fired) continue;
      // Un ticket retrouvé peut déjà porter sa fiche : elle ne se pose pas deux
      // fois. Seule compte celle que le rail lirait — celle d'un tiers ne
      // dispense pas de poser la bonne.
      const fichee =
        !neuf && (await github.commentaires(numero)).some((commentaire) => DE_CONFIANCE.includes(commentaire.association) && porteFiche(commentaire.body));
      if (arrete()) return false;
      if (!fichee) await github.commenter(numero, ficheDuTicket(prevu, numeroDe));
      await github.labelliser(numero, [LABEL]);
      if (arrete()) return false;
      atelier.surLeRail?.();
      noter(numero, { type: "manager.split-fired", payload: { epic: epic.number, index: rang } });
    }
    noter(epic.number, { type: "manager.split-done", payload: {} });
    return true;
  };

  return {
    // Mène le découpage d'une épique aussi loin qu'il peut aller : le jugement
    // s'il manque pour cet état, les tickets, puis ce qu'il y a à en dire.
    // `commentaires` : ce qui fait l'état de l'épique. `echanges` : les mêmes,
    // et les questions que le manager y a posées — ce que le découpage lit.
    // Rend vrai quand il ne reste rien à faire.
    async traiter(epic: IssueOuverte, commentaires: string[], echanges: string[] = commentaires): Promise<boolean> {
      let connu = decoupageDe(base, epic.number);
      if (connu?.state !== "split") {
        const etat = empreinteDEpique(epic, commentaires);
        if (connu?.fingerprint !== etat) {
          if (!atelier.peutJuger()) return false;
          let fichiers: string[] = [];
          try {
            fichiers = atelier.fichiers();
          } catch (erreur) {
            avertir(`brigade : plan du dépôt illisible, l'épique #${epic.number} est découpée sans lui — ${message(erreur)}`);
          }
          const mission = { depot: atelier.depotGitHub, issue: epic, commentaires: echanges, fichiers, communs: communsDuRail(base), capacites: capacitesFournies(base) };
          const suite = await demanderAvecRelance(
            () => demanderDecoupage({ numero: epic.number, prefixe: "decoupe", nom: "découpage" }, mission),
            async () => (await atelier.jugerSeul?.(epic, commentaires, etat)) ?? false,
          );
          if ("seul" in suite) {
            // Jugée comme un ticket : son découpage illisible est noté, pour
            // qu'elle ne soit pas redécoupée tant qu'elle ne change pas.
            if (!suite.seul) return false;
            noter(epic.number, { type: "manager.split-failed", payload: { run: "juge-seul", fingerprint: etat, reason: "découpage illisible deux fois — jugée comme un ticket seul" } });
            connu = decoupageDe(base, epic.number);
          } else {
            const { reponse } = suite;
            if (!reponse) return false;
            retenir(epic.number, etat, reponse);
            connu = decoupageDe(base, epic.number);
          }
        }
      }
      if (!connu) return true;
      if (arrete() || atelier.eteint()) return false;
      try {
        if (connu.state === "split" && !connu.done) {
          // Une épique fermée n'est jamais découpée. La liste lue en début de
          // tour a l'âge du jugement : l'état se relit juste avant de créer.
          const fraiche = await github.issue(epic.number);
          if (arrete()) return false;
          if (fraiche?.state !== "open") return true;
          if (!(await creer(epic, connu))) return false;
          connu = decoupageDe(base, epic.number) ?? connu;
        }
        if (connu.commented) return true;
        await github.commenter(epic.number, dire(epic, connu));
      } catch (erreur) {
        if (!arrete()) avertir(`brigade : découpage de l'épique #${epic.number} interrompu, il reprendra où il en est — ${message(erreur)}`);
        return false;
      }
      if (arrete()) return false;
      noter(epic.number, { type: "manager.split-commented", payload: {} });
      return true;
    },

    // Redécoupe un ticket que la pass a refusé : il devient l'épique de ses
    // sous-tickets. Rien n'est écrit ici : le découpage rendu se note par
    // `retenir`, que l'appelant joue dans la transaction où il vérifie qu'il
    // tient toujours le ticket — un découpage noté ferait naître des
    // sous-tickets quoi qu'il soit arrivé au parent entre-temps. Les tickets
    // naissent ensuite comme ceux d'une épique, par `traiter`. `echec` : ce
    // qui a échoué, donné au découpage comme un commentaire de plus. Rend null
    // si le jugement n'a pas abouti, et ce qui l'empêche s'il ne rend pas de
    // tickets.
    async redecouper(ticket: IssueOuverte, commentaires: string[], echec: string): Promise<{ retenir: () => void } | { impossible: string } | null> {
      if (decoupageDe(base, ticket.number)?.state === "split") return { retenir: () => {} };
      if (!atelier.peutJuger()) return null;
      let fichiers: string[] = [];
      try {
        fichiers = atelier.fichiers();
      } catch (erreur) {
        avertir(`brigade : plan du dépôt illisible, le ticket #${ticket.number} est redécoupé sans lui — ${message(erreur)}`);
      }
      const reponse = await demanderDecoupage({ numero: ticket.number, prefixe: "decoupe", nom: "redécoupage" }, { depot: atelier.depotGitHub, issue: ticket, commentaires: [...commentaires, echec], fichiers, communs: communsDuRail(base), capacites: capacitesFournies(base) });
      if (!reponse) return null;
      if ("illisible" in reponse) return { impossible: reponse.illisible };
      const { valeur } = reponse;
      if (valeur.quoi === "question") return { impossible: `the split asks: ${valeur.question}` };
      if (valeur.quoi === "deja") return { impossible: valeur.reason };
      return { retenir: () => retenir(ticket.number, empreinteDEpique(ticket, commentaires), reponse) };
    },

    // Ce que la liste des issues ouvertes dit des tickets des épiques : ceux
    // que le chef y rattache, ceux qu'il ferme ou rouvre. Sans E/S.
    observer(ouvertes: IssueOuverte[]): void {
      const presentes = new Set(ouvertes.map((issue) => issue.number));
      for (const issue of ouvertes) {
        const epic = epiqueDe(issue.body);
        if (epic === null || epic === issue.number || neDUnDecoupage(issue.body) || !DE_CONFIANCE.includes(issue.association)) continue;
        if (ticketDEpique(base, issue.number) || decoupageDe(base, epic)?.state !== "split") continue;
        noter(issue.number, { type: "manager.split-adopted", payload: { epic, title: issue.title } });
      }
      for (const { epic } of epiquesDecoupees(base)) {
        for (const ticket of ticketsDEpique(base, epic)) {
          const open = presentes.has(ticket.ticket);
          if (ticket.open !== open) noter(ticket.ticket, { type: "manager.split-seen", payload: { epic, open } });
        }
      }
    },

    // Tient à jour, dans le corps de chaque épique ouverte, la liste de ses
    // tickets et de leur état, lus sur GitHub seul (#2618) — et ferme celle
    // dont tous les tickets sont fermés, servis ou abandonnés. Une épique est
    // une issue dont le corps porte la liste, ou que ce manager a découpée.
    // Ses tickets : ceux que la liste nomme, ceux que le découpage a fait
    // naître, et les issues de confiance qui disent en venir. Un ticket ouvert
    // ne coûte aucune lecture ; un ticket fermé se lit une fois par process.
    // Rend les épiques fermées.
    async suivre(ouvertes: IssueOuverte[]): Promise<Set<number>> {
      const fermees = new Set<number>();
      const parNumero = new Map(ouvertes.map((issue) => [issue.number, issue]));
      for (const lu of [...fermes.keys()]) if (parNumero.has(lu)) fermes.delete(lu);
      for (const epic of ouvertes) {
        if (arrete()) return fermees;
        const connu = decoupageDe(base, epic.number);
        // Ses tickets naissent encore : `traiter` les finit avant.
        if (connu?.state === "split" && !connu.done) continue;
        if (!porteListe(epic.body) && connu?.state !== "split") continue;
        const numeros = new Set([...ticketsDeLaListe(epic.body), ...ticketsDEpique(base, epic.number).map((ticket) => ticket.ticket)]);
        for (const issue of ouvertes) if (epiqueDe(issue.body) === epic.number && DE_CONFIANCE.includes(issue.association)) numeros.add(issue.number);
        numeros.delete(epic.number);
        if (numeros.size === 0) continue;
        let lignes: LigneLue[];
        try {
          lignes = [];
          for (const numero of numeros) {
            const ligne = await lireLigne(numero, parNumero.get(numero));
            if (ligne) lignes.push(ligne);
          }
        } catch (erreur) {
          if (!arrete()) avertir(`brigade : tickets de l'épique #${epic.number} non lus, elle reprendra au prochain tour — ${message(erreur)}`);
          continue;
        }
        if (arrete()) return fermees;
        if (lignes.length === 0) continue;
        const bloc = rendreListe(epic.number, lignes);
        if (ecrits.get(epic.number) !== bloc && avecListe(epic.body, bloc) !== epic.body) {
          try {
            // Relu juste avant d'écrire : le chef a pu l'éditer. Une épique
            // disparue n'a plus de corps où écrire.
            const corps = (await github.issue(epic.number))?.body;
            if (corps !== undefined && avecListe(corps, bloc) !== corps) await github.ecrireCorps(epic.number, avecListe(corps, bloc));
          } catch (erreur) {
            if (!arrete()) avertir(`brigade : liste des tickets non écrite dans l'épique #${epic.number} — ${message(erreur)}`);
            continue;
          }
          if (arrete()) return fermees;
        }
        ecrits.set(epic.number, bloc);
        if (lignes.every((ligne) => ligne.ferme) && (await fermerTerminee(epic.number, lignes))) fermees.add(epic.number);
      }
      return fermees;
    },
  };

  // Un ticket de l'épique, tel que GitHub le dit. Ouvert, la liste des issues
  // ouvertes suffit ; fermé, son issue et la PR qui l'a fermée se lisent une
  // fois, gardées tant qu'il ne rouvre pas. Un numéro que GitHub ne connaît
  // pas n'est pas un ticket : null.
  async function lireLigne(numero: number, ouverte: IssueOuverte | undefined): Promise<LigneLue | null> {
    if (ouverte) return ouvert(numero, ouverte.title);
    const connue = fermes.get(numero);
    if (connue) return connue;
    const lue = await github.issue(numero);
    if (lue === null || lue.pr === true) return null;
    if (lue.state === "open") return ouvert(numero, lue.title);
    // Servi par une PR mergée : celle que GitHub dit avoir fermé l'issue
    // (`Closes #n`), sinon celle mergée depuis la branche du cook, même sans
    // ligne `Closes`.
    let pr = await github.prQuiFerme(numero);
    if (!pr?.merged) {
      const debranche = await github.prDeBranche(brancheDuTicket(numero));
      pr = debranche?.merged ? debranche : pr;
    }
    const title = lue.title;
    const ligne: LigneLue = pr?.merged ? { ticket: numero, title, state: "served", served: true, ferme: true, pr: pr.url } : { ticket: numero, title, state: "dropped", served: false, ferme: true, pr: null };
    fermes.set(numero, ligne);
    return ligne;
  }

  // Tous les tickets de l'épique sont fermés : elle se ferme, `completed`, avec
  // un commentaire qui nomme ses tickets servis et ses tickets abandonnés —
  // c'est lui que le second lit, ni label ni carte. Des abandons ne la
  // retiennent pas ouverte. Une épique que le chef a déjà fermée n'est pas
  // commentée ; le commentaire ne se pose pas deux fois si la fermeture
  // échoue. Rend vrai si elle est fermée.
  async function fermerTerminee(epic: number, lignes: LigneLue[]): Promise<boolean> {
    try {
      const issue = await github.issue(epic);
      if (arrete()) return false;
      if (issue?.state !== "open") return false;
      const commentaires = await github.commentaires(epic);
      if (!commentaires.some((commentaire) => commentaire.body.includes(MARQUEUR_TERMINEE) || commentaire.body.includes(MARQUEUR_SERVIE))) await github.commenter(epic, direTerminee(lignes));
      if (arrete()) return false;
      await github.fermerIssue(epic);
    } catch (erreur) {
      if (!arrete()) avertir(`brigade : épique #${epic} non fermée, elle reprendra au prochain tour — ${message(erreur)}`);
      return false;
    }
    if (!arrete()) noter(epic, { type: "manager.split-served", payload: {} });
    return true;
  }

  function direTerminee(lignes: LigneLue[]): string {
    const servis = lignes.filter((ligne) => ligne.served);
    const abandonnes = lignes.filter((ligne) => !ligne.served);
    const nommer = (ligne: LigneLue) => `- #${ligne.ticket} ${ligne.title}${ligne.pr ? ` — ${ligne.pr}` : ""}`;
    return [
      MARQUEUR_MANAGER,
      MARQUEUR_TERMINEE,
      abandonnes.length === 0
        ? `**Manager — epic served, I close it.** Its ${lignes.length} tickets are served:`
        : `**Manager — epic finished, I close it.** Its ${lignes.length} tickets are closed, ${abandonnes.length} without being served.`,
      ...(abandonnes.length === 0
        ? ["", ...servis.map(nommer)]
        : [
            "",
            `**Served** (${servis.length}):`,
            ...(servis.length === 0 ? ["- none"] : servis.map(nommer)),
            "",
            `**Dropped** (${abandonnes.length}), closed with no merged PR:`,
            ...abandonnes.map(nommer),
            "",
            `⚠️ ${abandonnes.length > 1 ? "These dropped tickets delivered nothing" : "This dropped ticket delivered nothing"}: what ${abandonnes.length > 1 ? "they were" : "it was"} to do of the epic is not done. It closes anyway; the second says whether a ticket is left to open.`,
          ]),
    ].join("\n");
  }
}
