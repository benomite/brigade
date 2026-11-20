// Le dossier que le manager reçoit au tour du superviseur (#3914) : la file,
// la queue du journal, l'étape de CI en échec avec ses lignes de log, et
// l'historique du ticket fautif. Chaque lecture qui échoue le dit à sa place
// dans le dossier, sans faire tomber le tour : le manager lit ce qui manque,
// jamais un dossier dit calme faute de l'avoir lu.

export type TicketDeLaFile = { ticket: number; titre: string; ligne?: string };
export type EtapeEnEchec = { etape: string; lignes: string[] };

type LecturesDuDossier = {
  file(): Promise<TicketDeLaFile[]>;
  queueDuJournal(lignes: number): Promise<string[]>;
  // L'étape de CI en échec sur la base et ses lignes de log, nulle quand rien n'y échoue.
  etapeEnEchec(): Promise<EtapeEnEchec | null>;
  historique(ticket: number): Promise<string[]>;
};

export type Dossier = {
  file: TicketDeLaFile[];
  journal: string[];
  ci: EtapeEnEchec | null;
  historique: string[];
  // Ce qui n'a pas pu se lire, une ligne par lecture.
  manques: string[];
  // Le dossier en texte, tel que le manager le lit.
  texte: string;
};

export const LIGNES_DE_JOURNAL = 50;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export async function composerDossier({ lectures, ticketFautif, lignesDeJournal = LIGNES_DE_JOURNAL, vu = "" }: { lectures: LecturesDuDossier; ticketFautif: number | null; lignesDeJournal?: number; vu?: string }): Promise<Dossier> {
  const manques: string[] = [];
  const lire = async <T>(quoi: string, lecture: () => Promise<T>, aDefaut: T): Promise<T> => {
    try {
      return await lecture();
    } catch (erreur) {
      manques.push(`${quoi} could not be read: ${message(erreur)}`);
      return aDefaut;
    }
  };
  const file = await lire("the queue", () => lectures.file(), []);
  const journal = await lire("the journal", () => lectures.queueDuJournal(lignesDeJournal), []);
  const ci = await lire("the failing CI step", () => lectures.etapeEnEchec(), null);
  const historique = ticketFautif === null ? [] : await lire(`the history of #${ticketFautif}`, () => lectures.historique(ticketFautif), []);
  const texte = [
    ...(vu === "" ? [] : ["## What triggered this run", "", vu, ""]),
    "## The queue",
    "",
    ...(file.length === 0 ? ["(empty)"] : file.map(({ ticket, titre, ligne }) => `- #${ticket} ${titre}${ligne === undefined ? "" : ` — ${ligne}`}`)),
    "",
    `## The tail of the journal (last ${lignesDeJournal} lines)`,
    "",
    ...(journal.length === 0 ? ["(empty)"] : ["```", ...journal, "```"]),
    "",
    "## The failing CI step on main",
    "",
    ...(ci === null ? ["(none)"] : [`Step: ${ci.etape}`, "", "```", ...ci.lignes, "```"]),
    "",
    ...(ticketFautif === null ? [] : [`## The history of #${ticketFautif}`, "", ...(historique.length === 0 ? ["(empty)"] : historique.map((ligne) => `- ${ligne}`)), ""]),
    ...(manques.length === 0 ? [] : ["## What could not be read", "", ...manques.map((manque) => `- ${manque}`), ""]),
  ].join("\n");
  return { file, journal, ci, historique, manques, texte };
}
