// Retirer un projet : deux gestes, qui ne se confondent jamais.
//
// « Retirer de l'app » enlève sa ligne du fichier des projets — donc de la barre —, et
// rien d'autre : rien ne part vers sa box, où il reste installé, son journal intact.
//
// « Désinstaller de la box » lance à la place du chef le geste de désinstallation de la
// box (`sudo brigade-installer uninstall …`, runtime/deploy/brigade-installer), par
// `ssh`, en deux temps. Le plan d'abord (`--plan`) : la box dit ce qu'elle retirerait,
// et ne retire rien. Puis l'exécution (`--confirmer <projet>`), refusée ici tant que la
// box n'a pas rendu son plan pour le même réglage, et tant que le chef n'a pas écrit le
// nom du projet. Le journal ne part que s'il a coché l'option : sans elle,
// `--supprimer-le-journal` n'est jamais envoyé.
//
// L'app n'a aucune règle de suppression : ce qui serait retiré, ce qui l'a été et ce
// qui est gardé, c'est la box qui le dit, et ses phrases sont montrées mot pour mot. De
// son objet, l'app ne lit que deux choses : que c'est la réponse à ce qu'elle a demandé,
// et où est le journal — gardé, ou retiré.
//
// Désinstallé, un projet reste dans l'app — l'en retirer est l'autre geste —, mais n'y
// est plus pilotable : elle le montre sans sa box, ne lit plus rien d'elle, et le dit.
// Rien n'est gardé d'un lancement de l'app à l'autre : relancée, elle relit la box, qui
// dit elle-même ne plus connaître le projet.
import { execFile, type ExecFileException } from "node:child_process";
import { cite, type Reglages, type Served } from "./box.ts";
import type { Projet } from "./config.ts";
import { nombre } from "./format.ts";

// Le geste, par le chemin que sa règle sudoers nomme : `sudo` n'a pas à le chercher.
export const GESTE = "/usr/local/bin/brigade-installer";

// L'objet du geste : la dernière ligne de sa sortie standard qui en est un.
export function objetDuGeste(sortie: string): Record<string, unknown> | undefined {
  for (const ligne of sortie.split("\n").reverse()) {
    try {
      const lu: unknown = JSON.parse(ligne);
      if (lu !== null && typeof lu === "object" && typeof (lu as { ok?: unknown }).ok === "boolean") return lu as Record<string, unknown>;
    } catch {
      // Pas un objet : ce que la station a écrit d'autre reste dans ce qui a été obtenu.
    }
  }
  return undefined;
}

// Les deux gestes, par le libellé qui les sépare — et celui du plan, qui ne retire rien.
export const RETIRER = "Remove from the app";
export const UNINSTALL = "Uninstall from the station";
export const PLANIFIER = "See what the station would remove";
const DOC = "docs/installer.md";
// Ce que `ssh` a pour répondre. Le plan inventorie le clone du projet ; l'exécution
// arrête son runtime et retire, journal compris s'il est demandé (runtime/src/desinstallateur.ts).
export const DELAIS = { planMs: 180_000, executionMs: 900_000 } as const;
// Le code d'une désinstallation commencée qui s'est arrêtée en chemin (runtime/deploy/brigade-installer).
const INACHEVEE = 79;

// Ce qui est demandé à la box : son plan, ou la désinstallation, confirmée par le nom du projet.
// `journal` : l'option que le chef a cochée — fausse, `--supprimer-le-journal` ne part pas.
export type Demande = { plan: true; journal: boolean } | { plan: false; confirmation: string; journal: boolean };

// Ce que le geste reçoit, argument par argument. Aucun chemin : il compose lui-même ce qu'il retire.
export function argumentsDuRetrait(nom: string, demande: Demande): string[] {
  return ["uninstall", nom, ...(demande.plan ? ["--plan"] : ["--confirmer", demande.confirmation]), ...(demande.journal ? ["--supprimer-le-journal"] : [])];
}

// La ligne que `ssh` porte à la box. `sudo -n` : sans terminal, il échoue plutôt que
// d'attendre un mot de passe.
export const gesteDeRetrait = (nom: string, demande: Demande) => `sudo -n ${GESTE} ${argumentsDuRetrait(nom, demande).map(cite).join(" ")}`;

// Où la box dit le journal du projet : là où elle le garde, ou là d'où elle le retire.
export type Log = { garde: string | null; retire: string | null };
// `plan`, `desinstalle` : le geste a rendu `ok` pour ce qui lui était demandé. `refuse` :
// il a répondu, et dit non — son code, et sa phrase dans `obtenu`. `injoignable` : `ssh`
// a échoué de lui-même (255), ou n'a pas pu être lancé — session jamais ouverte, ou perdue
// en route : son code ne les sépare pas. `geste-absent` : la box a été jointe, et ce n'est
// pas la réponse du geste à cette demande. `sans-reponse` : `ssh` a été arrêté au délai.
// `obtenu` : ce que l'app a reçu, tel quel.
export type Rendu =
  | { etat: "plan" | "desinstalle"; journal: Log; obtenu: string }
  | { etat: "refuse"; motif: string; code: number | null; obtenu: string }
  | { etat: "injoignable" | "geste-absent" | "sans-reponse"; obtenu: string };

const texte = (recu: unknown) => (typeof recu === "string" ? recu.trim() : "");
const chemin = (lu: unknown) => (typeof lu === "string" && lu !== "" ? lu : null);

// Lance le geste de désinstallation sur la box du projet, et dit ce qu'il en est advenu.
// Jamais d'exception : tout ce qui arrive est un rendu.
export function lancerRetrait(reglages: Reglages, { nom, box }: Served, demande: Demande): Promise<Rendu> {
  // Comme la veille : sans terminal, `ssh` ne peut rien demander.
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${reglages.connexionS}`, "--", box.hote, gesteDeRetrait(nom, demande)];
  const attendu = demande.plan ? "plan" : "desinstalle";
  const lance = `$ ${reglages.ssh} ${args.join(" ")}`;
  return new Promise((resoudre) => {
    const rendre = (erreur: ExecFileException | null, sortie: string, erreurs: string) => {
      const code = erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : null;
      const arrete = erreur?.killed === true;
      const suite = arrete ? `no answer in ${nombre(reglages.delaiMs / 1000)} s: ssh stopped` : code !== null ? `exit code ${code}` : (erreur?.message ?? "");
      const objet = objetDuGeste(sortie);
      // Un `ok` ne vaut que s'il répond à cette demande : une désinstallation, de ce projet, à ce temps-là.
      if (objet?.ok === true && objet.action === "uninstall" && objet.projet === nom && objet.fait === attendu) {
        const { retire, garde } = objet as { retire?: { journal?: unknown } | null; garde?: { journal?: unknown } | null };
        // Ce que le geste dit à un humain est sur sa sortie d'erreur : c'est ce qui se lit. Son objet le redit, pour l'app.
        return resoudre({ etat: attendu, journal: { garde: chemin(garde?.journal), retire: chemin(retire?.journal) }, obtenu: `${lance}\n${erreurs.trim() || sortie.trim()}\n\n→ ${suite}` });
      }
      if (objet?.ok === false) {
        return resoudre({ etat: "refuse", motif: texte(objet.motif) || "sans motif", code, obtenu: `${lance}\n${erreurs.trim() || `brigade-installer : ${texte(objet.message)}`}\n\n→ ${suite}` });
      }
      const obtenu = `${lance}\n${erreurs}${sortie}\n→ ${suite}`;
      if (arrete) return resoudre({ etat: "sans-reponse", obtenu });
      // 255 est le code de `ssh` ; sans code, il n'a pas pu être lancé — sauf une sortie
      // trop longue pour être gardée, qui vient bien de la box.
      const jointe = code === null ? erreur?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" : code !== 255;
      resoudre({ etat: jointe ? "geste-absent" : "injoignable", obtenu });
    };
    try {
      execFile(reglages.ssh, args, { timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024 }, rendre);
    } catch (erreur) {
      // Un argument que le système refuse — un nom qui porte un caractère nul — : `ssh` n'est pas lancé, et rien n'est parti.
      resoudre({ etat: "injoignable", obtenu: `${lance}\n→ ${erreur instanceof Error ? erreur.message : String(erreur)}` });
    }
  });
}

// Ce que la vue pose d'une demande faite à la box : son titre, ce que l'app a obtenu, ce
// qu'elle en dit. `pas-parti` : rien n'est parti vers la box, et `suite` dit pourquoi.
// `inachevee` : la désinstallation avait commencé, et la box dit où elle s'est arrêtée.
export type Montre =
  | { etat: "en-cours"; titre: string }
  | { etat: "pas-parti"; titre: string; suite: string[] }
  | { etat: Rendu["etat"] | "inachevee"; a: string; titre: string; obtenu: string; suite: string[] };

// Le geste de box d'un projet, prêt à poser : la vue n'y décide rien.
// `journal.refus`, `planifierRefuse`, `desinstallerRefuse` : pourquoi la case ou le bouton
// est inactif — absent, il se clique.
export type Desinstallation = {
  hote: string;
  journal: { coche: boolean; libelle: string; avertissement: string[]; refus?: string };
  planifier: string;
  planifierRefuse?: string;
  plan?: Montre;
  consigne: string;
  desinstallerRefuse?: string;
  issue?: Montre;
};

// Ce que le panneau montre pour retirer un projet : ses deux gestes, chacun sous son
// libellé, avec ce qu'il fait et ce qu'il ne fait pas. `geste` : absent pour un projet
// sans box — il n'y a rien à y désinstaller, et `lignes` le dit.
export type Retrait = {
  projet: string;
  titre: string;
  retirer: { libelle: string; lignes: string[] };
  desinstaller: { libelle: string; lignes: string[]; geste?: Desinstallation };
};

// Ce que l'app dit d'un projet qu'elle vient de retirer de sa liste.
export type Avis = { titre: string; lignes: string[] };

type Lue = { a: string; rendu: Rendu };
type Tenu = {
  hote: string;
  journal: boolean;
  // Ce que la box a rendu de son plan, pour ce réglage : seul un plan rendu ouvre la désinstallation.
  plan?: Lue;
  planEnCours?: Promise<void>;
  // Ce qu'il est advenu de la dernière désinstallation demandée — ou pourquoi rien n'est parti.
  issue?: Lue | { pasParti: string };
  enCours?: Promise<void>;
  // `journal` : nul quand une désinstallation rejouée depuis n'a pas abouti — l'app ne sait plus où il en est.
  desinstalle?: { a: string; journal: Log | null };
};

// Une désinstallation commencée, qui s'est arrêtée en chemin : son code — ou son motif, si le code s'est perdu.
const inachevee = (rendu: Extract<Rendu, { etat: "refuse" }>) => rendu.code === INACHEVEE || rendu.motif === "echec";

// Ce que la box dit du journal, redit en une phrase : avant, puis après.
function ofTheLog(log: Log | null, fait: boolean): string {
  if (log === null) return "The app no longer knows where its log stands: an uninstall replayed since did not complete — the station's plan will say what is left of it.";
  const { garde, retire } = log;
  if (retire !== null) return fait ? `The project's log was deleted along with its state (${retire}): this cannot be undone.` : `The log is part of what the station would remove (${retire}): deleting it cannot be undone.`;
  if (garde !== null) return fait ? `The project's log still exists on the station: ${garde}. The uninstall did not delete it.` : `The log is not part of what the station would remove: it keeps it (${garde}).`;
  return `The station names no log for this project: neither kept, nor ${fait ? "removed" : "to be removed"}.`;
}

// Ce que l'app dit d'un refus du geste, selon son code (runtime/deploy/brigade-installer).
// La phrase de la box est au-dessus, mot pour mot : elle n'est pas redite.
function suiteDuRefus(code: number | null): string[] {
  if (code === 64) return ["What the station refuses is named above: it removed nothing."];
  if (code === 65) return [`The station does not know this project: there is nothing to uninstall there. If it should no longer appear in the app, that is the other action: “${RETIRER}”.`];
  if (code === 75) return ["Another installation action is running on this station: retry once it has finished."];
  if (code === 76 || code === 77) return [`The station is not ready for this action, and the app does not prepare it: what it lacks is set up on the station itself, by someone with \`sudo\` there — ${DOC}, section 3, « Préparer ».`];
  if (code === 81) return ["The station is held back by what the uninstall would take away: it names it above. Sort it out on the station, then retry."];
  return [];
}

// Ce qu'une demande faite à la box donne à voir. `execution` : c'est la désinstallation, pas son plan.
// `deja` : le projet était déjà dit désinstallé — une désinstallation rejouée qui n'aboutit pas ne l'en dédit pas.
function montrer({ nom, box: { hote } }: Served, { a, rendu }: Lue, execution: boolean, deja: boolean): Montre {
  const { obtenu } = rendu;
  const redemander = "Ask the station for its plan again: it will say what is left of the project on it.";
  const pasDit = deja ? "This project is still reported as uninstalled — it already was: what remained of it on the station is what is in doubt." : "The app does not report this project as uninstalled: what its station says about it can still be read alongside.";
  const ssh = [
    `What each of \`ssh\`'s messages means, and the action that answers it: ${DOC}, section 2, « Joindre ».`,
    `If it says your key was refused (\`Permission denied\`), the station answers and it is access you lack: ${DOC}, « Ajouter un humain ».`,
  ];
  if (rendu.etat === "plan") {
    return {
      etat: "plan",
      a,
      titre: `WHAT STATION “${hote}” WOULD REMOVE — nothing is removed`,
      obtenu,
      suite: ["This is the station's plan, as it returned it: the app adds nothing to it and decides nothing about it.", ofTheLog(rendu.journal, false), `To go ahead: type the project name below, then “${UNINSTALL}”.`],
    };
  }
  if (rendu.etat === "desinstalle") {
    return {
      etat: "desinstalle",
      a,
      titre: `UNINSTALLED FROM STATION “${hote}”`,
      obtenu,
      suite: [
        "What the station removed, and what it keeps, is above, as it said it.",
        ofTheLog(rendu.journal, true),
        `“${nom}” can no longer be driven from the app: it no longer reads its station, and writes nothing to it.`,
        `It is still in the app: “${RETIRER}” removes it — that is the other action.`,
        ...(rendu.journal.garde === null ? [] : ["To delete its log too, replay the uninstall with the option ticked: the plan first, then the confirmation."]),
      ],
    };
  }
  if (rendu.etat === "refuse") {
    if (execution && inachevee(rendu)) {
      return {
        etat: "inachevee",
        a,
        titre: `THE UNINSTALL STOPPED HALFWAY ON STATION “${hote}”`,
        obtenu,
        suite: ["The station says above what is done, and what remains.", "The uninstall can be replayed — ask the station for its plan again: it will say what is left to remove.", pasDit],
      };
    }
    return { etat: "refuse", a, titre: `STATION “${hote}” REFUSED (${rendu.motif}) — nothing is removed`, obtenu, suite: suiteDuRefus(rendu.code) };
  }
  if (rendu.etat === "injoignable") {
    // Un plan ne retire rien, joint ou pas. Une désinstallation, elle, a pu commencer avant que `ssh` ne perde sa session.
    if (!execution) {
      return { etat: "injoignable", a, titre: `STATION “${hote}” COULD NOT BE REACHED — nothing is removed`, obtenu, suite: ["`ssh` did not return the station's plan, and it said why: its message is above, the app does not read it.", ...ssh] };
    }
    return {
      etat: "injoignable",
      a,
      titre: `\`ssh\` FAILED WITHOUT AN ANSWER FROM STATION “${hote}”`,
      obtenu,
      suite: [
        "`ssh` exited with an error, and its message is above: the app does not read it. If it never opened a session, nothing reached the station; if it lost it on the way, the uninstall may have started.",
        `So the app does not know what the station did. ${pasDit}`,
        redemander,
        ...ssh,
      ],
    };
  }
  if (rendu.etat === "geste-absent") {
    return {
      etat: "geste-absent",
      a,
      titre: `STATION “${hote}” WAS REACHED, AND ITS ACTION DID NOT RETURN ${execution ? "ITS ANSWER" : "ITS PLAN"}`,
      obtenu,
      suite: [
        "What the station returned is above, as is. The expected case: `brigade-installer` is not installed there — or not in a version that uninstalls — or its sudoers rule does not grant it to your account.",
        `The app does not prepare a station. This action is set up on it, once, by someone with \`sudo\` there: ${DOC}, section 3, « Préparer » — « Le geste d'installation ».`,
        ...(execution ? [`The app does not know what the station did. ${pasDit}`, redemander] : []),
      ],
    };
  }
  return {
    etat: "sans-reponse",
    a,
    titre: `STATION “${hote}” DID NOT FINISH ANSWERING`,
    obtenu,
    suite: execution
      ? ["`ssh` was stopped at the timeout, before the station returned its answer: the app does not know where the station stood.", pasDit, redemander]
      : ["`ssh` was stopped at the timeout, before the station returned its plan. A plan removes nothing: ask for it again."],
  };
}

const minutes = (ms: number) => Math.round(ms / 60_000);

export type Retraits = ReturnType<typeof tenirRetraits>;

// Les retraits, tenus tant que l'app est ouverte. Ce par quoi ils passent leur est
// donné : le fichier des projets, pour le premier geste ; la box, pour le second.
export function tenirRetraits(options: {
  // Le fichier des projets : le premier geste n'écrit que là.
  chemin: string;
  // Retire le projet de ce fichier, et rien d'autre. Rend la raison, s'il ne l'a pas été.
  retirer(nom: string): string | undefined;
  // Lance le geste de désinstallation sur la box du projet : son plan, ou l'exécution.
  lancer(served: Served, demande: Demande): Promise<Rendu>;
  // La box vient de dire le projet désinstallé — ou ce que l'app en disait a changé : il se
  // montre sans elle, tel que `vu` le rend maintenant.
  surDesinstalle(nom: string): void;
}) {
  const tenus = new Map<string, Tenu>();

  // Le retrait d'un projet sur sa box d'aujourd'hui : un plan obtenu d'une autre ne vaut rien ici.
  function tenir(nom: string, hote: string): Tenu {
    const tenu = tenus.get(nom);
    if (tenu !== undefined && tenu.hote === hote) return tenu;
    // Rien n'est coché d'avance : le journal survit, sauf demande.
    const neuf: Tenu = { hote, journal: false };
    tenus.set(nom, neuf);
    return neuf;
  }

  // Ce que l'app tient de désinstallé pour ce projet, sur la box que le fichier lui donne.
  function desinstalle(projet: Projet): Tenu["desinstalle"] {
    const tenu = tenus.get(projet.nom);
    return projet.box !== undefined && tenu?.hote === projet.box.hote ? tenu.desinstalle : undefined;
  }

  const enleve = (nom: string) => `“${RETIRER}” takes “${nom}” off the bar and out of ${options.chemin} — nothing else.`;
  const RESTE = "Its terminals open here are stopped; its folder on this workstation is left untouched.";

  function etat(projet: Projet): Retrait {
    const { nom, box } = projet;
    if (box !== undefined) return poser({ nom, box }, tenir(nom, box.hote));
    return {
      projet: nom,
      titre: "Remove this project from the app",
      retirer: { libelle: RETIRER, lignes: [enleve(nom), "It has no station: there is nothing else to remove.", RESTE] },
      desinstaller: { libelle: UNINSTALL, lignes: [`“${nom}” does not say where its station is: the app has nothing to uninstall there.`] },
    };
  }

  // Les deux gestes d'un projet servi par une box, d'après ce qui est tenu de lui. Rien n'y
  // est pris ni posé : une réponse arrivée après que le projet a changé de box, ou quitté la
  // liste, se pose d'après ce qui était tenu quand elle est partie.
  function poser(served: Served, tenu: Tenu): Retrait {
    const { nom, box } = served;
    const { hote } = box;
    const parti = tenu.desinstalle;
    const { journal: log, plan, planEnCours, issue, enCours } = tenu;
    const occupee = "The uninstall is under way: the station answers on its own.";
    const sansPlan = `No uninstall: the station has not yet said what it would remove${log ? ", log included" : ""} — “${PLANIFIER}” asks it for its plan, and removes nothing.`;
    const planifierRefuse = enCours !== undefined ? occupee : planEnCours !== undefined ? "The plan has been requested: the station answers on its own." : undefined;
    const uninstallRefused = enCours !== undefined ? occupee : planEnCours !== undefined || plan?.rendu.etat !== "plan" ? sansPlan : undefined;
    const planMontre: Montre | undefined =
      planEnCours !== undefined
        ? { etat: "en-cours", titre: `plan requested from the station… it is taking inventory of what the project has there: a few seconds, ${minutes(DELAIS.planMs)} minutes at most` }
        : plan === undefined
          ? undefined
          : montrer(served, plan, false, parti !== undefined);
    const issueMontree: Montre | undefined =
      enCours !== undefined
        ? { etat: "en-cours", titre: `uninstall under way on the station… it stops the project's runtime, then removes what its plan said: ${minutes(DELAIS.executionMs)} minutes at most` }
        : issue === undefined
          ? undefined
          : "pasParti" in issue
            ? { etat: "pas-parti", titre: "NOTHING WAS SENT TO THE STATION — nothing is removed", suite: [issue.pasParti] }
            : montrer(served, issue, true, parti !== undefined);
    return {
      projet: nom,
      titre: parti === undefined ? "Remove this project — from the app, or from its station: two actions" : "Remove this project — uninstalled from its station, still in the app",
      retirer: {
        libelle: RETIRER,
        lignes: [
          enleve(nom),
          parti === undefined
            ? `Nothing is sent to station “${hote}”: the project stays installed there — and served, if it is — with its log intact.`
            : `It is uninstalled from station “${hote}”: removing it from the app is what is left to do, if it should no longer appear there.`,
          RESTE,
        ],
      },
      desinstaller: {
        libelle: UNINSTALL,
        lignes: [
          parti === undefined
            ? `“${UNINSTALL}” removes “${nom}” from station “${hote}”, through its uninstall action (\`sudo brigade-installer uninstall ${cite(nom)}\`), which the app runs for you. What is removed is decided and reported by the station: the app has no rule about it.`
            : `It is uninstalled from station “${hote}”: it says below what it removed. The action can be replayed — to delete its log too, if it is kept — the same way.`,
          "In two steps: the station first states its plan, removing nothing; then nothing is removed until you confirm by typing the project name.",
          "It stays in the app: removing it from there is the other action.",
        ],
        geste: {
          hote,
          journal: {
            coche: log,
            libelle: "Also delete the project's log on the station",
            avertissement: [
              "Unticked — the default: the app does not ask for the log to be deleted, and the station's plan says where it stays.",
              "Ticked: the app adds `--supprimer-le-journal` to the action. The log is the kitchen's history, and deleting it cannot be undone: the station's plan says what goes with it — read it again before confirming.",
              "Changing this station drops the plan already returned: it only holds for the setting it was requested with.",
            ],
            ...(enCours === undefined ? {} : { refus: "The uninstall is under way: its setting can no longer change." }),
          },
          planifier: PLANIFIER,
          ...(planifierRefuse === undefined ? {} : { planifierRefuse }),
          ...(planMontre === undefined ? {} : { plan: planMontre }),
          consigne: `To confirm, type the project name — ${nom}:`,
          ...(uninstallRefused === undefined ? {} : { desinstallerRefuse: uninstallRefused }),
          ...(issueMontree === undefined ? {} : { issue: issueMontree }),
        },
      },
    };
  }

  return {
    // Les deux gestes d'un projet, tels que le panneau les pose.
    etat,

    // Le projet tel que l'app le montre : celui qu'elle a désinstallé de sa box n'en a plus
    // — rien n'y est lu, rien n'y est écrit —, et dit pourquoi à la place.
    vu(projet: Projet): Projet {
      const parti = desinstalle(projet);
      if (parti === undefined || projet.box === undefined) return projet;
      const { box, ...sansBox } = projet;
      return {
        ...sansBox,
        desinstalle: {
          hote: box.hote,
          a: parti.a,
          titre: `UNINSTALLED FROM STATION “${box.hote}” — can no longer be driven from the app`,
          lignes: [
            `The app uninstalled “${projet.nom}” from station “${box.hote}”: it can no longer be driven from here. The app no longer reads its station, and writes nothing to it.`,
            ofTheLog(parti.journal, true),
            "What the station removed, word for word, is in its space, under “Remove this project”.",
            `It is still in the app: “${RETIRER}”, in the same place, removes it — that is the other action.`,
            "To serve it again: remove it from the app, then add it — adding it installs it on its station.",
            "None of this is kept from one launch of the app to the next: relaunched, it re-reads the station, which will itself say it no longer knows this project.",
          ],
        },
      };
    },

    // Le premier geste : le projet quitte le fichier des projets, et rien d'autre n'a
    // lieu — rien n'est demandé à sa box. Rend l'avis à montrer, ou pourquoi il n'est pas retiré.
    retirerDeLApp(projet: Projet): { avis: Avis } | { refus: string } {
      const { nom, box } = projet;
      const parti = desinstalle(projet);
      // Retiré maintenant, il n'aurait plus d'espace où lire ce que la box répond de sa désinstallation.
      const tenu = tenus.get(nom);
      if (box !== undefined && tenu?.hote === box.hote && tenu.enCours !== undefined) {
        return { refus: `Not removed — its uninstall from station “${box.hote}” is under way: wait for what the station says, then remove it from the app.` };
      }
      const refus = options.retirer(nom);
      if (refus !== undefined) return { refus: `Not removed — ${refus}` };
      tenus.delete(nom);
      const lignes =
        box === undefined
          ? ["It had no station: there was nothing else to remove."]
          : [
              ...(parti === undefined
                ? [
                    `Nothing was sent to station “${box.hote}”: the project is still installed there, and its log was not touched.`,
                    `Uninstalling it from the station is another action: declare it in the app again — the “+” — then “${UNINSTALL}”. Or on the station, by hand (${DOC}, « Désinstaller »).`,
                  ]
                : [`It had been uninstalled from station “${box.hote}”: only what it said it keeps remains there.`]),
            ];
      return { avis: { titre: `“${nom}” is removed from the app.`, lignes } };
    },

    // Le chef coche l'option qui supprime le journal, ou la décoche : le plan rendu pour
    // l'autre réglage ne vaut plus, et celui qui est en route n'est plus à personne.
    sayLog(projet: Projet, coche: boolean): Retrait {
      if (projet.box === undefined) return etat(projet);
      const tenu = tenir(projet.nom, projet.box.hote);
      if (tenu.enCours === undefined && tenu.journal !== coche) {
        tenu.journal = coche;
        tenu.plan = undefined;
        tenu.planEnCours = undefined;
      }
      return etat(projet);
    },

    // Demande son plan à la box, et rend le retrait tel qu'il en sort. Rien n'est retiré.
    // Un plan en route ne se double pas, et celui d'avant ne vaut plus dès qu'il part.
    async planifier(projet: Projet): Promise<Retrait> {
      if (projet.box === undefined) return etat(projet);
      const { nom, box } = projet;
      const tenu = tenir(nom, box.hote);
      if (tenu.enCours !== undefined) return etat(projet);
      if (tenu.planEnCours === undefined) {
        tenu.plan = undefined;
        const lancee = options.lancer({ nom, box }, { plan: true, journal: tenu.journal }).then((rendu) => {
          // La case a changé, ou le projet a quitté la liste : ce plan n'est plus à personne.
          if (tenu.planEnCours !== lancee) return;
          tenu.planEnCours = undefined;
          tenu.plan = { a: new Date().toISOString(), rendu };
        });
        tenu.planEnCours = lancee;
      }
      await tenu.planEnCours;
      return poser({ nom, box }, tenu);
    },

    // Le second geste : la désinstallation, sur la box. Refusée — rien ne part — tant que
    // la box n'a pas rendu son plan pour ce réglage, et tant que `saisi` n'est pas le nom
    // du projet. Une désinstallation en route ne se double pas.
    async uninstall(projet: Projet, saisi: unknown): Promise<Retrait> {
      if (projet.box === undefined) return etat(projet);
      const { nom, box } = projet;
      const tenu = tenir(nom, box.hote);
      if (tenu.enCours === undefined) {
        const pasParti = (raison: string) => {
          tenu.issue = { pasParti: raison };
          return etat(projet);
        };
        if (tenu.planEnCours !== undefined || tenu.plan?.rendu.etat !== "plan") return pasParti(`The station has not yet said what it would remove: “${PLANIFIER}” first — the uninstall does not go ahead without its plan.`);
        const confirmation = texte(saisi);
        if (confirmation === "") return pasParti(`You have not typed the project name: uninstalling “${nom}” is confirmed by typing it.`);
        if (confirmation !== nom) return pasParti(`You typed “${confirmation}”, and the project is called “${nom}”: the uninstall is confirmed by its name, character for character.`);
        tenu.issue = undefined;
        const lancee = options.lancer({ nom, box }, { plan: false, confirmation, journal: tenu.journal }).then((rendu) => {
          // Le projet a quitté la liste, ou changé de box : cette réponse n'est plus à personne.
          if (tenu.enCours !== lancee || tenus.get(nom) !== tenu) return;
          tenu.enCours = undefined;
          const a = new Date().toISOString();
          tenu.issue = { a, rendu };
          // Le plan ne vaut encore que si la box a répondu, et refusé avant son premier geste :
          // tout le reste — elle a retiré, commencé, ou n'a rien dit — en redemande un.
          const sansEffet = rendu.etat === "refuse" && !inachevee(rendu);
          if (!sansEffet) tenu.plan = undefined;
          if (rendu.etat === "desinstalle") {
            tenu.desinstalle = { a, journal: rendu.journal };
            options.surDesinstalle(nom);
          } else if (!sansEffet && tenu.desinstalle !== undefined) {
            // Rejouée sur un projet déjà désinstallé, sans aboutir : il le reste, et son journal n'est plus su.
            tenu.desinstalle = { ...tenu.desinstalle, journal: null };
            options.surDesinstalle(nom);
          }
        });
        tenu.enCours = lancee;
      }
      await tenu.enCours;
      return poser({ nom, box }, tenu);
    },

    // Le projet a quitté la liste : rien n'est gardé de son retrait.
    oublier(nom: string): void {
      tenus.delete(nom);
    },
  };
}
