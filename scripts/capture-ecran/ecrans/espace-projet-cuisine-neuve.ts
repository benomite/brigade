// L'espace de « parade », un projet de la nouvelle cuisine (#4482) : son état n'est que dans ses labels GitHub — `fire`,
// `taken`, `in-pass`, `try:N`, `parked:chef`. Ce que la vue reçoit est lu par la lecture même de l'app (board/read.ts,
// puis ce qui attend le chef), devant un GitHub figé qui répond selon le chemin : une issue dans chaque colonne. Joué sur
// une branche d'avant #4482, le même écran montre ce que l'app tirait de ces labels avec le runtime d'avant.
import type { Facts } from "../../../app/src/facts.ts";
import { withWhatAwaitingTheChef } from "../../../app/src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../../app/src/board/client.ts";
import { readTheBoardOfRepository } from "../../../app/src/board/read.ts";
import { statusOfBoard } from "../../../app/src/board/rail.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const DEPOT = "chef/parade";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, title: string, labels: string[]) => ({ number, title, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-10-13T08:00:00Z", labels: labels.map((name) => ({ name })), body: "" });
const pr = (number: number, ticket: number, title: string, extra: object = {}) => ({ number, title: `#${ticket} — ${title}`, html_url: `https://github.com/${DEPOT}/pull/${number}`, created_at: "2026-10-13T09:30:00Z", updated_at: MAINTENANT, head: { ref: `cook/${ticket}-github` }, body: `Closes #${ticket}`, ...extra });
const OUVERTES = [
  issue(31, "Export the journal as CSV", ["prio:2"]),
  issue(32, "Login by magic link", ["fire", "model:sonnet", "effort:medium"]),
  issue(33, "PDF export of the invoices", ["fire", "taken", "model:sonnet", "effort:medium"]),
  issue(34, "SIRET validation", ["fire", "in-pass", "try:1", "model:sonnet", "effort:medium"]),
  issue(35, "Free tier: keep the CSV export?", ["fire", "parked:chef", "try:1", "try:2", "try:3"]),
];
const appeler: CallGitHub = async (chemin) => {
  if (chemin === `/repos/${DEPOT}/contents/.brigade/kitchen.json`) return ok({ type: "file", content: Buffer.from('{"risk": []}').toString("base64") });
  if (chemin.startsWith(`/repos/${DEPOT}/issues?state=open`)) {
    const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
    return ok(label === undefined ? OUVERTES : OUVERTES.filter(({ labels }) => labels.some(({ name }) => name === decodeURIComponent(label))));
  }
  if (chemin.startsWith(`/repos/${DEPOT}/issues?state=closed`)) return ok([]);
  if (chemin.startsWith(`/repos/${DEPOT}/pulls?state=open`)) return ok([pr(40, 34, "SIRET validation")]);
  if (chemin.startsWith(`/repos/${DEPOT}/pulls?state=closed`)) return ok([pr(38, 36, "The append-only journal", { merged_at: "2026-10-13T09:00:00Z" })]);
  const heure = (h: number) => new Date(Date.parse(MAINTENANT) - h * 3_600_000).toISOString();
  const pose = (label: string, h: number) => ({ event: "labeled", label: { name: label }, created_at: heure(h) });
  const frise: Record<string, object[]> = { "32": [pose("fire", 5)], "33": [pose("taken", 3)], "34": [pose("taken", 6), pose("in-pass", 1)], "35": [pose("parked:chef", 30)], "36": [pose("taken", 4)] };
  const frisee = /\/issues\/(\d+)\/timeline/.exec(chemin)?.[1];
  if (frisee !== undefined) return ok(frise[frisee] ?? []);
  if (/\/pulls\/\d+$/.test(chemin)) return ok({ additions: 120, deletions: 14, created_at: "2026-10-13T09:30:00Z" });
  if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main", permissions: { push: true } });
  if (chemin.includes("/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
  if (/\/issues\/35\/comments/.test(chemin)) return ok([{ id: 9, body: "Parked for the chef: the third refusal — the ticket does not say whether the free tier keeps the CSV export.", author_association: "OWNER", created_at: "2026-10-13T09:50:00Z" }]);
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: { message: "Not Found" } };
};

const lu = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: DEPOT, appeler, maintenant: () => new Date(MAINTENANT) }), appeler);
if (!lu.lu) throw new Error(lu.raison);
const parade: Rendu = { ...(RENDUS.parade as Rendu), facts: lu.faits as unknown as Facts, status: statusOfBoard(lu) };

export const ecran: Ecran = {
  dit: "L'espace de « parade », un projet de la nouvelle cuisine : son kanban lu des labels GitHub seuls — une issue par colonne (#4482)",
  largeur: 2000,
  hauteur: 620,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)) }, envois: cuisine({ ...RENDUS, parade }) }),
};
