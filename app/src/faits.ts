// Ce que l'app dessine : les faits que la box rend dans une forme faite pour un
// programme (`brigade <projet> faits` — docs/runtime.md, « Les faits, pour un
// programme »). L'app n'y déduit rien : un état est un mot lu, un compteur un
// nombre lu. Une sortie qui n'est pas cette forme n'est pas dessinée du tout —
// ce que la box a rendu se lit à sa place. Et une couleur ne se pose que sur un
// mot des deux listes fermées : un mot inconnu s'affiche tel quel, sans couleur.
import type { Echec, Lecture } from "./box.ts";

export const COMMANDE = "faits";

// La forme, telle que le runtime la fige (runtime/src/etat.ts, `Faits`).
export type Faits = {
  etat: string;
  lu: string;
  dernierTick: string | null;
  compteurs: { rail: number; auTravail: number; aLaPass: number; attend: number; livres24h: number };
  dernierEvenement: { seq: number; at: string; type: string; ticket: number | null } | null;
  rail: { ticket: number; etat: string; titre: string; url: string }[];
};

// Ce que la vue dessine d'un projet, prêt à poser : elle n'y calcule rien.
// `ton` : la couleur du mot d'état — absente, le mot n'est pas de la liste fermée.
// `arretee` : la bannière d'arrêt se pose. `ouvrable` : ce ticket s'ouvre sur son issue.
export type Tableau = {
  etat: string;
  ton?: string;
  arretee: boolean;
  tick: string;
  compteurs: { libelle: string; nombre: number }[];
  evenement: string;
  rail: { ticket: number; etat: string; ton?: string; titre: string; ouvrable: boolean }[];
};

// Ce qu'une lecture de `faits` donne à la vue : le tableau ; ou, sous un `titre`
// qui dit lequel, ce que la box a `rendu` à la place des faits, mot pour mot, et
// en quoi ce n'est pas la forme (`informe`) ; ou l'échec de la veille, tel quel.
export type Dessinable = { projet: string; demande: number; a: string } & ({ tableau: Tableau } | { titre: string; informe: string; rendu: string } | ({ titre: string } & Echec));

class Informe extends Error {}

const refuser = (champ: string, attendu: string): never => {
  throw new Informe(`« ${champ} » n'est pas ${attendu}`);
};
const objet = (valeur: unknown, champ: string): Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : refuser(champ, "un objet");
const texte = (valeur: unknown, champ: string): string => (typeof valeur === "string" ? valeur : refuser(champ, "un texte"));
const entier = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : refuser(champ, "un nombre entier positif"));
const heure = (valeur: unknown, champ: string): string => (typeof valeur === "string" && !Number.isNaN(Date.parse(valeur)) ? valeur : refuser(champ, "une heure"));
const ouRien = <T>(valeur: unknown, champ: string, lire: (valeur: unknown, champ: string) => T): T | null => (valeur === null ? null : lire(valeur, champ));

// La sortie de `faits`, champ pour champ — ou en quoi elle n'est pas la forme.
// Rien n'y est complété : un champ qui manque refuse la forme entière. Un champ
// de plus est laissé de côté, un mot d'état inconnu est gardé.
export function comprendre(sortie: string): Faits | { informe: string } {
  if (sortie.trim() === "") return { informe: "la commande n'a rien rendu" };
  let lu: unknown;
  try {
    lu = JSON.parse(sortie);
  } catch {
    return { informe: "ce n'est pas du JSON" };
  }
  try {
    const racine = typeof lu === "object" && lu !== null && !Array.isArray(lu) ? (lu as Record<string, unknown>) : refuser("la sortie", "un objet");
    const compteurs = objet(racine.compteurs, "compteurs");
    const evenement = ouRien(racine.dernierEvenement, "dernierEvenement", objet);
    return {
      etat: texte(racine.etat, "etat"),
      lu: heure(racine.lu, "lu"),
      dernierTick: ouRien(racine.dernierTick, "dernierTick", heure),
      compteurs: {
        rail: entier(compteurs.rail, "compteurs.rail"),
        auTravail: entier(compteurs.auTravail, "compteurs.auTravail"),
        aLaPass: entier(compteurs.aLaPass, "compteurs.aLaPass"),
        attend: entier(compteurs.attend, "compteurs.attend"),
        livres24h: entier(compteurs.livres24h, "compteurs.livres24h"),
      },
      dernierEvenement:
        evenement === null
          ? null
          : {
              seq: entier(evenement.seq, "dernierEvenement.seq"),
              at: heure(evenement.at, "dernierEvenement.at"),
              type: texte(evenement.type, "dernierEvenement.type"),
              ticket: ouRien(evenement.ticket, "dernierEvenement.ticket", entier),
            },
      rail: (Array.isArray(racine.rail) ? racine.rail : refuser("rail", "une liste")).map((ticket: unknown, rang) => {
        const lequel = `rail[${rang}]`;
        const lu = objet(ticket, lequel);
        return { ticket: entier(lu.ticket, `${lequel}.ticket`), etat: texte(lu.etat, `${lequel}.etat`), titre: texte(lu.titre, `${lequel}.titre`), url: texte(lu.url, `${lequel}.url`) };
      }),
    };
  } catch (erreur) {
    if (erreur instanceof Informe) return { informe: erreur.message };
    throw erreur;
  }
}

// Ce que l'app dit d'une lecture de `faits` en échec : le même cas que sous
// `status` (vue.js, `rendre`), avec les mêmes mots — le code de sortie le
// choisit. Sans cas, sur une box jointe, c'est `faits` qui n'a pas répondu : un
// runtime d'avant cette commande.
const TITRES: Readonly<Record<Exclude<Echec["cas"], null | "ssh-en-echec">, string>> = {
  "projet-inconnu": "JOINT, MAIS INCONNU DE LA BOX",
  "sans-droit": "JOINT, MAIS SANS LE DROIT DU GESTE",
  "commande-manque": "JOINT, MAIS UNE COMMANDE MANQUE SUR LA BOX",
  "node-inapte": "JOINT, MAIS LE NODE DE LA BOX NE CONVIENT PAS AU RUNTIME",
};
export function titreDEchec({ cas, atteinte }: Echec): string {
  if (cas !== null && cas !== "ssh-en-echec") return TITRES[cas];
  return atteinte ? "JOINT, MAIS `faits` N'A PAS RÉPONDU" : "PAS JOINT";
}

// Une lecture de la veille, et ce qui s'en dessine. Sans faits, rien n'est
// dessiné : le titre dit quel cas, et ce qui a été obtenu suit.
function lire(lecture: Lecture): { faits?: Faits; recue: Dessinable } {
  if ("erreur" in lecture) return { recue: { ...lecture, titre: titreDEchec(lecture) } };
  const { projet, demande, a } = lecture;
  const rendu = lecture.sorties.find(({ commande }) => commande === COMMANDE)?.texte ?? "";
  const faits = comprendre(rendu);
  if ("informe" in faits) return { recue: { projet, demande, a, titre: "LA BOX N'A PAS RENDU LA FORME DE `faits`", informe: faits.informe, rendu } };
  return { faits, recue: { projet, demande, a, tableau: tableau(faits) } };
}

export const dessiner = (lecture: Lecture): Dessinable => lire(lecture).recue;

// Les deux listes fermées de la forme, et la couleur de chaque mot.
const TONS_DE_PROJET = new Map([
  ["ouverte", "vert"],
  ["retenue", "jaune"],
  ["arrêtée", "rouge"],
  ["éteinte", "rouge"],
]);
const TONS_DE_TICKET = new Map([
  ["en attente", "gris"],
  ["BLOQUÉ", "rouge"],
  ["pris", "bleu"],
  ["en pass", "jaune"],
  ["servi", "vert"],
  ["86", "rouge"],
]);
// Le mot et, s'il est de la liste, sa couleur : un mot inconnu n'en porte aucune.
const colore = (tons: ReadonlyMap<string, string>, etat: string): { etat: string; ton?: string } => {
  const ton = tons.get(etat);
  return ton === undefined ? { etat } : { etat, ton };
};

// Une durée, dite comme `status` la dit.
export function duree(ms: number): string {
  const secondes = Math.max(0, Math.floor(ms / 1000));
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(minutes / (24 * 60))} j`;
}

// Un âge se compte entre deux heures de la box — celle du fait, celle de la
// lecture : l'horloge du poste n'y entre pas.
const avant = (fait: string, lu: string) => `${duree(Date.parse(lu) - Date.parse(fait))} avant la lecture`;

// Le dernier événement : son type s'affiche, il ne s'interprète pas.
export function evenement({ dernierEvenement, lu }: Faits): string {
  if (dernierEvenement === null) return "aucun : le journal est vide";
  const { type, ticket, at } = dernierEvenement;
  return [type, ...(ticket === null ? [] : [`#${ticket}`]), avant(at, lu)].join(" · ");
}

// L'écart entre le dernier tick et la lecture : affiché, jamais conclu.
export function tick({ dernierTick, lu }: Faits): string {
  return dernierTick === null ? "aucun tick : runtime arrêté, ou pas encore de tick depuis son démarrage" : `dernier tick ${avant(dernierTick, lu)}`;
}

// Seule une adresse https s'ouvre : rien de ce qu'une box rend n'est lancé
// comme un fichier ou un programme.
const ouvrable = (url: string) => URL.parse(url)?.protocol === "https:";

// Les faits, tels que la vue les pose : la pastille, les cinq compteurs dans
// l'ordre de la carte, le dernier événement, et le rail dans l'ordre de service.
export function tableau(faits: Faits): Tableau {
  const { compteurs } = faits;
  return {
    ...colore(TONS_DE_PROJET, faits.etat),
    arretee: faits.etat === BANNIERE.etat,
    tick: tick(faits),
    compteurs: [
      { libelle: "rail", nombre: compteurs.rail },
      { libelle: "au travail", nombre: compteurs.auTravail },
      { libelle: "à la pass", nombre: compteurs.aLaPass },
      { libelle: "t'attend", nombre: compteurs.attend },
      { libelle: "livrés 24 h", nombre: compteurs.livres24h },
    ],
    evenement: evenement(faits),
    rail: faits.rail.map(({ ticket, etat, titre, url }) => ({ ticket, ...colore(TONS_DE_TICKET, etat), titre, ouvrable: ouvrable(url) })),
  };
}

// La bannière d'arrêt : posée sur le « stop » du chef, avec ce qu'il implique
// (docs/runtime.md, « Les garde-fous ») et le bouton qui écrit la relance.
export const BANNIERE = {
  etat: "arrêtée",
  bouton: "reprendre",
  texte: ["CUISINE À L'ARRÊT — ton « stop » tient", "Tous les cooks en cours ont été arrêtés, et plus aucun n'est lancé — redémarrage du runtime compris, jusqu'à « reprendre »."],
} as const;

// Les derniers faits de chaque projet, tenus par le process principal : la vue
// nomme un projet et un ticket, jamais une adresse. Celle qui s'ouvre est celle
// que la box a donnée pour ce ticket, à la dernière lecture.
export function tenirFaits() {
  const tenus = new Map<string, Faits>();
  return {
    recevoir(lecture: Lecture): Dessinable {
      const { faits, recue } = lire(lecture);
      if (faits === undefined) tenus.delete(lecture.projet);
      else tenus.set(lecture.projet, faits);
      return recue;
    },
    adresse(projet: unknown, ticket: unknown): string | undefined {
      const url = typeof projet === "string" ? tenus.get(projet)?.rail.find((candidat) => candidat.ticket === ticket)?.url : undefined;
      return url !== undefined && ouvrable(url) ? url : undefined;
    },
    oublier(): void {
      tenus.clear();
    },
  };
}
