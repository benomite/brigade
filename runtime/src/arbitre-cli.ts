// L'arbitre entre projets, vu et réglé par le chef, depuis son propre process :
//   npm --prefix runtime run arbiter                          par projet : ce qui tourne, ce qui est encore autorisé, ce que les cooks ont consommé
//   npm --prefix runtime run arbiter -- weight <projet> <n>   règle le poids d'un projet (1 par défaut)
//   npm --prefix runtime run arbiter -- remove <projet>       oublie un projet : sa part n'est plus réservée
// Les anciens mots (`arbitre`, `poids`, `retirer`) répondent encore, en disant
// le nouveau (`commandes.ts`).
// L'état se lit sur le port de l'arbitre ; les réglages s'écrivent dans sa
// base, qu'il relit à chaque décision — rien n'est à redémarrer.
import { existsSync } from "node:fs";
import { cheminReglages, estUnPort, ouvrirReglages, type Connu, type EtatArbitre, type ProjetArbitre } from "./arbitre.ts";
import { ArbitreInjoignable, configArbitrage, joindreArbitre } from "./arbitrage.ts";
import { enAnglais } from "./commandes.ts";
import { NOM_DE_PROJET } from "./runtime.ts";

const USAGE =
  "usage: BRIGADE_ARBITER_PORT=<port> BRIGADE_ARBITER_STATE_DIR=<arbiter directory> npm --prefix runtime run arbiter -- [weight <project> <integer ≥ 1> | remove <project>]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const nombre = (valeur: number) => valeur.toLocaleString("en-US");
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const ligne = (titre: string, valeur: string) => console.log(`${titre.padEnd(24)}${valeur}`);

function decrireProjet(projet: ProjetArbitre): string {
  const poids = `weight ${projet.poids}`;
  if (projet.presence === "absent") return [poids, `absent since ${projet.depuis} — holds no share`].join(" · ");
  if (projet.presence === "muet") {
    return [poids, `HAS NOT SPOKEN SINCE ${projet.depuis} — share reserved: ${projet.part ?? 0}, which nobody borrows; \`remove\` frees it`].join(" · ");
  }
  const sansArbitre = projet.nonArbitres ? ` (of which ${projet.nonArbitres} left without the arbiter)` : "";
  return [
    poids,
    `${projet.cooks ?? 0} running${sansArbitre}`,
    `share ${projet.part ?? 0}`,
    `${projet.encore ?? 0} left`,
    projet.demande ? "tickets are queued" : "nothing queued",
    `cooks consumed: ${nombre(projet.consommation?.jour ?? 0)} tokens in 24 h, ${nombre(projet.consommation?.semaine ?? 0)} in 7 days`,
  ].join(" · ");
}

function montrer(etat: EtatArbitre, port: number): void {
  ligne("arbiter", `127.0.0.1:${port} — started ${etat.demarreLe}`);
  ligne("account cap", `${pluriel(etat.plafond, "cook")} — ${etat.cooks} running, all projects heard`);
  ligne(
    "machine",
    etat.saturePar.length === 0
      ? "no project says it is held by it"
      : `SATURATED according to ${etat.saturePar.join(", ")} — the effective cap is what is running (${etat.cooks}): only a project under its share launches again`,
  );
  ligne("projects", etat.projets.length === 0 ? "none — no runtime has spoken yet" : String(etat.projets.length));
  const large = Math.max(0, ...etat.projets.map((projet) => projet.projet.length));
  for (const projet of etat.projets) console.log(`  ${projet.projet.padEnd(large)}  ${decrireProjet(projet)}`);
  const total = (fenetre: "jour" | "semaine") => etat.projets.reduce((somme, projet) => somme + (projet.consommation?.[fenetre] ?? 0), 0);
  ligne("cooks consumed", `${nombre(total("jour"))} tokens in 24 h, ${nombre(total("semaine"))} in 7 days — that of the ticket cooks the runtimes report, not the account's`);
}

function montrerLesReglages(projets: Connu[]): void {
  ligne("known projects", projets.length === 0 ? "none" : String(projets.length));
  const large = Math.max(0, ...projets.map((projet) => projet.projet.length));
  for (const projet of projets) console.log(`  ${projet.projet.padEnd(large)}  weight ${projet.poids}${projet.partiLe === null ? "" : ` · absent since ${projet.partiLe}`}`);
}

// Pourquoi l'arbitre n'a pas répondu, tel que `arbitrage.ts` le dit : la commande le redit en anglais.
function direMotif(motif: string): string {
  if (motif === "connexion refusée") return "connection refused";
  if (motif === "réponse illisible") return "unreadable response";
  return motif.replace(/^réponse (\d+)$/, "response $1").replace(/^aucune réponse en (.+) s$/, "no response within $1 s");
}

// Les réglages de l'arbitre, là où il les a posés : la commande n'en crée pas.
function reglages() {
  const repertoire = process.env.BRIGADE_ARBITER_STATE_DIR;
  if (!repertoire) echouer(2, `BRIGADE_ARBITER_STATE_DIR is not set\n${USAGE}`);
  if (!existsSync(cheminReglages(repertoire))) echouer(1, `no arbiter has run in ${repertoire}: no settings to read`);
  return ouvrirReglages(repertoire);
}

const args = enAnglais("arbiter", process.argv.slice(2), (ligne) => console.error(ligne));
const [commande, projet, valeur] = args;

if (commande === undefined) {
  // Une valeur illisible est un refus de démarrer, jamais un repli sur « pas d'arbitre » : `configArbitrage` le dit en français.
  const brut = process.env.BRIGADE_ARBITER_PORT;
  if (brut !== undefined && brut !== "" && !estUnPort(Number(brut))) echouer(2, `BRIGADE_ARBITER_PORT invalid: "${brut}" — a port number, from 1 to 65535, is expected`);
  const port = configArbitrage(process.env);
  if (port === null) echouer(2, `BRIGADE_ARBITER_PORT is not set\n${USAGE}`);
  try {
    montrer(await joindreArbitre(port).etat(), port);
  } catch (erreur) {
    if (!(erreur instanceof ArbitreInjoignable)) throw erreur;
    ligne("arbiter", `UNREACHABLE — ${direMotif(erreur.motif)} on 127.0.0.1:${port}`);
    ligne("", "each project launches at most one cook at a time, without arbitration (degraded mode), until it is back");
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
} else if (commande === "weight" && args.length === 3 && projet !== undefined && valeur !== undefined) {
  if (!NOM_DE_PROJET.test(projet)) echouer(2, `invalid project name: "${projet}"\n${USAGE}`);
  if (!/^[1-9][0-9]{0,5}$/.test(valeur)) echouer(2, `invalid weight: "${valeur}" — an integer, 1 at least, is expected\n${USAGE}`);
  const durables = reglages();
  try {
    const avant = durables.projets().find((connu) => connu.projet === projet);
    durables.peser(projet, Number(valeur), new Date().toISOString());
    console.log(
      avant
        ? `${projet}: weight ${valeur}${avant.poids === Number(valeur) ? " — unchanged" : ` (was ${avant.poids})`}; the arbiter reads it at its next decision`
        : `${projet}: weight ${valeur} — project not yet known to the arbiter: it will have a share only once its runtime has been heard`,
    );
  } finally {
    durables.fermer();
  }
} else if (commande === "remove" && args.length === 2 && projet !== undefined) {
  const durables = reglages();
  try {
    if (!durables.retirer(projet)) echouer(1, `${projet}: project unknown to the arbiter`);
    console.log(`${projet}: removed — its share is no longer reserved; if its runtime is running, it registers again at weight 1 as soon as it speaks`);
  } finally {
    durables.fermer();
  }
} else {
  echouer(2, USAGE);
}
