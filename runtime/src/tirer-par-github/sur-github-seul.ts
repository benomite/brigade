// La station secondaire d'un projet servi sur l'état GitHub seul (#2219,
// `brigade-github.ts`) : elle y prend et y cuit des tickets comme la
// principale, par la même boucle qu'aujourd'hui (`cuisiner.ts`) — elle pose sa
// demande dans son gist, et lit sa réponse au Kitchen board.
//
// Ce qui change est la réponse. Sur l'état GitHub seul, le journal de la
// principale ne déclare plus aucune station et ne tient plus le rail : il
// répondrait « station inconnue » à toute demande relayée (`distantes.ts`). La
// principale ne la relaie donc pas pour qu'il décide (`relayer.ts`) : elle y
// répond elle-même, par les faits de GitHub, comme son propre tour les lit —
//   - réclamer : le premier ticket libre dans l'ordre de son tour (`prio:`,
//     puis le plus ancien), calibré, dont aucune PR ouverte ne tient la zone,
//     qu'elle prend par un commentaire de prise au nom de la station
//     (`github-etat/prise.ts`). Deux stations qui le réclament au même
//     instant — la principale pour son cook, la secondaire par elle —, le plus
//     ancien commentaire l'emporte : un ticket n'est jamais pris deux fois.
//     Sa mission est celle d'un cook du tour : la même consigne, la branche
//     `cook/<n>-github` — reprise de l'origine si une PR ouverte la porte —,
//     lancé dans le bac à sable du poste : la station qui n'en a pas ne
//     reçoit rien ;
//   - renouveler : accepté tant que la station tient le ticket sur l'issue ;
//     le chef qui retire `taken` ou `fire` arrête son cook ;
//   - rendre : livré, sa branche est sur l'origine — sa PR s'ouvre, le ticket
//     passe en pass, où n'importe quelle station la relit et la merge ; sans
//     livraison, le ticket est rendu sur l'issue, et pourquoi s'y dit.
//
// La réponse s'écrit au journal du projet avec sa demande, dans une seule
// transaction : le Kitchen board publie la première réponse à chaque demande
// (`tableau.ts`), c'est donc celle-ci, et non le refus que le journal y
// ajoute ensuite. Une demande déjà répondue ne l'est plus (sa clé au journal) ;
// une réponse qui n'a pas pu se faire — GitHub muet — n'est pas écrite : la
// demande est reprise à la lecture suivante, tant qu'elle est fraîche.
//
// Le bail d'une station qui se tait, et sa reprise, ne sont pas d'ici : une
// prise tient jusqu'à ce qu'on la lâche, comme celle de la principale.
import { existsSync } from "node:fs";
import type { Fichiers } from "../appairage/canal.ts";
import { configurerLeCook, constater, dansLeBacASable } from "../bac-a-sable/ordinaires.ts";
import { brancheDuTicket, runDuTicket, secoupent, zoneDuCorps, type GitHubDuTour, type TicketLu } from "../brigade-github.ts";
import { calibrage as calibrageDesLabels, complet } from "../calibrage.ts";
import { argumentsClaude, consigne } from "../claude.ts";
import type { Demande, Mission, Refus, Reponse } from "../events/remote.ts";
import { etatDuTicket, LABEL_IN_PASS, LABEL_TAKEN } from "../github-etat/etats.ts";
import { lacher, lireTenant, prendre } from "../github-etat/prise.ts";
import { HORS_CUISINE } from "../github.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { etatDesGardeFous } from "../projections/guardrails.ts";
import { sessionEnCours } from "../projections/sessions.ts";
import type { Regle } from "../reseau.ts";
import { demandesDuGist, FRAICHEUR_MS } from "./demande.ts";
import { cleDuRelais, type SecondaireARelayer } from "./relayer.ts";

// Le bail que la mission annonce : celui du rail (`BRIGADE_LEASE_SECONDS`, une
// demi-heure par défaut). La station renouvelle au tiers ; une prise ne tombe
// pas avec lui.
export const BAIL_MS = 30 * 60_000;

// Le marqueur des renvois d'une livraison (`brigade-github.ts`) : la mission
// reprise en dit le nombre.
const MARQUE_DE_RENVOI = "<!-- brigade:renvoi";

export type OptionsDeLaReponse = {
  repertoireEtat: string;
  // `<owner>/<repo>` : les demandes d'un autre projet de la station restent dans son gist.
  depot: string;
  // La branche d'intégration, que visent ses PR.
  base: string;
  secondaires: readonly SecondaireARelayer[];
  lire: (gist: string) => Promise<Fichiers | null>;
  github: GitHubDuTour;
  // La liste réseau du projet, que le bac à sable du cook ouvre.
  hotes: () => Regle[];
  dureeBailMs?: number;
  maintenant?: () => number;
};

// `repondues` : ce qui vient d'être répondu, et ce que la réponse dit en
// clair. `sansRuntime` : rien ne l'a été, aucun runtime ne publierait la
// réponse. `panne` : GitHub a manqué à une réponse — elle et les suivantes
// attendent la lecture d'après.
export type Reponses = { repondues: Array<{ station: string; id: string; verb: string; dit: string }>; sansRuntime: boolean; panne: string | null };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le rang d'un ticket dans l'ordre du tour : le plus petit `prio:N` qu'il porte.
const rangDePriorite = (ticket: Pick<TicketLu, "labels">): number =>
  Math.min(Number.POSITIVE_INFINITY, ...ticket.labels.map((label) => /^prio:(\d+)$/.exec(label)?.[1]).filter((n) => n !== undefined).map(Number));

// Le ticket d'un run du tour : `<n>-github`.
const ticketDuRun = (run: string): number | null => {
  const trouve = /^(\d+)-github$/.exec(run);
  return trouve === null ? null : Number(trouve[1]);
};

export async function repondreSurGitHubSeul(options: OptionsDeLaReponse): Promise<Reponses> {
  const { repertoireEtat, depot, base, github } = options;
  const maintenant = options.maintenant ?? Date.now;
  const dureeBailMs = options.dureeBailMs ?? BAIL_MS;
  const instant = maintenant();
  const lues: Array<{ station: string } & ReturnType<typeof demandesDuGist>[number]> = [];
  for (const { station, gist } of options.secondaires) {
    const fichiers = await options.lire(gist);
    if (fichiers === null) continue;
    for (const posee of demandesDuGist(fichiers, depot)) {
      if (instant - Date.parse(posee.le) <= FRAICHEUR_MS) lues.push({ station, ...posee });
    }
  }
  const repondues: Reponses["repondues"] = [];
  if (lues.length === 0) return { repondues, sansRuntime: false, panne: null };
  // Sans journal ni runtime qui tourne, aucun tableau ne publierait la réponse.
  if (!existsSync(cheminJournal(repertoireEtat))) return { repondues, sansRuntime: true, panne: null };
  const journal = ouvrirJournal(repertoireEtat, { maintenant: () => new Date(maintenant()) });
  try {
    const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet || !sessionEnCours(journal.base)) return { repondues, sansRuntime: true, panne: null };
    const dejaRepondue = (station: string, id: string) => journal.base.lire<{ seq: number }>("SELECT seq FROM events WHERE dedup_key = ?", cleDuRelais(station, id)).length > 0;

    const reclamer = async (station: string, demande: Extract<Demande, { verb: "claim" }>): Promise<{ reponse: Reponse; dit: string; ticket: number | null }> => {
      const rien = (held: string | null, dit: string) => ({ reponse: { ok: true, verb: "claim", mission: null, held } as const, dit, ticket: null });
      // Le poste du chef ne lance aucun cook à nu : sans bac à sable, rien ne part.
      const hotes = options.hotes();
      const poste = constater(demande.sandbox, hotes);
      if (!poste.disponible) return rien(`no ticket without the Claude Code sandbox on its workstation — ${poste.raison}`, `rien, faute de bac à sable sur son poste — ${poste.raison}`);
      const limits = etatDesGardeFous(journal.base).limits;
      if (limits === null) return { reponse: { ok: false, verb: "claim", refusal: "invalid", said: "guardrails without caps in the log: no cook leaves without them" }, dit: "refusé, les garde-fous du projet n'ont pas de plafonds au journal", ticket: null };
      // Libres, comme le tour les lit : ni pris, ni en pass, ni en attente, ni hors cuisine.
      const libres = (await github.fires())
        .filter((ticket) => !ticket.labels.includes(HORS_CUISINE) && !ticket.labels.includes(LABEL_IN_PASS) && !ticket.labels.includes(LABEL_TAKEN) && etatDuTicket({ state: ticket.state, labels: ticket.labels, pr: null }) === null)
        .sort((x, y) => rangDePriorite(x) - rangDePriorite(y) || x.number - y.number);
      let ouvertes: Awaited<ReturnType<GitHubDuTour["prsOuvertes"]>> | null = null;
      for (const ticket of libres) {
        const calibrage = calibrageDesLabels(ticket.labels);
        if (!complet(calibrage)) continue;
        const zone = zoneDuCorps(await github.corpsDuTicket(ticket.number));
        if (zone.length > 0) {
          ouvertes ??= await github.prsOuvertes();
          const propre = brancheDuTicket(ticket.number);
          if (ouvertes.some((pr) => pr.branche !== propre && pr.fichiers.some((fichier) => zone.some((entree) => secoupent(entree, fichier))))) continue;
        }
        if (!(await prendre(ticket, { github, station })).prise) continue;
        const numero = ticket.number;
        const run = runDuTicket(numero);
        const branch = brancheDuTicket(numero);
        // Une PR ouverte porte déjà une livraison, renvoyée : le cook repart de sa branche.
        const pr = await github.prDuTicket(numero);
        const reprise = pr !== null && pr.state === "open" && !pr.merged;
        const renvois = reprise ? (await github.commentaires(numero)).filter((commentaire) => commentaire.body.startsWith(MARQUE_DE_RENVOI)).length : 0;
        const prompt = consigne({ ticket: numero, titre: ticket.title, depot, base });
        const mission: Mission = {
          ticket: numero,
          title: ticket.title,
          run,
          branch,
          base,
          repository: depot,
          ...calibrage,
          prompt,
          args: dansLeBacASable(argumentsClaude(prompt, calibrage), configurerLeCook(poste.poste, run, hotes)),
          sandbox: true,
          limits,
          leaseMs: dureeBailMs,
          leaseUntil: new Date(maintenant() + dureeBailMs).toISOString(),
          resumes: reprise ? { returns: renvois, pr: `https://github.com/${depot}/pull/${pr.number}` } : null,
        };
        return { reponse: { ok: true, verb: "claim", mission, held: null }, dit: `prend #${numero}, sa prise est sur l'issue`, ticket: numero };
      }
      return rien(null, "rien à prendre");
    };

    type Refuser = (refusal: Refus, said: string, plus?: { stop?: string | null }) => Reponse;
    // Le ticket d'un run, s'il est encore tenu par la station sur l'issue ; sinon le refus qui le dit.
    const tenu = async (station: string, run: string, refuser: Refuser): Promise<number | Reponse> => {
      const numero = ticketDuRun(run);
      if (numero === null) return refuser("unknown-run", `no GitHub-only cook ${run}: its run is \`<ticket>-github\``);
      const tenant = await lireTenant(numero, github);
      if (tenant?.station !== station) return refuser("stopped", `ticket #${numero} is no longer held by ${station} on its issue${tenant === null ? "" : ` (${tenant.station} holds it)`}: stop your cook — nothing it would deliver is received`, { stop: "stop" });
      return numero;
    };

    const repondre = async (station: string, demande: Demande): Promise<{ reponse: Reponse; dit: string; ticket: number | null }> => {
      const verb = demande.verb;
      const refuser: Refuser = (refusal, said, plus = {}) => ({ ok: false, verb, refusal, said, ...plus });
      switch (demande.verb) {
        case "claim":
          return reclamer(station, demande);
        case "renew": {
          const numero = await tenu(station, demande.run, refuser);
          if (typeof numero !== "number") return { reponse: numero, dit: `refusé, ${demande.run} n'est plus à elle`, ticket: null };
          return { reponse: { ok: true, verb: "renew", leaseUntil: new Date(maintenant() + dureeBailMs).toISOString() }, dit: `bail de #${numero} renouvelé`, ticket: numero };
        }
        case "deliver": {
          const numero = await tenu(station, demande.run, refuser);
          if (typeof numero !== "number") return { reponse: numero, dit: `refusé, ${demande.run} n'est plus à elle`, ticket: null };
          const ticket = { number: numero, labels: [LABEL_TAKEN] };
          if (demande.ending === "failed") {
            await github.commenter(numero, `Station \`${station}\`: the cook stopped without a delivery — ${demande.reason ?? "it did not say why"}`);
            await lacher(ticket, { github, station });
            return { reponse: { ok: true, verb: "deliver", ending: "failed", reason: demande.reason }, dit: `#${numero} rendu sans livraison, l'issue dit pourquoi`, ticket: numero };
          }
          // Sa branche est sur l'origine : sa PR s'ouvre — un renvoi pousse sur
          // celle qui l'est déjà —, puis `in-pass` avant le retrait de `taken`,
          // comme dans le tour : aucune station ne le lit libre entre les deux.
          const ouverte = await github.prDuTicket(numero);
          if (ouverte === null || ouverte.state !== "open") {
            const titre = (await github.fires()).find((lu) => lu.number === numero)?.title ?? "";
            await github.ouvrirPR({ branche: brancheDuTicket(numero), base, titre: `#${numero} — ${titre}`, corps: `Closes #${numero}\n\nCooked by station \`${station}\`.` });
          }
          await github.labelliser(numero, [LABEL_IN_PASS]);
          await github.delabelliser(numero, LABEL_TAKEN);
          return { reponse: { ok: true, verb: "deliver", ending: "done", reason: null }, dit: `#${numero} livré, sa PR est en pass`, ticket: numero };
        }
        default:
          return { reponse: refuser("invalid", "on the GitHub-only state a station does not announce itself: it claims"), dit: "refusé, elle ne s'annonce pas sur l'état GitHub seul", ticket: null };
      }
    };

    // Une demande à la fois, la plus ancienne d'abord : deux réclamations ne
    // se disputent jamais le même ticket ici.
    for (const { station, id, demande } of lues) {
      if (dejaRepondue(station, id)) continue;
      let repondue: Awaited<ReturnType<typeof repondre>>;
      try {
        repondue = await repondre(station, demande);
      } catch (erreur) {
        return { repondues, sansRuntime: false, panne: `${station} (${demande.verb}): ${message(erreur)}` };
      }
      const { reponse, dit, ticket } = repondue;
      journal.base.transaction(() => {
        const ecrite = journal.ajouter({ project: projet, ticket: null, author: `station:${station}`, type: "remote.asked", payload: { id, station, via: "github", ...demande }, dedupKey: cleDuRelais(station, id) });
        if (ecrite === null) return;
        journal.ajouter({ project: projet, ticket, author: "station", type: "remote.answered", payload: { id, station, ...reponse } });
        repondues.push({ station, id, verb: demande.verb, dit });
      });
    }
    return { repondues, sansRuntime: false, panne: null };
  } finally {
    journal.fermer();
  }
}
