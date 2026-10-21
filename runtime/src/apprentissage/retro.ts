// La rétro face aux leçons : ce qu'elle lit (toutes les leçons, avec leur id) et
// ce qu'elle rend (`reconfirm <id>` ou `propose <leçon>`, une entrée par ligne).
// Le rapprochement des formulations est fait par le cook de la rétro, dans la
// rétro : ici, l'égalité est exacte, sur l'id.
import { blanchir } from "../livrable.ts";
import type { Ecart, EntreeRetenue } from "./evenements.ts";
import { LeconInconnue, proposer, reconfirmer, type Carnet, type Origine } from "./lecons.ts";

export type Sortie = { genre: "reconfirm"; id: string } | { genre: "propose"; texte: string };

export class RetroInvalide extends Error {}

// Les leçons telles que la rétro les voit, provisoires et promues, avec leur id.
export function montrerLecons(carnet: Carnet): string {
  if (!carnet.lecons.length) return "(aucune leçon pour l'instant)";
  return carnet.lecons.map((l) => `- ${l.id} [${l.statut}] ${l.texte}`).join("\n");
}

export function consignesDeRetro(carnet: Carnet): string {
  return [
    "Leçons existantes (id, statut, texte) :",
    montrerLecons(carnet),
    "",
    "Pour chaque leçon que tu retiens, écris une ligne :",
    "- `reconfirm <id>` si une leçon existante dit déjà la même chose (cite son id exact) ;",
    "- `propose <leçon>` si c'est une leçon nouvelle.",
    "N'écris pas d'autre ligne.",
  ].join("\n");
}

// Lit la sortie d'une rétro. Un id inconnu est refusé, en le nommant.
export function lireSortie(texte: string, carnet: Carnet): Sortie[] {
  const sorties: Sortie[] = [];
  for (const [i, brute] of texte.split("\n").entries()) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const m = /^(reconfirm|propose)\s+(\S.*)$/.exec(ligne);
    if (!m) throw new RetroInvalide(`ligne ${i + 1} de la rétro illisible : « ${ligne} » (attendu : reconfirm <id> ou propose <leçon>)`);
    if (m[1] === "propose") {
      sorties.push({ genre: "propose", texte: m[2]! });
      continue;
    }
    const id = m[2]!.trim();
    if (!carnet.lecons.some((l) => l.id === id)) throw new RetroInvalide(`ligne ${i + 1} de la rétro : reconfirm cite l'id « ${id} », qui n'est celui d'aucune leçon`);
    sorties.push({ genre: "reconfirm", id });
  }
  return sorties;
}

// Range la sortie d'une rétro dans le carnet : tout ou rien.
export function appliquerSortie(carnet: Carnet, sorties: Sortie[], origine: Origine): Carnet {
  let courant = carnet;
  for (const s of sorties) {
    if (s.genre === "reconfirm") courant = reconfirmer(courant, s.id, origine);
    else courant = proposer(courant, s.texte, origine).carnet;
  }
  return courant;
}

export { LeconInconnue };

// La rétro du cook, à la fin de son dernier message : au plus trois leçons,
// chacune en une ou deux phrases, pour les cooks suivants du même projet. Ce qui
// dépasse est écarté, jamais tronqué : une leçon coupée ne dit plus ce qu'elle
// disait.
export const OUVERTURE_RETRO = "<retro>";
export const FERMETURE_RETRO = "</retro>";
export const LECONS_MAX = 3;
export const PHRASES_MAX = 2;
// Deux phrases tiennent en moins : au-delà, ce n'est plus une leçon courte.
export const LECON_MAX_CARACTERES = 400;

// Ce que la consigne d'un cook dit de sa rétro : la même pour un premier cook,
// un cook qui reprend et un cook renvoyé.
export const CONSIGNE_DE_RETRO = [
  `Après ton livrable, hors de sa délimitation, fais ta rétro : ce que ce ticket t'a appris du projet et qui servirait au prochain cook. Écris-la entre \`${OUVERTURE_RETRO}\` et \`${FERMETURE_RETRO}\`, balises nues, une ligne par leçon :`,
  "`propose <leçon>` pour une leçon nouvelle, ou `reconfirm <id>` si une leçon qu'on t'a donnée avec son id dit déjà la même chose.",
  `Au plus ${LECONS_MAX} leçons, chacune en une ou deux phrases ; ce qui dépasse est écarté. Une leçon dit ce qui vaut pour les tickets suivants, pas ce que tu as fait sur celui-ci. Rien à retenir : laisse la rétro vide.`,
  "Tes leçons servent aux cooks suivants du projet dès que le ticket est servi, sans relecture de personne.",
].join(" ");

// Le texte de la rétro d'un message : sa dernière délimitation fermée. Une
// balise citée — entre backticks, ou dans un bloc de code — n'en est pas une.
// Nul : rien n'est délimité, ou la délimitation est vide.
export function extraireRetro(message: string | null): string | null {
  if (!message) return null;
  let ouverte: number | null = null;
  let texte: string | null = null;
  for (const balise of blanchir(message).matchAll(/<(\/?)retro>/gi)) {
    if (balise[1] === "") ouverte = balise.index;
    else if (ouverte !== null) {
      texte = message.slice(ouverte + OUVERTURE_RETRO.length, balise.index).trim();
      ouverte = null;
    }
  }
  return texte === "" ? null : texte;
}

// Les phrases d'une leçon : ce qui finit par « . », « ! », « ? » ou « … »
// suivi d'un blanc ou de la fin. Un point dans un mot (`v2.1`, `pass.ts`) ne
// coupe rien.
export const phrases = (texte: string): number => texte.split(/(?<=[.!?…])\s+/).filter((morceau) => morceau.trim() !== "").length;

export type Tri = { kept: EntreeRetenue[]; dropped: { line: string; reason: Ecart }[] };

// Trie la rétro d'un cook face aux leçons du projet : les lignes lisibles, dans
// l'ordre, jusqu'à `LECONS_MAX` ; le reste est écarté, en le disant. Une ligne
// fautive n'emporte pas les autres — c'est un cook qui l'écrit, sans relecture.
// `communes` : les ids des leçons de l'étage commun que le cook a reçues — il
// peut les reconfirmer, elles ne sont pas dans le carnet du projet.
export function trierRetro(texte: string | null, carnet: Carnet, communes: readonly string[] = []): Tri {
  const tri: Tri = { kept: [], dropped: [] };
  const ecarter = (line: string, reason: Ecart) => tri.dropped.push({ line, reason });
  for (const brute of (texte ?? "").split("\n")) {
    const line = brute.trim();
    if (!line) continue;
    const m = /^(?:[-*]\s+)?(reconfirm|propose)\s+(\S.*)$/.exec(line);
    if (!m) {
      ecarter(line, "unreadable");
      continue;
    }
    const valeur = m[2]!.trim();
    const entree: EntreeRetenue = m[1] === "propose" ? { kind: "propose", text: valeur } : { kind: "reconfirm", id: valeur };
    if (entree.kind === "propose" && (phrases(entree.text) > PHRASES_MAX || entree.text.length > LECON_MAX_CARACTERES)) ecarter(line, "too-long");
    else if (entree.kind === "reconfirm" && !carnet.lecons.some((l) => l.id === entree.id) && !communes.includes(entree.id)) ecarter(line, "unknown-id");
    else if (tri.kept.some((k) => (k.kind === "propose" ? entree.kind === "propose" && k.text === entree.text : entree.kind === "reconfirm" && k.id === entree.id))) ecarter(line, "duplicate");
    else if (tri.kept.length >= LECONS_MAX) ecarter(line, "over-limit");
    else tri.kept.push(entree);
  }
  return tri;
}

// Range dans le carnet ce qu'une rétro a retenu. Un id qui n'y est pas — un
// carnet relu autrement qu'à l'écriture — est passé : tout le reste tient.
export function appliquerRetenues(carnet: Carnet, kept: EntreeRetenue[], origine: Origine): Carnet {
  let courant = carnet;
  for (const entree of kept) {
    if (entree.kind === "propose") courant = proposer(courant, entree.text, origine).carnet;
    else if (courant.lecons.some((l) => l.id === entree.id)) courant = reconfirmer(courant, entree.id, origine);
  }
  return courant;
}
