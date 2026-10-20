// Les projets que le chef ajoute à la station depuis l'app, sans terminal.
//
// L'app écrit, dans le gist de la station, les projets qu'il lui demande
// (`demande.ts`). La station le relit à chaque cadence ; pour chaque projet
// dont elle est la principale, elle vérifie que ses Apps GitHub sont
// autorisées sur le dépôt — sinon, elle publie la page où le chef les
// autorise, en un clic —, clone le dépôt, pose les décisions du parcours au
// journal du projet, ouvre le ticket qui prépare son dépôt
// (`preparation-depot/`), puis lui écrit sa ligne dans sa configuration, dans le
// bloc qu'elle tient seule (`bloc.ts`). La station l'ouvre aussitôt : il est
// dans sa liste, et sa présence le publie. Un projet que l'app ne demande plus
// quitte le bloc : la station ne le sert plus — son état et son clone restent.
//
// Ce qu'elle en dit, projet par projet, elle l'écrit dans le même gist
// (`brigade-projets-suivi.json`) : l'app le montre au chef — et, pour chacun,
// la station où il cuit, et si c'est l'ordinateur du chef ; pour ceux dont
// elle est la principale, où en est leur onboarding (`onboarding/`).
//
// La cuisine d'un projet déménage d'une station à une autre sans qu'il soit
// retiré ni rajouté (`demenagement/`) : l'app demande à celle qu'il quitte de
// le remettre (`remise`), à celle qui le reprend de le reprendre (`reprise`).
// Elles se répondent par leurs gists, en deux temps, et jamais deux cuisines ne
// le servent ensemble :
//   1. celle qui le reprend vérifie qu'elle peut le servir — sur l'ordinateur
//      du chef, le bac à sable d'abord —, l'autorise et le clone, puis se dit
//      prête dans son suivi (`acceptee`) ; ou dit, en une phrase, pourquoi elle
//      ne le peut pas (`refusee`) — et rien ne bouge ;
//   2. celle qu'il quitte, la voyant prête, retire sa ligne — sa cuisine se
//      ferme, plus rien n'en part —, arrête ses cooks en vol, et publie son
//      état dans son gist (`remise`) ;
//   3. celle qui le reprend le pose, puis écrit sa ligne : sa cuisine s'ouvre
//      sur le journal reçu, et reprend les tickets où ils en étaient (`recue`).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FICHIER_LOCAL } from "../appairage/presence.ts";
import type { Canal } from "../appairage/canal.ts";
import type { Verification } from "../bac-a-sable/local.ts";
import { dejaDemenage, lireRemise, recevoir, remettre, remisAilleurs } from "../demenagement/remise.ts";
import { ouvrirGitHub } from "../github.ts";
import { lireOnboarding } from "../onboarding/lire.ts";
import { ouvrirLaPreparation } from "../preparation-depot/ouvrir.ts";
import { CLONES, CONFIGURATION, ETATS } from "../station/configuration.ts";
import { lignesDuBloc, nomsHorsDuBloc, reecrireBloc } from "./bloc.ts";
import { documentDeSuivi, FICHIER_PROJETS, FICHIER_SUIVI, lireDemande, suiviDe, type Bascule, type ProjetDemande, type SuiviDuProjet } from "./demande.ts";
import { cloner, decisionsDe, poserLesDecisions, verifierAutorisation, type Autorisation } from "./preparer.ts";

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
  // Ouvre le ticket qui prépare le dépôt, une fois (`preparation-depot/`) ;
  // rend son numéro, et s'il vient d'être ouvert.
  ouvrirLaPreparation?: (projet: ProjetDemande, repertoireEtat: string, clone: string) => Promise<{ ticket: number; ouvert: boolean }>;
  // Cette station est celle de l'ordinateur du chef : ses cuisines sont
  // locales (`bac-a-sable/local.ts`). Faux par défaut.
  locale?: boolean;
  // Le bac à sable de ses cuisines peut-il servir ? Joué avant qu'elle accepte
  // de reprendre un projet : `ok`, ou ce qui manque, en une phrase — et elle
  // refuse. Absent : rien à vérifier, la cuisine n'est pas locale.
  verifierBacASable?: () => Verification;
  // Combien de temps la remise attend qu'un cook arrêté soit mort.
  attenteDesCooksMs?: number;
};

export type ProjetsDeLApp = {
  // Une lecture, tout de suite — après celle qui est en cours.
  relire(): Promise<void>;
  arreter(): void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

const ligneDe = (projet: ProjetDemande) => `${projet.nom} ${projet.depot} ${projet.base}`;
const nomDe = (ligne: string) => ligne.split(" ")[0] ?? "";

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

  const locale = options.locale ?? false;
  const etatDe = (nom: string) => join(racine, ETATS, nom);
  const suiviDu = (projet: ProjetDemande, etat: SuiviDuProjet["etat"], dit: string, autoriser: string[] = []): SuiviDuProjet => ({ nom: projet.nom, etat, dit, autoriser, serviLe: null, cuitSur: null, ici: false, bascule: null });

  // Ce qu'il faut pour servir un projet avant d'y rien écrire : ses Apps
  // autorisées sur le dépôt, et son clone. Rend null s'il l'est, ou ce qu'il en est.
  const accueillir = async (projet: ProjetDemande): Promise<SuiviDuProjet | null> => {
    const suivi = (etat: SuiviDuProjet["etat"], dit: string, autoriser: string[] = []) => suiviDu(projet, etat, dit, autoriser);
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
    return null;
  };

  // Prépare un projet dont la station est la principale. Rend sa ligne s'il
  // peut être servi, ou ce qu'il en est. `recu` : son état vient d'une autre
  // station, qui le servait — son dépôt est déjà préparé, son rail tourne.
  const preparer = async (projet: ProjetDemande, recu = false): Promise<{ ligne: string } | SuiviDuProjet> => {
    const suivi = (etat: SuiviDuProjet["etat"], dit: string) => suiviDu(projet, etat, dit);
    const accueil = await accueillir(projet);
    if (accueil !== null) return accueil;
    try {
      const posees = poserLesDecisions(join(racine, ETATS, projet.nom), projet.nom, decisionsDe(projet, station));
      if (posees.length > 0) dire(`brigade : station — ${projet.nom} : décisions du parcours posées au journal (${posees.join(", ")})`);
    } catch (erreur) {
      return suivi("refuse", `the chef's choices could not be written to its log — ${message(erreur)}`);
    }
    if (recu) return { ligne: ligneDe(projet) };
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
    // Ce que la station dit de plus d'un projet qu'elle sert encore, et où en
    // est son déménagement.
    const motifs = new Map<string, string>();
    const bascules = new Map<string, Bascule>();
    // Les projets à remettre : leur ligne quitte le bloc d'abord.
    const aRemettre: Array<{ projet: ProjetDemande; remise: NonNullable<ProjetDemande["remise"]> }> = [];
    for (const projet of demande.projets) {
      if (!projet.principale) {
        const remise = projet.remise ?? null;
        if (remise === null) {
          suivis.set(projet.nom, suiviDu(projet, "secondaire", "not its main station: it runs neither its manager nor its pass"));
          continue;
        }
        const bascule = { de: station, vers: remise.vers, demandeLe: remise.demandeLe };
        // Déjà remis : rien ne se rouvre ici — la remise se republie seulement
        // si le gist ne la porte plus. Sans journal, la remise publiée est tout
        // ce qu'il y avait à remettre.
        const publiee = lireRemise(lus, projet.nom);
        const publieePourElle = publiee !== null && publiee.demandeLe === remise.demandeLe && publiee.vers === remise.vers;
        if (dejaDemenage(etatDe(projet.nom), remise) || (publieePourElle && publiee.journal === null)) {
          if (publieePourElle) {
            suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", `handed over to ${remise.vers}: its kitchen is closed here, it cooks there now`), cuitSur: remise.vers, bascule: { ...bascule, etape: "remise" } });
          } else aRemettre.push({ projet, remise });
          continue;
        }
        const chezElle = suiviDe((await canal.lire(remise.gist))?.[FICHIER_SUIVI], projet.nom);
        if (arrete) return;
        const sienne = chezElle?.bascule;
        const pourCelleCi = sienne !== null && sienne !== undefined && sienne.demandeLe === remise.demandeLe && sienne.de === station && sienne.vers === remise.vers;
        if (pourCelleCi && (sienne.etape === "acceptee" || sienne.etape === "recue")) {
          aRemettre.push({ projet, remise });
          continue;
        }
        // L'autre n'est pas prête, ou refuse : rien ne bouge, elle le sert toujours.
        const refusee = pourCelleCi && sienne.etape === "refusee";
        const motif = refusee
          ? `moving to ${remise.vers} is refused, so it stays here — ${chezElle?.dit ?? ""}`
          : `moving to ${remise.vers} is asked: it cooks here until ${remise.vers} is ready to take it over`;
        if (refusee) direUneFois(`refus ${projet.nom} ${remise.demandeLe} ${chezElle?.dit}`, `brigade : station — ${projet.nom} : ${remise.vers} refuse de le reprendre, il reste servi ici — ${chezElle?.dit ?? ""}`);
        bascules.set(projet.nom, { ...bascule, etape: refusee ? "refusee" : "demandee" });
        const ligne = avant.find((une) => nomDe(une) === projet.nom);
        if (ligne !== undefined) {
          lignes.push(ligne);
          motifs.set(projet.nom, motif);
        } else suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", motif), bascule: bascules.get(projet.nom) ?? null });
        continue;
      }
      if (aLaMain.has(projet.nom)) {
        suivis.set(projet.nom, suiviDu(projet, "refuse", `the station's configuration already has a line for ${projet.nom}, written by hand: remove it, and the station takes this one`));
        continue;
      }
      // Déjà dans le bloc, tel quel : rien à préparer.
      if (avant.includes(ligneDe(projet))) {
        lignes.push(ligneDe(projet));
        const reprise = projet.reprise ?? null;
        if (reprise !== null && dejaDemenage(etatDe(projet.nom), { vers: station, demandeLe: reprise.demandeLe })) bascules.set(projet.nom, { de: reprise.de, vers: station, demandeLe: reprise.demandeLe, etape: "recue" });
        continue;
      }
      const reprise = projet.reprise ?? null;
      let recu = false;
      if (reprise !== null) {
        const bascule = { de: reprise.de, vers: station, demandeLe: reprise.demandeLe };
        const deLa = (etat: SuiviDuProjet["etat"], dit: string, etape: Bascule["etape"]): SuiviDuProjet => ({ ...suiviDu(projet, etat, dit), cuitSur: reprise.de, bascule: { ...bascule, etape } });
        recu = dejaDemenage(etatDe(projet.nom), { vers: station, demandeLe: reprise.demandeLe });
        if (!recu) {
          // Sur l'ordinateur du chef, pas de reprise sans bac à sable : elle est
          // refusée en une phrase, et l'autre station le sert toujours.
          const bac = options.verifierBacASable?.();
          if (bac !== undefined && !bac.ok) {
            direUneFois(`bac ${projet.nom} ${reprise.demandeLe} ${bac.raison}`, `brigade : station — ${projet.nom} n'est pas repris de ${reprise.de} : ${bac.raison}`);
            suivis.set(projet.nom, deLa("refuse", bac.raison, "refusee"));
            continue;
          }
          const accueil = await accueillir(projet);
          if (arrete) return;
          if (accueil !== null) {
            suivis.set(projet.nom, { ...accueil, cuitSur: reprise.de, bascule: { ...bascule, etape: "demandee" } });
            continue;
          }
          const chezElle = await canal.lire(reprise.gist);
          if (arrete) return;
          const remise = lireRemise(chezElle, projet.nom);
          if (remise === null || remise.demandeLe !== reprise.demandeLe || remise.vers !== station || remise.de !== reprise.de) {
            suivis.set(projet.nom, deLa("en-preparation", `ready to take it over from ${reprise.de}: waiting for ${reprise.de} to close its kitchen and hand over its state`, "acceptee"));
            continue;
          }
          try {
            const pose = recevoir({ repertoireEtat: etatDe(projet.nom), remise, fichiers: chezElle ?? {} });
            recu = pose !== null;
            dire(`brigade : station — ${projet.nom} repris de ${reprise.de} : ${pose === null ? "elle n'en avait aucun journal, il arrive neuf" : `son journal est posé (${pose.evenements} événements), ses tickets reprennent ici`}`);
          } catch (erreur) {
            const dit = message(erreur);
            direUneFois(`reception ${projet.nom} ${dit}`, `brigade : station — ${projet.nom} : la reprise de ${reprise.de} n'a pas abouti, la station réessaie : ${dit}`);
            suivis.set(projet.nom, deLa("en-preparation", `taking it over from ${reprise.de} did not go through; the station retries — ${dit}`, "acceptee"));
            continue;
          }
        }
        bascules.set(projet.nom, { ...bascule, etape: "recue" });
      } else {
        // Une cuisine remise ne se rouvre pas ici sans être reprise : deux
        // stations ne la serviraient plus que le temps d'une lecture, mais elles
        // la serviraient ensemble.
        const ailleurs = remisAilleurs(etatDe(projet.nom), station);
        if (ailleurs !== null) {
          suivis.set(projet.nom, { ...suiviDu(projet, "refuse", `it was handed over to ${ailleurs.to} (move asked on ${ailleurs.askedAt}) and cooks there: move it back to bring it here`), cuitSur: ailleurs.to });
          continue;
        }
      }
      const prepare = await preparer(projet, recu);
      if (arrete) return;
      if ("ligne" in prepare) lignes.push(prepare.ligne);
      else suivis.set(projet.nom, { ...prepare, bascule: bascules.get(projet.nom) ?? null });
    }

    const remis = new Set(aRemettre.map(({ projet }) => projet.nom));
    if (lignes.join("\n") !== avant.join("\n")) {
      // La configuration se remplace d'un coup : la station ne lit jamais une moitié.
      const neuf = reecrireBloc(lireTexte(fichier), lignes);
      writeFileSync(`${fichier}.app`, neuf);
      renameSync(`${fichier}.app`, fichier);
      const noms = (liste: string[]) => new Set(liste.map(nomDe));
      const [anciens, nouveaux] = [noms(avant), noms(lignes)];
      for (const nom of nouveaux) if (!anciens.has(nom)) dire(`brigade : station — ${nom} ajouté depuis l'app : sa ligne est écrite dans la configuration`);
      for (const nom of anciens) {
        if (nouveaux.has(nom)) continue;
        dire(remis.has(nom) ? `brigade : station — ${nom} déménage : sa ligne quitte la configuration, sa cuisine se ferme ici et plus aucun cook n'en part` : `brigade : station — ${nom} retiré depuis l'app : sa ligne quitte la configuration (son état et son clone restent)`);
      }
      // La station relit sa configuration : la cuisine d'un projet qui
      // déménage est fermée avant que sa remise ne commence.
      options.apresEcriture();
    }

    // Les remises : la cuisine fermée, ses cooks arrêtés, son état publié.
    for (const { projet, remise } of aRemettre) {
      const bascule = { de: station, vers: remise.vers, demandeLe: remise.demandeLe };
      try {
        const fichiers = await remettre({ repertoireEtat: etatDe(projet.nom), projet: projet.nom, de: station, vers: remise.vers, demandeLe: remise.demandeLe, maintenant: () => new Date(maintenant()), attenteMs: options.attenteDesCooksMs });
        if (arrete) return;
        if ((await canal.ecrire(gist, fichiers)) === "absent") throw new Error("the station's gist no longer exists");
        direUneFois(`remis ${projet.nom} ${remise.demandeLe}`, `brigade : station — ${projet.nom} remis à ${remise.vers} : sa cuisine est fermée ici, son état publié — il cuit là-bas désormais`);
        suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", `handed over to ${remise.vers}: its kitchen is closed here, it cooks there now`), cuitSur: remise.vers, bascule: { ...bascule, etape: "remise" } });
      } catch (erreur) {
        const dit = message(erreur);
        direUneFois(`remise ${projet.nom} ${dit}`, `brigade : station — ${projet.nom} : sa remise à ${remise.vers} attend, la station réessaie : ${dit}`);
        suivis.set(projet.nom, { ...suiviDu(projet, "secondaire", `handing its kitchen over to ${remise.vers}: no cook leaves here any more; the station retries — ${dit}`), bascule: { ...bascule, etape: "acceptee" } });
      }
    }

    const instant = maintenant();
    const servisMaintenant = new Set(servis.projets());
    const suivi = demande.projets.map((projet): SuiviDuProjet => {
      const dit = suivis.get(projet.nom);
      if (dit !== undefined) return dit;
      const bascule = bascules.get(projet.nom) ?? null;
      const motif = motifs.get(projet.nom);
      if (servisMaintenant.has(projet.nom)) {
        if (!serviLe.has(projet.nom)) serviLe.set(projet.nom, new Date(instant).toISOString());
        return { nom: projet.nom, etat: "servi", dit: motif === undefined ? `served by ${station}` : `served by ${station}; ${motif}`, autoriser: [], serviLe: serviLe.get(projet.nom) ?? null, cuitSur: station, ici: locale, bascule };
      }
      const refus = servis.refus(projet.nom);
      return refus === null
        ? { ...suiviDu(projet, "en-preparation", "its line is written: the station is opening it"), bascule }
        : { ...suiviDu(projet, "refuse", `the station refuses to serve it — ${refus}`), bascule };
    });
    for (const nom of [...serviLe.keys()]) if (!servisMaintenant.has(nom)) serviLe.delete(nom);
    // Où en est chaque projet dont elle est la principale, de son ajout à son
    // premier ticket. Un projet qu'elle reprend d'une autre station n'est pas
    // neuf : il n'en a pas.
    const onboarding = Object.fromEntries(
      demande.projets.flatMap((projet) => {
        if (!projet.principale || (projet.reprise ?? null) !== null) return [];
        const dit = suivi.find(({ nom }) => nom === projet.nom) ?? null;
        const repertoireEtat = etatDe(projet.nom);
        return [[projet.nom, lireOnboarding({ repertoireEtat, projet: projet.nom, depot: projet.depot, station, suivi: dit, clone: existsSync(join(racine, CLONES, projet.nom)) })]];
      }),
    );
    // Le suivi ne se réécrit que s'il a changé : un gist n'est pas un journal.
    const compare = JSON.stringify({ suivi, onboarding });
    if (compare === dernierSuivi && lus[FICHIER_SUIVI] !== undefined) return;
    await canal.ecrire(gist, { [FICHIER_SUIVI]: documentDeSuivi(suivi, instant, { nom: station, locale }, onboarding) });
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
