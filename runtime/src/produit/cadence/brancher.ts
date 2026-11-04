// The cadence of the product role: at each tick of the runtime — with no UI
// open, with no one at the keyboard —, the runtime runs the role once when the
// rail is empty, or when an issue opened by someone other than the chef has
// waited more than a day for an answer. It files what the role writes, never
// more than the project's daily cap (`etat.ts`, 3 by default), counted from the
// issues carrying `filed-by:product` created that day; once the cap is reached,
// nothing more runs that day, and the runtime says so once.
//
// It is off until the chef turns it on, and the chef turns it off and on in
// one gesture (`commande.ts`); the project switch, the "stop" and the breaker
// hold it as they hold the cooks. It runs at most once every `ECART_MIN_MS`,
// and one run at a time. What it ran and
// counted is kept in the project's state, and `status` says it (`statut.ts`).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dansLeBacASableLocal, type BacASableLocal } from "../../bac-a-sable/local.ts";
import type { Calibrage } from "../../calibrage.ts";
import { environnementCook, lireFlux, verdict, type Lecture } from "../../claude.ts";
import { envelopper, type Cloison } from "../../cloison.ts";
import { LancementRefuse, type GardeFous, type Verdict } from "../../garde-fous.ts";
import type { GitHub, IssueOuverte } from "../../github.ts";
import { environnementClaude } from "../../jeton-claude.ts";
import { argumentsJuge } from "../../juger.ts";
import type { Runtime } from "../../runtime.ts";
import type { Fin } from "../../superviseur.ts";
import { compter, deposeesLe, jourDe, lireLaCadence, noterPassage, noterPlafondDit, poserLaCadence } from "./etat.ts";
import { enRetard, externe, railVide, RETARD_MS, retenue } from "./regle.ts";
import { aDeposer, consigneDuRole, DEPOSEE_PAR, lireReponse, type Source } from "./role.ts";

// The name its runs carry in the log, in place of a station: it is by this
// name that the chef reads what the role costs.
export const STATION = "product";

export type OptionsCadence = {
  // True once the GitHub-only switch is on: the empty rail it reads is the stale log's, so it stops (#2218).
  perimee?: () => boolean;
  // A GitHub of its own: the list of open issues is a poll with its own
  // confirmation, which another reader would confirm under its feet.
  github: Pick<GitHub, "ouvertes" | "issuesDepuis" | "commentaires" | "creerIssue">;
  // `<owner>/<repo>`, for its brief.
  depotGitHub: string;
  repertoireEtat: string;
  // The `claude` binary.
  bin: string;
  // Its model and effort, read at each run: the manager's, which the chef may
  // change without restarting.
  calibrage: () => Calibrage;
  // What the rest of the kitchen gives it to read (the usage digest, the
  // chef's directions), read at each run. By default, nothing.
  sources?: () => Promise<Source[]>;
  env?: NodeJS.ProcessEnv;
  cloison?: Cloison | null;
  bacASable?: BacASableLocal | null;
  maintenant?: () => Date;
  // Where what it has to say goes, outside the log (journald).
  avertir?: (message: string) => void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const pluriel = (combien: number, mot: string) => `${combien} ${mot}${combien === 1 ? "" : "s"}`;

// Returns the runtime, with its product role's cadence. Its `arreter` takes it along.
export function brancherCadence<R extends Runtime & GardeFous>(runtime: R, options: OptionsCadence): R {
  const { journal } = runtime;
  const { base } = journal;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const env = options.env ?? process.env;
  poserLaCadence(base);

  let arrete = false;
  let occupee = false;
  // The last list of open issues read: GitHub says "unchanged" until it moves.
  let ouvertes: IssueOuverte[] = [];

  const lireOuvertes = async (): Promise<IssueOuverte[]> => {
    const sondage = await options.github.ouvertes();
    if (!sondage.inchange) {
      ouvertes = sondage.issues;
      sondage.confirmer();
    }
    return ouvertes;
  };

  // The issues carrying `filed-by:product` created on `jour`, as GitHub shows them.
  const deposeesAujourdhui = async (jour: string): Promise<number> => {
    const depuis = `${jour}T00:00:00Z`;
    const issues = await options.github.issuesDepuis(depuis);
    return issues.filter(({ labels, createdAt }) => labels.includes(DEPOSEE_PAR) && createdAt >= depuis && createdAt.slice(0, 10) === jour).length;
  };

  // Runs the role once, and returns its answer, or null if it did not get to
  // the end — the next run, after the gap, tries again.
  const demander = async (consigne: string): Promise<string | null> => {
    const run = `${STATION}-${randomUUID().slice(0, 8)}`;
    const calibrage = options.calibrage();
    let lecture: Lecture | null = null;
    const juger = (fin: Fin): Verdict => {
      let flux = "";
      try {
        flux = readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8");
      } catch {
        // Without its stream, there is no answer.
      }
      lecture = lireFlux(flux);
      if (fin.arret) return "failed";
      const comment = verdict(lecture, fin.code);
      if (comment === "refused") return "refused";
      // A run that went to its end counts neither for nor against the cooks'
      // failures in a row, any more than a judgement of the manager.
      return comment === "failed" ? "failed" : "neutral";
    };
    let lance;
    try {
      lance = runtime.lancer({
        ticket: null,
        run,
        contexte: { station: STATION, ...calibrage },
        // Outside any repository: it reads only its brief.
        ...envelopper(options.cloison, { commande: options.bin, args: dansLeBacASableLocal(options.bacASable, argumentsJuge(consigne, calibrage), tmpdir()) }, { cwd: tmpdir(), depot: null }),
        cwd: tmpdir(),
        env: environnementClaude(environnementCook(env), env),
        juger,
      });
    } catch (erreur) {
      // The "stop" or the breaker, arrived since the last look.
      if (erreur instanceof LancementRefuse) return null;
      throw erreur;
    }
    const fin = await lance.fin;
    const lu = lecture as Lecture | null;
    if (arrete || fin.outcome === "interrupted" || fin.arret || lu === null) {
      if (!arrete && fin.outcome !== "interrupted") avertir(`brigade : product role run ${run} did not finish (${fin.arret ? `guard:${fin.arret.reason}` : (fin.erreur ?? `exit code ${fin.code}`)}) — it runs again after the gap`);
      return null;
    }
    const comment = verdict(lu, fin.code);
    if (comment !== "done") {
      avertir(`brigade : product role run ${run} did not finish (${comment}) — it runs again after the gap`);
      return null;
    }
    return lu.message;
  };

  const passer = async () => {
    const instant = maintenant();
    const etat = lireLaCadence(base);
    if (retenue(base, etat, instant) !== null) return;
    const jour = jourDe(instant);
    // Said once a day, the first time a tick finds it reached.
    const auPlafond = (compte: typeof etat) => {
      const deposees = deposeesLe(compte, jour);
      if (deposees < compte.plafond) return false;
      if (compte.plafondDitLe !== jour) {
        noterPlafondDit(base, jour);
        avertir(`brigade : product role — daily cap reached (${deposees}/${compte.plafond} filed today): nothing more is filed before tomorrow`);
      }
      return true;
    };
    // Reached by what it already counted today: no need to ask GitHub.
    if (auPlafond(etat)) return;
    // The rail empty, or an outside issue overdue: what wakes the role.
    const vide = railVide(base);
    const enAttente: IssueOuverte[] = [];
    for (const issue of await lireOuvertes()) {
      if (arrete) return;
      if (!externe(issue) || instant.getTime() - Date.parse(issue.createdAt) < RETARD_MS) continue;
      if (enRetard(issue, await options.github.commentaires(issue.number), instant)) enAttente.push(issue);
    }
    if (!vide && enAttente.length === 0) return;

    compter(base, jour, await deposeesAujourdhui(jour));
    const compte = lireLaCadence(base);
    if (auPlafond(compte)) return;
    const deposees = deposeesLe(compte, jour);
    if (arrete || !lireLaCadence(base).allume) return;

    const reste = compte.plafond - deposees;
    noterPassage(base, instant);
    const pourquoi = vide ? "the rail is empty" : `${pluriel(enAttente.length, "outside issue")} unanswered for more than a day (${enAttente.map(({ number }) => `#${number}`).join(", ")})`;
    avertir(`brigade : product role runs — ${pourquoi}; it may file ${reste} today`);
    const sources = (await options.sources?.()) ?? [];
    const texte = await demander(consigneDuRole({ depot: options.depotGitHub, reste, ouvertes, enRetard: enAttente, sources }));
    if (texte === null || arrete) return;

    const reponse = lireReponse(texte);
    for (const raison of reponse.ecartees) avertir(`brigade : product role — a section is not filed: ${raison}`);
    const retenus = reponse.depots.slice(0, reste);
    if (reponse.depots.length > retenus.length) avertir(`brigade : product role — ${pluriel(reponse.depots.length - retenus.length, "section")} beyond the daily cap, not filed`);
    const deposes: number[] = [];
    for (const depot of retenus) {
      // Turned off while it ran: what it wrote is not filed.
      if (arrete || !lireLaCadence(base).allume) break;
      const { titre, corps, labels } = aDeposer(depot);
      try {
        deposes.push(await options.github.creerIssue({ titre, corps, labels }));
      } catch (erreur) {
        avertir(`brigade : product role — issue “${titre}” not filed: ${message(erreur)}`);
        break;
      } finally {
        // Counted as soon as filed: a failure further on does not let it file more.
        compter(base, jour, deposees + deposes.length);
      }
    }
    if (deposes.length > 0) avertir(`brigade : product role filed ${deposes.map((numero) => `#${numero}`).join(", ")} — ${deposees + deposes.length}/${compte.plafond} today`);
    else if (reponse.rien !== null) avertir(`brigade : product role filed nothing — ${reponse.rien}`);
  };

  const desabonner = runtime.surReveil((cause) => {
    if (cause !== "tick" || arrete || occupee || options.perimee?.()) return;
    occupee = true;
    void passer()
      .catch((erreur) => {
        // `gh` down: nothing is decided, the next tick tries again.
        if (!arrete) avertir(`brigade : product role cadence hit an error — ${message(erreur)}`);
      })
      .finally(() => {
        occupee = false;
      });
  });

  return {
    ...runtime,
    arreter(signal: string) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}
