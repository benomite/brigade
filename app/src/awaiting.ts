// Ce qui attend le chef, mis à part : le bloc `attend` de `status`, pris par son
// bord et par lui seul — de la seule ligne de la sortie qui commence par
// `attend` à la seule qui vaut `fin attend`, bornes comprises (docs/runtime/etat-et-mesures.md,
// « Ce qui attend le chef »). Le bord a deux écritures, `attend` … `fin attend`
// et `awaiting` … `end awaiting` (#536) : la box, l'app et le second ne se
// mettent pas à jour ensemble, les deux sont donc lues. Un début de l'une et la
// fin de l'autre ne font pas un bloc. Rien de ce qu'il porte n'est compté ni redit :
// quand rien n'attend, c'est lui qui le dit. Le reste de la sortie reste mot
// pour mot, à sa place. Une seule chose y est lue ici, pour le rail : le numéro
// en tête d'une ligne (`ticketsDe`) — ce que la ligne dit ensuite, et ce qui la
// précise dessous, plus en retrait, reste mot pour mot.
import type { Failure, Reading, Output } from "./box.ts";

// `attend` : le bloc, tel que `status` l'a écrit ; les `sorties` sont alors
// celles de la lecture, celle de `status` sans lui. Absent : la sortie de
// `status` n'a pas ce bord, et elle est restée entière — ce n'est pas « rien
// n'attend ».
export type Shown = { projet: string; demande: number; a: string } & ({ attend: string | undefined; sorties: Output[] } | Failure);

// Où le bloc commence et où il finit dans le texte, saut de ligne final compris.
function edge(text: string): { debut: number; fin: number } | undefined {
  const starts: number[] = [];
  const ends: number[] = [];
  // Le bord que chaque borne retenue porte : 0 pour `attend`, 1 pour `awaiting`.
  const formatsStarts: number[] = [];
  const formatsEnds: number[] = [];
  for (let departure = 0; departure < text.length; ) {
    const jump = text.indexOf("\n", departure);
    const next = jump === -1 ? text.length : jump + 1;
    const line = text.slice(departure, jump === -1 ? text.length : jump);
    if (line === "fin attend" || line === "end awaiting") {
      ends.push(next);
      formatsEnds.push(line === "fin attend" ? 0 : 1);
    } else if (line.startsWith("attend") || line.startsWith("awaiting")) {
      starts.push(departure);
      formatsStarts.push(line.startsWith("attend") ? 0 : 1);
    }
    departure = next;
  }
  const [start, end] = [starts[0], ends[0]];
  if (starts.length !== 1 || ends.length !== 1 || start === undefined || end === undefined || end <= start || formatsStarts[0] !== formatsEnds[0]) return undefined;
  return { debut: start, fin: end };
}

export function putAside(reading: Reading): Shown {
  if ("erreur" in reading) return reading;
  let awaiting: string | undefined;
  const outputs = reading.sorties.map((output) => {
    const finds = output.commande === "status" ? edge(output.texte) : undefined;
    if (finds === undefined) return output;
    awaiting = output.texte.slice(finds.debut, finds.fin);
    return { commande: output.commande, texte: output.texte.slice(0, finds.debut) + output.texte.slice(finds.fin) };
  });
  return { ...reading, attend: awaiting, sorties: outputs };
}

// Un ticket que le bloc nomme en tête d'une de ses lignes, et ce que la ligne
// en dit ensuite, mot pour mot. `suite` : les lignes posées sous elle, plus en
// retrait — ce qui la précise —, telles quelles, leur retrait compris.
export type Expected = { ticket: number; ligne: string; suite: string[] };

// Deux espaces, `#`, des chiffres, puis deux espaces ou la fin de la ligne :
// la tête qu'écrit `status` pour un ticket. C'est la seule forme lue dans le bloc.
const HEAD_OF_TICKET = /^ {2}#(\d+)(?: {2}(.*))?$/;
// Une entrée est à deux espaces de retrait ; ce qui est plus en retrait qu'elle
// la précise.
const SUITE = /^ {3}/;

// Les tickets du bloc, dans son ordre — le plus ancien d'abord. Une ligne sans
// numéro en tête n'en donne aucun : la station sans connexion Max, le bilan des
// arrêts, la tête du bloc. Elle reste dans le bloc, et nulle
// part ailleurs — ce qui la précise aussi : une suite n'est qu'à l'entrée
// qu'elle suit, jamais au ticket d'avant.
export function ticketsOf(block: string): Expected[] {
  const readOnes: Expected[] = [];
  // L'entrée dont les lignes plus en retrait sont la suite : celle d'un ticket, ou aucune.
  let current: Expected | undefined;
  for (const line of block.split("\n")) {
    if (SUITE.test(line)) {
      current?.suite.push(line);
      continue;
    }
    // Toute autre ligne ferme l'entrée d'avant : une entrée sans numéro, la tête du bloc, son bord.
    const [, number, suite] = HEAD_OF_TICKET.exec(line) ?? [];
    const ticket = Number(number);
    current = number !== undefined && Number.isSafeInteger(ticket) ? { ticket, ligne: suite ?? "", suite: [] } : undefined;
    if (current !== undefined) readOnes.push(current);
  }
  return readOnes;
}

// Ce que le bloc dit d'un ticket pour une entrée : sa ligne et ce qui la précise,
// d'un seul tenant, mot pour mot — ni rogné, ni remis en forme.
export const saysOf = ({ ligne: line, suite }: Expected): string => [line, ...suite].join("\n");
