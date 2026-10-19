// Les projets que le chef ajoute à la station depuis l'app, sans terminal.
//
// L'app écrit, dans le gist de la station, les projets qu'il lui demande
// (`demande.ts`). La station le relit à chaque cadence ; pour chaque projet
// dont elle est la principale, elle vérifie que ses Apps GitHub sont
// autorisées sur le dépôt — sinon, elle publie la page où le chef les
// autorise, en un clic —, clone le dépôt, pose les décisions du parcours au
// journal du projet, ouvre le ticket qui prépare son dépôt
// (`repo-preparation/`), puis lui écrit sa ligne dans sa configuration, dans le
// bloc qu'elle tient seule (`bloc.ts`). La station l'ouvre aussitôt : il est
// dans sa liste, et sa présence le publie. Un projet que l'app ne demande plus
// quitte le bloc : la station ne le sert plus — son état et son clone restent.
//
// Ce qu'elle en dit, projet par projet, elle l'écrit dans le même gist
// (`brigade-projets-suivi.json`) : l'app le montre au chef.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FICHIER_LOCAL } from "../pairing/presence.ts";
import type { Canal } from "../pairing/channel.ts";
import { ouvrirGitHub } from "../github.ts";
import { ouvrirLaPreparation } from "../repo-preparation/open.ts";
import { CLONES, CONFIGURATION, ETATS } from "../station/configuration.ts";
import { lignesDuBloc, nomsHorsDuBloc, reecrireBloc } from "./block.ts";
import { documentDeSuivi, FICHIER_PROJETS, FICHIER_SUIVI, lireDemande, type ProjetDemande, type SuiviDuProjet } from "./request.ts";
import { cloner, decisionsDe, poserLesDecisions, verifierAutorisation, type Autorisation } from "./prepare.ts";

// Entre deux lectures de ce que l'app demande.
export const CADENCE_MS = 30_000;

// Ce que la station sert, tel que ce module le lit.
export type ServiParLaStation = {
  projets(): string[];
  // Pourquoi la station refuse ce projet, ou null.
  refus(nom: string): string | null;
};

export type OptionsProjets = {
  racine: string;
  canal: Canal;
  // Le nom de la station : celui de ses stations déclarées.
  station: string;
  env: Record<string, string | undefined>;
  servis: ServiParLaStation;
  // La configuration vient d'être réécrite : la station la relit, et publie sa présence.
  apresEcriture: () => void;
  dire: (ligne: string) => void;
  cadenceMs?: number;
  maintenant?: () => number;
  // Surchargés par les tests.
  autoriser?: (depot: string) => Promise<Autorisation>;
  cloner?: (depot: string, clone: string) => Promise<void>;
  // Ouvre le ticket qui prépare le dépôt, une fois (`repo-preparation/`) ;
  // rend son numéro, et s'il vient d'être ouvert.
  ouvrirLaPreparation?: (projet: ProjetDemande, repertoireEtat: string, clone: string) => Promise<{ ticket: number; ouvert: boolean }>;
};

export type ProjetsDeLApp = {
  // Une lecture, tout de suite — après celle qui est en cours.
  relire(): Promise<void>;
  arreter(): void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

const ligneDe = (projet: ProjetDemande) => `${projet.nom} ${projet.depot} ${projet.base}`;

// Le gist de la station, une fois appairée — l'app n'écrit que dans ceux-là.
function gistAppaire(racine: string): string | null {
  try {
    const lu = JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")) as { gist?: unknown; appairee?: unknown };
    return lu.appairee === true && typeof lu.gist === "string" && lu.gist !== "" ? lu.gist : null;
  } catch {
    return null;
  }
}

function lireTexte(fichier: string): string {
  try {
    return readFileSync(fichier, "utf8");
  } catch {
    return "";
  }
}

export function tenirProjetsDeLApp(options: OptionsProjets): ProjetsDeLApp {
  const { racine, canal, station, env, servis, dire } = options;
  const maintenant = options.maintenant ?? Date.now;
  const fichier = join(racine, CONFIGURATION);
  const gh = env.BRIGADE_GH_BIN || "gh";
  const autoriser = options.autoriser ?? ((depot: string) => verifierAutorisation(env, depot));
  const clonerLe = options.cloner ?? ((depot: string, clone: string) => cloner({ gh, depot, clone }));
  const ouvrirLe =
    options.ouvrirLaPreparation ??
    (async (projet: ProjetDemande, repertoireEtat: string, clone: string) => {
      const github = ouvrirGitHub({ depot: projet.depot, bin: gh });
      try {
        return await ouvrirLaPreparation({ repertoireEtat, projet: projet.nom, depot: projet.depot, base: projet.base, clone, github });
      } finally {
        github.fermer();
      }
    });
  // Ce qui a déjà été dit : la même chose ne se répète pas à chaque cadence.
  const dits = new Set<string>();
  const direUneFois = (cle: string, ligne: string) => {
    if (dits.has(cle)) return;
    dits.add(cle);
    dire(ligne);
  };
  // Un dépôt autorisé le reste : la station ne le redemande pas à GitHub.
  const autorises = new Set<string>();
  // Quand chaque projet a été servi pour la première fois.
  const serviLe = new Map<string, string>();
  let dernierSuivi = "";
  let arrete = false;

  // Prépare un projet dont la station est la principale. Rend sa ligne s'il
  // peut être servi, ou ce qu'il en est.
  const preparer = async (projet: ProjetDemande): Promise<{ ligne: string } | SuiviDuProjet> => {
    const suivi = (etat: SuiviDuProjet["etat"], dit: string, autoriser: string[] = []): SuiviDuProjet => ({ nom: projet.nom, etat, dit, autoriser, serviLe: null });
    if (!autorises.has(projet.depot)) {
      const autorisation = await autoriser(projet.depot);
      if ("panne" in autorisation) return suivi("en-preparation", `GitHub could not tell whether the station may act on ${projet.depot}; retried every ${Math.round((options.cadenceMs ?? CADENCE_MS) / 1000)} s — ${autorisation.panne}`);
      if (!autorisation.autorisee) {
        direUneFois(`autoriser ${projet.nom} ${autorisation.pages.join(" ")}`, `brigade : station — ${projet.nom} attend que le chef autorise brigade sur ${projet.depot} : ${autorisation.pages.join(", ")}`);
        return suivi("a-autoriser", `authorize brigade on ${projet.depot}, on GitHub: one click per page`, autorisation.pages);
      }
      autorises.add(projet.depot);
    }
    try {
      await clonerLe(projet.depot, join(racine, CLONES, projet.nom));
    } catch (erreur) {
      const dit = message(erreur);
      direUneFois(`clone ${projet.nom} ${dit}`, `brigade : station — ${projet.nom} n'est pas cloné, la station réessaie : ${dit}`);
      return suivi("refuse", `the station could not clone ${projet.depot}; it retries — ${dit}`);
    }
    try {
      const posees = poserLesDecisions(join(racine, ETATS, projet.nom), projet.nom, decisionsDe(projet, station));
      if (posees.length > 0) dire(`brigade : station — ${projet.nom} : décisions du parcours posées au journal (${posees.join(", ")})`);
    } catch (erreur) {
      return suivi("refuse", `the chef's choices could not be written to its log — ${message(erreur)}`);
    }
    // Le premier ticket de sa cuisine, ouvert avant sa ligne : la cuisine qui
    // s'ouvre ensuite n'en laisse partir aucun autre avant lui.
    try {
      const { ticket, ouvert } = await ouvrirLe(projet, join(racine, ETATS, projet.nom), join(racine, CLONES, projet.nom));
      if (ouvert) dire(`brigade : station — ${projet.nom} : ticket #${ticket} ouvert sur ${projet.depot} pour préparer le dépôt (gates, setup de worktree, sites autorisés) — le rail n'en sert aucun autre avant son merge`);
    } catch (erreur) {
      const dit = message(erreur);
      direUneFois(`preparation ${projet.nom} ${dit}`, `brigade : station — ${projet.nom} : le ticket qui prépare son dépôt n'est pas ouvert sur GitHub, la station réessaie : ${dit}`);
      return suivi("en-preparation", `the station could not open the ticket that prepares ${projet.depot}; it retries — ${dit}`);
    }
    return { ligne: ligneDe(projet) };
  };

  const cycle = async () => {
    const gist = gistAppaire(racine);
    if (gist === null) return;
    const lus = await canal.lire(gist);
    if (lus === null || arrete) return;
    const brut = lus[FICHIER_PROJETS];
    const demande = brut === undefined ? { projets: [], problemes: [] } : lireDemande(brut);
    if (demande === null) {
      direUneFois(`illisible ${brut}`, `brigade : station — ce que l'app demande (${FICHIER_PROJETS}) est illisible : la station n'en change rien`);
      return;
    }
    for (const probleme of demande.problemes) direUneFois(probleme, `brigade : station — ${probleme}`);

    const texte = lireTexte(fichier);
    const avant = lignesDuBloc(texte);
    const aLaMain = new Set(nomsHorsDuBloc(texte));
    const lignes: string[] = [];
    const suivis = new Map<string, SuiviDuProjet>();
    for (const projet of demande.projets) {
      if (!projet.principale) {
        suivis.set(projet.nom, { nom: projet.nom, etat: "secondaire", dit: "not its main station: it runs neither its manager nor its pass", autoriser: [], serviLe: null });
        continue;
      }
      if (aLaMain.has(projet.nom)) {
        suivis.set(projet.nom, { nom: projet.nom, etat: "refuse", dit: `the station's configuration already has a line for ${projet.nom}, written by hand: remove it, and the station takes this one`, autoriser: [], serviLe: null });
        continue;
      }
      // Déjà dans le bloc, tel quel : rien à préparer.
      const prepare = avant.includes(ligneDe(projet)) ? { ligne: ligneDe(projet) } : await preparer(projet);
      if (arrete) return;
      if ("ligne" in prepare) lignes.push(prepare.ligne);
      else suivis.set(projet.nom, prepare);
    }

    if (lignes.join("\n") !== avant.join("\n")) {
      // La configuration se remplace d'un coup : la station ne lit jamais une moitié.
      const neuf = reecrireBloc(lireTexte(fichier), lignes);
      writeFileSync(`${fichier}.app`, neuf);
      renameSync(`${fichier}.app`, fichier);
      const noms = (liste: string[]) => new Set(liste.map((ligne) => ligne.split(" ")[0]));
      const [anciens, nouveaux] = [noms(avant), noms(lignes)];
      for (const nom of nouveaux) if (!anciens.has(nom)) dire(`brigade : station — ${nom} ajouté depuis l'app : sa ligne est écrite dans la configuration`);
      for (const nom of anciens) if (!nouveaux.has(nom)) dire(`brigade : station — ${nom} retiré depuis l'app : sa ligne quitte la configuration (son état et son clone restent)`);
      options.apresEcriture();
    }

    const instant = maintenant();
    const servisMaintenant = new Set(servis.projets());
    const suivi = demande.projets.map((projet): SuiviDuProjet => {
      const dit = suivis.get(projet.nom);
      if (dit !== undefined) return dit;
      if (servisMaintenant.has(projet.nom)) {
        if (!serviLe.has(projet.nom)) serviLe.set(projet.nom, new Date(instant).toISOString());
        return { nom: projet.nom, etat: "servi", dit: `served by ${station}`, autoriser: [], serviLe: serviLe.get(projet.nom) ?? null };
      }
      const refus = servis.refus(projet.nom);
      return refus === null
        ? { nom: projet.nom, etat: "en-preparation", dit: "its line is written: the station is opening it", autoriser: [], serviLe: null }
        : { nom: projet.nom, etat: "refuse", dit: `the station refuses to serve it — ${refus}`, autoriser: [], serviLe: null };
    });
    for (const nom of [...serviLe.keys()]) if (!servisMaintenant.has(nom)) serviLe.delete(nom);
    // Le suivi ne se réécrit que s'il a changé : un gist n'est pas un journal.
    const compare = JSON.stringify(suivi);
    if (compare === dernierSuivi && lus[FICHIER_SUIVI] !== undefined) return;
    await canal.ecrire(gist, { [FICHIER_SUIVI]: documentDeSuivi(suivi, instant) });
    dernierSuivi = compare;
  };

  let panne: string | null = null;
  let fil: Promise<void> = Promise.resolve();
  let enCours = false;
  const enchainer = () => {
    fil = fil.then(async () => {
      if (arrete) return;
      enCours = true;
      try {
        await cycle();
        if (panne !== null) dire("brigade : station — GitHub répond de nouveau : elle relit les projets que l'app lui demande");
        panne = null;
      } catch (erreur) {
        const dit = message(erreur);
        if (dit !== panne) dire(`brigade : station — les projets que l'app lui demande ne sont pas lus, elle réessaie : ${dit}`);
        panne = dit;
      } finally {
        enCours = false;
      }
    });
    return fil;
  };

  void enchainer();
  // Un clone long ne fait pas s'empiler les lectures : la suivante attend la fin de celle-ci.
  const veille = setInterval(() => void (enCours ? undefined : enchainer()), options.cadenceMs ?? CADENCE_MS);

  return {
    relire: enchainer,
    arreter() {
      arrete = true;
      clearInterval(veille);
    },
  };
}
