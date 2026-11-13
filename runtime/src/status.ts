// L'état de la cuisine, en lecture seule :
//   npm --prefix runtime run status                          la photo : runtime, ce qui attend le chef, rail, cooks, derniers événements
//   npm --prefix runtime run status -- --follow [<ticket>]   la photo, puis le journal en direct, jusqu'à Ctrl-C
// `--days <N>` : la période des cartes entrées dans TODO, par type — product,
// design, gesture —, comptée en jours jusqu'à maintenant (7 par défaut).
// L'ancien mot `--suivre` répond encore, en disant le nouveau (`commandes.ts`).
// BRIGADE_BACKUP_MAX_AGE_HOURS règle l'âge au-delà duquel la dernière sauvegarde
// est marquée (48 par défaut).
// La commande n'écrit jamais, et répond pendant que le runtime et ses cooks
// tournent. La photo se lit aussi sans process (`photoDuProjet`).
import { direEntreesEn, entreesParType } from "./carte-todo.ts";
import { enProcess, LectureImpossible, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { AGE_MAX_SAUVEGARDE_MS, decrireEtat, lireEtat, suivre } from "./etat.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { limiteDuCompteDeLaStation } from "./github-limite.ts";
import { direLeBudget } from "./github/budget-appels.ts";
import { appelsDeLaStation, budgetDeLaStation, ecrituresRetenuesDeLaStation, pauseDeLaStation, retenueDeLaStation } from "./limite-github.ts";
import { direGitHubSeul, lireGitHubSeul } from "./github-seul-etat.ts";
import { direLesAppelsParIdentite, lireAppelsParIdentite } from "./appels-par-identite.ts";
import { lireDeriveGithub } from "./closer-github-passe/derive-github.ts";
import { lireBlocagesSansQuestion } from "./blocages-sans-question.ts";
import { direLeChef, lireLeChef } from "./chef/chef.ts";
import { ligneDesRedemarrages } from "./redemarrages/journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { direCadence } from "./produit/cadence/statut.ts";
import { nommerLePlusLent } from "./lenteur/nommer.ts";
import { ligneDuTempsDesTickets } from "./status-temps-tickets.ts";
import { direLesAttentes, lireLesAttentes } from "./attente-des-tickets.ts";
import { ligneDesReparations } from "./status-reparations.ts";
import { ligneDesTempsDesTickets, lesTempsDesTickets } from "./temps-ticket/ligne-status.ts";
import { chiffresDuClone, direLesChiffres } from "./chiffres-du-projet.ts";
import { lignesDeTicketsQuiPerdent } from "./temps-max/affichage/affichage.ts";
import { avecLeRailBloque, railBloqueCherche, railBloqueDuStatus } from "./rail-bloque/status.ts";
import { attenteDuRailDuStatus, avecLAttenteDuRail } from "./attente-du-rail/status.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run status -- [--days <N>] [--follow [<numéro de ticket>]]";

const JOURS_DE_TODO = 7;

// Synchrone, sauf sur une station GitHub seul : le rail bloqué (#3358) s'y lit sur GitHub avant que rien ne s'écrive.
export function principal({ args: tapes, env, dire, redire }: Appel): void | Promise<void> {
  const brut = enAnglais("status", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  // `--days <N>` se retire des arguments avant le reste.
  let jours = JOURS_DE_TODO;
  const args = [...brut];
  const rangDays = args.indexOf("--days");
  if (rangDays !== -1) {
    const dit = args[rangDays + 1];
    if (dit === undefined || !/^[1-9][0-9]{0,3}$/.test(dit)) echouer(2, `--days attend un nombre de jours, 1 au moins\n${USAGE}`);
    jours = Number(dit);
    args.splice(rangDays, 2);
  }

  if (!env.BRIGADE_STATE_DIR) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const [option, ticket] = args;
  if (args.length > 2 || (option !== undefined && option !== "--follow") || (ticket !== undefined && !/^[0-9]+$/.test(ticket))) {
    echouer(2, USAGE);
  }

  let journal;
  let photo;
  const maintenant = new Date();
  try {
    const ageMaxSauvegardeMs = ageMaxDeLaSauvegarde(env);
    journal = ouvrirEnLecture(env.BRIGADE_STATE_DIR);
    photo = photographier(journal, env, jours, ageMaxSauvegardeMs, maintenant, env.NO_COLOR === undefined);
  } catch (erreur) {
    journal?.fermer();
    if (erreur instanceof LectureImpossible) echouer(erreur.code, erreur.message);
    throw erreur;
  }
  // Le rail bloqué (#3358) : des tickets `fire` qu'aucun manager n'a pris, sous la tête du bloc `awaiting` — la file du second.
  const { lignes, dernierSeq } = photo;
  const lu = journal;
  if (!railBloqueCherche(env)) return ecrire(lignes);
  // Pourquoi la file ne part pas (#3433) : sa phrase au-dessus de la ligne `rail`, la même que le rail de l'app.
  return Promise.all([railBloqueDuStatus(env, maintenant), attenteDuRailDuStatus(env, maintenant, lu.base)]).then(([rail, attente]) => ecrire(avecLAttenteDuRail(avecLeRailBloque(lignes, rail), attente)), (erreur: unknown) => {
    lu.fermer();
    throw erreur;
  });

  function ecrire(lignesDeLaPhoto: readonly string[]): void {
    for (const ligne of lignesDeLaPhoto) dire(ligne);
    suivreOuFermer(lu, dernierSeq);
  }

  function suivreOuFermer(journal: Journal, depuis: number): void {
    if (option === undefined) {
      journal.fermer();
    } else {
      // Les gestionnaires précèdent l'annonce : qui la lit peut signaler sans courir.
      // Un second signal, ou l'autre des deux, ne doit pas refermer le journal.
      let arreter = () => {};
      let arrete = false;
      const arretPropre = () => {
        if (arrete) return;
        arrete = true;
        arreter();
        journal.fermer();
      };
      for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, arretPropre);
      dire(`\nsuivi en direct${ticket === undefined ? "" : ` du ticket #${ticket}`} — Ctrl-C pour arrêter`);
      arreter = suivre(journal, {
        depuis,
        ticket: ticket === undefined ? undefined : Number(ticket),
        ecrire: (ligne) => dire(ligne),
      });
    }
  }
}

// La photo du projet de cet environnement, à cet instant : les lignes que
// `status` écrit, sans suivi. Lève `LectureImpossible` quand elle ne se lit pas.
export function photoDuProjet(env: Record<string, string | undefined>, { jours = JOURS_DE_TODO, maintenant = new Date() }: { jours?: number; maintenant?: Date } = {}): string[] {
  if (!env.BRIGADE_STATE_DIR) throw new LectureImpossible(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const ageMaxSauvegardeMs = ageMaxDeLaSauvegarde(env);
  const journal = ouvrirEnLecture(env.BRIGADE_STATE_DIR);
  try {
    return photographier(journal, env, jours, ageMaxSauvegardeMs, maintenant).lignes;
  } finally {
    journal.fermer();
  }
}

function ageMaxDeLaSauvegarde(env: Record<string, string | undefined>): number {
  const reglage = env.BRIGADE_BACKUP_MAX_AGE_HOURS;
  if (reglage !== undefined && !/^[1-9][0-9]*$/.test(reglage)) {
    throw new LectureImpossible(2, `BRIGADE_BACKUP_MAX_AGE_HOURS invalide : « ${reglage} » — attendu un nombre d'heures, 1 au moins`);
  }
  return reglage === undefined ? AGE_MAX_SAUVEGARDE_MS : Number(reglage) * 3_600_000;
}

function ouvrirEnLecture(repertoireEtat: string): Journal {
  try {
    return ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    throw new LectureImpossible(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
}

function photographier(journal: Journal, env: Record<string, string | undefined>, jours: number, ageMaxSauvegardeMs: number, maintenant: Date, rouge = false): { lignes: string[]; dernierSeq: number } {
  let etat;
  // Le journal ne voit plus de merge (#2061) : la dérive est celle que relève la passe du closer (#2361), quand
  // la station GitHub seul tourne ; le premier coup, celui des temps du clone (#2707).
  const githubSeul = lireGitHubSeul(env.BRIGADE_STATE_DIR);
  const temps = lesTempsDesTickets(env.BRIGADE_REPO_DIR);
  try {
    etat = lireEtat(journal, maintenant, { temps: temps.enregistrements, derive: githubSeul?.etat === "accepted" ? (lireDeriveGithub(env.BRIGADE_STATE_DIR)?.franchis ?? []) : [] });
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant ces projections, ni ne leur donne leur forme du jour.
    if (journalPasRejoue(erreur)) {
      throw new LectureImpossible(1, "ce journal n'a pas encore tout l'état que `status` lit : redémarrer le runtime, qui le recalcule");
    }
    throw erreur;
  }
  etat = { ...etat, tropLongs: lignesDeTicketsQuiPerdent(temps.enregistrements, temps.lostTimeMaxMin) };
  const lignes = decrireEtat(etat, maintenant, ageMaxSauvegardeMs, pauseDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()), appelsDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()), retenueDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()), limiteDuCompteDeLaStation(env.BRIGADE_STATION_DIR), ecrituresRetenuesDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()));
  // Le budget d'appels de l'heure, par projet : lectures et écritures chacune sur sa ligne (#2196).
  const budget = budgetDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime());
  if (budget !== null) lignes.push(...direLeBudget(budget).map((texte, i) => `${(i === 0 ? "gh budget" : "").padEnd(11)}${texte}`));
  // Le mode d'identité qu'a annoncé la cuisine, et les appels de chaque identité, jamais remis à zéro (#2316).
  lignes.push(...direLesAppelsParIdentite(lireAppelsParIdentite(env, etat.projet ?? env.BRIGADE_PROJECT ?? "")).map((texte, i) => `${(i === 0 ? "identity" : "").padEnd(11)}${texte}`));
  if (githubSeul !== null) lignes.push(direGitHubSeul(githubSeul));
  // Les redémarrages de la station des dernières 24 heures (#2589).
  lignes.push(ligneDesRedemarrages(env.BRIGADE_STATION_DIR, maintenant.getTime()));
  // Les `blocked-on-human` demandés sans question sur la carte, jamais remis à zéro (#2556).
  lignes.push(`${"blocked w/o q".padEnd(11)} ${lireBlocagesSansQuestion(env.BRIGADE_STATE_DIR)}`);
  // Le chef que les cartes de TODO mentionnent, et d'où il vient, tel que la cuisine l'a résolu (#2928).
  lignes.push(direLeChef(lireLeChef(env.BRIGADE_STATE_DIR)));
  lignes.push("", direEntreesEn(entreesParType(journal.base, new Date(maintenant.getTime() - jours * 86_400_000), maintenant), jours));
  lignes.push(direCadence(journal.base, maintenant));
  lignes.push(ligneDesTempsDesTickets(env.BRIGADE_REPO_DIR));
  lignes.push(ligneDuTempsDesTickets(env.BRIGADE_REPO_DIR));
  // Les quatre chiffres (#2672) : valeur, seuil, rouge au-dessus.
  lignes.push(...direLesChiffres(chiffresDuClone(env.BRIGADE_REPO_DIR), rouge));
  // Les réparations de la base par PR mergée, comptes à l'appui, sur la fenêtre des temps (#2696).
  lignes.push(ligneDesReparations(temps.enregistrements));
  // Rien ne s'ouvre avant 20 tickets mergés après le dernier ticket servi (#2868) : la station dit ce qu'il en manque.
  lignes.push(...direLesAttentes(lireLesAttentes(env.BRIGADE_STATE_DIR)));
  // La partie la plus lente du projet, en mots simples (#2350) ; rien d'enregistré, pas de ligne.
  const nom = etat.projet ?? env.BRIGADE_PROJECT;
  const lent = nom ? nommerLePlusLent(nom, { racine: env.BRIGADE_REPO_DIR ?? nom, env }) : null;
  if (lent !== null) lignes.push(`slowest     ${lent.phrase}`);
  return { lignes, dernierSeq: etat.dernierSeq };
}

if (import.meta.main) await enProcess(principal);
