// Le mot au cook (#4047, épique #4043) : une ligne de texte que le chef envoie
// au cook d'un ticket en cuisine, sans ouvrir sa session. La commande
// `send-word` (`commande.ts`) l'accepte et le poste sur l'issue du ticket, où la
// pass et un cook d'après le lisent ; il attend dans la file du ticket
// (`file.ts`) que le tour du cook finisse — jamais il ne le coupe au milieu
// d'une édition —, et le tour suivant du cook le reçoit dans son entrée
// (`lanceur.ts`).
//
// Le contrat de `send-word`, que l'app suit aussi : `{ ticket, text }` en
// entrée, `{ ok: true }` ou `{ ok: false, reason }` en sortie, `reason` sur une
// seule ligne. Un ticket qui n'est pas en cuisine — en pass, servi, inconnu —
// est refusé : rien n'est posté, rien n'est mis en file.

// L'état du ticket, dans les mots du glossaire. `undefined` : inconnu.
export type EtatDuTicket = "taken" | "in pass" | "served" | "waiting" | "queued" | undefined;

// `reason` : sur un refus seulement, en une ligne.
export type Reponse = { ok: boolean; reason?: string };

// Les mots d'un ticket qui attendent la fin du tour de son cook. `prendre` les
// rend et les retire, du plus ancien au plus récent.
export type FileDesMots = {
  ajouter(ticket: number, texte: string): void;
  prendre(ticket: number): string[];
};

export type DependancesDuMot = {
  // L'état du ticket, lu là où il vit (son issue).
  etat(ticket: number): EtatDuTicket | Promise<EtatDuTicket>;
  // Poste un commentaire sur l'issue du ticket.
  commenter(ticket: number, texte: string): Promise<void>;
  // Le mot remis au cook, à la fin de son tour.
  livrer(ticket: number, texte: string): void | Promise<void>;
  // Par défaut, une file en mémoire : celle d'un seul process.
  file?: FileDesMots;
};

export type MotAuCook = {
  // La commande `send-word`.
  envoyer(demande: { ticket: number; text: string }): Promise<Reponse>;
  // Le cook du ticket commence un tour.
  debutDeTour(ticket: number): void;
  // Son tour finit : les mots en file lui sont remis, pour son tour suivant.
  finDeTour(ticket: number): Promise<void>;
  // Des mots remis attendent l'entrée de son tour suivant.
  aDesMots(ticket: number): boolean;
  // L'entrée de son tour suivant : `base`, et les mots remis, qui n'y attendent plus.
  entreeDuTour(ticket: number, base: string): string;
};

// La marque du commentaire posé sur l'issue.
const MARQUE_DU_MOT = "<!-- brigade:mot-au-cook -->";

// Le commentaire qui garde le mot sur l'issue, pour la pass et les cooks d'après.
const corpsDuMot = (texte: string) => `${MARQUE_DU_MOT}\n**A word from the chef to the cook.** It reaches the cook at the end of its current turn:\n\n> ${texte}`;

// Ce qu'un message d'erreur devient dans une raison : une seule ligne.
export const surUneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();

// Pourquoi le mot est refusé pour ce ticket dans cet état, ou null s'il est en cuisine.
function raisonDuRefus(ticket: number, etat: EtatDuTicket): string | null {
  switch (etat) {
    case "taken":
      return null;
    case "in pass":
      return `#${ticket} is in pass: no cook is cooking it, the pass judges its delivery`;
    case "served":
      return `#${ticket} is closed (served or dropped): no cook is cooking it`;
    case "waiting":
      return `#${ticket} is waiting on a third party: no cook is cooking it`;
    case "queued":
      return `#${ticket} is not taken: no cook is cooking it yet`;
    default:
      return `#${ticket} is unknown: no issue of the project has this number`;
  }
}

// L'entrée d'un tour, avec les mots du chef. En français : c'est la langue des
// consignes du cook.
function entreeAvecLesMots(base: string, mots: readonly string[]): string {
  const bloc = ["## Un mot du chef", "Le chef t'a envoyé ce mot pendant que tu cuisinais. Tiens-en compte dans ce tour :", ...mots.map((mot) => `> ${mot}`)].join("\n\n");
  return base === "" ? bloc : `${base}\n\n${bloc}`;
}

function fileEnMemoire(): FileDesMots {
  const mots = new Map<number, string[]>();
  return {
    ajouter: (ticket, texte) => void mots.set(ticket, [...(mots.get(ticket) ?? []), texte]),
    prendre: (ticket) => {
      const pris = mots.get(ticket) ?? [];
      mots.delete(ticket);
      return pris;
    },
  };
}

const message = (erreur: unknown) => surUneLigne(erreur instanceof Error ? erreur.message : String(erreur));

export function creerMotAuCook(dependances: DependancesDuMot): MotAuCook {
  const file = dependances.file ?? fileEnMemoire();
  const enTour = new Set<number>();
  const remis = new Map<number, string[]>();
  const refus = (reason: string): Reponse => ({ ok: false, reason: surUneLigne(reason) });

  return {
    async envoyer({ ticket, text }) {
      if (!Number.isInteger(ticket) || ticket < 1) return refus(`the ticket is a number, from 1: “${String(ticket)}”`);
      const texte = typeof text === "string" ? text.trim() : "";
      if (texte === "") return refus("the word is empty: write one line of text");
      if (/[\r\n]/.test(texte)) return refus("the word is one line of text: it has a line break");
      let etat: EtatDuTicket;
      try {
        etat = await dependances.etat(ticket);
      } catch (erreur) {
        return refus(`the state of #${ticket} could not be read: ${message(erreur)}`);
      }
      const raison = raisonDuRefus(ticket, etat);
      if (raison !== null) return refus(raison);
      try {
        await dependances.commenter(ticket, corpsDuMot(texte));
      } catch (erreur) {
        return refus(`the word could not be posted on #${ticket}, nothing is queued: ${message(erreur)}`);
      }
      try {
        file.ajouter(ticket, texte);
      } catch (erreur) {
        return refus(`the word is posted on #${ticket} but could not be queued for its cook: ${message(erreur)}`);
      }
      return { ok: true };
    },

    debutDeTour(ticket) {
      enTour.add(ticket);
    },

    async finDeTour(ticket) {
      if (!enTour.has(ticket)) return;
      enTour.delete(ticket);
      for (const mot of file.prendre(ticket)) {
        remis.set(ticket, [...(remis.get(ticket) ?? []), mot]);
        await dependances.livrer(ticket, mot);
      }
    },

    aDesMots: (ticket) => (remis.get(ticket)?.length ?? 0) > 0,

    entreeDuTour(ticket, base) {
      const mots = remis.get(ticket) ?? [];
      if (mots.length === 0) return base;
      remis.delete(ticket);
      return entreeAvecLesMots(base, mots);
    },
  };
}
