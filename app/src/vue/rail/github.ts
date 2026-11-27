// Le rail et les cooks d'un projet, lus de GitHub (ticket 2220, épique 2209 ; seul chemin depuis le ticket 2061) : ses stations
// prennent, cuisent, jugent et mergent ses tickets sur GitHub, et la vue du rail et l'onglet Cooks lisent ce qu'elles y
// écrivent (board/read.ts).
//
// Ce qui se lit, à chaque lecture — toutes conditionnelles (`If-None-Match`) : un 304 ne coûte rien :
//   - ses issues ouvertes au label `fire` et ses PR ouvertes, page après page : le rail est chaque issue au label, son
//     état tiré de ses labels, de sa PR et de la base (`etatDuTicket`) — sans aucun des quatre, il est en attente ; une
//     épique, dont le corps liste les tickets, n'y est pas (ticket 2618) ;
//   - pour un ticket pris ou en pass, les commentaires et les événements de son issue : la station qui le tient
//     (vue/cooks/taken.ts). Ce sont les cooks de l'onglet Cooks, chacun sous sa station, avec sa PR quand il en a une.
// Et, pour les stations de l'onglet Cooks (ticket 2358), le signe de vie de chacune : l'enregistrement qu'elle réécrit dans son
// gist, sous le compte du chef, que le process principal lit à son pas (vue/cooks/signs-of-life.ts) — reçu ici, pas lu.
import { porteListe, ticketsDeLaListe } from "../../../../runtime/src/epique.ts";
import { feuPoseLe } from "../../../../runtime/src/attente-du-rail/lecture.ts";
import { lireLOrdreDuRail } from "../../../../runtime/src/ordre-de-merge/lecture.ts";
import { readTheNotTaken } from "../../rail-blocked/diagnostic.ts";
import type { AttenteSourcee, TicketDuRail, TicketEnWaiting } from "../../../../runtime/src/attente-du-rail/raison.ts";
import { attenteDeLIssue, type AttenteGitHub } from "../../../../runtime/src/attente-github/marque.ts";
import { attentesDuTicket } from "../../../../runtime/src/carte-attente/carte-attente.ts";
import { etatDuTicket, LABELS_D_AVANT_PARKED_SANS_CARTE, type EtatDeLaBase, type IssueLue } from "../../../../runtime/src/github-etat/etats.ts";
import { alertsOfRail, type AlertOfRail, type BaseRedRead, type RelaunchRead } from "../../wait-of-rail/alerts.ts";
import type { SigneDeVie } from "../../../../runtime/src/stations-github/stations.ts";
import type { Cook } from "../../facts.ts";
import type { CallGitHub } from "../../board/client.ts";
import type { ActivityOfCook, BoardRead } from "../../board/read.ts";
import { labelOfSetAside, LABEL_OF_BOARD_OF_THE_KITCHEN, setAsideOf, setAsideOn, WITHOUT_REASON, type SetAside } from "../../board/set-aside-github.ts";
import { stateOfTheBaseGithub, WORD_OF_THE_STATE, ticketOfThePR } from "../../board/rail-github.ts";
import { takenOfTheIssue, stationsOfGithub, holdingOfTheIssue, type Taking } from "../cooks/taken.ts";
import { isSensitive } from "../card-sensitive/label.ts";
import { PR_OF_TICKET } from "../pr-of-ticket.js";
import { lastSendBack, type SendBack } from "./send-back.ts";
import { railBlockedOf, type NotTakenRead } from "../rail-blocked/rail-blocked.ts";
import { avecLesStationsQuiCuisent, type StationsLues } from "../../../../runtime/src/attente-du-rail/stations.ts";
import { waitOfRailOf } from "../wait-of-rail/wait-of-rail.ts";
import { withThePause, pauseOfAccount, type QuotaGithub } from "../pause-quota/pause-quota.ts";
import { fiche } from "../../../../runtime/src/fiche.ts";
import { stopOfRail, zoneHeldOf, type ZoneHeld } from "../banner-stop/stop-of-rail.ts";
import { railDuBacklog } from "../../../../runtime/src/rail-backlog/rail-backlog.ts";
import type { TopOfBacklogOfFacts } from "./rail.ts";

const LABEL_FIRE = "fire";
const WORD_IN_FILE = "en attente";
// Le label que portent encore les tickets passés par l'étape retirée (ticket 4229) : ils se lisent toujours.
const LABEL_TESTS_WRITTEN = "tests-written";
// Le mot d'un ticket en file dont les tests d'acceptation sont écrits et gelés : l'étape `tests written` du rail, entre
// `queued` et `taken` (ticket 3725, label `tests-written`).
const WORD_TESTS_WRITTEN = "tests écrits";
// Les mots d'un ticket en file, que la cuisine n'a pas encore pris.
const IN_FILE = new Set([WORD_IN_FILE, WORD_TESTS_WRITTEN]);
// Le mot d'un ticket mis de côté (facts.ts, `TONS_DE_TICKET`) : sa carte est dans TODO (ticket 2075).
const WORD_SET_ASIDE = "86";
// La colonne où reste un ticket mis de côté qui ne demande rien au chef (facts.ts, `COLONNES_DE_FAITS`) : celle du rail.
const COLUMN_OF_THE_SET_ASIDE = "On the rail";
// La marque que la livraison porte dans le corps de sa PR : la station qui l'a cuisinée.
const STATION_OF_THE_PR = /Cooked by station `([A-Za-z0-9._/-]+)`/;
// Les mots dont un ticket a une station qui le tient.
const HELD = new Set(["pris", "en pass", "base rouge"]);

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.flatMap((oneOf: unknown) => { const o = object(oneOf); return o === null ? [] : [o]; }) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

// La PR qui livre un ticket, telle que la carte la dit.
export type PrOfTicket = { numero: number; url: string; le: string; station?: string | null; taille?: { additions: number; deletions: number } };
// Un ticket du rail lu sur GitHub : son mot d'état (facts.ts, `TONS_DE_TICKET`), sa priorité (`prio:<n>` de ses labels),
// l'heure de son issue, sa PR ouverte, la station qui le tient, et ce qui le met de côté (ticket 2075) — nulles sans elles.
// `sensible` : l'issue porte le label `sensitive` (ticket 3224). `renvoi` : le dernier renvoi de sa livraison à un cook, et
// pourquoi (ticket 3302) — lu des commentaires d'un ticket pris, en pass ou mis de côté ; absent sans renvoi, ou pour un
// autre ticket. `depend` : les tickets dont son corps dit dépendre (`Depends on #N`) ; `entreLe` : l'instant où `fire` lui a été
// posé, d'un ticket en file — nul quand ses événements ne le disent pas, absent d'un autre (ticket 3433). `attentes` : d'un
// ticket en file, ses attentes avec leur source — son corps, sa fiche, l'arrêt d'un cook — et `commentairesLus`, faux quand
// ses commentaires ne se lisent pas (ticket 3763). `reparationDeMain` : l'issue porte `repair-main`, la réparation d'une main
// rouge (ticket 3815). `prises` : combien de fois un cook l'a pris, depuis la première prise — lues de la première page de ses
// commentaires, `auMoins` quand elle est pleine ; absent sans prise lue (ticket 3823). `parqueParEchecs` : la station l'a
// parqué en arrêtant la boucle de ses échecs (tickets 3875, 4129) — depuis quand, et ce qu'il attend, de son commentaire de parking ;
// la zone que sa PR ouverte tient encore (ticket 3924).
export type TicketOnGithub = { ticket: number; titre: string; url: string; etat: string; priorite: number | null; creeLe: string; pr: PrOfTicket | null; prise: Taking | null; miseDeCote?: SetAside; parqueParEchecs?: { depuis: string; raison: string; zoneTenue?: ZoneHeld }; sensible?: true; renvoi?: SendBack; depend?: number[]; zone?: string[]; entreLe?: string | null; attentes?: AttenteSourcee[]; commentairesLus?: boolean; apres?: number[]; qui?: string | null; reparationDeMain?: true; prises?: { fois: number; depuis: string; auMoins?: true } };
// Un ticket servi dans les 24 h : l'issue fermée par une PR mergée, avec cette PR et la station qui l'a cuisiné.
export type ServedOnGithub = { ticket: number; titre: string; url: string; livre: string; station: string | null; pr: string; prLue?: { additions?: number; deletions?: number; ouvertLe?: string } };
// `nonPris` : les tickets `fire` qu'aucun manager n'a pris (ticket 3358, rail-blocked/diagnostic.ts), ou pourquoi ils ne se
// lisent pas ; absent d'une lecture qui ne les a pas cherchés. `labelsLus` : les labels de l'issue de chaque ticket, d'où le
// haut du backlog se tire (ticket 4223) — un ticket sans eux n'est ni calibré ni prêt.
export type RailOnGithub = { lu: string; tickets: TicketOnGithub[]; servis?: ServedOnGithub[]; nonPris?: NotTakenRead; labelsLus?: Record<number, string[]> };
// Les signes de vie des stations du compte, tels que le process principal les a lus — ou pourquoi ils ne l'ont pas été,
// en une phrase.
// `quotaGithub` : son état de quota GitHub, quand elle le publie (ticket 3482, vue/pause-quota/) ; `id`, son gist.
export type SignsOfLife = { lus: (SigneDeVie & { id?: string; quotaGithub?: QuotaGithub })[] } | { illisible: string };
export const SIGNS_NOT_READ: SignsOfLife = { illisible: "the app has not read your stations' signs of life on GitHub yet" };

// La priorité d'une issue : le plus petit `prio:<n>` de ses labels, null sans aucun.
const priorityOf = (labels: readonly string[]): number | null => {
  const readEntries = labels.flatMap((label) => { const n = /^prio:(\d+)$/.exec(label)?.[1]; return n === undefined ? [] : [Number(n)]; });
  return readEntries.length === 0 ? null : Math.min(...readEntries);
};

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

const TWENTY_FOUR_HOURS = 24 * 3600 * 1000;

// Les tickets servis dans les 24 h avant `maintenant` — ou la fenêtre `fenetreMs`, celle des chiffres d'autonomie
// (vue/autonomy/autonomy-github.ts) —, d'après les PR fermées, la plus récemment mise à jour d'abord :
// une lecture, page après page jusqu'à une PR plus ancienne que la fenêtre. Seule une PR mergée sert un ticket — une
// issue fermée sans PR mergée (not planned, doublon) n'est jamais servie. La station est celle que la PR dit avoir
// cuisiné (« Cooked by station `x` »). Le plus récemment mergé d'abord, un seul service par ticket.
export async function readTheServed(read: (path: string) => Promise<unknown>, repository: string, now: number, windowMs = TWENTY_FOUR_HOURS): Promise<ServedOnGithub[]> {
  return (await readTheServedByPages(read, repository, now, windowMs, 10, false)).servis;
}

// La même lecture, pour une fenêtre longue : jusqu'à `pagesMax` pages, et sans lever quand elle s'arrête avant
// d'avoir couvert la fenêtre — plafond atteint, ou page qui ne se lit pas après la première. `couvertDepuis` dit alors
// l'instant jusqu'où les PR sont toutes lues (les pages sont triées par mise à jour, et une PR est mise à jour au moins
// à son merge : toute PR mergée après la dernière mise à jour lue l'a été) ; null quand la fenêtre est entière.
// `raison` dit pourquoi elle s'est arrêtée. Une première page qui ne se lit pas lève : rien n'est lu.
export type ServedRead = { servis: ServedOnGithub[]; couvertDepuis: number | null; raison: string | null };
export const readTheServedOnTheWindow = (read: (path: string) => Promise<unknown>, repository: string, now: number, windowMs: number, pagesMax: number): Promise<ServedRead> =>
  readTheServedByPages(read, repository, now, windowMs, pagesMax, true);

async function readTheServedByPages(read: (path: string) => Promise<unknown>, repository: string, now: number, windowMs: number, pagesMax: number, partial: boolean): Promise<ServedRead> {
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
      if (!partial || page === 1) throw error;
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
      if (!partial) continue;
      coveredSince = readUntil;
      reason = "GitHub gave no update date for a pull request";
      break;
    }
    readUntil = last;
    if (page === pagesMax && partial) {
      coveredSince = last;
      reason = `more than ${pagesMax * BY_PAGE} closed pull requests in the period`;
    }
  }
  return { servis: [...servedOnes.values()].sort((a, b) => Date.parse(b.livre) - Date.parse(a.livre)), couvertDepuis: coveredSince, raison: reason };
}

// Le dernier commentaire de parking d'une issue (runtime/src/attente-github/marque.ts) : ce qu'il attend, et quand il a été
// posé — nul quand GitHub ne le dit pas. Aucun qui se lise : nul.
function parkingOf(comments: readonly Record<string, unknown>[]): { attente: AttenteGitHub; le: string | null } | null {
  for (const { body, author_association: association, created_at: the } of [...comments].reverse()) {
    const wait = attenteDeLIssue([{ body: text(body), association: text(association) }]);
    if (wait !== null) return { attente: wait, le: typeof the === "string" && !Number.isNaN(Date.parse(the)) ? the : null };
  }
  return null;
}

// Le rail d'un projet : ses tickets au label `fire`, chacun dans son état, avec sa PR et sa station. Un ticket qui porte
// `served-elsewhere` ou `out-of-kitchen` — sans `parked` — est mis de côté, quoi que ses autres labels disent : ses
// commentaires, toutes pages, disent pourquoi (board/set-aside-github.ts, ticket 2075). Une lecture qui échoue
// lève : la lecture du rail en dit la raison (board/read.ts).
export async function readTheRailOnGithub(options: { depot: string; appeler: CallGitHub; maintenant?: () => Date }): Promise<RailOnGithub> {
  const { depot: repository, appeler: call } = options;
  const read = async (path: string) => {
    const answer = await call(path);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status}`);
    return answer.data;
  };
  const issues = await allThePages(read, `/repos/${repository}/issues?state=open&labels=${LABEL_FIRE}&sort=created&direction=asc`);
  const prs = await allThePages(read, `/repos/${repository}/pulls?state=open`);
  const now = (options.maintenant ?? (() => new Date()))();
  const readOne = now.toISOString();
  const servedOnes = await readTheServed(read, repository, now.getTime());
  // La liste des PR ne dit ni leur taille ni leur ouverture : la PR seule les dit (ticket 4051). Une PR qui ne se lit pas n'en montre rien.
  await Promise.all(
    servedOnes.map(async (served, rank) => {
      const number = /\/pull\/(\d+)$/.exec(served.pr)?.[1];
      if (number === undefined) return;
      try {
        const { additions, deletions, created_at: opened } = object(await read(`/repos/${repository}/pulls/${number}`)) ?? {};
        const prRead = {
          ...(Number.isSafeInteger(additions) && Number.isSafeInteger(deletions) ? { additions: additions as number, deletions: deletions as number } : {}),
          ...(typeof opened === "string" ? { ouvertLe: opened } : {}),
        };
        servedOnes[rank] = { ...served, prLue: prRead };
      } catch {
        // Illisible : la carte ne dit rien de sa taille.
      }
    }),
  );
  const delivered = new Map<number, PrOfTicket>();
  for (const pr of prs) {
    const ticket = ticketOfThePR(text(object(pr.head)?.ref), text(pr.body));
    if (ticket !== null && !delivered.has(ticket) && typeof pr.number === "number") delivered.set(ticket, { numero: pr.number, url: text(pr.html_url), le: text(pr.created_at), station: STATION_OF_THE_PR.exec(text(pr.body))?.[1] ?? null });
  }
  const ofRail = issues.flatMap((issue) => {
    if (issue.pull_request !== undefined || typeof issue.number !== "number") return [];
    const labels = list(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));
    // Une épique dont le corps liste les tickets garde `fire` et sa `prio:` : elle se sert par ses tickets, jamais ne se
    // prend, et n'est pas sur le rail (ticket 2618).
    if (labels.includes(LABEL_OF_BOARD_OF_THE_KITCHEN) || porteListe(text(issue.body))) return [];
    return [{ numero: issue.number, titre: text(issue.title), url: text(issue.html_url), creeLe: text(issue.created_at), labels, corps: text(issue.body), reparationDeMain: labels.includes(LABEL_REPAIR_OF_MAIN) }];
  });
  // La liste des PR ne dit pas leur taille : la PR seule la dit (ticket 4051). C'est une lecture de plus par ticket du rail, à chaque
  // lecture, toutes ensemble : autant d'appels sur la limite de GitHub. Une PR qui ne se lit pas n'en montre aucune — jamais un zéro.
  await Promise.all(
    ofRail.flatMap(({ numero: number }) => {
      const pr = delivered.get(number);
      if (pr === undefined) return [];
      return [
        read(`/repos/${repository}/pulls/${pr.numero}`)
          .then((raw) => {
            const { additions, deletions } = object(raw) ?? {};
            if (Number.isSafeInteger(additions) && Number.isSafeInteger(deletions)) delivered.set(number, { ...pr, taille: { additions: additions as number, deletions: deletions as number } });
          })
          .catch(() => undefined),
      ];
    }),
  );
  // La base ne se lit que si un ticket est en pass : c'est le seul que sa couleur touche.
  let base: EtatDeLaBase | null = null;
  if (ofRail.some(({ numero: number, labels }) => labels.includes("in-pass") && delivered.has(number))) {
    const branch = object(await read(`/repos/${repository}`))?.default_branch;
    if (typeof branch === "string") base = stateOfTheBaseGithub(list(object(await read(`/repos/${repository}/commits/${encodeURIComponent(branch)}/check-runs?per_page=100`))?.check_runs));
  }
  const tickets: TicketOnGithub[] = [];
  const labelsRead: Record<number, string[]> = {};
  // Un ticket attendu découpé est attendu dans les tickets de son découpage, comme `status` le dit (runtime, attente-du-rail/status.ts).
  const splits = new Map(issues.flatMap((issue) => (typeof issue.number === "number" && porteListe(text(issue.body)) ? [[issue.number, ticketsDeLaListe(text(issue.body))] as const] : [])));
  const split = (n: number) => splits.get(n) ?? [];
  for (const { numero: number, titre: title, url, creeLe: createdThe, labels, corps: body, reparationDeMain: repairOfMain } of ofRail) {
    const pr = delivered.get(number) ?? null;
    // Parqué pour le chef par un label d'attente d'avant parked (ticket 4260), il garde l'étape où il est, comme sous `chef-todo` :
    // sa carte de TODO le dit (board/wait-of-chef.ts). Rien ne le prend pour autant (`estParque`, runtime).
    const issueRead: IssueLue = { state: "open", labels: labels.filter((label) => !LABELS_D_AVANT_PARKED_SANS_CARTE.includes(label)), pr: pr === null ? null : { state: "open", merged: false } };
    const label = labelOfSetAside(labels);
    const ofTheSetAside = label === null ? undefined : await allThePages(read, `/repos/${repository}/issues/${number}/comments`);
    const setAside = label === null || ofTheSetAside === undefined ? undefined : setAsideOf(repository, label, ofTheSetAside, number);
    const setAsideAt = label === null || ofTheSetAside === undefined ? null : setAsideOn(label, ofTheSetAside);
    // Gelé, la zone que sa PR ouverte tient (ticket 3924), des commentaires déjà lus : aucune lecture de plus.
    if (setAside) setAside.zoneTenue = zoneHeldOf(ofTheSetAside ?? [], pr, setAsideAt);
    const said = etatDuTicket(issueRead, base);
    const state = setAside !== undefined ? WORD_SET_ASIDE : said !== null ? WORD_OF_THE_STATE[said] : labels.includes(LABEL_TESTS_WRITTEN) ? WORD_TESTS_WRITTEN : WORD_IN_FILE;
    const ofTheTaking = HELD.has(state) ? list(await read(`/repos/${repository}/issues/${number}/comments?per_page=100`)) : undefined;
    // Pris, le label dit que le ticket est tenu : un retrait `unlabeled taken` déjà lu dont le label est encore là (la lecture
    // tombe dans la seconde du passage en pass) ne lui ôte pas sa station, et ses événements ne se lisent pas.
    const taking = ofTheTaking === undefined ? null : holdingOfTheIssue(ofTheTaking, state === "pris" ? [] : list(await read(`/repos/${repository}/issues/${number}/events?per_page=100`)));
    // Son dernier renvoi à un cook (ticket 3302), des commentaires déjà lus : aucune lecture de plus.
    const sendBack = lastSendBack(ofTheTaking ?? ofTheSetAside ?? []);
    // Ses prises (ticket 3823), des mêmes commentaires : un ticket relancé en boucle se compte sans lecture de plus.
    const taken = takenOfTheIssue(ofTheTaking ?? []);
    // En file, l'instant où `fire` lui a été posé (ticket 3433) ; des événements qui ne se lisent pas ne le disent pas, et
    // la durée n'est pas dite — le rail reste lu.
    const betweenThe = !IN_FILE.has(state) ? undefined : await read(`/repos/${repository}/issues/${number}/events?per_page=100`).then((raw) => (Array.isArray(raw) ? feuPoseLe(list(raw)) : null), () => null);
    // En file, ses attentes et d'où chacune est lue (ticket 3763) : son corps, et sa fiche et les arrêts de ses cooks, de ses
    // commentaires — illisibles, sa carte le dit, et le rail reste lu.
    const comments = !IN_FILE.has(state) ? [] : await read(`/repos/${repository}/issues/${number}/comments?per_page=100`).then((raw) => (Array.isArray(raw) ? list(raw).flatMap(({ body }) => (typeof body === "string" ? [body] : [])) : null), () => null);
    const { attentes: waits, commentairesLus: commentsRead } = attentesDuTicket({ ticket: number, corps: body, commentaires: comments, decoupage: split });
    // Parqué, qui il attend (ticket 3761), relu de sa marque : un ticket en file qui l'attend le nomme ; et, parqué par la
    // station en arrêtant la boucle de ses échecs, depuis quand (tickets 3875, 4129). Des commentaires illisibles taisent qui, le
    // rail reste lu.
    // Parqué par ses échecs, sa PR ouverte tient encore la zone que sa fiche déclare, depuis son parking (ticket 3924).
    const parking = state === WORD_OF_THE_STATE.parked ? await read(`/repos/${repository}/issues/${number}/comments?per_page=100`).then((raw) => ({ lus: list(raw), dit: parkingOf(list(raw)) }), () => null) : undefined;
    const who = parking === undefined ? undefined : (parking?.dit?.attente.who ?? null);
    const byFailures = parking?.dit?.attente.failures === true && parking.dit.le !== null ? { depuis: parking.dit.le, raison: parking.dit.attente.what } : null;
    const zoneOfParking = byFailures === null ? undefined : zoneHeldOf(parking?.lus ?? [], pr, byFailures.depuis);
    const parkedByFailures = byFailures === null ? null : { ...byFailures, ...(zoneOfParking === undefined ? {} : { zoneTenue: zoneOfParking }) };
    const depend = [...new Set(waits.map(({ ticket }) => ticket))];
    const zoneOfCard = !IN_FILE.has(state) || comments === null ? undefined : fiche(comments);
    const zone = zoneOfCard === null || zoneOfCard === undefined || zoneOfCard.problems.length > 0 || zoneOfCard.zone.length === 0 ? undefined : zoneOfCard.zone;
    const sourced = { ...(!IN_FILE.has(state) ? {} : { attentes: waits, commentairesLus: commentsRead }), ...(who === undefined ? {} : { qui: who }) };
    tickets.push({ ticket: number, titre: title, url, etat: state, priorite: priorityOf(labels), creeLe: createdThe, pr, prise: taking, ...(depend.length === 0 ? {} : { depend }), ...(zone === undefined ? {} : { zone }), ...sourced, ...(betweenThe === undefined ? {} : { entreLe: betweenThe }), ...(setAside === undefined ? {} : { miseDeCote: setAside }), ...(parkedByFailures === null ? {} : { parqueParEchecs: parkedByFailures }), ...(isSensitive(labels) ? { sensible: true as const } : {}), ...(sendBack === null ? {} : { renvoi: sendBack }), ...(repairOfMain ? { reparationDeMain: true as const } : {}), ...(taken[0] === undefined ? {} : { prises: { fois: taken.length, depuis: taken[0], ...((ofTheTaking?.length ?? 0) >= BY_PAGE ? { auMoins: true as const } : {}) } }) });
    // Ses labels, d'où le haut du backlog se tire (ticket 4223).
    labelsRead[number] = labels;
  }
  // L'ordre de merge (ticket 4044) : la lecture du runtime, sur les tickets lus — un ordre qui ne se lit pas ne lie rien.
  const onTheRail = new Set(tickets.filter(({ etat: state }) => STATES_OF_THE_FILE[state] !== undefined).map(({ ticket }) => ticket));
  const order = await lireLOrdreDuRail({
    depot: repository,
    lire: read,
    declarees: new Map(tickets.filter(({ etat: state }) => state === WORD_IN_FILE || state === WORD_TESTS_WRITTEN || state === "en pass").map(({ ticket, depend }) => [ticket, (depend ?? []).filter((n) => n !== ticket && onTheRail.has(n))] as const)),
    enPass: tickets.filter(({ etat: state }) => state === "en pass").map(({ ticket }) => ticket),
  }).catch(() => new Map<number, number[]>());
  for (const card of tickets) {
    const elders = order.get(card.ticket);
    if (elders !== undefined) card.apres = elders;
  }
  // Les tickets qu'aucun manager n'a pris (ticket 3358) : la lecture du runtime, sur les issues déjà lues — leurs
  // commentaires et leurs événements se relisent sous condition. Ce qui ne se lit pas est dit, et le rail reste lu.
  const notTaken: NotTakenRead = await readTheNotTaken({ depot: repository, lire: read, issues }).catch((error: unknown) => ({ illisible: error instanceof Error ? error.message : String(error) }));
  return { lu: readOne, tickets, servis: servedOnes, nonPris: notTaken, labelsLus: labelsRead };
}

// Une heure comme `status` l'écrit dans ses lignes : `2026-11-04 02:58 UTC` (slip.ts, `HEURE_EN`).
const hourIn = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

// La station d'un ticket : en pass ou base rouge, celle que la PR de sa livraison dit, sinon ce que sa prise dit encore.
const stationOfTicket = ({ etat: state, pr, prise: taking }: Pick<TicketOnGithub, "etat" | "pr" | "prise">): string | null => (state === "en pass" || state === "base rouge" ? pr?.station : null) ?? taking?.station ?? null;

// La ligne `status` d'un ticket (`  #<ticket>  <état>  <priorité>  <détail>  <titre>`), dans la forme que les bons du
// rail découpent (slip.ts, `FORMES`) : qui le tient et depuis sa prise, qui l'a cuisiné et depuis sa PR, et, en attente,
// depuis l'ouverture de son issue — GitHub ne date pas son entrée sur le rail sans lire son historique. Aucune
// pour un mot dont la forme n'a pas de détail (WAITING, base rouge), ni pour un ticket dont la station n'est pas lue :
// le bon dit alors ce que la file ne dit pas, plutôt qu'une ligne brute.
function lineOfTicket({ ticket, etat: state, priorite: priority, titre: title, creeLe: createdThe, pr, prise: taking }: TicketOnGithub): string | null {
  const prio = priority === null ? "-" : `prio:${priority}`;
  const write = (word: string, detail: string) => `  #${ticket}  ${word}  ${prio}  ${detail}  ${title}`;
  if (state === WORD_IN_FILE && createdThe !== "") return write("queued", `since ${hourIn(createdThe)}`);
  if (state === WORD_TESTS_WRITTEN && createdThe !== "") return write("tests written", `since ${hourIn(createdThe)}`);
  if (state === "pris" && taking !== null) return write("taken", `by ${taking.station} since ${hourIn(taking.le)}`);
  const station = stationOfTicket({ etat: state, pr, prise: taking });
  if (state === "en pass" && station !== null && pr !== null && pr.le !== "") return write("in pass", `since ${hourIn(pr.le)}, cooked by ${station}`);
  return null;
}

// Ce que la cuisine fait du ticket, en une ligne de sa carte (facts.ts, `direEnCeMoment`) : pris, son cook cuisine depuis
// sa prise ; en pass, sa PR attend d'être jugée et mergée — dite par son ticket (pr-of-ticket.js, ticket 3716).
function activityOf({ ticket, etat: state, pr, prise: taking }: TicketOnGithub): { activite?: { fait: string; cible: string | null; depuis: string } | null } {
  if (state === "pris") return { activite: taking === null ? null : { fait: "cooking", cible: null, depuis: taking.le } };
  if ((state === "en pass" || state === "base rouge") && pr !== null) return { activite: pr.le === "" ? null : { fait: "awaiting review and merge", cible: PR_OF_TICKET(ticket), depuis: pr.le } };
  return {};
}

// Les mots d'état comptés sur la ligne `rail` de `status`, dans son ordre et ses mots.
const ACCOUNTS: readonly (readonly [string, string])[] = [["pris", "taken"], ["en pass", "in pass"], ["base rouge", "base red"], ["WAITING", "WAITING"], ["tests écrits", "tests written"], ["en attente", "queued"], ["86", "set aside"]];

// Ce que GitHub dit du cook d'un ticket pris ou en pass : sa station, depuis sa prise, ce que la cuisine en fait, sa PR.
function cookOf(ticket: TicketOnGithub): ActivityOfCook[] {
  const { prise: taking, pr } = ticket;
  if (taking === null) return [];
  const activity = activityOf(ticket).activite ?? null;
  return [{
    ticket: ticket.ticket,
    titre: ticket.titre,
    run: "",
    station: taking.station,
    lanceLe: taking.le,
    finiLe: null,
    fin: null,
    maintenant: activity === null ? null : { ...activity, faitEn: activity.fait },
    etapes: [],
    tours: null,
    tokens: null,
    pr: pr === null ? null : { numero: pr.numero, url: pr.url },
  }];
}

// Les tickets du rail dans les états que la file dit (ticket 3433) : en file, pris, en pass — la base rouge est en pass, et
// un ticket dont les tests sont écrits (ticket 3725) est encore en file : aucun cook ne l'a pris.
// Un ticket mis de côté, ou en WAITING, n'en est pas.
const STATES_OF_THE_FILE: Record<string, TicketDuRail["etat"]> = { [WORD_IN_FILE]: "queued", [WORD_TESTS_WRITTEN]: "queued", pris: "taken", "en pass": "pass", "base rouge": "pass" };
export const ticketsOfTheWait = (tickets: readonly TicketOnGithub[]): TicketDuRail[] =>
  tickets.flatMap(({ ticket, etat: state, entreLe: betweenThe, depend, attentes: waits, commentairesLus: commentsRead, apres: after }) => (STATES_OF_THE_FILE[state] === undefined ? [] : [{ ticket, etat: STATES_OF_THE_FILE[state], entreLe: betweenThe ?? null, depend: depend ?? [], ...(waits === undefined ? {} : { attentes: waits }), ...(commentsRead === undefined ? {} : { commentairesLus: commentsRead }), ...(after === undefined ? {} : { apres: after }) }]));
// Les tickets en WAITING, et qui chacun attend (ticket 3761).
const ticketsInWaiting = (tickets: readonly TicketOnGithub[]): TicketEnWaiting[] => tickets.flatMap(({ ticket, etat: state, qui: who }) => (state === WORD_OF_THE_STATE.parked ? [{ ticket, qui: who ?? null }] : []));

// Le label et le début du titre de la réparation de main (ticket 3815), que le runtime n'ouvre plus (ticket 3945).
const LABEL_REPAIR_OF_MAIN = "repair-main";
const PREFIX_OF_THE_REPAIR = "Repair main:";

// La base rouge que le rail dit (ticket 3823) : sa réparation `repair-main` vivante — ni mise de côté, ni en WAITING —, que
// la cuisine ouvre tant que main est rouge et ferme une fois verte (ticket 3815). Depuis l'ouverture de l'issue, le check que son
// titre nomme ; la réparation, quand un cook ou la pass la tient. Sans elle, le rail ne dit pas la base rouge : il ne lit pas
// les checks de main, et une base rouge sans réparation n'a ni geste ni prise en charge à montrer.
function baseRedOfRail(tickets: readonly TicketOnGithub[]): BaseRedRead | null {
  const repair = tickets.filter(({ reparationDeMain: repairOfMain, miseDeCote: setAside, etat: state, creeLe: createdThe }) => repairOfMain === true && setAside === undefined && STATES_OF_THE_FILE[state] !== undefined && !Number.isNaN(Date.parse(createdThe))).sort((a, b) => Date.parse(a.creeLe) - Date.parse(b.creeLe))[0];
  if (repair === undefined) return null;
  const check = repair.titre.startsWith(PREFIX_OF_THE_REPAIR) ? repair.titre.slice(PREFIX_OF_THE_REPAIR.length).trim() : "";
  return { depuis: repair.creeLe, check, ticket: repair.ticket, reparation: STATES_OF_THE_FILE[repair.etat] === "queued" ? null : repair.ticket };
}

// Les alertes du haut du rail (ticket 3823, wait-of-rail/alerts.ts), de ce que la lecture du rail sait : l'en-tête
// — les stations qui cuisent ce projet —, le dernier cook — la PR la plus récente qu'un cook a ouverte —, le dernier service, la
// réparation de main, et les prises de chaque ticket. Le plafond de cooks, que GitHub ne publie pas, n'est jamais deviné.
// Ce que le ticket dit déjà de sa boucle : en WAITING, ou une carte qui attend le chef (ticket 4042).
function stopOfTheLoop(state: string, who: string | null | undefined, setAside: SetAside | undefined): { arret?: NonNullable<RelaunchRead["arret"]> } {
  if (setAside?.auChef === true) return { arret: { sorte: "carte", besoin: setAside.raison } };
  return state === WORD_OF_THE_STATE.parked ? { arret: { sorte: "waiting", qui: who ?? null } } : {};
}

function alertsOf(repository: string, tickets: readonly TicketOnGithub[], servedOnes: readonly ServedOnGithub[], cuisinent: readonly string[], stations: StationsLues, now: number): { alertesDuRail?: AlertOfRail[] } {
  const moreRecent = (instants: readonly string[]) => instants.filter((the) => !Number.isNaN(Date.parse(the))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const alerts = alertsOfRail({
    depot: repository,
    maintenant: now,
    tickets: ticketsOfTheWait(tickets),
    stations,
    plafondAtteint: false,
    entete: { cuisinent: [...new Set(cuisinent)] },
    cookEnCours: tickets.some(({ etat: state }) => state === "pris"),
    dernierCook: moreRecent(tickets.flatMap(({ pr }) => (pr === null ? [] : [pr.le]))),
    baseRouge: baseRedOfRail(tickets),
    relances: tickets.flatMap(({ ticket, prises: taken, etat: state, qui: who, miseDeCote: setAside }) => (taken === undefined ? [] : [{ ticket, ...taken, ...stopOfTheLoop(state, who, setAside) }])),
    dernierServiLe: moreRecent(servedOnes.map(({ livre: delivers }) => delivers)),
    misDeCoteParEchecs: tickets.flatMap(({ ticket, parqueParEchecs: parkedByFailures }) => (parkedByFailures === undefined ? [] : [{ ticket, depuis: parkedByFailures.depuis, raison: parkedByFailures.raison }])),
  });
  return alerts.length === 0 ? {} : { alertesDuRail: alerts };
}

// Le haut du backlog que la lecture porte ; facts.ts en compose l'écran (rail.ts). Ses labels seuls disent si une issue est
// calibrée et prête (rail-backlog.ts, une seule règle) ; son état dit seulement si une station la tient déjà — prise, en
// pass, ou qui attend un autre ticket —, ce qu'aucun label ne dit : celle-là a quitté la file.
function topOfBacklogOf(shown: readonly TicketOnGithub[], labelsRead: Readonly<Record<number, string[]>>): TopOfBacklogOfFacts {
  const inFile = shown.flatMap(({ ticket, titre: title, url, etat: state, creeLe: createdThe }) => (IN_FILE.has(state) ? [{ number: ticket, title: title, url, labels: labelsRead[ticket] ?? [], createdAt: createdThe }] : []));
  return { issues: railDuBacklog(() => inFile).rafraichir() };
}

// La lecture, dont le rail et les cooks sont ceux de GitHub : ses tickets dans l'ordre du service — la priorité, puis
// le plus ancien —, les lignes de leurs bons, ses compteurs, ce que fait leur cook, et ses stations d'après leurs prises
// et leurs signes de vie (ticket 2358) : `stationsSurGithub` dit à l'onglet Cooks quand ces signes ne se lisent pas. Un
// ticket mis de côté qui ne demande rien au chef reste sur le rail, dans sa colonne, avec sa ligne (ticket 2422) ; celui
// qui lui demande quelque chose est dans TODO, que `avecLAttenteDuChef` pose (board/wait-of-chef.ts, ticket 2460).
// Un ticket en file qui attend un ticket en WAITING (ticket 3761) est dit en WAITING, jamais en file au repos : ni compté en
// file, ni ticket prêt des alertes ou de la cuisine arrêtée ; sa carte dit ce qu'il attend, la ligne que la file lui donne.
export function withTheRail(readOne: BoardRead, { lu: readThe, tickets, servis: servedOnes = [], nonPris: notTaken, labelsLus: labelsRead = {} }: RailOnGithub, signs: SignsOfLife = SIGNS_NOT_READ): BoardRead {
  const ranges = [...tickets].sort((a, b) => (a.priorite ?? Number.POSITIVE_INFINITY) - (b.priorite ?? Number.POSITIVE_INFINITY) || a.ticket - b.ticket);
  const cooks: (Cook & { le: string })[] = ranges.flatMap(({ ticket, titre: title, prise: taking }) => (taking === null ? [] : [{ ticket, titre: title, station: taking.station, le: taking.le }]));
  const counters = object(readOne.faits.compteurs) ?? {};
  // Une station en pause de quota GitHub (ticket 3482) est retenue par GitHub, pas tue : la pause du compte se dit à part.
  // Une station qui cuit ou juge un ticket du projet le sert, même sans sélection de l'app (ticket 3797).
  const readOnes = "lus" in signs ? avecLesStationsQuiCuisent(withThePause(signs.lus, Date.parse(readThe)), readOne.depot, cooks.map(({ station }) => station)) : null;
  const stations = readOnes === null ? { illisibles: (signs as { illisible: string }).illisible } : { lues: readOnes };
  const pause = readOnes === null ? null : pauseOfAccount(readOnes, Date.parse(readThe));
  // Pourquoi la file ne part pas, et la ligne de ses cartes (ticket 3433) : la lecture du runtime, des mêmes signes de vie.
  const waiting = ticketsInWaiting(ranges);
  const wait = waitOfRailOf(readOne.depot, ticketsOfTheWait(ranges), stations, Date.parse(readThe), waiting);
  const inWaiting = new Set(waiting.map(({ ticket }) => ticket));
  const heldOnes = new Set(Object.entries(wait.attendusDesCartes ?? {}).flatMap(([ticket, itsOwn]) => (itsOwn.some((n) => inWaiting.has(n)) ? [Number(ticket)] : [])));
  const shown = ranges.map((ticket) => (heldOnes.has(ticket.ticket) ? { ...ticket, etat: WORD_OF_THE_STATE.parked } : ticket));
  const count = (...words: string[]) => shown.filter(({ etat: state }) => words.includes(state)).length;
  const saidOnes = ACCOUNTS.flatMap(([word, said]) => (count(word) === 0 ? [] : [`${count(word)} ${said}`]));
  return {
    ...readOne,
    luLe: readThe,
    cuisine: {
      rubriques: [
        ...readOne.cuisine.rubriques.filter(({ titre: title }) => title !== "rail" && title !== "cooks"),
        { titre: "rail", lignes: [saidOnes.length === 0 ? "0 on the rail" : saidOnes.join(" · ")] },
        { titre: "cooks", lignes: [cooks.length === 0 ? "none running" : `${cooks.length} running`] },
      ],
    },
    faits: {
      ...readOne.faits,
      lu: readThe,
      compteurs: { attend: 0, ...counters, livres24h: servedOnes.length, rail: shown.length, auTravail: count("pris"), aLaPass: count("en pass", "base rouge") },
      livres: servedOnes.map(({ ticket, titre: title, url, livre: delivers, station, pr, prLue: prRead }) => ({ ticket, titre: title, url, livre: delivers, station, pr, ...(prRead === undefined ? {} : { prLue: prRead }) })),
      rail: shown.map((ticket) => ({
        ...(ticket.miseDeCote === undefined || ticket.miseDeCote.auChef ? {} : { attente: { raison: ticket.miseDeCote.raison ?? WITHOUT_REASON, ...(ticket.miseDeCote.complete === undefined ? {} : { complete: ticket.miseDeCote.complete }), label: ticket.miseDeCote.label, colonne: COLUMN_OF_THE_SET_ASIDE, retour: null } }),
        ticket: ticket.ticket,
        etat: ticket.etat,
        titre: ticket.titre,
        url: ticket.url,
        ...(stationOfTicket(ticket) === null ? {} : { station: stationOfTicket(ticket) }),
        // Depuis quand il est dans sa colonne : sa prise s'il est pris, sa PR s'il est en pass.
        ...(ticket.etat === "pris" && ticket.prise !== null ? { depuis: ticket.prise.le } : {}),
        ...((ticket.etat === "en pass" || ticket.etat === "base rouge") && ticket.pr !== null && ticket.pr.le !== "" ? { depuis: ticket.pr.le } : {}),
        ...activityOf(ticket),
        ...(ticket.sensible === true ? { sensible: true } : {}),
        // Sa PR ouverte et son dernier renvoi (ticket 3302) : le récit du premier ticket les dit.
        ...(ticket.pr === null ? {} : { pr: { numero: ticket.pr.numero, url: ticket.pr.url, ...ticket.pr.taille, ...(ticket.pr.le === "" ? {} : { ouvertLe: ticket.pr.le }) } }),
        ...(ticket.renvoi === undefined ? {} : { renvoi: ticket.renvoi }),
      })),
      cooks: cooks.map(({ ticket, titre: title, station }) => ({ ticket, titre: title, station })),
      stations: stationsOfGithub(cooks, readOnes, readOne.depot, Date.parse(readThe)),
      stationsSurGithub: { illisible: "illisible" in signs ? signs.illisible : null },
      // Le rail bloqué (ticket 3358) : sa cause, des signes de vie des stations du compte.
      ...railBlockedOf(readOne.depot, notTaken, stations, Date.parse(readThe)),
      ...wait,
      // Les alertes du haut du rail (ticket 3823) : vraies — jamais contre l'en-tête —, datées, et chacune avec son geste ou
      // ce que la cuisine en fait.
      ...alertsOf(readOne.depot, shown, servedOnes, cooks.map(({ station }) => station), stations, Date.parse(readThe)),
      // La cuisine arrêtée (ticket 3924) : des tickets en file, aucune carte prise ni en pass — sa cause, et depuis quand.
      ...stopOfRail(ticketsOfTheWait(shown), shown, servedOnes, baseRedOfRail(shown)),
      // La pause de quota GitHub du compte (ticket 3482) : la tête de l'app la dit, chaque projet dit qu'il l'attend.
      ...(pause === null ? {} : { pauseQuota: pause }),
      // Le rail, haut du backlog (ticket 4223) : ses issues en file, calibrées et prêtes, par priorité puis âge.
      hautDuBacklog: topOfBacklogOf(shown, labelsRead),
      agents: [],
    },
    lignesDuRail: shown.flatMap((ticket) => {
      const line = lineOfTicket(ticket);
      return line === null ? [] : [{ ticket: ticket.ticket, priorite: ticket.priorite, ligne: line }];
    }),
    activites: shown.flatMap(cookOf),
  };
}
