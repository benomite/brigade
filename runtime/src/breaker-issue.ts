// Le disjoncteur vu de GitHub (#2138, épique #2134) : le chef sait, sans la
// box ni l'app, que la cuisine est retenue, et pourquoi.
//
// Quand le disjoncteur s'ouvre (`breaker.opened`, garde-fous.ts), une issue du
// dépôt du projet porte le label `brigade:breaker-open` : son corps dit le
// ticket dont l'échec l'a ouvert, son code de sortie et l'heure d'ouverture.
// Une issue déjà ouverte pour cette cuisine est reprise telle quelle : ouvrir
// deux fois n'en crée pas une seconde. Quand il se referme (`kitchen.resumed`),
// l'issue reçoit un commentaire qui dit la cuisine reprise, puis se ferme. Le
// label est créé s'il manque au dépôt.
//
// Rien de nouveau au journal : l'état voulu se lit dans la projection des
// garde-fous, à chaque réveil du runtime, et ne part sur GitHub que s'il a
// changé depuis la dernière publication réussie. Au démarrage, rien n'est
// tenu pour publié : une première lecture de GitHub reprend l'issue ouverte
// avant un redémarrage, ou ferme celle d'un disjoncteur refermé pendant que
// le runtime était arrêté. Un échec se dit une fois, et se rejoue au tick
// suivant — jamais à chaque écriture du journal.
//
// L'issue d'une cuisine se reconnaît à une marque, en commentaire HTML que
// GitHub n'affiche pas, qui nomme le projet : un dépôt que deux projets
// partageraient garde une issue par cuisine.
import { masquerIdentifiants } from "./identifiants.ts";
import type { Base } from "./base.ts";
import { COMPTE_DE_LA_MACHINE, lectureDe, limiteDuProcess, prendreUnAppel, type ReponseHttp } from "./limite-github.ts";
import { echecsDuDisjoncteur, etatDesGardeFous, type EchecDuDisjoncteur } from "./projections/guardrails.ts";
import type { CauseReveil, Runtime } from "./runtime.ts";
import { lancerGhApi, type OptionsClient } from "./tableau/publication/client.ts";

export const LABEL_DU_DISJONCTEUR = "brigade:breaker-open";

// Le label tel qu'il est créé s'il manque : sa couleur et sa description sont
// ensuite au projet.
export const DEFINITION_DU_LABEL = {
  name: LABEL_DU_DISJONCTEUR,
  color: "B60205",
  description: "The kitchen's breaker is open: no cook leaves until the chef resumes it",
};

// Une issue telle que le disjoncteur la lit.
export type IssueDuDisjoncteur = { numero: number; corps: string };

export type ClientDuDisjoncteur = {
  // Les issues ouvertes du dépôt qui portent ce label, PR écartées.
  ouvertesAuLabel(label: string): Promise<IssueDuDisjoncteur[]>;
  // Crée le label s'il n'existe pas ; un label présent n'est pas retouché.
  assurerLabel(label: typeof DEFINITION_DU_LABEL): Promise<void>;
  // Crée l'issue ; rend son numéro.
  creer(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  commenter(numero: number, corps: string): Promise<void>;
  fermer(numero: number): Promise<void>;
};

// Ce que le journal dit du disjoncteur. Ouvert : depuis quand, l'échec qui l'a
// ouvert — le dernier des échecs d'affilée —, et ceux qu'il a comptés. Fermé :
// la dernière reprise de la cuisine, nulle s'il n'y en a jamais eu.
export type Disjoncteur =
  | { ouvert: true; depuis: string; ticket: number | null; code: number | null; echecs: EchecDuDisjoncteur[]; seuil: number | null }
  | { ouvert: false; reprisLe: string | null };

export function disjoncteurDuJournal(base: Base): Disjoncteur {
  const garde = etatDesGardeFous(base);
  if (garde.breakerOpenedAt === null) {
    const reprisLe = base.lire<{ at: string }>("SELECT at FROM events WHERE type = 'kitchen.resumed' ORDER BY seq DESC LIMIT 1")[0]?.at ?? null;
    return { ouvert: false, reprisLe };
  }
  const echecs = echecsDuDisjoncteur(base);
  const dernier = echecs.at(-1);
  return { ouvert: true, depuis: garde.breakerOpenedAt, ticket: dernier?.ticket ?? null, code: dernier?.code ?? null, echecs, seuil: garde.breakerThreshold };
}

// La marque de l'issue d'une cuisine.
export const marque = (projet: string) => `<!-- brigade:breaker-open project=${projet} -->`;
const deLaCuisine = (projet: string) => (issue: IssueDuDisjoncteur) => issue.corps.split(/\r?\n/).some((ligne) => ligne.trim() === marque(projet));

const nommerTicket = (ticket: number | null) => (ticket === null ? "none (a cook that served no ticket)" : `#${ticket}`);
const nommerCode = (code: number | null) => (code === null ? "none (stopped by a guardrail or a signal)" : String(code));

export const titreDeLIssue = (projet: string) => `Kitchen ${projet} held: its breaker is open`;

export function corpsDeLIssue(projet: string, disjoncteur: Extract<Disjoncteur, { ouvert: true }>): string {
  const { depuis, ticket, code, echecs, seuil } = disjoncteur;
  const compte = echecs.length === 0 ? "failures in a row" : `${echecs.length} failure${echecs.length > 1 ? "s" : ""} in a row${seuil === null ? "" : ` (threshold ${seuil})`}`;
  return [
    marque(projet),
    `The breaker of the \`${projet}\` kitchen opened after ${compte}: no cook leaves until the chef resumes the kitchen.`,
    "",
    `- **Failing ticket**: ${nommerTicket(ticket)}`,
    `- **Exit code**: ${nommerCode(code)}`,
    `- **Opened at**: ${depuis}`,
    ...(echecs.length > 1 ? ["", "The failures it counted, oldest first:", ...echecs.map((echec) => `- ${nommerTicket(echec.ticket)}: exit code ${nommerCode(echec.code)}, at ${echec.at}`)] : []),
    "",
    "brigade comments and closes this issue when the kitchen is resumed.",
  ].join("\n");
}

export const commentaireDeReprise = (projet: string, reprisLe: string | null) =>
  `The \`${projet}\` kitchen is resumed${reprisLe === null ? "" : ` (${reprisLe})`}: its breaker is closed, and cooks leave again.`;

// Publie l'état du disjoncteur sur GitHub. Ouvert : rend l'issue de la
// cuisine — celle qui l'était déjà, ou celle qui vient d'être créée. Fermé :
// commente et ferme celles de la cuisine encore ouvertes, et rend null.
export async function publierLeDisjoncteur(client: ClientDuDisjoncteur, projet: string, disjoncteur: Disjoncteur): Promise<number | null> {
  const ouvertes = (await client.ouvertesAuLabel(LABEL_DU_DISJONCTEUR)).filter(deLaCuisine(projet));
  if (disjoncteur.ouvert) {
    const [deja] = ouvertes;
    if (deja !== undefined) return deja.numero;
    await client.assurerLabel(DEFINITION_DU_LABEL);
    return client.creer({ titre: titreDeLIssue(projet), corps: corpsDeLIssue(projet, disjoncteur), labels: [LABEL_DU_DISJONCTEUR] });
  }
  for (const { numero } of ouvertes) {
    await client.commenter(numero, commentaireDeReprise(projet, disjoncteur.reprisLe));
    await client.fermer(numero);
  }
  return null;
}

// L'état voulu, réduit à ce qui distingue deux publications : une ouverture
// par son heure — un disjoncteur refermé puis rouvert est une autre issue.
const cleDe = (disjoncteur: Disjoncteur) => (disjoncteur.ouvert ? `ouvert ${disjoncteur.depuis}` : "ferme");

export type OptionsDuDisjoncteur = {
  client: ClientDuDisjoncteur;
  // Où se dit un échec de publication ; par défaut, la sortie d'erreur.
  avertir?: (ligne: string) => void;
};

// Le publieur d'une cuisine : `passer` lit l'état voulu et le publie s'il a
// changé depuis la dernière publication réussie. Une seule publication à la
// fois : un réveil qui arrive pendant l'une est revu à sa fin — il peut avoir
// vu un changement qu'elle ne porte pas. Rend la publication qui suit ce
// réveil, une fois faite ou manquée.
export function publieurDuDisjoncteur(base: Base, projet: string, options: OptionsDuDisjoncteur) {
  const avertir = options.avertir ?? ((ligne: string) => console.error(ligne));
  let publiee: string | null = null;
  let enVol: Promise<void> | null = null;
  let suite: Promise<void> | null = null;
  let echec: string | null = null;
  const passer = (cause: CauseReveil = "tick"): Promise<void> => {
    if (enVol !== null) {
      suite ??= enVol.then(() => {
        suite = null;
        try {
          return passer(cause);
        } catch (erreur) {
          // Le journal fermé entre-temps : le runtime s'est arrêté.
          avertir(`brigade : disjoncteur non lu — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        }
      });
      return suite;
    }
    // Après un échec, seul le tick rejoue : pas un appel à GitHub par écriture du journal.
    if (echec !== null && cause !== "tick") return Promise.resolve();
    const voulu = disjoncteurDuJournal(base);
    const cle = cleDe(voulu);
    if (cle === publiee) return Promise.resolve();
    const courante = publierLeDisjoncteur(options.client, projet, voulu).then(
      () => {
        publiee = cle;
        echec = null;
      },
      (erreur: unknown) => {
        const message = `brigade : disjoncteur non publié sur GitHub — ${erreur instanceof Error ? erreur.message : String(erreur)}`;
        // Dit une fois, jusqu'à ce qu'il change.
        if (message !== echec) avertir(message);
        echec = message;
      },
    );
    enVol = courante;
    // Enregistré avant toute suite : celle-ci trouve la place libre.
    void courante.then(() => {
      if (enVol === courante) enVol = null;
    });
    return courante;
  };
  return { passer };
}

// Branche la publication au runtime : une passe d'emblée, puis à chaque réveil.
export function brancherIssueDuDisjoncteur<R extends Runtime>(runtime: R, options: OptionsDuDisjoncteur): R {
  const publieur = publieurDuDisjoncteur(runtime.journal.base, runtime.projet, options);
  const passer = (cause: CauseReveil) => {
    try {
      void publieur.passer(cause);
    } catch (erreur) {
      (options.avertir ?? ((ligne: string) => console.error(ligne)))(`brigade : disjoncteur non lu — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  passer("tick");
  runtime.surReveil(passer);
  return runtime;
}

type IssueBrute = { number?: unknown; body?: unknown; pull_request?: unknown };

// Le client réel, par `gh api`, comme celui du tableau
// (`tableau/publication/client.ts`) : chaque appel prend le sien au compteur
// du quota réel, sous l'usage de la cuisine.
export function clientGitHubDuDisjoncteur(options: OptionsClient): ClientDuDisjoncteur {
  const { depot } = options;
  const bin = options.bin ?? "gh";
  const compte = options.compte ?? COMPTE_DE_LA_MACHINE;

  const appeler = async (brut: string[], entree?: unknown): Promise<ReponseHttp> => {
    const args = brut.map((arg) => masquerIdentifiants(arg).texte);
    const limite = options.limite ?? limiteDuProcess();
    let env: NodeJS.ProcessEnv | undefined;
    const environnement = async () => (env ??= options.jeton ? { ...process.env, GH_TOKEN: await options.jeton() } : undefined);
    const appel = await prendreUnAppel(limite, { usage: "cuisine", compte, etiquette: { projet: options.projet ?? (process.env.BRIGADE_PROJECT || depot), lecture: lectureDe(args) }, gh: bin, env: environnement, maintenant: options.maintenant });
    await environnement();
    return lancerGhApi(args, entree, { bin, delaiMs: options.delaiMs, env, limite, compte, appel, maintenant: options.maintenant });
  };

  const exiger = (reponse: ReponseHttp, chemin: string, ...attendus: number[]): ReponseHttp => {
    if (!(attendus.length === 0 ? [200] : attendus).includes(reponse.statut)) throw new Error(`gh api ${chemin} : HTTP ${reponse.statut}`);
    return reponse;
  };

  return {
    async ouvertesAuLabel(label) {
      // Une issue par cuisine : une page suffit.
      const chemin = `repos/${depot}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=100`;
      const issues = JSON.parse(exiger(await appeler([chemin]), chemin).corps) as IssueBrute[];
      return issues
        .filter((brute) => brute.pull_request === undefined && typeof brute.number === "number")
        .map((brute) => ({ numero: brute.number as number, corps: typeof brute.body === "string" ? brute.body : "" }));
    },
    async assurerLabel(label) {
      const chemin = `repos/${depot}/labels`;
      // 422 : il existe déjà.
      exiger(await appeler(["-X", "POST", chemin], label), chemin, 201, 422);
    },
    async creer({ titre, corps, labels }) {
      const chemin = `repos/${depot}/issues`;
      const reponse = exiger(await appeler(["-X", "POST", chemin], { title: titre, body: corps, labels }), chemin, 201);
      const numero = (JSON.parse(reponse.corps) as { number?: unknown }).number;
      if (!Number.isSafeInteger(numero)) throw new Error(`gh api ${chemin} : issue créée sans numéro`);
      return numero as number;
    },
    async commenter(numero, corps) {
      const chemin = `repos/${depot}/issues/${numero}/comments`;
      exiger(await appeler(["-X", "POST", chemin], { body: corps }), chemin, 201);
    },
    async fermer(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      exiger(await appeler(["-X", "PATCH", chemin], { state: "closed", state_reason: "completed" }), chemin);
    },
  };
}
