// Ce qu'un test ne peut pas jouer sous Windows, et pourquoi — chaque raison est dite par le test
// sauté (`{ skip: SANS_POSIX }`), comme ceux du vrai pty là où node-pty n'est pas livré compilé.
// Ailleurs, chacune vaut `false` : le test se joue.
const SOUS_WINDOWS = process.platform === "win32";

// Les doublures que l'app lance à la place de ses vrais programmes — un faux
// `claude`, un faux `gh`, un faux shell de connexion — sont des scripts POSIX : un `#!/bin/sh` rendu
// exécutable, ou un `.ts` lancé par son shebang. Windows ne lance aucun script par son chemin — il
// lui faut un vrai `.exe` —, et n'a pas de `/bin/sh`.
export const SANS_POSIX: string | false = SOUS_WINDOWS ? "Windows runs no script by its path, and has no /bin/sh: this test's stand-ins are POSIX scripts" : false;

// Le code de la box, ou les outils de test du runtime, joués tels quels : ils sont écrits pour la
// box, sous Linux — un chemin absolu y commence par `/`, et la configuration git qu'ils écrivent
// porte des chemins que le git de Windows ne lit pas.
export const CODE_DE_LA_BOX: string | false = SOUS_WINDOWS ? "this test runs the box's runtime code or the runtime's test tools, written for the Linux box (POSIX paths, a git config with POSIX paths)" : false;

// Le paquet de l'app et sa mise à jour ne sont pas de ce poste : le .dmg se construit, se signe et
// s'installe par les outils de macOS, et les prérequis de l'APK se cherchent comme sur une machine
// de construction POSIX. Le paquet Windows est un autre ticket.
export const PAQUETS: string | false = SOUS_WINDOWS ? "the app's packages and their update are built with macOS and POSIX tools: the Windows package is a separate ticket" : false;

// Un lien vers un fichier absent : Windows doit savoir, en le créant, s'il mène à un fichier ou à
// un dossier — sans cible, il en fait un lien de dossier, que l'app ne lit pas comme un fichier.
export const LIENS: string | false = SOUS_WINDOWS ? "Windows creates a link to a missing target as a folder link, not a file link" : false;
