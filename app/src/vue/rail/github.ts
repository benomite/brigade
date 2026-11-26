// Le rail et les cooks d'un projet, lus de GitHub (ticket 2220, épique 2209 ; seul chemin depuis le ticket 2061) : ses stations
// prennent, cuisent, jugent et mergent ses tickets sur GitHub, et la vue du rail et l'onglet Cooks lisent ce qu'elles y
// écrivent (tableau/read.ts).
//
// Ce qui se lit, à chaque lecture — toutes conditionnelles (`If-None-Match`) : un 304 ne coûte rien :
//   - ses issues ouvertes au label `fire` et ses PR ouvertes, page après page : le rail est chaque issue au label, son
//     état tiré de ses labels, de sa PR et de la base (`etatDuTicket`) — sans aucun des quatre, il est en attente ; une
//     épique, dont le corps liste les tickets, n'y est pas (ticket 2618) ;
//   - pour un ticket pris ou en pass, les commentaires et les événements de son issue : la station qui le tient
//     (vue/cooks/prises.ts). Ce sont les cooks de l'onglet Cooks, chacun sous sa station, avec sa PR quand il en a une.
// Et, pour les stations de l'onglet Cooks (ticket 2358), le signe de vie de chacune : l'enregistrement qu'elle réécrit dans son
// gist, sous le compte du chef, que le process principal lit à son pas (vue/cooks/signes-de-vie.ts) — reçu ici, pas lu.
import { porteListe, ticketsDeLaListe } from "../../../../runtime/src/epique.ts";
import { feuPoseLe } from "../../../../runtime/src/attente-du-rail/lecture.ts";
import { lireLOrdreDuRail } from "../../../../runtime/src/ordre-de-merge/lecture.ts";
import { lireLesNonTaken } from "../../rail-blocked/diagnostic.ts";
import type { AttenteSourcee, TicketDuRail, TicketEnWaiting } from "../../../../runtime/src/attente-du-rail/raison.ts";
import { attenteDeLIssue, type AttenteGitHub } from "../../../../runtime/src/attente-github/marque.ts";
import { attentesDuTicket } from "../../../../runtime/src/carte-attente/carte-attente.ts";
import { etatDuTicket, LABELS_D_AVANT_PARKED_SANS_CARTE, type EtatDeLaBase, type IssueLue } from "../../../../runtime/src/github-etat/etats.ts";
import { alertsDuRail, type AlertDuRail, type BaseRedLue, type RelanceLue } from "../../wait-du-rail/alerts.ts";
import type { SigneDeVie } from "../../../../runtime/src/stations-github/stations.ts";
import type { Cook } from "../../facts.ts";
import type { CallGitHub } from "../../tableau/client.ts";
import type { ActivityDuCook, TableauLu } from "../../tableau/read.ts";
import { labelDeMiseDeSide, LABEL_DU_TABLEAU_DE_LA_KITCHEN, miseDeSideDe, miseDeSideLe, SANS_RAISON, type MiseDeSide } from "../../tableau/mise-de-side-github.ts";
import { stateDeLaBaseGithub, WORD_DE_L_STATE, ticketDeLaPR } from "../../tableau/rail-github.ts";
import { prisesDeLIssue, stationsDeGithub, tenantDeLIssue, type Taking } from "../cooks/prises.ts";
import { estSensitive } from "../card-sensitive/label.ts";
import { PR_DU_TICKET } from "../pr-du-ticket.js";
import { dernierSendBack, type SendBack } from "./send-back.ts";
import { railBlockedDe, type NonTakenLus } from "../rail-blocked/rail-blocked.ts";
import { avecLesStationsQuiCuisent, type StationsLues } from "../../../../runtime/src/attente-du-rail/stations.ts";
import { waitDuRailDe } from "../wait-du-rail/wait-du-rail.ts";
import { avecLaPause, pauseDuAccount, type QuotaGithub } from "../pause-quota/pause-quota.ts";
import { fiche } from "../../../../runtime/src/fiche.ts";
import { stopDuRail, zoneTenueDe, type ZoneTenue } from "../banner-stop/stop-du-rail.ts";
import { railDuBacklog } from "../../../../runtime/src/rail-backlog/rail-backlog.ts";
import type { HautDuBacklogDesFacts } from "./rail.ts";

const LABEL_FIRE = "fire";
const WORD_EN_FILE = "en attente";
// Le label que portent encore les tickets passés par l'étape retirée (ticket 4229) : ils se lisent toujours.
const LABEL_TESTS_ECRITS = "tests-written";
// Le mot d'un ticket en file dont les tests d'acceptation sont écrits et gelés : l'étape `tests written` du rail, entre
// `queued` et `taken` (ticket 3725, label `tests-written`).
const WORD_TESTS_ECRITS = "tests écrits";
// Les mots d'un ticket en file, que la cuisine n'a pas encore pris.
const EN_FILE = new Set([WORD_EN_FILE, WORD_TESTS_ECRITS]);
// Le mot d'un ticket mis de côté (facts.ts, `TONS_DE_TICKET`) : sa carte est dans TODO (ticket 2075).
const WORD_MIS_DE_SIDE = "86";
// La colonne où reste un ticket mis de côté qui ne demande rien au chef (facts.ts, `COLONNES_DE_FAITS`) : celle du rail.
const COLONNE_DE_LA_MISE_DE_SIDE = "On the rail";
// La marque que la livraison porte dans le corps de sa PR : la station qui l'a cuisinée.
const STATION_DE_LA_PR = /Cooked by station `([A-Za-z0-9._/-]+)`/;
// Les mots dont un ticket a une station qui le tient.
const TENUS = new Set(["pris", "en pass", "base rouge"]);

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const liste = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

// La PR qui livre un ticket, telle que la carte la dit.
export type PrDuTicket = { numero: number; url: string; le: string; station?: string | null; taille?: { additions: number; deletions: number } };
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
export type TicketSurGithub = { ticket: number; titre: string; url: string; etat: string; priorite: number | null; creeLe: string; pr: PrDuTicket | null; prise: Taking | null; miseDeCote?: MiseDeSide; parqueParEchecs?: { depuis: string; raison: string; zoneTenue?: ZoneTenue }; sensible?: true; renvoi?: SendBack; depend?: number[]; zone?: string[]; entreLe?: string | null; attentes?: AttenteSourcee[]; commentairesLus?: boolean; apres?: number[]; qui?: string | null; reparationDeMain?: true; prises?: { fois: number; depuis: string; auMoins?: true } };
// Un ticket servi dans les 24 h : l'issue fermée par une PR mergée, avec cette PR et la station qui l'a cuisiné.
export type ServedSurGithub = { ticket: number; titre: string; url: string; livre: string; station: string | null; pr: string; prLue?: { additions?: number; deletions?: number; ouvertLe?: string } };
// `nonPris` : les tickets `fire` qu'aucun manager n'a pris (ticket 3358, rail-blocked/diagnostic.ts), ou pourquoi ils ne se
// lisent pas ; absent d'une lecture qui ne les a pas cherchés. `labelsLus` : les labels de l'issue de chaque ticket, d'où le
// haut du backlog se tire (ticket 4223) — un ticket sans eux n'est ni calibré ni prêt.
export type RailSurGithub = { lu: string; tickets: TicketSurGithub[]; servis?: ServedSurGithub[]; nonPris?: NonTakenLus; labelsLus?: Record<number, string[]> };
// Les signes de vie des stations du compte, tels que le process principal les a lus — ou pourquoi ils ne l'ont pas été,
// en une phrase.
// `quotaGithub` : son état de quota GitHub, quand elle le publie (ticket 3482, vue/pause-quota/) ; `id`, son gist.
export type SignesDeVie = { lus: (SigneDeVie & { id?: string; quotaGithub?: QuotaGithub })[] } | { illisible: string };
export const SIGNES_PAS_LUS: SignesDeVie = { illisible: "the app has not read your stations' signs of life on GitHub yet" };

// La priorité d'une issue : le plus petit `prio:<n>` de ses labels, null sans aucun.
const priorityDe = (labels: readonly string[]): number | null => {
  const lues = labels.flatMap((label) => { const n = /^prio:(\d+)$/.exec(label)?.[1]; return n === undefined ? [] : [Number(n)]; });
  return lues.length === 0 ? null : Math.min(...lues);
};

// Une liste de GitHub, page après page, jusqu'à une page qui n'est pas pleine — dix au plus. Une réponse qui n'est pas
// une liste lève : jamais un rail vide à sa place.
const PAR_PAGE = 100;
export async function toutesLesPages(lire: (chemin: string) => Promise<unknown>, chemin: string): Promise<Brut[]> {
  const toutes: Brut[] = [];
  for (let page = 1; page <= 10; page++) {
    const brute = await lire(`${chemin}${chemin.includes("?") ? "&" : "?"}per_page=${PAR_PAGE}&page=${page}`);
    if (!Array.isArray(brute)) throw new Error("GitHub's answer is not a list");
    const lue = liste(brute);
    toutes.push(...lue);
    if (lue.length < PAR_PAGE) break;
  }
  return toutes;
}

const VINGT_QUATRE_HEURES = 24 * 3600 * 1000;

// Les tickets servis dans les 24 h avant `maintenant` — ou la fenêtre `fenetreMs`, celle des chiffres d'autonomie
// (vue/autonomy/autonomy-github.ts) —, d'après les PR fermées, la plus récemment mise à jour d'abord :
// une lecture, page après page jusqu'à une PR plus ancienne que la fenêtre. Seule une PR mergée sert un ticket — une
// issue fermée sans PR mergée (not planned, doublon) n'est jamais servie. La station est celle que la PR dit avoir
// cuisiné (« Cooked by station `x` »). Le plus récemment mergé d'abord, un seul service par ticket.
export async function lireLesServed(lire: (chemin: string) => Promise<unknown>, repository: string, maintenant: number, fenetreMs = VINGT_QUATRE_HEURES): Promise<ServedSurGithub[]> {
  return (await lireLesServedParPages(lire, repository, maintenant, fenetreMs, 10, false)).servis;
}

// La même lecture, pour une fenêtre longue : jusqu'à `pagesMax` pages, et sans lever quand elle s'arrête avant
// d'avoir couvert la fenêtre — plafond atteint, ou page qui ne se lit pas après la première. `couvertDepuis` dit alors
// l'instant jusqu'où les PR sont toutes lues (les pages sont triées par mise à jour, et une PR est mise à jour au moins
// à son merge : toute PR mergée après la dernière mise à jour lue l'a été) ; null quand la fenêtre est entière.
// `raison` dit pourquoi elle s'est arrêtée. Une première page qui ne se lit pas lève : rien n'est lu.
export type ServedLus = { servis: ServedSurGithub[]; couvertDepuis: number | null; raison: string | null };
export const lireLesServedSurLaFenetre = (lire: (chemin: string) => Promise<unknown>, repository: string, maintenant: number, fenetreMs: number, pagesMax: number): Promise<ServedLus> =>
  lireLesServedParPages(lire, repository, maintenant, fenetreMs, pagesMax, true);

async function lireLesServedParPages(lire: (chemin: string) => Promise<unknown>, repository: string, maintenant: number, fenetreMs: number, pagesMax: number, partiel: boolean): Promise<ServedLus> {
  const depuis = maintenant - fenetreMs;
  const servedOnes = new Map<number, ServedSurGithub>();
  // Jusqu'où les pages lues couvrent : la mise à jour de la dernière PR de la dernière page lue.
  let lueJusque = maintenant;
  let couvertDepuis: number | null = null;
  let raison: string | null = null;
  for (let page = 1; page <= pagesMax; page++) {
    let lue: Brut[];
    try {
      const brute = await lire(`/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=${PAR_PAGE}&page=${page}`);
      if (!Array.isArray(brute)) throw new Error("GitHub's answer is not a list");
      lue = liste(brute);
    } catch (error) {
      if (!partiel || page === 1) throw error;
      raison = error instanceof Error ? error.message : String(error);
      couvertDepuis = lueJusque;
      break;
    }
    for (const pr of lue) {
      const mergeLe = texte(pr.merged_at);
      const instant = Date.parse(mergeLe);
      if (Number.isNaN(instant) || instant < depuis || instant > maintenant) continue;
      const ticket = ticketDeLaPR(texte(objet(pr.head)?.ref), texte(pr.body));
      if (ticket === null || typeof pr.number !== "number") continue;
      const connu = servedOnes.get(ticket);
      if (connu !== undefined && Date.parse(connu.livre) >= instant) continue;
      servedOnes.set(ticket, {
        ticket,
        titre: texte(pr.title).replace(/^#\d+\s*[—-]\s*/, ""),
        url: `https://github.com/${repository}/issues/${ticket}`,
        livre: mergeLe,
        station: STATION_DE_LA_PR.exec(texte(pr.body))?.[1] ?? null,
        pr: texte(pr.html_url),
      });
    }
    // Triées par mise à jour, une page dont la dernière PR est plus ancienne que la fenêtre n'a plus rien après elle.
    const derniere = Date.parse(texte(lue[lue.length - 1]?.updated_at));
    if (lue.length < PAR_PAGE || (!Number.isNaN(derniere) && derniere < depuis)) break;
    if (Number.isNaN(derniere)) {
      // Une page pleine dont la dernière PR n'a pas de date : on ne sait pas jusqu'où la lecture couvre.
      if (!partiel) continue;
      couvertDepuis = lueJusque;
      raison = "GitHub gave no update date for a pull request";
      break;
    }
    lueJusque = derniere;
    if (page === pagesMax && partiel) {
      couvertDepuis = derniere;
      raison = `more than ${pagesMax * PAR_PAGE} closed pull requests in the period`;
    }
  }
  return { servis: [...servedOnes.values()].sort((a, b) => Date.parse(b.livre) - Date.parse(a.livre)), couvertDepuis, raison };
}

// Le dernier commentaire de parking d'une issue (runtime/src/attente-github/marque.ts) : ce qu'il attend, et quand il a été
// posé — nul quand GitHub ne le dit pas. Aucun qui se lise : nul.
function parkingDe(commentaires: readonly Record<string, unknown>[]): { attente: AttenteGitHub; le: string | null } | null {
  for (const { body, author_association: association, created_at: le } of [...commentaires].reverse()) {
    const wait = attenteDeLIssue([{ body: texte(body), association: texte(association) }]);
    if (wait !== null) return { attente: wait, le: typeof le === "string" && !Number.isNaN(Date.parse(le)) ? le : null };
  }
  return null;
}

// Le rail d'un projet : ses tickets au label `fire`, chacun dans son état, avec sa PR et sa station. Un ticket qui porte
// `served-elsewhere` ou `out-of-kitchen` — sans `parked` — est mis de côté, quoi que ses autres labels disent : ses
// commentaires, toutes pages, disent pourquoi (tableau/mise-de-side-github.ts, ticket 2075). Une lecture qui échoue
// lève : la lecture du rail en dit la raison (tableau/read.ts).
export async function lireLeRailSurGithub(options: { depot: string; appeler: CallGitHub; maintenant?: () => Date }): Promise<RailSurGithub> {
  const { depot: repository, appeler } = options;
  const lire = async (chemin: string) => {
    const answer = await appeler(chemin);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status}`);
    return answer.data;
  };
  const issues = await toutesLesPages(lire, `/repos/${repository}/issues?state=open&labels=${LABEL_FIRE}&sort=created&direction=asc`);
  const prs = await toutesLesPages(lire, `/repos/${repository}/pulls?state=open`);
  const maintenant = (options.maintenant ?? (() => new Date()))();
  const lu = maintenant.toISOString();
  const servedOnes = await lireLesServed(lire, repository, maintenant.getTime());
  // La liste des PR ne dit ni leur taille ni leur ouverture : la PR seule les dit (ticket 4051). Une PR qui ne se lit pas n'en montre rien.
  await Promise.all(
    servedOnes.map(async (served, rang) => {
      const numero = /\/pull\/(\d+)$/.exec(served.pr)?.[1];
      if (numero === undefined) return;
      try {
        const { additions, deletions, created_at: ouvert } = objet(await lire(`/repos/${repository}/pulls/${numero}`)) ?? {};
        const prLue = {
          ...(Number.isSafeInteger(additions) && Number.isSafeInteger(deletions) ? { additions: additions as number, deletions: deletions as number } : {}),
          ...(typeof ouvert === "string" ? { ouvertLe: ouvert } : {}),
        };
        servedOnes[rang] = { ...served, prLue };
      } catch {
        // Illisible : la carte ne dit rien de sa taille.
      }
    }),
  );
  const livrees = new Map<number, PrDuTicket>();
  for (const pr of prs) {
    const ticket = ticketDeLaPR(texte(objet(pr.head)?.ref), texte(pr.body));
    if (ticket !== null && !livrees.has(ticket) && typeof pr.number === "number") livrees.set(ticket, { numero: pr.number, url: texte(pr.html_url), le: texte(pr.created_at), station: STATION_DE_LA_PR.exec(texte(pr.body))?.[1] ?? null });
  }
  const duRail = issues.flatMap((issue) => {
    if (issue.pull_request !== undefined || typeof issue.number !== "number") return [];
    const labels = liste(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));
    // Une épique dont le corps liste les tickets garde `fire` et sa `prio:` : elle se sert par ses tickets, jamais ne se
    // prend, et n'est pas sur le rail (ticket 2618).
    if (labels.includes(LABEL_DU_TABLEAU_DE_LA_KITCHEN) || porteListe(texte(issue.body))) return [];
    return [{ numero: issue.number, titre: texte(issue.title), url: texte(issue.html_url), creeLe: texte(issue.created_at), labels, corps: texte(issue.body), reparationDeMain: labels.includes(LABEL_REPARATION_DE_MAIN) }];
  });
  // La liste des PR ne dit pas leur taille : la PR seule la dit (ticket 4051). C'est une lecture de plus par ticket du rail, à chaque
  // lecture, toutes ensemble : autant d'appels sur la limite de GitHub. Une PR qui ne se lit pas n'en montre aucune — jamais un zéro.
  await Promise.all(
    duRail.flatMap(({ numero }) => {
      const pr = livrees.get(numero);
      if (pr === undefined) return [];
      return [
        lire(`/repos/${repository}/pulls/${pr.numero}`)
          .then((brute) => {
            const { additions, deletions } = objet(brute) ?? {};
            if (Number.isSafeInteger(additions) && Number.isSafeInteger(deletions)) livrees.set(numero, { ...pr, taille: { additions: additions as number, deletions: deletions as number } });
          })
          .catch(() => undefined),
      ];
    }),
  );
  // La base ne se lit que si un ticket est en pass : c'est le seul que sa couleur touche.
  let base: EtatDeLaBase | null = null;
  if (duRail.some(({ numero, labels }) => labels.includes("in-pass") && livrees.has(numero))) {
    const branch = objet(await lire(`/repos/${repository}`))?.default_branch;
    if (typeof branch === "string") base = stateDeLaBaseGithub(liste(objet(await lire(`/repos/${repository}/commits/${encodeURIComponent(branch)}/check-runs?per_page=100`))?.check_runs));
  }
  const tickets: TicketSurGithub[] = [];
  const labelsLus: Record<number, string[]> = {};
  // Un ticket attendu découpé est attendu dans les tickets de son découpage, comme `status` le dit (runtime, attente-du-rail/status.ts).
  const splits = new Map(issues.flatMap((issue) => (typeof issue.number === "number" && porteListe(texte(issue.body)) ? [[issue.number, ticketsDeLaListe(texte(issue.body))] as const] : [])));
  const split = (n: number) => splits.get(n) ?? [];
  for (const { numero, titre, url, creeLe, labels, corps, reparationDeMain } of duRail) {
    const pr = livrees.get(numero) ?? null;
    // Parqué pour le chef par un label d'attente d'avant parked (ticket 4260), il garde l'étape où il est, comme sous `chef-todo` :
    // sa carte de TODO le dit (tableau/wait-du-chef.ts). Rien ne le prend pour autant (`estParque`, runtime).
    const issueLue: IssueLue = { state: "open", labels: labels.filter((label) => !LABELS_D_AVANT_PARKED_SANS_CARTE.includes(label)), pr: pr === null ? null : { state: "open", merged: false } };
    const label = labelDeMiseDeSide(labels);
    const deLaMiseDeSide = label === null ? undefined : await toutesLesPages(lire, `/repos/${repository}/issues/${numero}/comments`);
    const miseDeSide = label === null || deLaMiseDeSide === undefined ? undefined : miseDeSideDe(repository, label, deLaMiseDeSide, numero);
    const misDeSideLe = label === null || deLaMiseDeSide === undefined ? null : miseDeSideLe(label, deLaMiseDeSide);
    // Gelé, la zone que sa PR ouverte tient (ticket 3924), des commentaires déjà lus : aucune lecture de plus.
    if (miseDeSide) miseDeSide.zoneTenue = zoneTenueDe(deLaMiseDeSide ?? [], pr, misDeSideLe);
    const dit = etatDuTicket(issueLue, base);
    const state = miseDeSide !== undefined ? WORD_MIS_DE_SIDE : dit !== null ? WORD_DE_L_STATE[dit] : labels.includes(LABEL_TESTS_ECRITS) ? WORD_TESTS_ECRITS : WORD_EN_FILE;
    const deLaTaking = TENUS.has(state) ? liste(await lire(`/repos/${repository}/issues/${numero}/comments?per_page=100`)) : undefined;
    // Pris, le label dit que le ticket est tenu : un retrait `unlabeled taken` déjà lu dont le label est encore là (la lecture
    // tombe dans la seconde du passage en pass) ne lui ôte pas sa station, et ses événements ne se lisent pas.
    const taking = deLaTaking === undefined ? null : tenantDeLIssue(deLaTaking, state === "pris" ? [] : liste(await lire(`/repos/${repository}/issues/${numero}/events?per_page=100`)));
    // Son dernier renvoi à un cook (ticket 3302), des commentaires déjà lus : aucune lecture de plus.
    const sendBack = dernierSendBack(deLaTaking ?? deLaMiseDeSide ?? []);
    // Ses prises (ticket 3823), des mêmes commentaires : un ticket relancé en boucle se compte sans lecture de plus.
    const prises = prisesDeLIssue(deLaTaking ?? []);
    // En file, l'instant où `fire` lui a été posé (ticket 3433) ; des événements qui ne se lisent pas ne le disent pas, et
    // la durée n'est pas dite — le rail reste lu.
    const entreLe = !EN_FILE.has(state) ? undefined : await lire(`/repos/${repository}/issues/${numero}/events?per_page=100`).then((brut) => (Array.isArray(brut) ? feuPoseLe(liste(brut)) : null), () => null);
    // En file, ses attentes et d'où chacune est lue (ticket 3763) : son corps, et sa fiche et les arrêts de ses cooks, de ses
    // commentaires — illisibles, sa carte le dit, et le rail reste lu.
    const commentaires = !EN_FILE.has(state) ? [] : await lire(`/repos/${repository}/issues/${numero}/comments?per_page=100`).then((brut) => (Array.isArray(brut) ? liste(brut).flatMap(({ body }) => (typeof body === "string" ? [body] : [])) : null), () => null);
    const { attentes, commentairesLus } = attentesDuTicket({ ticket: numero, corps, commentaires, decoupage: split });
    // Parqué, qui il attend (ticket 3761), relu de sa marque : un ticket en file qui l'attend le nomme ; et, parqué par la
    // station en arrêtant la boucle de ses échecs, depuis quand (tickets 3875, 4129). Des commentaires illisibles taisent qui, le
    // rail reste lu.
    // Parqué par ses échecs, sa PR ouverte tient encore la zone que sa fiche déclare, depuis son parking (ticket 3924).
    const parking = state === WORD_DE_L_STATE.parked ? await lire(`/repos/${repository}/issues/${numero}/comments?per_page=100`).then((brut) => ({ lus: liste(brut), dit: parkingDe(liste(brut)) }), () => null) : undefined;
    const qui = parking === undefined ? undefined : (parking?.dit?.attente.who ?? null);
    const parFailures = parking?.dit?.attente.failures === true && parking.dit.le !== null ? { depuis: parking.dit.le, raison: parking.dit.attente.what } : null;
    const zoneDuParking = parFailures === null ? undefined : zoneTenueDe(parking?.lus ?? [], pr, parFailures.depuis);
    const parqueParFailures = parFailures === null ? null : { ...parFailures, ...(zoneDuParking === undefined ? {} : { zoneTenue: zoneDuParking }) };
    const depend = [...new Set(attentes.map(({ ticket }) => ticket))];
    const zoneDeCard = !EN_FILE.has(state) || commentaires === null ? undefined : fiche(commentaires);
    const zone = zoneDeCard === null || zoneDeCard === undefined || zoneDeCard.problems.length > 0 || zoneDeCard.zone.length === 0 ? undefined : zoneDeCard.zone;
    const sourcees = { ...(!EN_FILE.has(state) ? {} : { attentes, commentairesLus }), ...(qui === undefined ? {} : { qui }) };
    tickets.push({ ticket: numero, titre, url, etat: state, priorite: priorityDe(labels), creeLe, pr, prise: taking, ...(depend.length === 0 ? {} : { depend }), ...(zone === undefined ? {} : { zone }), ...sourcees, ...(entreLe === undefined ? {} : { entreLe }), ...(miseDeSide === undefined ? {} : { miseDeCote: miseDeSide }), ...(parqueParFailures === null ? {} : { parqueParEchecs: parqueParFailures }), ...(estSensitive(labels) ? { sensible: true as const } : {}), ...(sendBack === null ? {} : { renvoi: sendBack }), ...(reparationDeMain ? { reparationDeMain: true as const } : {}), ...(prises[0] === undefined ? {} : { prises: { fois: prises.length, depuis: prises[0], ...((deLaTaking?.length ?? 0) >= PAR_PAGE ? { auMoins: true as const } : {}) } }) });
    // Ses labels, d'où le haut du backlog se tire (ticket 4223).
    labelsLus[numero] = labels;
  }
  // L'ordre de merge (ticket 4044) : la lecture du runtime, sur les tickets lus — un ordre qui ne se lit pas ne lie rien.
  const surLeRail = new Set(tickets.filter(({ etat: state }) => STATES_DE_LA_FILE[state] !== undefined).map(({ ticket }) => ticket));
  const ordre = await lireLOrdreDuRail({
    depot: repository,
    lire,
    declarees: new Map(tickets.filter(({ etat: state }) => state === WORD_EN_FILE || state === WORD_TESTS_ECRITS || state === "en pass").map(({ ticket, depend }) => [ticket, (depend ?? []).filter((n) => n !== ticket && surLeRail.has(n))] as const)),
    enPass: tickets.filter(({ etat: state }) => state === "en pass").map(({ ticket }) => ticket),
  }).catch(() => new Map<number, number[]>());
  for (const card of tickets) {
    const aines = ordre.get(card.ticket);
    if (aines !== undefined) card.apres = aines;
  }
  // Les tickets qu'aucun manager n'a pris (ticket 3358) : la lecture du runtime, sur les issues déjà lues — leurs
  // commentaires et leurs événements se relisent sous condition. Ce qui ne se lit pas est dit, et le rail reste lu.
  const nonTaken: NonTakenLus = await lireLesNonTaken({ depot: repository, lire, issues }).catch((error: unknown) => ({ illisible: error instanceof Error ? error.message : String(error) }));
  return { lu, tickets, servis: servedOnes, nonPris: nonTaken, labelsLus };
}

// Une heure comme `status` l'écrit dans ses lignes : `2026-11-04 02:58 UTC` (slip.ts, `HEURE_EN`).
const heureEn = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

// La station d'un ticket : en pass ou base rouge, celle que la PR de sa livraison dit, sinon ce que sa prise dit encore.
const stationDuTicket = ({ etat: state, pr, prise: taking }: Pick<TicketSurGithub, "etat" | "pr" | "prise">): string | null => (state === "en pass" || state === "base rouge" ? pr?.station : null) ?? taking?.station ?? null;

// La ligne `status` d'un ticket (`  #<ticket>  <état>  <priorité>  <détail>  <titre>`), dans la forme que les bons du
// rail découpent (slip.ts, `FORMES`) : qui le tient et depuis sa prise, qui l'a cuisiné et depuis sa PR, et, en attente,
// depuis l'ouverture de son issue — GitHub ne date pas son entrée sur le rail sans lire son historique. Aucune
// pour un mot dont la forme n'a pas de détail (WAITING, base rouge), ni pour un ticket dont la station n'est pas lue :
// le bon dit alors ce que la file ne dit pas, plutôt qu'une ligne brute.
function lineDuTicket({ ticket, etat: state, priorite: priority, titre, creeLe, pr, prise: taking }: TicketSurGithub): string | null {
  const prio = priority === null ? "-" : `prio:${priority}`;
  const ecrire = (word: string, detail: string) => `  #${ticket}  ${word}  ${prio}  ${detail}  ${titre}`;
  if (state === WORD_EN_FILE && creeLe !== "") return ecrire("queued", `since ${heureEn(creeLe)}`);
  if (state === WORD_TESTS_ECRITS && creeLe !== "") return ecrire("tests written", `since ${heureEn(creeLe)}`);
  if (state === "pris" && taking !== null) return ecrire("taken", `by ${taking.station} since ${heureEn(taking.le)}`);
  const station = stationDuTicket({ etat: state, pr, prise: taking });
  if (state === "en pass" && station !== null && pr !== null && pr.le !== "") return ecrire("in pass", `since ${heureEn(pr.le)}, cooked by ${station}`);
  return null;
}

// Ce que la cuisine fait du ticket, en une ligne de sa carte (facts.ts, `direEnCeMoment`) : pris, son cook cuisine depuis
// sa prise ; en pass, sa PR attend d'être jugée et mergée — dite par son ticket (pr-du-ticket.js, ticket 3716).
function activityDe({ ticket, etat: state, pr, prise: taking }: TicketSurGithub): { activite?: { fait: string; cible: string | null; depuis: string } | null } {
  if (state === "pris") return { activite: taking === null ? null : { fait: "cooking", cible: null, depuis: taking.le } };
  if ((state === "en pass" || state === "base rouge") && pr !== null) return { activite: pr.le === "" ? null : { fait: "awaiting review and merge", cible: PR_DU_TICKET(ticket), depuis: pr.le } };
  return {};
}

// Les mots d'état comptés sur la ligne `rail` de `status`, dans son ordre et ses mots.
const COMPTES: readonly (readonly [string, string])[] = [["pris", "taken"], ["en pass", "in pass"], ["base rouge", "base red"], ["WAITING", "WAITING"], ["tests écrits", "tests written"], ["en attente", "queued"], ["86", "set aside"]];

// Ce que GitHub dit du cook d'un ticket pris ou en pass : sa station, depuis sa prise, ce que la cuisine en fait, sa PR.
function cookDe(ticket: TicketSurGithub): ActivityDuCook[] {
  const { prise: taking, pr } = ticket;
  if (taking === null) return [];
  const activity = activityDe(ticket).activite ?? null;
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
const STATES_DE_LA_FILE: Record<string, TicketDuRail["etat"]> = { [WORD_EN_FILE]: "queued", [WORD_TESTS_ECRITS]: "queued", pris: "taken", "en pass": "pass", "base rouge": "pass" };
export const ticketsDeLWait = (tickets: readonly TicketSurGithub[]): TicketDuRail[] =>
  tickets.flatMap(({ ticket, etat: state, entreLe, depend, attentes, commentairesLus, apres }) => (STATES_DE_LA_FILE[state] === undefined ? [] : [{ ticket, etat: STATES_DE_LA_FILE[state], entreLe: entreLe ?? null, depend: depend ?? [], ...(attentes === undefined ? {} : { attentes }), ...(commentairesLus === undefined ? {} : { commentairesLus }), ...(apres === undefined ? {} : { apres }) }]));
// Les tickets en WAITING, et qui chacun attend (ticket 3761).
const ticketsEnWaiting = (tickets: readonly TicketSurGithub[]): TicketEnWaiting[] => tickets.flatMap(({ ticket, etat: state, qui }) => (state === WORD_DE_L_STATE.parked ? [{ ticket, qui: qui ?? null }] : []));

// Le label et le début du titre de la réparation de main (ticket 3815), que le runtime n'ouvre plus (ticket 3945).
const LABEL_REPARATION_DE_MAIN = "repair-main";
const PREFIXE_DE_LA_REPARATION = "Repair main:";

// La base rouge que le rail dit (ticket 3823) : sa réparation `repair-main` vivante — ni mise de côté, ni en WAITING —, que
// la cuisine ouvre tant que main est rouge et ferme une fois verte (ticket 3815). Depuis l'ouverture de l'issue, le check que son
// titre nomme ; la réparation, quand un cook ou la pass la tient. Sans elle, le rail ne dit pas la base rouge : il ne lit pas
// les checks de main, et une base rouge sans réparation n'a ni geste ni prise en charge à montrer.
function baseRedDuRail(tickets: readonly TicketSurGithub[]): BaseRedLue | null {
  const reparation = tickets.filter(({ reparationDeMain, miseDeCote: miseDeSide, etat: state, creeLe }) => reparationDeMain === true && miseDeSide === undefined && STATES_DE_LA_FILE[state] !== undefined && !Number.isNaN(Date.parse(creeLe))).sort((a, b) => Date.parse(a.creeLe) - Date.parse(b.creeLe))[0];
  if (reparation === undefined) return null;
  const check = reparation.titre.startsWith(PREFIXE_DE_LA_REPARATION) ? reparation.titre.slice(PREFIXE_DE_LA_REPARATION.length).trim() : "";
  return { depuis: reparation.creeLe, check, ticket: reparation.ticket, reparation: STATES_DE_LA_FILE[reparation.etat] === "queued" ? null : reparation.ticket };
}

// Les alertes du haut du rail (ticket 3823, wait-du-rail/alerts.ts), de ce que la lecture du rail sait : l'en-tête
// — les stations qui cuisent ce projet —, le dernier cook — la PR la plus récente qu'un cook a ouverte —, le dernier service, la
// réparation de main, et les prises de chaque ticket. Le plafond de cooks, que GitHub ne publie pas, n'est jamais deviné.
// Ce que le ticket dit déjà de sa boucle : en WAITING, ou une carte qui attend le chef (ticket 4042).
function stopDeLaBoucle(state: string, qui: string | null | undefined, miseDeSide: MiseDeSide | undefined): { arret?: NonNullable<RelanceLue["arret"]> } {
  if (miseDeSide?.auChef === true) return { arret: { sorte: "carte", besoin: miseDeSide.raison } };
  return state === WORD_DE_L_STATE.parked ? { arret: { sorte: "waiting", qui: qui ?? null } } : {};
}

function alertsDe(repository: string, tickets: readonly TicketSurGithub[], servedOnes: readonly ServedSurGithub[], cuisinent: readonly string[], stations: StationsLues, maintenant: number): { alertesDuRail?: AlertDuRail[] } {
  const plusRecent = (instants: readonly string[]) => instants.filter((le) => !Number.isNaN(Date.parse(le))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const alerts = alertsDuRail({
    depot: repository,
    maintenant,
    tickets: ticketsDeLWait(tickets),
    stations,
    plafondAtteint: false,
    entete: { cuisinent: [...new Set(cuisinent)] },
    cookEnCours: tickets.some(({ etat: state }) => state === "pris"),
    dernierCook: plusRecent(tickets.flatMap(({ pr }) => (pr === null ? [] : [pr.le]))),
    baseRouge: baseRedDuRail(tickets),
    relances: tickets.flatMap(({ ticket, prises, etat: state, qui, miseDeCote: miseDeSide }) => (prises === undefined ? [] : [{ ticket, ...prises, ...stopDeLaBoucle(state, qui, miseDeSide) }])),
    dernierServiLe: plusRecent(servedOnes.map(({ livre }) => livre)),
    misDeCoteParEchecs: tickets.flatMap(({ ticket, parqueParEchecs: parqueParFailures }) => (parqueParFailures === undefined ? [] : [{ ticket, depuis: parqueParFailures.depuis, raison: parqueParFailures.raison }])),
  });
  return alerts.length === 0 ? {} : { alertesDuRail: alerts };
}

// Le haut du backlog que la lecture porte ; facts.ts en compose l'écran (rail.ts). Ses labels seuls disent si une issue est
// calibrée et prête (rail-backlog.ts, une seule règle) ; son état dit seulement si une station la tient déjà — prise, en
// pass, ou qui attend un autre ticket —, ce qu'aucun label ne dit : celle-là a quitté la file.
function hautDuBacklogDe(montres: readonly TicketSurGithub[], labelsLus: Readonly<Record<number, string[]>>): HautDuBacklogDesFacts {
  const enFile = montres.flatMap(({ ticket, titre, url, etat: state, creeLe }) => (EN_FILE.has(state) ? [{ number: ticket, title: titre, url, labels: labelsLus[ticket] ?? [], createdAt: creeLe }] : []));
  return { issues: railDuBacklog(() => enFile).rafraichir() };
}

// La lecture, dont le rail et les cooks sont ceux de GitHub : ses tickets dans l'ordre du service — la priorité, puis
// le plus ancien —, les lignes de leurs bons, ses compteurs, ce que fait leur cook, et ses stations d'après leurs prises
// et leurs signes de vie (ticket 2358) : `stationsSurGithub` dit à l'onglet Cooks quand ces signes ne se lisent pas. Un
// ticket mis de côté qui ne demande rien au chef reste sur le rail, dans sa colonne, avec sa ligne (ticket 2422) ; celui
// qui lui demande quelque chose est dans TODO, que `avecLAttenteDuChef` pose (tableau/wait-du-chef.ts, ticket 2460).
// Un ticket en file qui attend un ticket en WAITING (ticket 3761) est dit en WAITING, jamais en file au repos : ni compté en
// file, ni ticket prêt des alertes ou de la cuisine arrêtée ; sa carte dit ce qu'il attend, la ligne que la file lui donne.
export function avecLeRail(lu: TableauLu, { lu: luLe, tickets, servis: servedOnes = [], nonPris: nonTaken, labelsLus = {} }: RailSurGithub, signes: SignesDeVie = SIGNES_PAS_LUS): TableauLu {
  const ranges = [...tickets].sort((a, b) => (a.priorite ?? Number.POSITIVE_INFINITY) - (b.priorite ?? Number.POSITIVE_INFINITY) || a.ticket - b.ticket);
  const cooks: (Cook & { le: string })[] = ranges.flatMap(({ ticket, titre, prise: taking }) => (taking === null ? [] : [{ ticket, titre, station: taking.station, le: taking.le }]));
  const compteurs = objet(lu.faits.compteurs) ?? {};
  // Une station en pause de quota GitHub (ticket 3482) est retenue par GitHub, pas tue : la pause du compte se dit à part.
  // Une station qui cuit ou juge un ticket du projet le sert, même sans sélection de l'app (ticket 3797).
  const lus = "lus" in signes ? avecLesStationsQuiCuisent(avecLaPause(signes.lus, Date.parse(luLe)), lu.depot, cooks.map(({ station }) => station)) : null;
  const stations = lus === null ? { illisibles: (signes as { illisible: string }).illisible } : { lues: lus };
  const pause = lus === null ? null : pauseDuAccount(lus, Date.parse(luLe));
  // Pourquoi la file ne part pas, et la ligne de ses cartes (ticket 3433) : la lecture du runtime, des mêmes signes de vie.
  const waiting = ticketsEnWaiting(ranges);
  const wait = waitDuRailDe(lu.depot, ticketsDeLWait(ranges), stations, Date.parse(luLe), waiting);
  const enWaiting = new Set(waiting.map(({ ticket }) => ticket));
  const tenus = new Set(Object.entries(wait.attendusDesCartes ?? {}).flatMap(([ticket, siens]) => (siens.some((n) => enWaiting.has(n)) ? [Number(ticket)] : [])));
  const montres = ranges.map((ticket) => (tenus.has(ticket.ticket) ? { ...ticket, etat: WORD_DE_L_STATE.parked } : ticket));
  const nombre = (...mots: string[]) => montres.filter(({ etat: state }) => mots.includes(state)).length;
  const dits = COMPTES.flatMap(([word, dit]) => (nombre(word) === 0 ? [] : [`${nombre(word)} ${dit}`]));
  return {
    ...lu,
    luLe,
    cuisine: {
      rubriques: [
        ...lu.cuisine.rubriques.filter(({ titre }) => titre !== "rail" && titre !== "cooks"),
        { titre: "rail", lignes: [dits.length === 0 ? "0 on the rail" : dits.join(" · ")] },
        { titre: "cooks", lignes: [cooks.length === 0 ? "none running" : `${cooks.length} running`] },
      ],
    },
    faits: {
      ...lu.faits,
      lu: luLe,
      compteurs: { attend: 0, ...compteurs, livres24h: servedOnes.length, rail: montres.length, auTravail: nombre("pris"), aLaPass: nombre("en pass", "base rouge") },
      livres: servedOnes.map(({ ticket, titre, url, livre, station, pr, prLue }) => ({ ticket, titre, url, livre, station, pr, ...(prLue === undefined ? {} : { prLue }) })),
      rail: montres.map((ticket) => ({
        ...(ticket.miseDeCote === undefined || ticket.miseDeCote.auChef ? {} : { attente: { raison: ticket.miseDeCote.raison ?? SANS_RAISON, ...(ticket.miseDeCote.complete === undefined ? {} : { complete: ticket.miseDeCote.complete }), label: ticket.miseDeCote.label, colonne: COLONNE_DE_LA_MISE_DE_SIDE, retour: null } }),
        ticket: ticket.ticket,
        etat: ticket.etat,
        titre: ticket.titre,
        url: ticket.url,
        ...(stationDuTicket(ticket) === null ? {} : { station: stationDuTicket(ticket) }),
        // Depuis quand il est dans sa colonne : sa prise s'il est pris, sa PR s'il est en pass.
        ...(ticket.etat === "pris" && ticket.prise !== null ? { depuis: ticket.prise.le } : {}),
        ...((ticket.etat === "en pass" || ticket.etat === "base rouge") && ticket.pr !== null && ticket.pr.le !== "" ? { depuis: ticket.pr.le } : {}),
        ...activityDe(ticket),
        ...(ticket.sensible === true ? { sensible: true } : {}),
        // Sa PR ouverte et son dernier renvoi (ticket 3302) : le récit du premier ticket les dit.
        ...(ticket.pr === null ? {} : { pr: { numero: ticket.pr.numero, url: ticket.pr.url, ...ticket.pr.taille, ...(ticket.pr.le === "" ? {} : { ouvertLe: ticket.pr.le }) } }),
        ...(ticket.renvoi === undefined ? {} : { renvoi: ticket.renvoi }),
      })),
      cooks: cooks.map(({ ticket, titre, station }) => ({ ticket, titre, station })),
      stations: stationsDeGithub(cooks, lus, lu.depot, Date.parse(luLe)),
      stationsSurGithub: { illisible: "illisible" in signes ? signes.illisible : null },
      // Le rail bloqué (ticket 3358) : sa cause, des signes de vie des stations du compte.
      ...railBlockedDe(lu.depot, nonTaken, stations, Date.parse(luLe)),
      ...wait,
      // Les alertes du haut du rail (ticket 3823) : vraies — jamais contre l'en-tête —, datées, et chacune avec son geste ou
      // ce que la cuisine en fait.
      ...alertsDe(lu.depot, montres, servedOnes, cooks.map(({ station }) => station), stations, Date.parse(luLe)),
      // La cuisine arrêtée (ticket 3924) : des tickets en file, aucune carte prise ni en pass — sa cause, et depuis quand.
      ...stopDuRail(ticketsDeLWait(montres), montres, servedOnes, baseRedDuRail(montres)),
      // La pause de quota GitHub du compte (ticket 3482) : la tête de l'app la dit, chaque projet dit qu'il l'attend.
      ...(pause === null ? {} : { pauseQuota: pause }),
      // Le rail, haut du backlog (ticket 4223) : ses issues en file, calibrées et prêtes, par priorité puis âge.
      hautDuBacklog: hautDuBacklogDe(montres, labelsLus),
      agents: [],
    },
    lignesDuRail: montres.flatMap((ticket) => {
      const line = lineDuTicket(ticket);
      return line === null ? [] : [{ ticket: ticket.ticket, priorite: ticket.priorite, ligne: line }];
    }),
    activites: montres.flatMap(cookDe),
  };
}
