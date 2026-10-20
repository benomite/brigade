// Les leçons des cooks : chacune porte un id qui ne change jamais, et l'histoire
// de ce qui l'a proposée ou reconfirmée. Une rétro ne compare pas les leçons par
// leur texte : elle cite un id (reconfirmer) ou en fait naître un (proposer).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { RETRO_ORIGIN, type LessonOrigin } from "../carnet/carnet.ts";

export type Statut = "provisoire" | "promue";

// D'où vient une entrée : la rétro (sa référence) et le ticket qu'elle suit.
export type Origine = { retro: string; ticket: number };

export type Entree = Origine & { genre: "propose" | "reconfirme" };

// `origin` : d'où la leçon est née — une rétro, un renvoi de la pass ou une
// correction du chef (`carnet/carnet.ts`). Elle la garde jusqu'au carnet.
export type Lecon = { id: string; texte: string; statut: Statut; entrees: Entree[]; origin: LessonOrigin };

// `suivant` ne redescend jamais : un id retiré ne sert pas deux fois.
export type Carnet = { suivant: number; lecons: Lecon[] };

export class LeconInconnue extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`leçon inconnue : « ${id} » n'est l'id d'aucune leçon du carnet`);
    this.id = id;
  }
}

export const carnetVide = (): Carnet => ({ suivant: 1, lecons: [] });

const verifierOrigine = (o: Origine) => {
  if (!o.retro.trim()) throw new Error("une entrée de leçon réclame la référence de sa rétro");
  if (!Number.isInteger(o.ticket) || o.ticket <= 0) throw new Error(`une entrée de leçon réclame le numéro du ticket (reçu ${o.ticket})`);
};

// Fait naître une leçon provisoire, avec un id neuf. `naissance` : d'où elle
// naît, une rétro sauf mention contraire.
export function proposer(carnet: Carnet, texte: string, origine: Origine, naissance: LessonOrigin = RETRO_ORIGIN): { carnet: Carnet; id: string } {
  verifierOrigine(origine);
  if (!texte.trim()) throw new Error("une leçon proposée ne peut pas être vide");
  const id = `L${carnet.suivant}`;
  const lecon: Lecon = { id, texte: texte.trim(), statut: "provisoire", entrees: [{ genre: "propose", ...origine }], origin: { ...naissance } };
  return { carnet: { suivant: carnet.suivant + 1, lecons: [...carnet.lecons, lecon] }, id };
}

// Reconfirme une leçon existante : seule l'histoire grandit, l'id et le texte restent.
export function reconfirmer(carnet: Carnet, id: string, origine: Origine): Carnet {
  verifierOrigine(origine);
  if (!carnet.lecons.some((l) => l.id === id)) throw new LeconInconnue(id);
  return { ...carnet, lecons: carnet.lecons.map((l) => (l.id === id ? { ...l, entrees: [...l.entrees, { genre: "reconfirme", ...origine }] } : l)) };
}

export const memeTicket = (a: Entree, b: Entree) => a.ticket === b.ticket;

export function lireCarnet(fichier: string): Carnet {
  if (!existsSync(fichier)) return carnetVide();
  const brut = JSON.parse(readFileSync(fichier, "utf8")) as Carnet;
  if (!Number.isInteger(brut.suivant) || !Array.isArray(brut.lecons)) throw new Error(`carnet de leçons illisible : ${fichier}`);
  // Écrit avant l'origine : chaque leçon y est née d'une rétro.
  return { ...brut, lecons: brut.lecons.map((l) => ({ ...l, origin: l.origin ?? { ...RETRO_ORIGIN } })) };
}

export function ecrireCarnet(fichier: string, carnet: Carnet): void {
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.tmp`;
  writeFileSync(provisoire, JSON.stringify(carnet, null, 2) + "\n");
  renameSync(provisoire, fichier);
}
