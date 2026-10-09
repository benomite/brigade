// L'arbitre entre projets, vu et réglé par le chef, depuis son propre process :
//   npm --prefix runtime run arbitre                          par projet : ce qui tourne, ce qui est encore autorisé, ce que les cooks ont consommé
//   npm --prefix runtime run arbitre -- poids <projet> <n>    règle le poids d'un projet (1 par défaut)
//   npm --prefix runtime run arbitre -- retirer <projet>      oublie un projet : sa part n'est plus réservée
// L'état se lit sur le port de l'arbitre ; les réglages s'écrivent dans sa
// base, qu'il relit à chaque décision — rien n'est à redémarrer.
import { existsSync } from "node:fs";
import { cheminReglages, ouvrirReglages, type Connu, type EtatArbitre, type ProjetArbitre } from "./arbitre.ts";
import { ArbitreInjoignable, configArbitrage, joindreArbitre } from "./arbitrage.ts";
import { ConfigInvalide, NOM_DE_PROJET } from "./runtime.ts";

const USAGE =
  "usage : BRIGADE_ARBITER_PORT=<port> BRIGADE_ARBITER_STATE_DIR=<répertoire de l'arbitre> npm --prefix runtime run arbitre -- [poids <projet> <entier ≥ 1> | retirer <projet>]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const ligne = (titre: string, valeur: string) => console.log(`${titre.padEnd(24)}${valeur}`);

function decrireProjet(projet: ProjetArbitre): string {
  const poids = `poids ${projet.poids}`;
  if (projet.presence === "absent") return [poids, `absent depuis le ${projet.depuis} — ne tient aucune part`].join(" · ");
  if (projet.presence === "muet") {
    return [poids, `N'A PAS REPARLÉ depuis le ${projet.depuis} — part réservée : ${projet.part ?? 0}, que personne n'emprunte ; \`retirer\` la libère`].join(" · ");
  }
  const sansArbitre = projet.nonArbitres ? ` (dont ${projet.nonArbitres} ${projet.nonArbitres > 1 ? "partis" : "parti"} sans arbitre)` : "";
  return [
    poids,
    `${projet.cooks ?? 0} en cours${sansArbitre}`,
    `part ${projet.part ?? 0}`,
    `encore ${projet.encore ?? 0}`,
    projet.demande ? "des tickets attendent" : "rien n'attend",
    `consommation des cooks : ${nombre(projet.consommation?.jour ?? 0)} tokens sur 24 h, ${nombre(projet.consommation?.semaine ?? 0)} sur 7 jours`,
  ].join(" · ");
}

function montrer(etat: EtatArbitre, port: number): void {
  ligne("arbitre", `127.0.0.1:${port} — démarré le ${etat.demarreLe}`);
  ligne("plafond du compte", `${pluriel(etat.plafond, "cook")} — ${etat.cooks} en cours, tous projets entendus`);
  ligne(
    "machine",
    etat.saturePar.length === 0
      ? "aucun projet ne s'en dit retenu"
      : `SATURÉE d'après ${etat.saturePar.join(", ")} — le plafond effectif est ce qui tourne (${etat.cooks}) : seul un projet sous sa part relance`,
  );
  ligne("projets", etat.projets.length === 0 ? "aucun — aucun runtime n'a encore parlé" : String(etat.projets.length));
  const large = Math.max(0, ...etat.projets.map((projet) => projet.projet.length));
  for (const projet of etat.projets) console.log(`  ${projet.projet.padEnd(large)}  ${decrireProjet(projet)}`);
  const total = (fenetre: "jour" | "semaine") => etat.projets.reduce((somme, projet) => somme + (projet.consommation?.[fenetre] ?? 0), 0);
  ligne("consommation des cooks", `${nombre(total("jour"))} tokens sur 24 h, ${nombre(total("semaine"))} sur 7 jours — celle des cooks de tickets que les runtimes redisent, pas celle du compte`);
}

function montrerLesReglages(projets: Connu[]): void {
  ligne("projets connus", projets.length === 0 ? "aucun" : String(projets.length));
  const large = Math.max(0, ...projets.map((projet) => projet.projet.length));
  for (const projet of projets) console.log(`  ${projet.projet.padEnd(large)}  poids ${projet.poids}${projet.partiLe === null ? "" : ` · absent depuis le ${projet.partiLe}`}`);
}

// Les réglages de l'arbitre, là où il les a posés : la commande n'en crée pas.
function reglages() {
  const repertoire = process.env.BRIGADE_ARBITER_STATE_DIR;
  if (!repertoire) echouer(2, `BRIGADE_ARBITER_STATE_DIR n'est pas défini\n${USAGE}`);
  if (!existsSync(cheminReglages(repertoire))) echouer(1, `aucun arbitre n'a tourné dans ${repertoire} : pas de réglages à lire`);
  return ouvrirReglages(repertoire);
}

const args = process.argv.slice(2);
const [commande, projet, valeur] = args;

if (commande === undefined) {
  let port: number | null;
  try {
    port = configArbitrage(process.env);
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, erreur.message);
    throw erreur;
  }
  if (port === null) echouer(2, `BRIGADE_ARBITER_PORT n'est pas défini\n${USAGE}`);
  try {
    montrer(await joindreArbitre(port).etat(), port);
  } catch (erreur) {
    if (!(erreur instanceof ArbitreInjoignable)) throw erreur;
    ligne("arbitre", `INJOIGNABLE — ${erreur.motif} sur 127.0.0.1:${port}`);
    ligne("", "chaque projet lance au plus un cook à la fois, sans arbitrage (mode dégradé), jusqu'à son retour");
    // Ce qui reste lisible sans lui : ses réglages, s'ils sont à portée.
    const repertoire = process.env.BRIGADE_ARBITER_STATE_DIR;
    if (repertoire && existsSync(cheminReglages(repertoire))) {
      const durables = ouvrirReglages(repertoire);
      try {
        montrerLesReglages(durables.projets());
      } finally {
        durables.fermer();
      }
    }
    process.exit(1);
  }
} else if (commande === "poids" && args.length === 3 && projet !== undefined && valeur !== undefined) {
  if (!NOM_DE_PROJET.test(projet)) echouer(2, `nom de projet invalide : « ${projet} »\n${USAGE}`);
  if (!/^[1-9][0-9]{0,5}$/.test(valeur)) echouer(2, `poids invalide : « ${valeur} » — attendu un entier, 1 au moins\n${USAGE}`);
  const durables = reglages();
  try {
    const avant = durables.projets().find((connu) => connu.projet === projet);
    durables.peser(projet, Number(valeur), new Date().toISOString());
    console.log(
      avant
        ? `${projet} : poids ${valeur}${avant.poids === Number(valeur) ? " — inchangé" : ` (était ${avant.poids})`} ; l'arbitre le lit à sa prochaine décision`
        : `${projet} : poids ${valeur} — projet encore inconnu de l'arbitre : il n'aura de part qu'une fois son runtime entendu`,
    );
  } finally {
    durables.fermer();
  }
} else if (commande === "retirer" && args.length === 2 && projet !== undefined) {
  const durables = reglages();
  try {
    if (!durables.retirer(projet)) echouer(1, `${projet} : projet inconnu de l'arbitre`);
    console.log(`${projet} : retiré — sa part n'est plus réservée ; si son runtime tourne, il se réinscrit au poids 1 dès qu'il reparle`);
  } finally {
    durables.fermer();
  }
} else {
  echouer(2, USAGE);
}
