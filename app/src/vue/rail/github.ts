// Les tickets servis d'un projet, lus de GitHub (ticket 2220, épique 2209) : les PR fermées de son dépôt, page après page —
// ce que les chiffres d'autonomie comptent (vue/autonomy/autonomy-github.ts). Le kanban, lui, est lu de ses labels
// (board/kitchen-board.ts).
import { ticketOfThePR } from "../../board/rail-github.ts";

// La marque que la livraison porte dans le corps de sa PR : la station qui l'a cuisinée.
const STATION_OF_THE_PR = /Cooked by station `([A-Za-z0-9._/-]+)`/;

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.flatMap((oneOf: unknown) => { const o = object(oneOf); return o === null ? [] : [o]; }) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

// Un ticket servi : l'issue fermée par une PR mergée, avec cette PR et la station qui l'a cuisiné.
export type ServedOnGithub = { ticket: number; titre: string; url: string; livre: string; station: string | null; pr: string };

// Une liste de GitHub, page après page, jusqu'à une page qui n'est pas pleine — dix au plus. Une réponse qui n'est pas
// une liste lève : jamais un rail vide à sa place.
const BY_PAGE = 100;
export async function allThePages(read: (path: string) => Promise<unknown>, path: string): Promise<Raw[]> {
  const allEntries: Raw[] = [];
  for (let page = 1; page <= 10; page++) {
    const raw = await read(`${path}${path.includes("?") ? "&" : "?"}per_page=${BY_PAGE}&page=${page}`);
    if (!Array.isArray(raw)) throw new Error("GitHub's answer is not a list");
    const readEntry = list(raw);
    allEntries.push(...readEntry);
    if (readEntry.length < BY_PAGE) break;
  }
  return allEntries;
}

// Les tickets servis dans la fenêtre `fenetreMs` avant `maintenant`, d'après les PR fermées, la plus récemment mise à jour
// d'abord : page après page jusqu'à une PR plus ancienne que la fenêtre. Seule une PR mergée sert un ticket — une issue
// fermée sans PR mergée (not planned, doublon) n'est jamais servie. La station est celle que la PR dit avoir cuisiné
// (« Cooked by station `x` »). Le plus récemment mergé d'abord, un seul service par ticket. Jusqu'à `pagesMax` pages, et
// sans lever quand la lecture s'arrête avant d'avoir couvert la fenêtre — plafond atteint, ou page qui ne se lit pas après
// la première. `couvertDepuis` dit alors l'instant jusqu'où les PR sont toutes lues (les pages sont triées par mise à
// jour, et une PR est mise à jour au moins à son merge : toute PR mergée après la dernière mise à jour lue l'a été) ; null
// quand la fenêtre est entière.
// `raison` dit pourquoi elle s'est arrêtée. Une première page qui ne se lit pas lève : rien n'est lu.
export type ServedRead = { servis: ServedOnGithub[]; couvertDepuis: number | null; raison: string | null };
export async function readTheServedOnTheWindow(read: (path: string) => Promise<unknown>, repository: string, now: number, windowMs: number, pagesMax: number): Promise<ServedRead> {
  const since = now - windowMs;
  const servedOnes = new Map<number, ServedOnGithub>();
  // Jusqu'où les pages lues couvrent : la mise à jour de la dernière PR de la dernière page lue.
  let readUntil = now;
  let coveredSince: number | null = null;
  let reason: string | null = null;
  for (let page = 1; page <= pagesMax; page++) {
    let readEntry: Raw[];
    try {
      const raw = await read(`/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=${BY_PAGE}&page=${page}`);
      if (!Array.isArray(raw)) throw new Error("GitHub's answer is not a list");
      readEntry = list(raw);
    } catch (error) {
      if (page === 1) throw error;
      reason = error instanceof Error ? error.message : String(error);
      coveredSince = readUntil;
      break;
    }
    for (const pr of readEntry) {
      const mergeThe = text(pr.merged_at);
      const instant = Date.parse(mergeThe);
      if (Number.isNaN(instant) || instant < since || instant > now) continue;
      const ticket = ticketOfThePR(text(object(pr.head)?.ref), text(pr.body));
      if (ticket === null || typeof pr.number !== "number") continue;
      const knownOne = servedOnes.get(ticket);
      if (knownOne !== undefined && Date.parse(knownOne.livre) >= instant) continue;
      servedOnes.set(ticket, {
        ticket,
        titre: text(pr.title).replace(/^#\d+\s*[—-]\s*/, ""),
        url: `https://github.com/${repository}/issues/${ticket}`,
        livre: mergeThe,
        station: STATION_OF_THE_PR.exec(text(pr.body))?.[1] ?? null,
        pr: text(pr.html_url),
      });
    }
    // Triées par mise à jour, une page dont la dernière PR est plus ancienne que la fenêtre n'a plus rien après elle.
    const last = Date.parse(text(readEntry[readEntry.length - 1]?.updated_at));
    if (readEntry.length < BY_PAGE || (!Number.isNaN(last) && last < since)) break;
    if (Number.isNaN(last)) {
      // Une page pleine dont la dernière PR n'a pas de date : on ne sait pas jusqu'où la lecture couvre.
      coveredSince = readUntil;
      reason = "GitHub gave no update date for a pull request";
      break;
    }
    readUntil = last;
    if (page === pagesMax) {
      coveredSince = last;
      reason = `more than ${pagesMax * BY_PAGE} closed pull requests in the period`;
    }
  }
  return { servis: [...servedOnes.values()].sort((a, b) => Date.parse(b.livre) - Date.parse(a.livre)), couvertDepuis: coveredSince, raison: reason };
}

