// La station `box/claude` : elle vient prendre un ticket sur le rail, lui
// fabrique un worktree, y lance un cook sous garde-fous, lit comment il finit,
// et rend au rail ce que cette fin veut dire. Le manager ne spawne rien — c'est
// elle qui se sert.
//
// Le worktree est rendu exécutable avant que le cook n'y entre : le setup du
// projet, s'il en a un, y passe d'abord — le même que celui que la pass joue
// avant les gates — et ce qu'il exporte fait partie de l'environnement du cook.
//
// Elle ne garde en mémoire que le cook qu'elle attend : pouvoir servir se lit
// dans le journal, donc tient après un redémarrage.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RuntimeAvecRail } from "./alimenter.ts";
import { complet, manquant, type Calibrage } from "./calibrage.ts";
import { argumentsClaude, consigne, environnementCook, lireFlux, verdict, VARIABLES_DE_JETON, type Lecture, type Session } from "./claude.ts";
import { ouvrirDepot, type Depot } from "./depot.ts";
import type { FaitStation, FinDeCook } from "./evenements/station.ts";
import { illisible, MARQUEUR } from "./fiche.ts";
import { jouerSetup, SCRIPT_SETUP } from "./gates.ts";
import { LancementRefuse, nomDeRun, type CookLance, type FinDeCook as FinGardee, type GardeFous, type Verdict } from "./garde-fous.ts";
import type { GitHub } from "./github.ts";
import { consigneDeRenvoi, RENVOIS_MAX } from "./pass.ts";
import { cooksEnCours, etatDesGardeFous } from "./projections/garde-fous.ts";
import { passDuTicket, renvoiEnAttente } from "./projections/pass.ts";
import { communsDuRail, lireRail, ticketDuRail, type TicketRail } from "./projections/rail.ts";
import { etatStation } from "./projections/stations.ts";
import { GesteRefuse } from "./rail.ts";
import { ConfigInvalide } from "./runtime.ts";
import type { Fin } from "./superviseur.ts";
import { horsZone, possede } from "./zones.ts";

export const STATION = "box/claude";
// Un cook = un ticket, et une seule station sur le compte Max : le parallélisme
// vaut un. Sa valeur se réglera quand plusieurs stations se partageront le
// compte.
const ANNONCE = { station: STATION, engine: "claude", provides: ["code"], maxCooks: 1 };
const AUTEUR = `station:${STATION}`;

// Les motifs que la station écrit sur le rail.
export const SANS_CALIBRAGE = "no-calibration";
const CALIBRE = "calibrated";
export const FICHE_ILLISIBLE = "unreadable-card";
const FICHE_LISIBLE = "card-readable";
const QUOTA = "quota";
const DECONNEXION = "disconnected";
const SETUP_EN_ECHEC = "setup-failed";
// Un cook qui conclut sans rien commiter : son compte-rendu est son livrable.
export const SANS_DIFF = "no-diff";

const HEURE = 3_600_000;
// Un quota épuisé qui ne dit pas quand il revient est retenté une heure après.
const REPLI_QUOTA_MS = HEURE;
// Un worktree impossible à préparer (origine injoignable) : le ticket est
// reproposé dix minutes plus tard, sans cook perdu.
const REPLI_WORKTREE_MS = 600_000;
// Le setup du projet tient dans la moitié du bail du ticket : le cook part
// avant qu'il ne tombe.
const PART_DU_SETUP = 0.5;
// Ce que la station garde de la sortie d'un setup en échec, pour journald.
const FIN_DE_SETUP_MAX = 2000;
// Le worktree d'un cook est regardé au tick, au plus une fois par dixième de
// bail : un `git status` toutes les trois minutes pour un bail de trente.
const REGARDS_PAR_BAIL = 10;
// GitHub refuse un commentaire au-delà de 65 536 caractères.
const COMPTE_RENDU_MAX = 20_000;
// Ce que le commentaire nomme des fichiers écrits hors zone ; le journal les
// porte tous.
const HORS_ZONE_MAX = 20;

export type ConfigStation = {
  // Le clone du dépôt du projet, réservé à la station.
  clone: string;
  // La branche d'intégration : d'où part le worktree, où vise la PR.
  base: string;
  // Le binaire `claude`. Surchargé par les tests, jamais sur la box.
  bin: string;
};

// Lit la configuration de la station dans l'environnement. Ni le clone ni la
// branche n'ont de défaut ; et rien ne doit détourner `claude` de la connexion
// Max de la machine.
export function configStation(env: Record<string, string | undefined>): ConfigStation {
  for (const variable of VARIABLES_DE_JETON) {
    if (env[variable]) {
      throw new ConfigInvalide(
        `${variable} est défini : la station ne pilote \`claude\` que par la connexion Max de la machine, jamais par une clé ou un jeton — retirer la variable`,
      );
    }
  }
  const clone = env.BRIGADE_REPO_DIR;
  if (!clone) throw new ConfigInvalide("BRIGADE_REPO_DIR n'est pas défini");
  const base = env.BRIGADE_BASE_BRANCH;
  if (!base) throw new ConfigInvalide("BRIGADE_BASE_BRANCH n'est pas défini");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base)) {
    throw new ConfigInvalide(`BRIGADE_BASE_BRANCH invalide : « ${base} » — attendu un nom de branche (v2, main)`);
  }
  return { clone, base, bin: env.BRIGADE_CLAUDE_BIN || "claude" };
}

export type OptionsStation = {
  repertoireEtat: string;
  depot: Depot;
  github: GitHub;
  // `<owner>/<repo>`, pour la consigne du cook.
  depotGitHub: string;
  base: string;
  bin: string;
  // La session Max de la machine, demandée une fois au démarrage.
  session: () => Promise<Session>;
  // L'environnement dont part celui des cooks. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  dureeBailMs: number;
  maintenant?: () => Date;
  // Où va ce que la station a à dire hors du journal (journald). Par défaut,
  // la sortie d'erreur du process.
  avertir?: (message: string) => void;
  // Appelé une fois la fin d'un cook racontée : la pass n'attend pas le tick.
  apresCook?: () => void;
};

// Ouvre le dépôt de la station là où le runtime le range : les worktrees des
// cooks vivent dans le répertoire d'état, à côté de leurs flux bruts.
export function depotDeStation(repertoireEtat: string, config: ConfigStation): Depot {
  return ouvrirDepot({ clone: config.clone, base: config.base, worktrees: join(repertoireEtat, "worktrees") });
}

// Ce que la station retient d'un cook entre le moment où elle juge sa fin et
// celui où elle la raconte.
// `sansCommit` : son worktree ne porte aucun commit — il n'y a ni branche à
// pousser ni PR à ouvrir.
type Conclusion = { fin: FinDeCook; raison: string | null; lecture: Lecture; sansCommit: boolean };

// Un ticket que la pass a renvoyé : son cook repart de la livraison refusée.
type Reprise = { n: number; pr: string | null };

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const duree = (ms: number) =>
  ms >= 60_000 ? `${(ms / 60_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min` : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const chemins = (zone: string[]) => zone.map((chemin) => `\`${chemin}\``).join(", ") || "aucune";
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce que la station dit d'un cook que le bail de son ticket a arrêté.
const sansProgres = (fin: FinGardee): string | null =>
  fin.arret?.reason === "lease" ? `Aucun progrès dans son worktree depuis ${duree(fin.arret.observed ?? 0)} : le bail du ticket est tombé.` : null;

function entete(fin: string, calibrage: Calibrage, mesure: Fin): string {
  return [
    `**Cook \`${STATION}\` — ${fin}**`,
    `\`${calibrage.model}\` / \`${calibrage.effort}\``,
    pluriel(mesure.turns, "tour"),
    `${nombre(mesure.tokens)} tokens`,
    duree(mesure.durationMs),
  ].join(" · ");
}

// Le corps de la PR d'une livraison. Le calibrage manque si le ticket l'a
// perdu depuis son cook.
const corpsDePR = (numero: number, calibrage: Calibrage | null, compteRendu: string | null) =>
  [`Ticket #${numero}, cuisiné par \`${STATION}\`${calibrage ? ` (\`${calibrage.model}\` / \`${calibrage.effort}\`)` : ""}.`, "", compteRendu ?? ""].join("\n");

// Rend le runtime, augmenté de sa station. Son `arreter` l'emporte avec lui.
export function brancherStation<R extends RuntimeAvecRail & GardeFous>(runtime: R, options: OptionsStation): R {
  const { journal, projet, rail } = runtime;
  const { base } = journal;
  const { depot, github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const envCook = environnementCook(options.env ?? process.env);
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const pasDeRegard = options.dureeBailMs / REGARDS_PAR_BAIL;
  const noter = (ticket: number | null, fait: FaitStation) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

  // Un geste du rail refusé : le ticket a quitté le rail ou changé de mains
  // pendant que le cook tournait. Il n'y a plus rien à en dire.
  const geste = (faire: () => void): boolean => {
    try {
      faire();
      return true;
    } catch (erreur) {
      if (erreur instanceof GesteRefuse) return false;
      throw erreur;
    }
  };

  // Un ticket en pass dont le cook n'a pas de compte-rendu : la pass part de
  // `cook.reported`, elle ne verra jamais cette livraison.
  const sansCompteRendu = (numero: number): boolean => {
    const phase = passDuTicket(base, numero)?.phase;
    return ticketDuRail(base, numero)?.state === "pass" && (phase === "cooking" || phase === "returned");
  };
  // Lus au démarrage, où aucun cook ne tourne : ce sont ceux qu'une vie
  // précédente a envoyés en pass avant de mourir. Plus tard, le même état est
  // celui d'un cook que la station est en train de raconter.
  const aReprendre: number[] = [];

  base.transaction(() => {
    const connue = etatStation(base, STATION);
    const { announcedAt, quotaUntil, quotaReason, disconnectedAt, disconnectedReason, ...annoncee } = connue ?? { station: null };
    if (JSON.stringify(annoncee) !== JSON.stringify(ANNONCE)) noter(null, { type: "station.announced", payload: ANNONCE });
    // Aucun cook ne tourne au démarrage : un ticket encore tenu par la station
    // est celui d'une vie précédente, morte entre le prêt et le lancement.
    for (const ticket of rail.tickets()) {
      if (ticket.state === "taken" && ticket.station === STATION) geste(() => rail.rendre(ticket.ticket, "station-restarted", STATION));
      if (ticket.station === STATION && sansCompteRendu(ticket.ticket)) aReprendre.push(ticket.ticket);
    }
  });

  let arrete = false;
  // Arrête le setup en cours quand le runtime s'en va.
  const abandon = new AbortController();
  // Le regard de la station sur le worktree du cook en cours, porté au tick.
  let observer: (() => void) | undefined;

  // Les deux seules choses que la station écrit sur GitHub en dehors de la PR.
  // Un commentaire qui ne part pas ne retient rien : le journal a déjà tout.
  const commenter = async (ticket: number, corps: string) => {
    try {
      await github.commenter(ticket, corps);
    } catch (erreur) {
      if (!arrete) avertir(`brigade : commentaire non posté sur le ticket #${ticket} — ${message(erreur)}`);
    }
  };

  const deconnecter = (ticket: number | null, raison: string, run: string | null) => {
    noter(ticket, { type: "station.disconnected", payload: { station: STATION, reason: raison, run } });
    avertir(
      `brigade : connexion Max de la station ${STATION} absente ou expirée (${raison}) — \`claude /login\` sous le compte du service, puis « reprendre »`,
    );
  };

  const peutServir = (): boolean => {
    const garde = etatDesGardeFous(base);
    if (garde.stoppedAt !== null || garde.breakerOpenedAt !== null) return false;
    const etat = etatStation(base, STATION);
    if (etat?.disconnectedAt) return false;
    if (etat?.quotaUntil && etat.quotaUntil > maintenant().toISOString()) return false;
    return cooksEnCours(base).length < ANNONCE.maxCooks;
  };

  // Un ticket refusé revient en attente dès que ce qui lui manquait est là :
  // son calibrage, une fiche lisible.
  const rendreLesCorriges = () => {
    for (const ticket of rail.tickets()) {
      if (ticket.state !== "86") continue;
      if (ticket.reason === SANS_CALIBRAGE && complet(ticket)) geste(() => rail.rendre(ticket.ticket, CALIBRE));
      if (ticket.reason === FICHE_ILLISIBLE && illisible(ticket.card) === null) geste(() => rail.rendre(ticket.ticket, FICHE_LISIBLE));
    }
  };

  const refuser = async (ticket: TicketRail) => {
    if (!geste(() => rail.quatreVingtSix(ticket.ticket, { motif: SANS_CALIBRAGE, station: STATION }))) return;
    await commenter(
      ticket.ticket,
      [
        `**Station \`${STATION}\` — ticket non calibré.** Aucun cook n'est lancé sans modèle ni effort explicites.`,
        "",
        `Il manque : \`${manquant(ticket)}\` — un seul label par dimension. Le ticket est 86 ; il reviendra en attente tout seul une fois posé.`,
      ].join("\n"),
    );
  };

  const refuserLaFiche = async (ticket: TicketRail) => {
    if (!geste(() => rail.quatreVingtSix(ticket.ticket, { motif: FICHE_ILLISIBLE, station: STATION }))) return;
    await commenter(
      ticket.ticket,
      [
        `**Station \`${STATION}\` — fiche du ticket illisible.** Aucun cook n'est lancé sur une fiche que le runtime ne comprend pas.`,
        "",
        ...(ticket.card?.problems ?? []).map((probleme) => `- ${probleme}`),
        "",
        `La fiche est le commentaire de cette issue marqué \`${MARQUEUR}\` — le marqueur se voit en l'éditant. Corrige-la sur place : le ticket est 86 ; il reviendra en attente tout seul une fois la fiche lisible.`,
      ].join("\n"),
    );
  };

  // La zone que le ticket portait la dernière fois qu'il a été pris. C'est
  // elle qui juge la livraison, pas celle du jour : le cook tourne sous le
  // compte du service, et peut éditer la fiche de son propre ticket.
  const zoneALaPrise = (numero: number): string[] => {
    let zone: string[] = [];
    let prise: string[] = [];
    for (const evenement of journal.duTicket(numero)) {
      if (evenement.type === "ticket.arrived" || evenement.type === "ticket.changed") zone = evenement.payload.card?.zone ?? [];
      else if (evenement.type === "ticket.taken") prise = zone;
    }
    return prise;
  };

  // Confronte une livraison à la zone de son ticket : ce qu'elle écrit
  // ailleurs, et une fiche qui a changé pendant la cuisson, vont au journal.
  // Rend ce qu'il y a à en dire sur le ticket — rien, le plus souvent. Un
  // signal, jamais un arrêt : un ticket pris sans zone ne possède rien, et
  // n'est pas signalé.
  const signalerHorsZone = (numero: number, run: string, worktree: string): string[] => {
    const zone = zoneALaPrise(numero);
    if (zone.length === 0) return [];
    let livres: string[];
    try {
      livres = depot.changes(worktree);
    } catch (erreur) {
      avertir(`brigade : livraison du ticket #${numero} illisible, sa zone n'est pas vérifiée — ${message(erreur)}`);
      return [];
    }
    const autres = lireRail(base).filter((autre) => autre.ticket !== numero && autre.card !== null && illisible(autre.card) === null);
    const files = horsZone(zone, livres, communsDuRail(base)).map((path) => ({
      path,
      owners: autres.filter((autre) => autre.card?.zone.some((chemin) => possede(chemin, path))).map((autre) => autre.ticket),
    }));
    const aujourdhui = ticketDuRail(base, numero)?.card?.zone ?? [];
    const cardChanged = JSON.stringify(aujourdhui) !== JSON.stringify(zone);
    if (files.length === 0 && !cardChanged) return [];
    noter(numero, { type: "cook.out-of-zone", payload: { run, zone, files, cardChanged } });
    return [
      ...(files.length === 0
        ? []
        : [
            "",
            `**Hors zone — ${pluriel(files.length, "fichier")} écrit${files.length > 1 ? "s" : ""} hors de la zone du ticket** (zone du ticket : ${chemins(zone)}) :`,
            ...files.slice(0, HORS_ZONE_MAX).map(({ path, owners }) => `- \`${path}\`${owners.length === 0 ? "" : ` — dans la zone de ${owners.map((owner) => `#${owner}`).join(", ")}`}`),
            ...(files.length > HORS_ZONE_MAX ? [`- … et ${files.length - HORS_ZONE_MAX} de plus, tous au journal`] : []),
            "",
            "Rien n'est arrêté : la pass juge cette livraison comme une autre. C'est le signe d'un découpage à revoir — si l'écart est légitime, élargis la zone dans la fiche du ticket.",
          ]),
      ...(cardChanged
        ? [
            "",
            `**La fiche a changé pendant la cuisson** — zone du ticket à la prise : ${chemins(zone)} ; aujourd'hui : ${chemins(aujourdhui)}. La livraison est confrontée à celle de la prise : un cook peut éditer la fiche de son propre ticket.`,
          ]
        : []),
    ];
  };

  // Raconte la fin d'un cook : au rail, au journal, puis sur le ticket.
  const conclure = async (
    ticket: TicketRail,
    calibrage: Calibrage,
    lance: CookLance,
    branche: string,
    worktree: string,
    fin: FinGardee,
    conclusion: Conclusion | null,
    reprise: Reprise | null,
  ) => {
    const numero = ticket.ticket;
    const { run } = lance;
    const compteRendu = conclusion?.lecture.message?.slice(0, COMPTE_RENDU_MAX) ?? null;
    const rapporter = (ending: FinDeCook, reason: string | null, pr: string | null) =>
      noter(numero, { type: "cook.reported", payload: { run, ending, reason, summary: compteRendu, branch: branche, pr } });

    switch (fin.outcome) {
      // Le chef a dit « stop », ou le runtime s'en va : rien à ajouter.
      case "stop":
      case "interrupted":
        return;
      case "ok": {
        geste(() => rail.envoyerEnPass(numero, STATION));
        // Sans diff, il n'y a ni branche poussée ni PR : la pass fait relire
        // le compte-rendu.
        const sansDiff = conclusion?.raison === SANS_DIFF;
        const sansCommit = conclusion?.sansCommit === true;
        // Un renvoi livre sur la PR de la livraison qu'il corrige.
        let pr: string | null = reprise?.pr ?? null;
        let sansPR = "";
        try {
          if (!sansCommit) {
            pr ??= await github.ouvrirPR({
              branche,
              base: options.base,
              titre: `#${numero} — ${ticket.title}`,
              corps: corpsDePR(numero, calibrage, compteRendu),
            });
          }
        } catch (erreur) {
          sansPR = message(erreur);
          if (!arrete) avertir(`brigade : PR non ouverte pour le ticket #${numero} (branche ${branche}) — ${sansPR}`);
        }
        if (arrete) return;
        // Récolté : le cook s'est arrêté sans conclure, son travail est parti quand même.
        const recolte = conclusion?.raison?.startsWith("harvested:") ? conclusion.raison.replace(/^harvested:/, "") : null;
        const bailTombe = sansProgres(fin);
        // Le signal et le compte-rendu s'écrivent ensemble : une livraison
        // reprise après un redémarrage ne la signale pas deux fois.
        const horsDeSaZone = base.transaction(() => {
          const lignes = sansCommit ? [] : signalerHorsZone(numero, run, worktree);
          rapporter("done", conclusion?.raison ?? null, pr);
          return lignes;
        });
        await commenter(
          numero,
          [
            entete(sansDiff ? "fini, sans diff" : recolte === null ? "fini" : `récolté (${recolte})`, calibrage, fin),
            sansDiff
              ? "Aucun commit : le livrable de ce ticket est le compte-rendu ci-dessous. Il part en pass, où le reviewer le relit — rien n'est servi sans cette relecture."
              : sansCommit
                ? "Aucun commit, et rien n'est poussé : c'est la pass qui dira ce que vaut cette livraison."
                : `Branche \`${branche}\` · ${pr ?? `PR non ouverte : ${sansPR}`}`,
            ...(reprise === null ? [] : [`Renvoi ${reprise.n}/${RENVOIS_MAX} de la pass : le cook a repris la livraison qu'elle avait refusée.`]),
            ...(bailTombe === null ? [] : [bailTombe]),
            ...(recolte === null ? [] : ["Le cook s'est arrêté sans conclure : ce qu'il avait commité est poussé et part en pass."]),
            ...horsDeSaZone,
            "",
            compteRendu ?? "_Le cook n'a laissé aucun compte-rendu._",
          ].join("\n"),
        );
        return;
      }
      case "guard":
      case "failed": {
        const raison = conclusion?.raison ?? fin.erreur ?? "échec";
        const bailTombe = sansProgres(fin);
        rapporter("failed", raison, null);
        await commenter(
          numero,
          [
            entete(`échoué (${raison})`, calibrage, fin),
            ...(bailTombe === null ? [] : [bailTombe]),
            `Rien n'est poussé. Le ticket est revenu en attente ; le travail du cook reste sur la station, branche \`${branche}\`.`,
            ...(compteRendu ? ["", compteRendu] : []),
          ].join("\n"),
        );
        return;
      }
      case "neutral": {
        if (conclusion?.fin === "86") {
          const instant = maintenant();
          const annonce = conclusion.lecture.quota?.retour ?? null;
          // Une heure de retour déjà passée ne retiendrait rien : le cook
          // suivant buterait aussitôt sur le même quota.
          const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
          base.transaction(() => {
            geste(() => rail.quatreVingtSix(numero, { motif: QUOTA, retour, station: STATION }));
            noter(null, { type: "station.86", payload: { station: STATION, reason: QUOTA, until: retour.toISOString(), window: conclusion.lecture.quota?.fenetre ?? null } });
            rapporter("86", QUOTA, null);
          });
          return;
        }
        base.transaction(() => {
          geste(() => rail.rendre(numero, DECONNEXION, STATION));
          deconnecter(numero, "authentication_failed", run);
          rapporter("disconnected", "authentication_failed", null);
        });
        await commenter(
          numero,
          [
            `**Station \`${STATION}\` — connexion Max expirée.** Le cook de ce ticket n'a pas pu parler au modèle : le ticket est revenu en attente, et la station ne prend plus rien.`,
            "",
            "Sur la machine : `claude /login` sous le compte du service, puis `npm --prefix runtime run garde-fous -- reprendre`.",
          ].join("\n"),
        );
        return;
      }
    }
  };

  // Cuisine un ticket que la station vient de prendre. Résolue quand le cook
  // est fini et sa fin racontée.
  const cuisiner = async (ticket: TicketRail) => {
    const numero = ticket.ticket;
    if (!complet(ticket)) return refuser(ticket);
    if (illisible(ticket.card) !== null) return refuserLaFiche(ticket);
    const calibrage: Calibrage = { model: ticket.model, effort: ticket.effort };

    const run = nomDeRun(numero);
    // Un ticket renvoyé par la pass se reprend là où il a été livré : même
    // worktree, même branche, même PR. Si ce worktree n'existe plus, le cook
    // repart de la base comme un premier.
    const renvoi = renvoiEnAttente(base, numero);
    const repris = renvoi !== null && existsSync(resolve(options.repertoireEtat, renvoi.worktree)) ? renvoi : null;
    let worktree: string;
    let branche: string;
    try {
      ({ worktree, branche } = repris ? { worktree: resolve(options.repertoireEtat, repris.worktree), branche: repris.branch } : await depot.preparer(run));
    } catch (erreur) {
      if (arrete) return;
      avertir(`brigade : worktree impossible à préparer pour le ticket #${numero} — ${message(erreur)}`);
      geste(() =>
        rail.quatreVingtSix(numero, { motif: "worktree-failed", retour: new Date(maintenant().getTime() + REPLI_WORKTREE_MS), station: STATION }),
      );
      return;
    }
    if (arrete) return;

    // Un worktree neuf n'est pas exécutable. Un setup en échec ne lance aucun
    // cook — donc ne consomme rien, et ne compte pas pour le disjoncteur : le
    // ticket est reproposé dix minutes plus tard, et le worktree, s'il était
    // neuf, ne reste pas.
    // Un worktree neuf où aucun cook n'entrera ne reste pas. Celui d'un renvoi
    // porte une livraison : il est gardé.
    const retirerLeNeuf = () => {
      if (repris) return;
      try {
        depot.retirer(worktree, branche);
      } catch (erreur) {
        avertir(`brigade : worktree du ticket #${numero} non retiré, aucun cook n'y est entré — ${message(erreur)}`);
      }
    };
    const delaiSetupMs = options.dureeBailMs * PART_DU_SETUP;
    const setup = await jouerSetup({ worktree, ticket: numero, env: envCook, delaiMs: delaiSetupMs, signal: abandon.signal });
    if (arrete) return;
    if (!setup.pret) {
      const pourquoi = setup.depasse ? `plafond de ${duree(delaiSetupMs)} dépassé` : setup.code === null ? "interrompu" : `code de sortie ${setup.code}`;
      avertir(
        [`brigade : setup du worktree en échec pour le ticket #${numero} (\`${SCRIPT_SETUP}\`, ${pourquoi}) — aucun cook n'est lancé`, setup.sortie.trim().slice(-FIN_DE_SETUP_MAX)]
          .filter(Boolean)
          .join("\n"),
      );
      geste(() =>
        rail.quatreVingtSix(numero, { motif: SETUP_EN_ECHEC, retour: new Date(maintenant().getTime() + REPLI_WORKTREE_MS), station: STATION }),
      );
      retirerLeNeuf();
      return;
    }
    // Le setup a pris sur le bail : le cook part avec un bail entier. Refusé,
    // le ticket a quitté la station pendant le setup.
    if (setup.joue && !geste(() => rail.renouveler(numero, STATION))) return retirerLeNeuf();
    // Ce que le setup exporte passe au cook, sauf ce qui le détournerait de la
    // connexion Max : un setup qui charge un `.env` entier peut porter une clé.
    const envDuCook = Object.fromEntries(Object.entries(setup.env).filter(([nom]) => !VARIABLES_DE_JETON.includes(nom)));

    // La fin d'un cook, lue dans son flux brut — puis dans son worktree, qui
    // fait foi : le runtime récolte. Un cook qui a commité puis s'est arrêté,
    // en erreur ou sous un garde-fou, a fini. Un cook qui conclut sans rien
    // commiter, dans un worktree qu'il a laissé intact, a livré son
    // compte-rendu — un ticket sans diff, que le reviewer jugera seul. Sans
    // compte-rendu, ou avec des fichiers écrits et jamais commités, il n'a
    // rien livré : ce travail-là ne partirait nulle part. Seul le quota épuisé
    // ne se récolte pas : le ticket attend son retour.
    //
    // Sur un renvoi, les commits de la livraison refusée sont déjà là : seul un
    // commit de plus se récolte. Un cook de renvoi qui conclut sans en ajouter
    // repart quand même en pass — il tient le finding pour faux, et elle rejuge.
    //
    // Une livraison n'en est une que poussée : le push se joue donc ici, avant
    // que la fin ne s'écrive, et il bloque le runtime le temps de se faire —
    // sans quoi une origine en panne ferait reprendre le même ticket sans fin,
    // hors de la vue du disjoncteur.
    let conclusion: Conclusion | null = null;
    const juger = (fin: Fin): Verdict => {
      let sansCommit = false;
      let flux = "";
      try {
        flux = readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8");
      } catch {
        // Sans flux, rien ne prouve que le cook a fini.
      }
      const lecture = lireFlux(flux);
      let lu: FinDeCook = fin.arret ? "failed" : verdict(lecture, fin.code);
      let raison: string | null = null;
      if (fin.arret) raison = `guard:${fin.arret.reason}`;
      else if (lu === "failed") raison = fin.code === 0 ? "flux sans résultat" : fin.code === null ? `signal ${fin.signal}` : `code de sortie ${fin.code}`;
      if (lu === "done" || lu === "failed") {
        try {
          const commits = depot.commits(worktree);
          sansCommit = commits === 0;
          const aLivre = commits > 0 && (!repris || depot.tete(worktree) !== repris.sha);
          if (!aLivre) {
            if (lu === "done" && commits === 0 && lecture.message?.trim() && depot.intact(worktree)) raison = SANS_DIFF;
            else if (lu === "done" && !repris) [lu, raison] = ["failed", "no-commit"];
          } else {
            depot.pousser(branche);
            if (lu === "failed") [lu, raison] = ["done", `harvested:${raison}`];
          }
        } catch (erreur) {
          [lu, raison] = ["failed", `push-failed: ${message(erreur)}`];
        }
      }
      conclusion = { fin: lu, raison, lecture, sansCommit };
      return lu === "done" ? "ok" : lu === "failed" ? "failed" : "neutral";
    };

    // Un worktree qu'on ne sait pas lire ne prouve aucun travail — ni son
    // absence.
    const regarder = (): string | null => {
      try {
        return depot.empreinte(worktree);
      } catch (erreur) {
        avertir(`brigade : worktree du ticket #${numero} illisible — ${message(erreur)}`);
        return null;
      }
    };
    // L'état du worktree avant que le cook n'y entre : son premier geste est
    // déjà un progrès.
    let vue = regarder();
    const depart = maintenant().getTime();

    const mission = { ticket: numero, titre: ticket.title, depot: options.depotGitHub, base: options.base };
    let lance: CookLance;
    try {
      lance = runtime.lancer({
        ticket: numero,
        run,
        contexte: { station: STATION, ...calibrage, branch: branche, worktree: repris?.worktree ?? join("worktrees", run) },
        commande: options.bin,
        args: argumentsClaude(
          repris
            ? consigneDeRenvoi({ ...mission, branche, n: repris.returns, findings: repris.findings })
            : consigne(mission),
          calibrage,
        ),
        cwd: worktree,
        env: envDuCook,
        juger,
      });
    } catch (erreur) {
      if (!(erreur instanceof LancementRefuse)) throw erreur;
      // « stop » ou disjoncteur, arrivés entre le prêt et le lancement.
      geste(() => rail.rendre(numero, `launch-refused:${erreur.motif}`, STATION));
      return;
    }

    // Le bail ne se renouvelle que sur un progrès observable : le worktree a
    // bougé depuis le dernier regard. Ni la présence du cook ni ce qu'il dit
    // ne comptent — c'est l'affaire de l'inactivité, sur son flux. Un bail qui
    // tombe arrête le cook par un arrêt jugé : ce qu'il a commité est récolté
    // avant que le ticket ne soit rendu.
    let progres = depart;
    let regard = depart;
    observer = () => {
      const tenu = ticketDuRail(base, numero);
      // Le ticket a échappé à la station (retiré du rail) : son cook n'a plus
      // de raison de tourner.
      if (tenu?.state !== "taken" || tenu.station !== STATION) return lance.arreter();
      const instant = maintenant().getTime();
      const retard = tenu.leaseUntil === null ? -1 : instant - Date.parse(tenu.leaseUntil);
      const echu = retard >= 0;
      if (!echu && instant - regard < pasDeRegard) return;
      regard = instant;
      const courante = regarder();
      // Une lecture ratée à l'échéance n'arrête pas un cook qui a peut-être
      // progressé : la station relit au tick suivant. Le sursis est borné —
      // un worktree durablement illisible finit par faire tomber le bail.
      if (courante === null && retard < pasDeRegard) return;
      if (courante !== null && courante !== vue) {
        vue = courante;
        progres = instant;
        if (!geste(() => rail.renouveler(numero, STATION))) lance.arreter();
      } else if (echu) {
        lance.arreter({ reason: "lease", limit: options.dureeBailMs, observed: instant - progres });
      }
    };
    let fin: FinGardee;
    try {
      fin = await lance.fin;
    } finally {
      observer = undefined;
    }
    if (arrete) return;
    await conclure(ticket, calibrage, lance, branche, worktree, fin, conclusion, repris && { n: repris.returns, pr: repris.pr });
    options.apresCook?.();
  };

  // Raconte une livraison que la vie précédente a envoyée en pass sans avoir
  // pu le faire. Sa branche est poussée — le push précède la fin du cook ; sa
  // PR, ouverte ou non : GitHub le dit, et elle n'est ouverte que s'il n'en
  // connaît aucune. Le compte-rendu se relit dans le flux brut du cook.
  const reprendre = async (numero: number) => {
    const livraison = passDuTicket(base, numero);
    const ticket = ticketDuRail(base, numero);
    if (!livraison || !ticket || livraison.branch === null) return;
    const { run, branch: branche } = livraison;
    let compteRendu: string | null = null;
    try {
      compteRendu = lireFlux(readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8")).message?.slice(0, COMPTE_RENDU_MAX) ?? null;
    } catch {
      // Sans flux, la livraison se raconte sans le dernier mot du cook.
    }
    let pr = livraison.pr;
    let sansPR = "";
    // Une livraison sans diff n'a jamais eu de PR à ouvrir.
    let sansDiff = false;
    const worktree = livraison.worktree === null ? null : resolve(options.repertoireEtat, livraison.worktree);
    try {
      sansDiff = worktree !== null && depot.commits(worktree) === 0 && depot.intact(worktree);
    } catch {
      // Un worktree illisible : la livraison se raconte comme un diff.
    }
    try {
      pr ??= (await github.prDeBranche(branche))?.url ?? null;
      if (!sansDiff) pr ??= await github.ouvrirPR({
        branche,
        base: options.base,
        titre: `#${numero} — ${ticket.title}`,
        corps: corpsDePR(numero, complet(ticket) ? ticket : null, compteRendu),
      });
    } catch (erreur) {
      sansPR = message(erreur);
      if (!arrete) avertir(`brigade : PR non ouverte pour le ticket #${numero} (branche ${branche}) — ${sansPR}`);
    }
    if (arrete) return;
    let horsDeSaZone: string[] = [];
    const raconte = base.transaction(() => {
      // Le ticket a pu quitter le rail, ou le chef le rendre, pendant l'appel.
      if (!sansCompteRendu(numero) || passDuTicket(base, numero)?.run !== run) return false;
      if (!sansDiff && worktree !== null) horsDeSaZone = signalerHorsZone(numero, run, worktree);
      noter(numero, { type: "cook.reported", payload: { run, ending: "done", reason: sansDiff ? SANS_DIFF : null, summary: compteRendu, branch: branche, pr, reconciled: true } });
      return true;
    });
    if (!raconte) return;
    avertir(`brigade : livraison du ticket #${numero} reprise après un redémarrage (branche ${branche}) — elle part en pass`);
    await commenter(
      numero,
      [
        `**Cook \`${STATION}\` — livraison reprise après un redémarrage du runtime.** Le cook avait fini et poussé son travail ; le runtime s'est arrêté avant d'en rendre compte.`,
        sansDiff ? "Aucun commit : le livrable de ce ticket est le compte-rendu ci-dessous, que le reviewer relit en pass." : `Branche \`${branche}\` · ${pr ?? `PR non ouverte : ${sansPR}`}`,
        ...horsDeSaZone,
        "",
        compteRendu ?? "_Le cook n'a laissé aucun compte-rendu._",
      ].join("\n"),
    );
    options.apresCook?.();
  };
  void (async () => {
    for (const numero of aReprendre) {
      if (arrete) return;
      try {
        await reprendre(numero);
      } catch (erreur) {
        // Tant que le compte-rendu n'est pas écrit, le démarrage suivant y revient.
        if (!arrete) avertir(`brigade : reprise de la livraison du ticket #${numero} impossible — ${message(erreur)}`);
      }
    }
  })();

  // Un seul service à la fois. Un réveil qui arrive pendant qu'un cook tourne
  // n'est pas perdu : le service repasse une fois le cook fini.
  let pret = false;
  let enCours = false;
  let aRefaire = false;
  const servir = () => {
    if (arrete || !pret) return;
    if (enCours) {
      aRefaire = true;
      return;
    }
    enCours = true;
    void (async () => {
      try {
        do {
          aRefaire = false;
          rendreLesCorriges();
          while (!arrete && peutServir()) {
            const ticket = rail.prendre(STATION);
            if (!ticket) break;
            await cuisiner(ticket);
          }
        } while (aRefaire && !arrete);
      } catch (erreur) {
        // Rien ne doit tuer le runtime depuis ici : le ticket en cause revient
        // par son bail, et le réveil suivant relance le service.
        if (!arrete) avertir(`brigade : la station ${STATION} a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
      } finally {
        enCours = false;
      }
    })();
  };

  // Seul un « non connecté » franc retient la station : une réponse illisible
  // laisse le premier cook trancher.
  void options.session().then((session) => {
    if (arrete) return;
    if ((session === "absente" || session === "introuvable") && !etatStation(base, STATION)?.disconnectedAt) {
      deconnecter(null, session === "absente" ? "not-logged-in" : `binaire introuvable : ${options.bin}`, null);
    }
    pret = true;
    servir();
  });

  const desabonner = [
    runtime.surReveil((cause) => {
      if (cause === "tick") observer?.();
      servir();
    }),
    runtime.surSondage(servir),
  ];

  return {
    ...runtime,
    arreter(signal) {
      arrete = true;
      // Le cook meurt avec le runtime, mais pas dans l'instant : son bail ne
      // doit pas se renouveler sur un journal fermé.
      observer = undefined;
      abandon.abort();
      for (const quitter of desabonner) quitter();
      runtime.arreter(signal);
    },
  };
}
