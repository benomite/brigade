// Essayer Brigade sur un projet d'essai, dès le premier lancement de l'app (#3227, épique #3217).
//
//   noterLePremierLancement(dossier, instant)   l'instant du premier lancement de l'app, écrit une
//                                               seule fois : un second lancement ne le change pas.
//   creerLeProjetDEssai(client, dossier, …)     un petit dépôt privé sur le compte GitHub du chef —
//                                               un projet minimal, sa section de bindings
//                                               (`sectionDeBindings`), et un seul ticket ouvert, prêt
//                                               à cuire : les labels du premier ticket
//                                               (`LABELS_DU_PREMIER_TICKET`), `fire` compris. Le dépôt
//                                               créé est noté avant toute autre écriture : c'est le
//                                               seul que la suppression atteindra.
//   suivreLeProjetDEssai(client, dossier)       ce que l'app en montre — et, son ticket pas encore
//                                               servi, la PR de sa branche (`brancheDuTicket`) lue sur
//                                               GitHub : mergée, l'instant du merge est noté, et la
//                                               durée depuis le premier lancement se dit
//                                               (`messageDuService`).
//   supprimerLeProjetDEssai(client, dossier, d) supprime le dépôt noté, et lui seul : un autre nom est
//                                               refusé avant tout appel. Sans la permission
//                                               `delete_repo` du jeton, rien n'est supprimé et la
//                                               permission est demandée (l'app la fait accorder par
//                                               `gh auth refresh`, puis rejoue).
//
// Tout ce que l'app en garde est dans un fichier à elle (`FICHIER`), à côté de son fichier des
// projets. Un fichier illisible n'est jamais lu vide puis écrasé : il le dit, et rien n'est écrit.
// L'app y arrive par son process principal (`app/src/main.ts`), qui charge ce module depuis le
// runtime à côté d'elle et lui passe le GitHub du `gh` de l'ordinateur (`clientGh`).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brancheDuTicket } from "../brigade-github.ts";
import { sectionDeBindings } from "../depot-prepare/preparation.ts";
import type { ClientGitHub, ReponseGitHub } from "../proteger-branche.ts";
import { LABELS_DU_PREMIER_TICKET, SECTIONS_DU_PREMIER_TICKET } from "../second-init/premier-ticket.ts";

export const FICHIER = "sample-project.json";
export const NOM_DU_DEPOT = "brigade-sample";
// Si le compte a déjà un dépôt de ce nom, le suivant : `brigade-sample-2`, … jusqu'à ce rang.
const ESSAIS_DE_NOM = 5;
export const PERMISSION = "delete_repo";

export type ProjetDEssai = {
  // `owner/repo`, tel que GitHub l'a créé.
  repository: string;
  url: string;
  base: string;
  createdAt: string;
  // Le ticket, une fois créé ; sa PR et l'instant de son merge, une fois servi ; la suppression, une fois faite.
  ticket?: number;
  ticketUrl?: string;
  servedAt?: string;
  pullRequest?: string;
  deletedAt?: string;
};
export type Enregistrement = { firstLaunch?: string; sample?: ProjetDEssai };
export type Lu = { enregistrement: Enregistrement } | { illisible: string };

// Ce que l'app montre : le projet noté, la phrase du service quand son ticket est servi, et ce qui
// ne s'est pas lu (le fichier, ou GitHub) — en une phrase, sans rien inventer à sa place.
export type VuDeLEssai = { sample?: ProjetDEssai; served?: string; illisible?: string; lecture?: string };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";

function ditGitHub(reponse: ReponseGitHub): string {
  const corps = reponse.corps;
  const dit = corps !== null && typeof corps === "object" && "message" in corps && typeof corps.message === "string" ? corps.message : undefined;
  return `HTTP ${reponse.statut}${dit ? `: ${dit}` : ""}`;
}

function lireLeProjet(brut: unknown): ProjetDEssai | undefined {
  if (typeof brut !== "object" || brut === null) return undefined;
  const lu = brut as Record<string, unknown>;
  if (!texte(lu.repository) || !texte(lu.url) || !texte(lu.base) || !texte(lu.createdAt)) return undefined;
  if (lu.ticket !== undefined && !(typeof lu.ticket === "number" && Number.isInteger(lu.ticket) && lu.ticket > 0)) return undefined;
  const projet: ProjetDEssai = { repository: lu.repository, url: lu.url, base: lu.base, createdAt: lu.createdAt };
  if (typeof lu.ticket === "number") projet.ticket = lu.ticket;
  for (const cle of ["ticketUrl", "servedAt", "pullRequest", "deletedAt"] as const) {
    const valeur = lu[cle];
    if (texte(valeur)) projet[cle] = valeur;
  }
  return projet;
}

export function lireLEnregistrement(dossier: string): Lu {
  const chemin = join(dossier, FICHIER);
  if (!existsSync(chemin)) return { enregistrement: {} };
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch (erreur) {
    return { illisible: `${chemin} cannot be read (${message(erreur)})` };
  }
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) return { illisible: `${chemin} is not a JSON object` };
  const { firstLaunch, sample } = brut as Record<string, unknown>;
  if (firstLaunch !== undefined && !(texte(firstLaunch) && !Number.isNaN(Date.parse(firstLaunch)))) return { illisible: `${chemin}: \`firstLaunch\` is not a date` };
  const projet = sample === undefined ? undefined : lireLeProjet(sample);
  if (sample !== undefined && projet === undefined) return { illisible: `${chemin}: \`sample\` is not a sample project Brigade recorded` };
  return { enregistrement: { ...(firstLaunch === undefined ? {} : { firstLaunch: firstLaunch as string }), ...(projet === undefined ? {} : { sample: projet }) } };
}

// Écrit d'un coup : un fichier à moitié écrit ne se lit jamais.
function ecrire(dossier: string, enregistrement: Enregistrement): void {
  mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, FICHIER);
  writeFileSync(`${chemin}.tmp`, `${JSON.stringify(enregistrement, null, 2)}\n`);
  renameSync(`${chemin}.tmp`, chemin);
}

// L'instant du premier lancement, noté une fois. Rend ce qui est lu ensuite ; un fichier illisible
// n'est pas écrasé.
export function noterLePremierLancement(dossier: string, instant: Date): Lu {
  const lu = lireLEnregistrement(dossier);
  if ("illisible" in lu || lu.enregistrement.firstLaunch !== undefined) return lu;
  const enregistrement = { ...lu.enregistrement, firstLaunch: instant.toISOString() };
  ecrire(dossier, enregistrement);
  return { enregistrement };
}

// Les minutes entre le premier lancement et le merge, arrondies — au moins une. Rien, si l'un des
// deux instants ne se lit pas ou si le merge le précède : aucune durée n'est inventée.
export function dureeDuPremierService(premierLancement: string, merge: string): number | undefined {
  const debut = Date.parse(premierLancement);
  const fin = Date.parse(merge);
  if (Number.isNaN(debut) || Number.isNaN(fin) || fin < debut) return undefined;
  return Math.max(1, Math.round((fin - debut) / 60_000));
}

export const messageDuService = (minutes: number) => `Your first ticket was served in ${minutes} minute${minutes === 1 ? "" : "s"}.`;

// Le projet minimal : de quoi lancer un test, et le `CLAUDE.md` dont les rôles lisent leurs bindings.
export function fichiersDuProjet(base: string): Array<{ chemin: string; contenu: string }> {
  return [
    {
      chemin: "CLAUDE.md",
      contenu: ["# brigade-sample", "", "A tiny project Brigade created to try a kitchen on. Tests: `npm test` (Node's own test runner, no dependency).", "", sectionDeBindings(base)].join("\n"),
    },
    { chemin: "package.json", contenu: `${JSON.stringify({ name: NOM_DU_DEPOT, private: true, type: "module", scripts: { test: "node --test" } }, null, 2)}\n` },
    { chemin: "greeting.js", contenu: "// Says hello to someone.\nexport const greeting = (name) => `Hello, ${name}`;\n" },
    {
      chemin: "greeting.test.js",
      contenu: ['import assert from "node:assert/strict";', 'import { test } from "node:test";', 'import { greeting } from "./greeting.js";', "", 'test("greets someone by their name", () => {', '  assert.equal(greeting("Ada"), "Hello, Ada");', "});", ""].join("\n"),
    },
  ];
}

// Le seul ticket : petit, vérifiable par un test, écrit comme un ticket du second.
export const TICKET = {
  title: "Greet with an exclamation mark",
  body: [
    SECTIONS_DU_PREMIER_TICKET[0],
    "",
    "The greeting sounds flat. It should end with an exclamation mark.",
    "",
    SECTIONS_DU_PREMIER_TICKET[1],
    "",
    '- `greeting("Ada")` returns `Hello, Ada!`.',
    "- `npm test` passes, with the test updated to the new greeting.",
    "",
  ].join("\n"),
};

async function appeler(client: ClientGitHub, requete: Parameters<ClientGitHub>[0], dire: string): Promise<ReponseGitHub> {
  try {
    return await client(requete);
  } catch (erreur) {
    throw new Error(`GitHub could not be reached to ${dire} (${message(erreur)}).`);
  }
}

export type Cree = { sample: ProjetDEssai } | { refus: string };

// Crée le projet d'essai, ou rend celui que l'app a déjà créé et pas supprimé : jamais un second.
// `instant` : l'heure de la création, notée avec le dépôt.
export async function creerLeProjetDEssai(client: ClientGitHub, dossier: string, instant: Date): Promise<Cree> {
  const lu = lireLEnregistrement(dossier);
  if ("illisible" in lu) return { refus: `The sample project cannot be created: ${lu.illisible}.` };
  const deja = lu.enregistrement.sample;
  if (deja !== undefined && deja.deletedAt === undefined && deja.ticket !== undefined) return { sample: deja };
  try {
    // Un dépôt créé dont le ticket a manqué : on reprend ce dépôt-là.
    const projet = deja !== undefined && deja.deletedAt === undefined ? deja : await creerLeDepot(client, dossier, lu.enregistrement, instant);
    for (const fichier of fichiersDuProjet(projet.base)) {
      const reponse = await appeler(
        client,
        { methode: "PUT", chemin: `repos/${projet.repository}/contents/${fichier.chemin}`, corps: { message: `Add ${fichier.chemin}`, content: Buffer.from(fichier.contenu, "utf8").toString("base64"), branch: projet.base } },
        `add ${fichier.chemin} to ${projet.repository}`,
      );
      // 422 : il y est déjà — posé par une création que le ticket a interrompue.
      if (reponse.statut !== 201 && reponse.statut !== 200 && reponse.statut !== 422) throw new Error(`GitHub refused to add ${fichier.chemin} to ${projet.repository} (${ditGitHub(reponse)}).`);
    }
    const reponse = await appeler(client, { methode: "POST", chemin: `repos/${projet.repository}/issues`, corps: { ...TICKET, labels: [...LABELS_DU_PREMIER_TICKET] } }, `create the ticket of ${projet.repository}`);
    const issue = reponse.corps as { number?: unknown; html_url?: unknown } | null;
    if (reponse.statut !== 201 || typeof issue?.number !== "number" || !texte(issue.html_url)) throw new Error(`GitHub refused to create the ticket of ${projet.repository} (${ditGitHub(reponse)}).`);
    const avecTicket: ProjetDEssai = { ...projet, ticket: issue.number, ticketUrl: issue.html_url };
    ecrire(dossier, { ...lireOuVide(dossier), sample: avecTicket });
    return { sample: avecTicket };
  } catch (erreur) {
    return { refus: message(erreur) };
  }
}

// Ce que le fichier tient à l'instant — il vient d'être lu lisible, et seule l'app l'écrit.
function lireOuVide(dossier: string): Enregistrement {
  const lu = lireLEnregistrement(dossier);
  if ("illisible" in lu) throw new Error(`The sample project could not be recorded: ${lu.illisible}.`);
  return lu.enregistrement;
}

// Le dépôt, privé, avec un premier commit (`auto_init`) : sa branche par défaut existe, les fichiers
// s'y ajoutent. Il est noté dès qu'il existe.
async function creerLeDepot(client: ClientGitHub, dossier: string, enregistrement: Enregistrement, instant: Date): Promise<ProjetDEssai> {
  for (let rang = 1; rang <= ESSAIS_DE_NOM; rang++) {
    const name = rang === 1 ? NOM_DU_DEPOT : `${NOM_DU_DEPOT}-${rang}`;
    const reponse = await appeler(client, { methode: "POST", chemin: "user/repos", corps: { name, private: true, auto_init: true, description: "A sample project Brigade created to try a kitchen on." } }, "create the sample repository");
    // 422 : le compte a déjà un dépôt de ce nom — le suivant.
    if (reponse.statut === 422) continue;
    const cree = reponse.corps as { full_name?: unknown; html_url?: unknown; default_branch?: unknown } | null;
    if (reponse.statut !== 201 || !texte(cree?.full_name) || !texte(cree.html_url)) throw new Error(`GitHub refused to create the sample repository (${ditGitHub(reponse)}).`);
    const projet: ProjetDEssai = { repository: cree.full_name, url: cree.html_url, base: texte(cree.default_branch) ? cree.default_branch : "main", createdAt: instant.toISOString() };
    ecrire(dossier, { ...enregistrement, sample: projet });
    return projet;
  }
  throw new Error(`Your GitHub account already has repositories named ${NOM_DU_DEPOT} to ${NOM_DU_DEPOT}-${ESSAIS_DE_NOM}: no sample repository was created.`);
}

// La PR de la branche du ticket, si elle est mergée : son adresse et l'instant du merge.
async function lireLeService(client: ClientGitHub, projet: ProjetDEssai & { ticket: number }): Promise<{ servedAt: string; pullRequest: string } | undefined> {
  const [owner] = projet.repository.split("/");
  const reponse = await appeler(client, { methode: "GET", chemin: `repos/${projet.repository}/pulls?head=${owner}:${brancheDuTicket(projet.ticket)}&state=closed&per_page=10` }, `read the pull requests of ${projet.repository}`);
  if (reponse.statut !== 200 || !Array.isArray(reponse.corps)) throw new Error(`GitHub did not let the pull requests of ${projet.repository} be read (${ditGitHub(reponse)}).`);
  const mergee = (reponse.corps as Array<{ merged_at?: unknown; html_url?: unknown }>).find(({ merged_at }) => texte(merged_at) && !Number.isNaN(Date.parse(merged_at)));
  return mergee === undefined ? undefined : { servedAt: mergee.merged_at as string, pullRequest: texte(mergee.html_url) ? mergee.html_url : "" };
}

// Ce que l'app montre du projet d'essai. Son ticket pas encore servi, GitHub est relu ; servi, le
// merge est noté une fois pour toutes, et la phrase se dit — tant que le premier lancement est connu.
export async function suivreLeProjetDEssai(client: ClientGitHub, dossier: string): Promise<VuDeLEssai> {
  const lu = lireLEnregistrement(dossier);
  if ("illisible" in lu) return { illisible: lu.illisible };
  const { firstLaunch, sample } = lu.enregistrement;
  if (sample === undefined) return {};
  let projet = sample;
  let lecture: string | undefined;
  if (projet.ticket !== undefined && projet.servedAt === undefined && projet.deletedAt === undefined) {
    try {
      const servi = await lireLeService(client, { ...projet, ticket: projet.ticket });
      if (servi !== undefined) {
        projet = { ...projet, ...servi };
        ecrire(dossier, { ...lireOuVide(dossier), sample: projet });
      }
    } catch (erreur) {
      lecture = message(erreur);
    }
  }
  const minutes = firstLaunch === undefined || projet.servedAt === undefined ? undefined : dureeDuPremierService(firstLaunch, projet.servedAt);
  return { sample: projet, ...(minutes === undefined ? {} : { served: messageDuService(minutes) }), ...(lecture === undefined ? {} : { lecture }) };
}

export type Suppression = { supprime: ProjetDEssai } | { permission: typeof PERMISSION } | { refus: string };

// Supprime le dépôt que l'app a créé et noté — aucun autre : le nom demandé doit être le sien, à la
// lettre, avant tout appel à GitHub.
export async function supprimerLeProjetDEssai(client: ClientGitHub, dossier: string, depot: unknown, instant: Date): Promise<Suppression> {
  const lu = lireLEnregistrement(dossier);
  if ("illisible" in lu) return { refus: `The sample repository cannot be deleted: ${lu.illisible}.` };
  const projet = lu.enregistrement.sample;
  if (projet === undefined || projet.deletedAt !== undefined) return { refus: "Brigade has no sample repository left to delete." };
  if (depot !== projet.repository) return { refus: `Brigade only deletes the sample repository it created, ${projet.repository}.` };
  try {
    const reponse = await appeler(client, { methode: "DELETE", chemin: `repos/${projet.repository}` }, `delete ${projet.repository}`);
    if (reponse.statut === 403 && reponse.scopes !== null && !reponse.scopes.includes(PERMISSION)) return { permission: PERMISSION };
    // 404 : déjà supprimé ailleurs — à condition que GitHub ne le connaisse vraiment plus.
    if (reponse.statut === 404) {
      const relu = await appeler(client, { methode: "GET", chemin: `repos/${projet.repository}` }, `read ${projet.repository}`);
      if (relu.statut !== 404) throw new Error(`GitHub did not delete ${projet.repository} (${ditGitHub(reponse)}).`);
    } else if (reponse.statut !== 204) throw new Error(`GitHub refused to delete ${projet.repository} (${ditGitHub(reponse)}).`);
    const supprime = { ...projet, deletedAt: instant.toISOString() };
    ecrire(dossier, { ...lireOuVide(dossier), sample: supprime });
    return { supprime };
  } catch (erreur) {
    return { refus: message(erreur) };
  }
}
