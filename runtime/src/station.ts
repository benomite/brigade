// La station `box/claude` : elle vient prendre un ticket sur le rail, lui
// fabrique un worktree, y lance un cook sous garde-fous, lit comment il finit,
// et rend au rail ce que cette fin veut dire. Le manager ne spawne rien — c'est
// elle qui se sert.
//
// Elle ne garde en mémoire que le cook qu'elle attend : pouvoir servir se lit
// dans le journal, donc tient après un redémarrage.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeAvecRail } from "./alimenter.ts";
import { complet, manquant, type Calibrage } from "./calibrage.ts";
import { argumentsClaude, consigne, environnementCook, lireFlux, verdict, VARIABLES_DE_JETON, type Lecture, type Session } from "./claude.ts";
import { ouvrirDepot, type Depot } from "./depot.ts";
import type { FaitStation, FinDeCook } from "./evenements/station.ts";
import { LancementRefuse, nomDeRun, type CookLance, type FinDeCook as FinGardee, type GardeFous, type Verdict } from "./garde-fous.ts";
import type { GitHub } from "./github.ts";
import { cooksEnCours, etatDesGardeFous } from "./projections/garde-fous.ts";
import type { TicketRail } from "./projections/rail.ts";
import { etatStation } from "./projections/stations.ts";
import { GesteRefuse } from "./rail.ts";
import { ConfigInvalide } from "./runtime.ts";
import type { Fin } from "./superviseur.ts";

export const STATION = "box/claude";
// Un cook = un ticket, et une seule station sur le compte Max : le parallélisme
// vaut un. Sa valeur se réglera quand plusieurs stations se partageront le
// compte.
const ANNONCE = { station: STATION, engine: "claude", provides: ["code"], maxCooks: 1 };
const AUTEUR = `station:${STATION}`;

// Les motifs que la station écrit sur le rail.
export const SANS_CALIBRAGE = "no-calibration";
const CALIBRE = "calibrated";
const QUOTA = "quota";
const DECONNEXION = "disconnected";

const HEURE = 3_600_000;
// Un quota épuisé qui ne dit pas quand il revient est retenté une heure après.
const REPLI_QUOTA_MS = HEURE;
// Un worktree impossible à préparer (origine injoignable) : le ticket est
// reproposé dix minutes plus tard, sans cook perdu.
const REPLI_WORKTREE_MS = 600_000;
// GitHub refuse un commentaire au-delà de 65 536 caractères.
const COMPTE_RENDU_MAX = 20_000;

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
};

// Ouvre le dépôt de la station là où le runtime le range : les worktrees des
// cooks vivent dans le répertoire d'état, à côté de leurs flux bruts.
export function depotDeStation(repertoireEtat: string, config: ConfigStation): Depot {
  return ouvrirDepot({ clone: config.clone, base: config.base, worktrees: join(repertoireEtat, "worktrees") });
}

// Ce que la station retient d'un cook entre le moment où elle juge sa fin et
// celui où elle la raconte.
type Conclusion = { fin: FinDeCook; raison: string | null; lecture: Lecture };

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const duree = (ms: number) =>
  ms >= 60_000 ? `${(ms / 60_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min` : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

function entete(fin: string, calibrage: Calibrage, mesure: Fin): string {
  return [
    `**Cook \`${STATION}\` — ${fin}**`,
    `\`${calibrage.model}\` / \`${calibrage.effort}\``,
    pluriel(mesure.turns, "tour"),
    `${nombre(mesure.tokens)} tokens`,
    duree(mesure.durationMs),
  ].join(" · ");
}

// Rend le runtime, augmenté de sa station. Son `arreter` l'emporte avec lui.
export function brancherStation<R extends RuntimeAvecRail & GardeFous>(runtime: R, options: OptionsStation): R {
  const { journal, projet, rail } = runtime;
  const { base } = journal;
  const { depot, github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const envCook = environnementCook(options.env ?? process.env);
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
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

  base.transaction(() => {
    const connue = etatStation(base, STATION);
    const { announcedAt, quotaUntil, quotaReason, disconnectedAt, disconnectedReason, ...annoncee } = connue ?? { station: null };
    if (JSON.stringify(annoncee) !== JSON.stringify(ANNONCE)) noter(null, { type: "station.announced", payload: ANNONCE });
    // Aucun cook ne tourne au démarrage : un ticket encore tenu par la station
    // est celui d'une vie précédente, morte entre le prêt et le lancement.
    for (const ticket of rail.tickets()) {
      if (ticket.state === "taken" && ticket.station === STATION) geste(() => rail.rendre(ticket.ticket, "station-restarted", STATION));
    }
  });

  let arrete = false;
  // Le renouvellement du bail du cook en cours.
  let bail: NodeJS.Timeout | undefined;

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

  // Un ticket refusé faute de calibrage revient en attente dès qu'il l'a.
  const rendreLesCalibres = () => {
    for (const ticket of rail.tickets()) {
      if (ticket.state === "86" && ticket.reason === SANS_CALIBRAGE && complet(ticket)) geste(() => rail.rendre(ticket.ticket, CALIBRE));
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

  // Raconte la fin d'un cook : au rail, au journal, puis sur le ticket.
  const conclure = async (ticket: TicketRail, calibrage: Calibrage, lance: CookLance, branche: string, fin: FinGardee, conclusion: Conclusion | null) => {
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
        let pr: string | null = null;
        let sansPR = "";
        try {
          pr = await github.ouvrirPR({
            branche,
            base: options.base,
            titre: `#${numero} — ${ticket.title}`,
            corps: [`Ticket #${numero}, cuisiné par \`${STATION}\` (\`${calibrage.model}\` / \`${calibrage.effort}\`).`, "", compteRendu ?? ""].join("\n"),
          });
        } catch (erreur) {
          sansPR = message(erreur);
          if (!arrete) avertir(`brigade : PR non ouverte pour le ticket #${numero} (branche ${branche}) — ${sansPR}`);
        }
        if (arrete) return;
        rapporter("done", null, pr);
        await commenter(
          numero,
          [entete("fini", calibrage, fin), `Branche \`${branche}\` · ${pr ?? `PR non ouverte : ${sansPR}`}`, "", compteRendu ?? "_Le cook n'a laissé aucun compte-rendu._"].join("\n"),
        );
        return;
      }
      case "guard":
      case "failed": {
        const raison = fin.arret ? `guard:${fin.arret.reason}` : (conclusion?.raison ?? fin.erreur ?? "échec");
        rapporter("failed", raison, null);
        await commenter(
          numero,
          [
            entete(`échoué (${raison})`, calibrage, fin),
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
    const calibrage: Calibrage = { model: ticket.model, effort: ticket.effort };

    const run = nomDeRun(numero);
    let worktree: string;
    let branche: string;
    try {
      ({ worktree, branche } = await depot.preparer(run));
    } catch (erreur) {
      if (arrete) return;
      avertir(`brigade : worktree impossible à préparer pour le ticket #${numero} — ${message(erreur)}`);
      geste(() =>
        rail.quatreVingtSix(numero, { motif: "worktree-failed", retour: new Date(maintenant().getTime() + REPLI_WORKTREE_MS), station: STATION }),
      );
      return;
    }
    if (arrete) return;

    // La fin d'un cook que rien n'a arrêté, lue dans son flux brut. Une
    // livraison n'en est une que poussée : le push se joue donc ici, avant que
    // la fin ne s'écrive, et il bloque le runtime le temps de se faire — sans
    // quoi une origine en panne ferait reprendre le même ticket sans fin, hors
    // de la vue du disjoncteur.
    let conclusion: Conclusion | null = null;
    const juger = (fin: Fin): Verdict => {
      let flux = "";
      try {
        flux = readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8");
      } catch {
        // Sans flux, rien ne prouve que le cook a fini.
      }
      const lecture = lireFlux(flux);
      let lu = verdict(lecture, fin.code);
      let raison: string | null = null;
      if (lu === "done") {
        try {
          if (depot.commits(worktree) === 0) [lu, raison] = ["failed", "no-commit"];
          else depot.pousser(branche);
        } catch (erreur) {
          [lu, raison] = ["failed", `push-failed: ${message(erreur)}`];
        }
      } else if (lu === "failed") {
        raison = fin.code === 0 ? "flux sans résultat" : fin.code === null ? `signal ${fin.signal}` : `code de sortie ${fin.code}`;
      }
      conclusion = { fin: lu, raison, lecture };
      return lu === "done" ? "ok" : lu === "failed" ? "failed" : "neutral";
    };

    let lance: CookLance;
    try {
      lance = runtime.lancer({
        ticket: numero,
        run,
        contexte: { station: STATION, ...calibrage, branch: branche, worktree: join("worktrees", run) },
        commande: options.bin,
        args: argumentsClaude(consigne({ ticket: numero, titre: ticket.title, depot: options.depotGitHub, base: options.base }), calibrage),
        cwd: worktree,
        env: envCook,
        juger,
      });
    } catch (erreur) {
      if (!(erreur instanceof LancementRefuse)) throw erreur;
      // « stop » ou disjoncteur, arrivés entre le prêt et le lancement.
      geste(() => rail.rendre(numero, `launch-refused:${erreur.motif}`, STATION));
      return;
    }

    // La station vit : son bail est renouvelé. Refusé, c'est que le ticket lui
    // a échappé (retiré du rail) — son cook n'a plus de raison de tourner.
    bail = setInterval(() => {
      if (!geste(() => rail.renouveler(numero, STATION))) lance.arreter();
    }, Math.max(1, Math.floor(options.dureeBailMs / 3)));
    let fin: FinGardee;
    try {
      fin = await lance.fin;
    } finally {
      clearInterval(bail);
    }
    if (arrete) return;
    await conclure(ticket, calibrage, lance, branche, fin, conclusion);
  };

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
          rendreLesCalibres();
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

  const desabonner = [runtime.surReveil(servir), runtime.surSondage(servir)];

  return {
    ...runtime,
    arreter(signal) {
      arrete = true;
      // Le cook meurt avec le runtime, mais pas dans l'instant : son bail ne
      // doit pas se renouveler sur un journal fermé.
      clearInterval(bail);
      for (const quitter of desabonner) quitter();
      runtime.arreter(signal);
    },
  };
}
