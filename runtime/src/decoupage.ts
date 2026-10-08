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
import { consigneDeDecoupage, corpsDuTicket, empreinteDEpique, ficheDuTicket, lireDecoupage, marqueDe, MARQUEUR_QUESTION, neDUnDecoupage, separer, type Decoupe } from "./decouper.ts";
import { avecListe, epiqueDe, reference, rendreListe, type LigneDeListe } from "./epique.ts";
import type { FaitManager } from "./evenements/manager.ts";
import { porteFiche } from "./fiche.ts";
import { LABEL, type GitHub, type IssueOuverte } from "./github.ts";
import type { Journal } from "./journal.ts";
import { MARQUEUR_MANAGER } from "./juger.ts";
import { creationsAnnoncees, decoupageDe, epiquesDecoupees, ticketDEpique, ticketsDEpique, type Decoupage, type TicketDEpique } from "./projections/decoupages.ts";
import { communsDuRail, sortDuTicket, ticketDuRail } from "./projections/rail.ts";
import { direRetenue, nomAbandon, nomEtat, retenue } from "./rail.ts";

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
  // Le runtime s'arrête : plus rien ne s'écrit.
  arrete: () => boolean;
  // Le chef a éteint le manager : ce qui est décidé reste au journal.
  eteint: () => boolean;
  avertir: (message: string) => void;
  // Ce qu'un jugement a coûté, tel qu'il se signe sur l'issue.
  signature: (run: string | null, verbe: string) => string;
};

// L'horloge de GitHub n'est pas celle du runtime : un ticket se cherche à
// partir d'un peu avant l'heure du découpage.
const MARGE_MS = 600_000;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const priorites = (labels: string[]) => labels.filter((label) => /^prio:[1-9]$/.test(label));

// L'état d'un ticket tel que l'épique le montre. Aucune date : la liste ne se
// réécrit que quand un état change.
function ligne(journal: Journal, ticket: TicketDEpique): LigneDeListe {
  const { base } = journal;
  const sur = ticketDuRail(base, ticket.ticket);
  const title = sur?.title ?? ticket.title;
  if (sur) {
    const etat =
      sur.state === "taken"
        ? "en cuisine"
        : sur.state === "86"
          ? `86 (${sur.reason})`
          : retenue(sur) === "bloque"
            ? `bloqué — ${direRetenue(sur)}`
            : (direRetenue(sur) ?? nomEtat(sur.state));
    return { ticket: ticket.ticket, title, state: etat, served: sur.state === "served" };
  }
  const sort = sortDuTicket(base, ticket.ticket);
  if (sort?.outcome === "served") return { ticket: ticket.ticket, title, state: "servi", served: true };
  if (sort) return { ticket: ticket.ticket, title, state: `abandonné (${nomAbandon(sort.reason ?? "")})`, served: false };
  // Le rail n'en sait rien : pas lancé, ou lancé depuis moins d'un sondage.
  return { ticket: ticket.ticket, title, state: ticket.open ? "pas sur le rail" : "fermé", served: false };
}

export function ouvrirDecoupage(atelier: Atelier) {
  const { journal, github, noter, avertir, arrete } = atelier;
  const { base } = journal;

  const dire = (epic: IssueOuverte, connu: Decoupage): string => {
    switch (connu.state) {
      case "split": {
        const nes = new Map(ticketsDEpique(base, epic.number).map((ticket) => [ticket.index, ticket.ticket]));
        const numero = (rang: number) => `#${nes.get(rang) ?? "?"}`;
        // Les dépendances que le code a posées : des zones qui se recouvraient.
        const raccords = connu.tickets.flatMap((prevu, i) =>
          (prevu.overlaps ?? []).map(({ index, path }) => `- ${numero(i + 1)} attend ${numero(index)} : tous deux possèdent \`${path}\``),
        );
        return [
          MARQUEUR_MANAGER,
          `**Manager — épique découpée en ${connu.tickets.length} ticket${connu.tickets.length > 1 ? "s" : ""}.** Ils sont créés, calibrés et lancés ; ce qu'ils deviennent se lit dans la liste en bas de l'épique.`,
          "",
          `**Pourquoi ces tickets.** ${connu.reason}`,
          "",
          `**Pourquoi cet ordre.** ${connu.order ?? ""}`,
          "",
          "| # | Ticket | Attend | Zone | Calibrage |",
          "|---|---|---|---|---|",
          ...connu.tickets.map(
            (prevu, i) =>
              `| ${numero(i + 1)} | ${prevu.title.replace(/\|/g, "\\|")} | ${prevu.waitsFor.map(numero).join(", ") || "rien"} | ${prevu.zone.map((chemin) => `\`${chemin}\``).join(", ")} | \`${prevu.model}\` / \`${prevu.effort}\` |`,
          ),
          ...(raccords.length === 0
            ? []
            : [
                "",
                "**Zones qui se recouvraient.** Deux tickets qui peuvent partir en même temps ne possèdent pas le même fichier : là où le découpage en donnait un à deux tickets sans dire lequel passe d'abord, le second attend le premier.",
                "",
                ...raccords,
              ]),
          "",
          `Ce découpage est à toi désormais. Ferme un ticket : il ne renaîtra pas. Ajoutes-en un en écrivant \`${reference(epic.number)}\` dans son corps : il entre dans la liste. Change un critère, une fiche, un calibrage : rien n'est réécrit. Le manager ne redécoupe jamais une épique.`,
          "",
          atelier.signature(connu.run, "Découpé"),
        ].join("\n");
      }
      case "asked":
        return [
          MARQUEUR_MANAGER,
          MARQUEUR_QUESTION,
          "**Manager — épique non découpée : une question.**",
          "",
          connu.reason,
          "",
          "Réponds ici, ou édite l'épique : elle sera relue, et découpée si la réponse suffit. Aucun ticket n'est créé d'ici là — et rien d'autre n'attend cette réponse : le reste du rail avance.",
          "",
          atelier.signature(connu.run, "Lu"),
        ].join("\n");
      case "skipped":
        return [
          MARQUEUR_MANAGER,
          `**Manager — épique déjà découpée : aucun ticket créé.** ${connu.reason}`,
          "",
          "Si ce n'est pas le cas, dis-le ici ou édite l'épique : elle sera relue.",
          "",
          atelier.signature(connu.run, "Lu"),
        ].join("\n");
      case "failed":
        return [
          MARQUEUR_MANAGER,
          `**Manager — découpage illisible.** Le découpage de cette épique n'a rien rendu que le code sache lire (${connu.reason}) : aucun ticket n'est créé.`,
          "",
          "Elle sera relue quand elle changera ; d'ici là, ses tickets s'écrivent à la main.",
          "",
          atelier.signature(connu.run, "Lu"),
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
          const labels = [`model:${prevu.model}`, `effort:${prevu.effort}`, ...priorites(epic.labels)];
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
          const consigne = consigneDeDecoupage({ depot: atelier.depotGitHub, issue: epic, commentaires: echanges, fichiers, communs: communsDuRail(base) });
          const reponse = await atelier.demander({ numero: epic.number, prefixe: "decoupe", nom: "découpage" }, consigne, lireDecoupage);
          if (!reponse) return false;
          retenir(epic.number, etat, reponse);
          connu = decoupageDe(base, epic.number);
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

    // Tient à jour, dans le corps de chaque épique découpée, la liste de ses
    // tickets et de leur état. Ne lit que le journal tant que rien n'a changé.
    async suivre(): Promise<void> {
      for (const connu of epiquesDecoupees(base)) {
        if (arrete()) return;
        if (!connu.done) continue;
        const bloc = rendreListe(connu.epic, ticketsDEpique(base, connu.epic).map((ticket) => ligne(journal, ticket)));
        const digest = createHash("sha256").update(bloc).digest("hex").slice(0, 16);
        if (digest === connu.listed) continue;
        try {
          // Relu juste avant d'écrire : le chef a pu l'éditer. Une épique
          // disparue n'a plus de corps où écrire.
          const corps = (await github.issue(connu.epic))?.body;
          if (corps !== undefined && avecListe(corps, bloc) !== corps) await github.ecrireCorps(connu.epic, avecListe(corps, bloc));
        } catch (erreur) {
          if (!arrete()) avertir(`brigade : liste des tickets non écrite dans l'épique #${connu.epic} — ${message(erreur)}`);
          continue;
        }
        if (arrete()) return;
        noter(connu.epic, { type: "manager.split-listed", payload: { digest } });
      }
    },
  };
}
