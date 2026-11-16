// La cuisine inerte (épique #2745, ticket #2755). Une routine humaine repérait
// la cuisine à l'arrêt et ouvrait un bug. Ici, la cuisine le fait seule : pour
// un projet, si aucune PR n'a été fusionnée depuis `INERTIE_MINUTES` alors
// qu'au moins un ticket est cuisinable, elle ouvre un ticket de bug qui nomme
// la cause probable :
// - `stale-claim`  : un ticket pris l'est depuis plus longtemps que le seuil, sans PR ;
// - `held-zone`    : la zone d'un ticket est tenue, et la station sait par qui ;
// - `skipped`      : la porte de prise a sauté chaque ticket à prendre, et dit
//   pourquoi — une dépendance, une capacité, une fiche sans zone, la cuisine
//   retenue (#3699) ;
// - `empty-rail`   : aucune PR n'est en passe, le rail est vraiment vide ;
// - `unknown`      : rien de ce qui précède ne l'explique.
//
// Un seul bug à la fois : tant que le bug de la cuisine inerte est ouvert,
// un nouvel appel n'en ouvre pas un second. Rien n'est tenu ici : le bug déjà
// ouvert se relit du client GitHub à chaque appel. Aucune valeur n'est propre
// à un projet : le client et l'horloge viennent de l'appelant.
//
// L'inertie dit comment la cuisine elle-même tourne, quelle que soit sa cause :
// elle ne se répare pas dans le dépôt du projet servi, où le code de la cuisine
// n'est pas. Le bug se dépose sur la brigade, comme le ticket du temps perdu
// (`../routage-temps-perdu.ts`, #2783), et ne va jamais à un cook du projet
// (#3098, #3620) ; sans la brigade, il ne se dépose nulle part. La brigade qui
// se sert elle-même le garde chez elle, dans le dépôt du projet. Le 15 novembre
// 2026, un `empty-rail` déposé sur secondes y a été pris par un cook qui n'y
// pouvait rien. Ses trois tickets, la porte de prise les sautait et disait
// pourquoi à la retenue ; l'alerte, qui ne lisait que les zones tenues, disait
// « rail vide » et demandait de réparer une porte qui n'avait rien de cassé
// (#3699). Elle nomme maintenant ce que la porte a dit.

// Depuis combien de minutes sans fusion la cuisine est dite inerte.
export const INERTIE_MINUTES = 90;

// Le label du ticket de bug qu'ouvre l'inertie.
export const LABEL_DU_BUG = "fix";

export type Cause = "stale-claim" | "held-zone" | "skipped" | "empty-rail" | "unknown";

// Ce qui tient la zone d'un ticket sauté : le ticket tenant (null sans numéro
// dans sa branche), sa branche, la date de sa fermeture (YYYY-MM-DD) s'il est
// fermé, et la PR ouverte qui la tient, s'il y en a une.
export type TenantDeZone = { ticket: number | null; branche: string; fermeLe: string | null; pr: number | null };

// La marque qui reconnaît le bug de l'inertie dans son corps.
export const MARQUE_D_INERTIE = "<!-- brigade:cuisine-inerte -->";

// Un ticket cuisinable.
export type TicketCuisinable = { number: number; title: string };

// Un ticket pris par un cook, et depuis quand (ISO 8601).
export type PrisePourCuisiner = { number: number; depuis: string };

// Ce que la détection demande au client GitHub du projet, et rien de plus.
export type GitHubDeLInertie = {
  // La date (ISO 8601) de la dernière PR fusionnée, ou null s'il n'y en a jamais eu.
  dernierMerge(): Promise<string | null>;
  cuisinables(): Promise<TicketCuisinable[]>;
  prises(): Promise<PrisePourCuisiner[]>;
  // Le nombre de PR ouvertes en passe.
  prsEnPasse(): Promise<number>;
  // Les issues ouvertes portant `label`, avec leur corps.
  issuesOuvertes(label: string): Promise<{ number: number; body: string }[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  // Les tickets que la porte de prise a sautés pour une zone tenue, et ce qui la tient. Absent, aucune.
  zonesTenues?(): Promise<{ ticket: number; tenant: TenantDeZone }[]>;
  // Les tickets à prendre que la porte de prise a sautés, et la ligne qui dit pourquoi. Absent, aucun.
  sautes?(): Promise<{ ticket: number; ligne: string }[]>;
};

// Le dépôt de la brigade, où va le bug : son bug ouvert pour le projet servi,
// et la création.
export type BrigadeDeLInertie = {
  issuesOuvertes(label: string): Promise<{ number: number; body: string }[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  // La marque cachée qui nomme le projet servi dans le bug déposé sur la brigade.
  marqueDuProjet: string;
  servi: string;
};

// `brigade` : où le bug se dépose ; absente, il ne se dépose pas, sauf si
// `projetBrigade` dit que le projet servi est la brigade elle-même — il se
// dépose alors dans son propre dépôt.
export type ContexteDeLInertie = { github: GitHubDeLInertie; maintenant: Date; brigade?: BrigadeDeLInertie; projetBrigade?: boolean };

// `sur: "brigade"` : le bug est celui du dépôt de la brigade, pas du projet servi.
export type Inertie =
  | { fait: "bug"; cause: Cause; bug: number; sur?: "brigade" }
  | { fait: "deja-signale"; bug: number; sur?: "brigade" }
  // La cuisine est inerte, mais rien ne dit où déposer le bug : il ne se dépose pas.
  | { fait: "sans-brigade" }
  | { fait: "rien"; pourquoi: string };

const DIT: Record<Cause, string> = {
  "stale-claim": "a claim is stale: a ticket has been taken for longer than the threshold with nothing merged",
  "held-zone": "a zone is held: the tickets below wait for what holds it",
  skipped: "the claim gate skipped every cookable ticket, for the reasons below: what they name must move, not the dispatcher",
  "empty-rail": "the rail is empty of in-pass PRs",
  unknown: "no obvious cause: no claim is stale, and PRs are in pass",
};

// « zone held by #412, closed on 2026-10-23, through PR #489 » : ce qui tient, sa fermeture si elle a eu lieu, sa PR.
export function direLaZoneTenue(tenant: TenantDeZone): string {
  const qui = tenant.ticket === null ? `the open PR on ${tenant.branche}` : `#${tenant.ticket}`;
  return `zone held by ${qui}${tenant.fermeLe === null ? "" : `, closed on ${tenant.fermeLe}`}${tenant.pr === null ? "" : `, through PR #${tenant.pr}`}`;
}

const minutesDepuis = (iso: string, maintenant: Date) => (maintenant.getTime() - Date.parse(iso)) / 60_000;

// La cause probable de l'inertie, d'après ce que le client GitHub lit.
export async function causeProbable(contexte: ContexteDeLInertie): Promise<{ cause: Cause; detail: string }> {
  const { github, maintenant } = contexte;
  const perimees = (await github.prises()).filter((p) => minutesDepuis(p.depuis, maintenant) >= INERTIE_MINUTES);
  if (perimees.length > 0) return { cause: "stale-claim", detail: perimees.map((p) => `- #${p.number} taken since ${p.depuis}`).join("\n") };
  const tenues = (await github.zonesTenues?.()) ?? [];
  if (tenues.length > 0) return { cause: "held-zone", detail: tenues.map(({ ticket, tenant }) => `- #${ticket}: ${direLaZoneTenue(tenant)}`).join("\n") };
  // Tous sautés, et chacun dit pourquoi : ce n'est pas un rail vide (#3699).
  const sautes = (await github.sautes?.()) ?? [];
  const cuisinables = await github.cuisinables();
  if (cuisinables.length > 0 && cuisinables.every((t) => sautes.some((s) => s.ticket === t.number))) return { cause: "skipped", detail: sautes.map(({ ligne }) => `- ${ligne}`).join("\n") };
  const enPasse = await github.prsEnPasse();
  if (enPasse === 0) return { cause: "empty-rail", detail: "- no open PR is in pass" };
  return { cause: "unknown", detail: `- ${enPasse} PR(s) in pass, none merged` };
}

// Ouvre un bug si la cuisine est inerte, un seul tant qu'il reste ouvert.
export async function signalerInertie(contexte: ContexteDeLInertie): Promise<Inertie> {
  const { github, maintenant } = contexte;
  const dernier = await github.dernierMerge();
  if (dernier !== null && minutesDepuis(dernier, maintenant) < INERTIE_MINUTES) return { fait: "rien", pourquoi: "a PR was merged recently" };
  const cuisinables = await github.cuisinables();
  if (cuisinables.length === 0) return { fait: "rien", pourquoi: "no cookable ticket" };
  const { brigade } = contexte;
  const surLaBrigade = brigade !== undefined;
  // Jamais dans le dépôt d'un projet (#3620).
  if (!surLaBrigade && contexte.projetBrigade !== true) return { fait: "sans-brigade" };
  if (surLaBrigade) {
    // Un bug par projet : celui d'un autre projet ne fait taire personne.
    const deja = (await brigade.issuesOuvertes(LABEL_DU_BUG)).find((i) => i.body.includes(MARQUE_D_INERTIE) && i.body.includes(brigade.marqueDuProjet));
    if (deja) return { fait: "deja-signale", bug: deja.number, sur: "brigade" };
  } else {
    const ouvert = (await github.issuesOuvertes(LABEL_DU_BUG)).find((i) => i.body.includes(MARQUE_D_INERTIE));
    if (ouvert) return { fait: "deja-signale", bug: ouvert.number };
  }
  const { cause, detail } = await causeProbable(contexte);
  const depuis = dernier === null ? "ever" : `since ${dernier}`;
  const ouvrir = surLaBrigade ? brigade.creerIssue : github.creerIssue;
  const bug = await ouvrir({
    titre: `The kitchen is idle: no merge for ${INERTIE_MINUTES} minutes with ${cuisinables.length} cookable ticket(s) (${cause})`,
    corps: [
      MARQUE_D_INERTIE,
      ...(surLaBrigade ? [brigade.marqueDuProjet, "", `> Seen on the served project **${brigade.servi}**: the kitchen's code lives here (\`runtime/src\`), not on ${brigade.servi}: a kitchen alert is filed here, never in the project's repository.`] : []),
      `No PR has been merged ${depuis}, for at least ${INERTIE_MINUTES} minutes, while ${cuisinables.length} ticket(s) are cookable: ${cuisinables.map((t) => `#${t.number}`).join(", ")}.`,
      "",
      "## Likely cause",
      "",
      `\`${cause}\` — ${DIT[cause]}.`,
      "",
      detail,
      "",
      "Find why the kitchen does not cook, then fix it. Close this ticket when a PR merges again.",
    ].join("\n"),
    labels: [LABEL_DU_BUG],
  });
  return surLaBrigade ? { fait: "bug", cause, bug, sur: "brigade" } : { fait: "bug", cause, bug };
}
