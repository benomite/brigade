// La rétro face aux leçons : ce qu'elle lit (toutes les leçons, avec leur id) et
// ce qu'elle rend (`reconfirm <id>` ou `propose <leçon>`, une entrée par ligne).
// Le rapprochement des formulations est fait par le cook de la rétro, dans la
// rétro : ici, l'égalité est exacte, sur l'id.
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
