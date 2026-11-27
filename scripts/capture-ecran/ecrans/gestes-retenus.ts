// Les gestes retenus de « parade » (#4273) : rien n'est prêt sur son kanban — ses deux épiques attendent au Backlog —, et
// deux découpages de ces épiques attendent l'OK du chef. La vue les reçoit du pont (`gestesRetenus`, app/src/held/) : une
// carte par geste — son résumé, sa raison, Approve — à côté du TODO. Le kanban est lu par la lecture même de l'app
// (board/read.ts, puis ce qui attend le chef), devant un GitHub figé qui répond selon le chemin (#4507).
import type { Facts } from "../../../app/src/facts.ts";
import type { AnswerGitHub, CallGitHub } from "../../../app/src/board/client.ts";
import { readTheBoardOfRepository } from "../../../app/src/board/read.ts";
import { statusOfBoard } from "../../../app/src/board/rail.ts";
import { withWhatAwaitingTheChef } from "../../../app/src/board/wait-of-chef.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const DEPOT = "chef/parade";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const epique = (number: number, title: string) => ({ number, title, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-10-12T16:20:00Z", labels: [{ name: "epic" }], body: "" });
const OUVERTES = [epique(4129, "Le journal exportable"), epique(4130, "Le menu du soir")];
const appeler: CallGitHub = async (chemin) => {
  if (chemin.startsWith(`/repos/${DEPOT}/issues?state=open`)) {
    const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
    return ok(label === undefined ? OUVERTES : OUVERTES.filter(({ labels }) => labels.some(({ name }) => name === decodeURIComponent(label))));
  }
  if (chemin.startsWith(`/repos/${DEPOT}/pulls?`)) return ok([]);
  if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main", permissions: { push: true } });
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: { message: "Not Found" } };
};

const lu = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: DEPOT, appeler, maintenant: () => new Date(MAINTENANT) }), appeler);
if (!lu.lu) throw new Error(lu.raison);
const RAIL_VIDE: Rendu = { ...(RENDUS.parade as Rendu), facts: lu.faits as unknown as Facts, status: statusOfBoard(lu) };
const geste = (id: string, epique: number, tickets: number) => ({ id, kind: "manager", summary: `split #${epique} into ${tickets} tickets`, reason: "an epic split is held for your OK", approveCommand: `brigade parade manager approve ${id}`, heldAt: MAINTENANT });

export const ecran: Ecran = {
  dit: "Le kanban de « parade », rien de prêt, ses deux épiques au Backlog, et deux découpages retenus pour l'OK du chef : une carte par geste, son résumé, sa raison et Approve (#4273)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], gestesRetenus: { gestes: [geste("3", 4129, 3), geste("4", 4130, 2)] } },
    envois: cuisine({ ...RENDUS, parade: RAIL_VIDE }),
  }),
};
