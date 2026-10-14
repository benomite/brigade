// La mise en service d'un projet, après l'ajout : amorcer son dépôt, merger,
// vérifier, démarrer — dans cet ordre, et l'app n'en saute aucun.
//
// `/brigade:init` est une session Claude Code, pas une commande : l'app ne la joue
// pas à la place du chef, elle l'ouvre dans le second de l'espace. Que son résultat
// soit mergé, elle ne le sait pas : elle dit qu'il doit l'être, et c'est le chef qui
// le dit fait. Elle vérifie alors en lançant la commande qui existe — `installation`,
// par le geste de la box, comme la veille lance `status` — et montre ce qu'elle a
// rendu, en entier : c'est `installation` qui nomme chaque manque et son geste, l'app
// n'en redit aucun. Seul son code de sortie fait un « prêt », avec sa ligne de verdict.
//
// Démarrer est un geste `root` (`systemctl`), qu'aucun geste de la box ne donne
// sans mot de passe : l'app ne le lance pas. Elle l'écrit dans un shell de l'espace,
// sans l'envoyer — et refuse de l'écrire tant qu'`installation` n'a pas dit le projet
// prêt. Rien n'est gardé d'un lancement de l'app à l'autre : une mise en service
// reprise repart de son premier état, et la box redit le reste.
import { echecDe, lancerGeste, type Echec, type Reglages, type Servi } from "./box.ts";
import type { Projet } from "./config.ts";
import { titreDEchec } from "./faits.ts";
import { FORME_ATTENDUE, refusDeForme } from "./nom.ts";
import type { Terminal } from "./terminaux.ts";

// La session qui amorce le dépôt (docs/installer.md, « Amorcer le dépôt »).
export const INIT = "/brigade:init";
// La commande du runtime qui dit si le projet est prêt, et tout ce qui manque d'un coup.
export const VERIFICATION = "installation";
const DOC = "docs/installer.md";

// Ce qu'`installation` a rendu, lancée une fois. `a` : l'instant où elle a fini.
//   `pret`         sortie en 0, avec sa ligne de verdict : rien ne manque
//   `incomplete`   elle a été lancée, et le projet n'est pas prêt (1), ou elle a refusé son environnement (2)
//   `illisible`    un 0 sans sa ligne de verdict : ce n'est pas elle qui a répondu
//   `sans-verdict` elle n'a rien rendu d'elle-même — la box pas jointe, le geste qui refuse, `ssh` arrêté
// `obtenu` : la ligne lancée, ce que la box a écrit, le code de sortie — tel quel.
export type Verifiee = { a: string } & ({ etat: "pret" | "incomplete" | "illisible"; obtenu: string } | ({ etat: "sans-verdict" } & Echec));

// La ligne par laquelle `installation` dit un projet prêt (runtime/src/installation-cli.ts).
const verdict = (nom: string) => `brigade : projet « ${nom} » : prêt`;

// Lance `installation` sur la box du projet, et dit ce qu'il en est advenu. Jamais
// d'exception. Les codes sont ceux de docs/installer.md, « Vérifier que le projet est
// prêt » : 0, 1 ou 2, la commande a été lancée ; tout autre vient du geste, ou de `ssh`.
export async function verifier(reglages: Reglages, servi: Servi): Promise<Verifiee> {
  const rendu = await lancerGeste(reglages, servi, VERIFICATION);
  const a = new Date().toISOString();
  const { erreur } = rendu;
  const obtenu = (code: number) => `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}\n→ exit code ${code}`;
  if (erreur === null) {
    // Un compte enfermé dans une commande forcée rend 0, lui aussi, et autre chose que le verdict.
    const dit = rendu.sortie.split("\n").some((ligne) => ligne.startsWith(verdict(servi.nom)));
    return { a, etat: dit ? "pret" : "illisible", obtenu: obtenu(0) };
  }
  if (erreur.killed !== true && (erreur.code === 1 || erreur.code === 2)) return { a, etat: "incomplete", obtenu: obtenu(erreur.code) };
  return { a, etat: "sans-verdict", ...echecDe({ ...rendu, erreur }, reglages.delaiMs) };
}

// Un mot tel que le shell du poste le rendra à `ssh` : entier, sans rien en exécuter.
const mot = (texte: string) => (/^[A-Za-z0-9@._:-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);

const sansBox = (nom: string) => `“${nom}” does not say where its box is: there is nothing to verify or start there.`;

// Ce que « Démarrer » écrit pour ce projet — ou pourquoi il n'écrit rien. C'est le geste
// de docs/installer.md, « Servir le premier ticket », celui que la box nomme en fin
// d'installation ; `ssh -t` lui donne un terminal, où `sudo` demande son mot de passe.
export function commandeDeDemarrage(projet: Projet): { commande: string } | { refus: string } {
  if (projet.box === undefined) return { refus: sansBox(projet.nom) };
  const { hote } = projet.box;
  // Un retour à la ligne enverrait la commande ; et dans cette forme, un tiret en tête est une option de `ssh`.
  if (/[\x00-\x1f\x7f]/.test(hote)) return { refus: "nothing is written: “hote” has a control character, and a line break would have sent the command — fix it in the projects file" };
  if (hote.startsWith("-")) return { refus: `nothing is written: “hote” starts with a dash (${hote}), and \`ssh\` would read it as an option in the command — fix it in the projects file` };
  // L'unité porte le nom du projet : seul un nom que la box accepte en nomme une — au caractère près.
  const { nom } = projet;
  if (nom === "" || nom !== nom.trim() || refusDeForme(nom) !== undefined) return { refus: `nothing is written: this project's “nom” is not the name of any instance on the box — expected: ${FORME_ATTENDUE}` };
  return { commande: `ssh -t ${mot(hote)} sudo systemctl enable --now brigade@${nom}.service` };
}

// Les trois états : l'init n'est pas dit mergé ; il l'est, et `installation` ne dit
// pas — ou pas encore — le projet prêt ; elle le dit.
export type Etape = "init" | "verification" | "pret";

// Ce que la vue pose d'une vérification : son titre, ce que l'app a obtenu, ce qu'elle
// en dit. Sans verdict, c'est l'échec de la veille, que la vue sait déjà rendre.
export type Montree =
  | { etat: "en-cours"; titre: string }
  | { etat: "pret" | "incomplete" | "illisible"; a: string; titre: string; obtenu: string; suite: string[] }
  | { etat: "sans-verdict"; a: string; titre: string; echec: Echec };

// La mise en service d'un projet, prête à poser : la vue n'y décide rien.
// `suivi` : le chef l'a entamée — par l'écran d'ajout, ou par un de ses gestes —, et
// elle s'ouvre d'elle-même dans l'espace du projet.
// `verifierRefuse`, `demarrerRefuse` : pourquoi le bouton est inactif — absent, il se clique.
export type Parcours = {
  projet: string;
  etape: Etape;
  suivi: boolean;
  titre: string;
  init: string;
  amorce: string[];
  consigne: string[];
  merge: boolean;
  verifie: string[];
  verifierRefuse?: string;
  verification?: Montree;
  demarre: string[];
  demarrerRefuse?: string;
};

const TITRES: Readonly<Record<Etape, string>> = {
  init: "seed the repository, and merge",
  verification: "verify that the project is ready",
  pret: "ready — the runtime can start",
};

type Tenu = { hote: string; suivi: boolean; merge: boolean; verification?: Verifiee; enCours?: Promise<void> };

export type Services = ReturnType<typeof tenirServices>;

// Les mises en service, tenues tant que l'app est ouverte. Ce par quoi elles passent
// leur est donné : la vérification sur la box, et les deux terminaux — le second, où
// s'ouvre la session d'init, et un shell, où s'écrit le démarrage.
export function tenirServices(options: {
  verifier(servi: Servi): Promise<Verifiee>;
  session(projet: Projet, commande: string): Terminal;
  shell(projet: Projet, ecrit: string): Terminal;
}) {
  const tenus = new Map<string, Tenu>();

  // La mise en service d'un projet sur sa box d'aujourd'hui : un « prêt » obtenu d'une autre ne vaut rien ici.
  function tenir(nom: string, hote: string): Tenu {
    const tenu = tenus.get(nom);
    if (tenu !== undefined && tenu.hote === hote) return tenu;
    const neuf: Tenu = { hote, suivi: false, merge: false };
    tenus.set(nom, neuf);
    return neuf;
  }

  const etape = ({ merge, verification, enCours }: Tenu): Etape => (!merge ? "init" : enCours === undefined && verification?.etat === "pret" ? "pret" : "verification");

  function montrer(servi: Servi, verifiee: Verifiee): Montree {
    const { a } = verifiee;
    const commande = `ssh ${mot(servi.box.hote)} brigade ${mot(servi.nom)} ${VERIFICATION}`;
    if (verifiee.etat === "sans-verdict") {
      const { erreur, atteinte, cas } = verifiee;
      return { etat: "sans-verdict", a, titre: titreDEchec({ erreur, atteinte, cas }, `REACHED, BUT \`${VERIFICATION}\` DID NOT RETURN ITS VERDICT`), echec: { erreur, atteinte, cas } };
    }
    const { etat, obtenu } = verifiee;
    if (etat === "pret") {
      return { etat, a, titre: "READY", obtenu, suite: [`\`${VERIFICATION}\` says the project is ready: nothing is missing to launch a cook.`, "A `à savoir` line holds nothing back — read it anyway: it is what the box wants you to know before starting."] };
    }
    if (etat === "incomplete") {
      return {
        etat,
        a,
        titre: "NOT READY",
        obtenu,
        suite: [
          `\`${VERIFICATION}\` answered, and the project is not ready: what it returned is above, in full.`,
          "Each `MANQUE` line names a point that is not ready, and the arrow (`→`) below it what is left to do for it. A `à savoir` line holds nothing back.",
          `Where the arrow says “la même commande”, type it this way from this workstation: \`${commande}\`, followed by what it names.`,
          `A “Dans le dépôt” shortfall: the result of \`${INIT}\` is not — or not entirely — on the integration branch, as the origin carries it.`,
          "Fix what is missing, then verify again: the verification can be replayed as often as you like.",
        ],
      };
    }
    return {
      etat,
      a,
      titre: "NO VERDICT",
      obtenu,
      suite: [
        `The box returned code 0 without the line by which \`${VERIFICATION}\` says this project is ready (\`${verdict(servi.nom)}…\`): what it returned is above, and it is not a “ready”.`,
        `The expected case: your account on the box is locked into a forced command, which replaces the one the app sends — ${DOC}, “Ajouter un humain”.`,
      ],
    };
  }

  function parcours(projet: Projet): Parcours | undefined {
    if (projet.box === undefined) return undefined;
    const servi = { nom: projet.nom, box: projet.box };
    const tenu = tenir(projet.nom, projet.box.hote);
    const ou = etape(tenu);
    const { merge, verification, enCours } = tenu;
    const demarrage = commandeDeDemarrage(projet);
    const verifierRefuse = !merge
      ? `No verification: the result of \`${INIT}\` is not said to be merged — merge it on the integration branch, then tick the box above.`
      : enCours !== undefined
        ? "The verification is running: it answers by itself."
        : undefined;
    const demarrerRefuse = !merge
      ? `No start: the result of \`${INIT}\` is not said to be merged.`
      : enCours !== undefined
        ? "No start: the verification is running."
        : verification === undefined
          ? `No start: the box has not verified this project yet — “Verify” runs \`${VERIFICATION}\` there.`
          : verification.etat === "incomplete"
            ? `No start: \`${VERIFICATION}\` does not say the project is ready — what is missing is named above, point by point, with what is left to do.`
            : verification.etat !== "pret"
              ? `No start: \`${VERIFICATION}\` did not return its verdict — what the app got is above.`
              : "refus" in demarrage
                ? demarrage.refus
                : undefined;
    return {
      projet: projet.nom,
      etape: ou,
      suivi: tenu.suivi,
      titre: `Deploy — ${tenu.suivi ? TITRES[ou] : "seed the repository, merge, verify, start"}`,
      init: INIT,
      amorce: [
        `\`${INIT}\` is a Claude Code session, not a command: the app does not play it for you, it opens it in this space's second — a fresh conversation, in the project's folder.`,
        `It puts in the repository what the box expects of it — the bindings block, the gates, the setup — and proves it (${DOC}, “Amorcer le dépôt”). It can be replayed without harm.`,
      ],
      consigne: [
        `The result of \`${INIT}\` must be merged on the integration branch before going on: the box only sees of the repository what its origin carries.`,
        "The app does not know whether it is: you say so. Until you have, it verifies nothing and does not offer the start.",
      ],
      merge,
      verifie: [`“Verify” runs \`${VERIFICATION}\` on the project's box, for you: it says whether a cook can go, and names everything missing at once. It launches no cook and no setup, and can be replayed as often as you like.`],
      ...(verifierRefuse === undefined ? {} : { verifierRefuse }),
      ...(enCours !== undefined
        ? { verification: { etat: "en-cours", titre: `verification running… \`${VERIFICATION}\` reaches the repository's origin and GitHub: a few seconds, two minutes at most` } }
        : verification === undefined
          ? {}
          : { verification: montrer(servi, verification) }),
      demarre: [
        ...("commande" in demarrage ? [`“Start” opens a shell in this space and writes there, without sending it: \`${demarrage.commande}\`.`] : []),
        "Your Enter starts the runtime: starting a service is a `root` action, which the app does not do for you. On the box, `sudo` asks for your password in this shell, if it wants one.",
        `The first ticket is served without a \`merge\` grant, and a first backup is launched by hand: ${DOC}, “Servir le premier ticket”.`,
      ],
      ...(demarrerRefuse === undefined ? {} : { demarrerRefuse }),
    };
  }

  function suivre(projet: Projet): void {
    if (projet.box !== undefined) tenir(projet.nom, projet.box.hote).suivi = true;
  }

  // Ce qui réclame un terminal : la raison, pour un projet qui n'en a pas.
  const sansTerminal = (projet: Projet) => (projet.box === undefined ? sansBox(projet.nom) : projet.refus === undefined ? undefined : `“${projet.nom}” does not open: ${projet.refus}`);

  return {
    // Rien, pour un projet sans box : il n'y a rien à y vérifier ni à y démarrer.
    parcours,

    // Le projet vient d'être ajouté par l'écran : sa mise en service est entamée.
    suivre,

    // La session `/brigade:init`, dans le second du projet. Rien n'en est déduit :
    // qu'elle ait abouti, et que son résultat soit mergé, c'est le chef qui le dit.
    amorcer(projet: Projet): Terminal | { refus: string } {
      const refus = sansTerminal(projet);
      if (refus !== undefined) return { refus };
      suivre(projet);
      return options.session(projet, INIT);
    },

    // Le chef dit le résultat de l'init mergé — ou s'en dédit : le verdict d'avant est alors lâché.
    direMerge(projet: Projet, merge: boolean): Parcours | undefined {
      if (projet.box === undefined) return undefined;
      const tenu = tenir(projet.nom, projet.box.hote);
      tenu.suivi = true;
      tenu.merge = merge;
      if (!merge) {
        tenu.verification = undefined;
        tenu.enCours = undefined;
      }
      return parcours(projet);
    },

    // Lance `installation`, et rend la mise en service telle qu'elle en sort. Refusée tant
    // que l'init n'est pas dit mergé : rien ne part vers la box. Une vérification en route
    // ne se double pas, et le verdict d'avant ne vaut plus dès qu'elle part.
    async verifier(projet: Projet): Promise<Parcours | undefined> {
      if (projet.box === undefined) return undefined;
      const tenu = tenir(projet.nom, projet.box.hote);
      if (!tenu.merge) return parcours(projet);
      if (tenu.enCours === undefined) {
        tenu.suivi = true;
        tenu.verification = undefined;
        const lancee = options.verifier({ nom: projet.nom, box: projet.box }).then((verifiee) => {
          // Le chef s'est dédit, ou le projet a changé de box : ce verdict n'est plus à personne.
          if (tenu.enCours !== lancee) return;
          tenu.enCours = undefined;
          tenu.verification = verifiee;
        });
        tenu.enCours = lancee;
      }
      await tenu.enCours;
      return parcours(projet);
    },

    // Écrit le démarrage dans un shell de l'espace, sans l'envoyer — ou dit pourquoi
    // rien n'est écrit : tant qu'`installation` ne dit pas le projet prêt, rien ne l'est.
    demarrer(projet: Projet): Terminal | { refus: string } {
      const refus = sansTerminal(projet) ?? parcours(projet)?.demarrerRefuse;
      if (refus !== undefined) return { refus };
      const demarrage = commandeDeDemarrage(projet);
      return "refus" in demarrage ? demarrage : options.shell(projet, demarrage.commande);
    },

    // Le projet a quitté la liste : rien n'est gardé de sa mise en service.
    oublier(nom: string): void {
      tenus.delete(nom);
    },
  };
}
