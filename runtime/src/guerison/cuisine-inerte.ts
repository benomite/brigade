// La cuisine inerte (épique #2745, ticket #2755). Une routine humaine repérait
// la cuisine à l'arrêt et ouvrait un bug. Ici, la cuisine le fait seule : pour
// un projet, si aucune PR n'a été fusionnée depuis `INERTIE_MINUTES` alors
// qu'au moins un ticket est cuisinable, elle ouvre un ticket de bug qui nomme
// la cause probable :
// - `stale-claim`  : un ticket pris l'est depuis plus longtemps que le seuil, sans PR ;
// - `empty-rail`   : aucune PR n'est en passe, le rail est vide ;
// - `unknown`      : rien de ce qui précède ne l'explique.
//
// Un seul bug à la fois : tant que le bug de la cuisine inerte est ouvert,
// un nouvel appel n'en ouvre pas un second. Rien n'est tenu ici : le bug déjà
// ouvert se relit du client GitHub à chaque appel. Aucune valeur n'est propre
// à un projet : le client et l'horloge viennent de l'appelant.

// Depuis combien de minutes sans fusion la cuisine est dite inerte.
export const INERTIE_MINUTES = 90;

// Le label du ticket de bug qu'ouvre l'inertie.
export const LABEL_DU_BUG = "fix";

export type Cause = "stale-claim" | "empty-rail" | "unknown";

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
};

export type ContexteDeLInertie = { github: GitHubDeLInertie; maintenant: Date };

export type Inertie =
  | { fait: "bug"; cause: Cause; bug: number }
  | { fait: "deja-signale"; bug: number }
  | { fait: "rien"; pourquoi: string };

const DIT: Record<Cause, string> = {
  "stale-claim": "a claim is stale: a ticket has been taken for longer than the threshold with nothing merged",
  "empty-rail": "the rail is empty of in-pass PRs",
  unknown: "no obvious cause: no claim is stale, and PRs are in pass",
};

const minutesDepuis = (iso: string, maintenant: Date) => (maintenant.getTime() - Date.parse(iso)) / 60_000;

// La cause probable de l'inertie, d'après ce que le client GitHub lit.
export async function causeProbable(contexte: ContexteDeLInertie): Promise<{ cause: Cause; detail: string }> {
  const { github, maintenant } = contexte;
  const perimees = (await github.prises()).filter((p) => minutesDepuis(p.depuis, maintenant) >= INERTIE_MINUTES);
  if (perimees.length > 0) return { cause: "stale-claim", detail: perimees.map((p) => `- #${p.number} taken since ${p.depuis}`).join("\n") };
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
  const ouvert = (await github.issuesOuvertes(LABEL_DU_BUG)).find((i) => i.body.includes(MARQUE_D_INERTIE));
  if (ouvert) return { fait: "deja-signale", bug: ouvert.number };
  const { cause, detail } = await causeProbable(contexte);
  const depuis = dernier === null ? "ever" : `since ${dernier}`;
  const bug = await github.creerIssue({
    titre: `The kitchen is idle: no merge for ${INERTIE_MINUTES} minutes with ${cuisinables.length} cookable ticket(s) (${cause})`,
    corps: [
      MARQUE_D_INERTIE,
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
  return { fait: "bug", cause, bug };
}
