import assert from "node:assert/strict";
import { test } from "node:test";
import type { Commentaire, IssueOuverte, Sondage } from "../../../src/github.ts";
import { consigneDesDirections, directionsActives, jusquaDans, lecteurDesDirections, type IssueDeDirection } from "../../../src/produit/directions/directions.ts";

const CHEF = "la-cheffe";
const MAINTENANT = new Date("2026-11-15T22:30:00Z");
const lien = (numero: number) => `https://github.com/acme/projet/issues/${numero}`;

const commentaire = (author: string, body: string, createdAt: string): Commentaire => ({ author, body, createdAt, association: author === CHEF ? "OWNER" : "NONE" });

const issue = (numero: number, champs: Partial<IssueDeDirection> = {}): IssueDeDirection => ({
  number: numero,
  url: lien(numero),
  title: `Direction ${numero}`,
  body: `Le corps de ${numero}.`,
  author: CHEF,
  state: "open",
  labels: ["direction"],
  commentaires: [],
  ...champs,
});

const lire = (issues: IssueDeDirection[], chefs: string[] = [CHEF]) => directionsActives(issues, { chefs, maintenant: MAINTENANT });

test("seules les issues `direction` ouvertes du chef, non échues, sont rendues — chacune avec son lien, son texte et les commentaires que le chef y a ajoutés", () => {
  const issues = [
    issue(10, {
      title: "Focus on onboarding",
      body: "Focus on onboarding this month.\n\nuntil: 2026-11-30\n",
      commentaires: [
        commentaire(CHEF, "Start with the installer: that's where people give up.", "2026-11-03T09:00:00Z"),
        commentaire("passant", "What about the docs?", "2026-11-04T09:00:00Z"),
        commentaire(CHEF, "And the first ticket a new project serves.", "2026-11-05T09:00:00Z"),
      ],
    }),
    issue(11, { labels: ["product"] }),
    issue(12, { body: "Keep the app fast.", labels: ["Direction", "prio:1"] }),
    issue(13, { state: "closed" }),
    issue(14, { body: "Old one.\nuntil: 2026-11-14" }),
  ];

  assert.deepEqual(lire(issues), [
    { numero: 12, lien: lien(12), titre: "Direction 12", texte: "Keep the app fast.", jusqua: null, commentaires: [] },
    {
      numero: 10,
      lien: lien(10),
      titre: "Focus on onboarding",
      texte: "Focus on onboarding this month.\n\nuntil: 2026-11-30",
      jusqua: "2026-11-30",
      commentaires: [
        { texte: "Start with the installer: that's where people give up.", date: "2026-11-03T09:00:00Z" },
        { texte: "And the first ticket a new project serves.", date: "2026-11-05T09:00:00Z" },
      ],
    },
  ]);
});

test("une issue `direction` ouverte par un autre que le chef est ignorée, même si le chef la commente", () => {
  const issues = [issue(20, { author: "passant", commentaires: [commentaire(CHEF, "+1", "2026-11-02T09:00:00Z")] }), issue(21, { author: "" })];
  assert.deepEqual(lire(issues), []);
  // Le compte du chef se compare sans la casse ; sans compte de chef, rien n'est une direction.
  assert.deepEqual(lire([issue(22, { author: "La-Cheffe" })]).map(({ numero }) => numero), [22]);
  assert.deepEqual(lire([issue(23)], []), []);
  assert.deepEqual(lire([issue(24, { author: "second-compte" })], [CHEF, " second-compte "]).map(({ numero }) => numero), [24]);
});

test("une direction passée son `until:` ou fermée n'est pas rendue ; le jour même de `until:` compte encore", () => {
  assert.deepEqual(lire([issue(30, { body: "until: 2026-11-14" })]), [], "échue la veille");
  assert.deepEqual(lire([issue(31, { state: "closed", body: "until: 2026-12-31" })]), [], "fermée");
  assert.deepEqual(lire([issue(32, { body: "until: 2026-11-15" })]).map(({ numero }) => numero), [32], "son dernier jour, à 22 h 30 UTC");
});

test("un `until:` écrit plus tard par le chef en commentaire l'emporte sur celui du corps ; celui d'un autre ne compte pas", () => {
  const prolongee = issue(40, { body: "until: 2026-11-01", commentaires: [commentaire(CHEF, "Extending it.\nuntil: 2026-12-15", "2026-11-10T09:00:00Z")] });
  assert.deepEqual(lire([prolongee]).map(({ jusqua }) => jusqua), ["2026-12-15"]);
  const avancee = issue(41, { body: "until: 2026-12-31", commentaires: [commentaire(CHEF, "until: 2026-11-10", "2026-11-09T09:00:00Z")] });
  assert.deepEqual(lire([avancee]), []);
  const parUnAutre = issue(42, { body: "until: 2026-11-01", commentaires: [commentaire("passant", "until: 2026-12-31", "2026-11-10T09:00:00Z")] });
  assert.deepEqual(lire([parUnAutre]), []);
});

test("`until:` se lit avec ou sans puce ni gras ; une date impossible ne borne rien", () => {
  assert.equal(jusquaDans("Focus.\n- **until:** 2026-11-30"), "2026-11-30");
  assert.equal(jusquaDans("Until: 2026-11-30"), "2026-11-30");
  assert.equal(jusquaDans("until: 2026-02-30"), null);
  assert.equal(jusquaDans("We work until: the end"), null);
  assert.equal(jusquaDans("Not a line: until: 2026-11-30"), null);
  assert.equal(jusquaDans("until: 2026-11-30T12:00"), "2026-11-30");
});

// Un GitHub de test : les issues ouvertes sous un sondage, chaque issue et ses commentaires.
function fauxGitHub(issues: IssueDeDirection[]) {
  const appels: string[] = [];
  let inchange = false;
  return {
    appels,
    repondreInchange: () => void (inchange = true),
    github: {
      async ouvertes(): Promise<Sondage<IssueOuverte>> {
        appels.push("ouvertes");
        if (inchange) return { inchange: true };
        const ouvertes = issues
          .filter(({ state }) => state === "open")
          .map(({ number, url, title, body, labels, state }) => ({ number, url, title, body, labels, state, association: "OWNER", createdAt: "", updatedAt: "" }));
        return { inchange: false, issues: ouvertes, confirmer: () => appels.push("confirmer") };
      },
      async issue(numero: number) {
        appels.push(`issue ${numero}`);
        const trouvee = issues.find(({ number }) => number === numero);
        if (!trouvee) return null;
        const { commentaires: _, ...reste } = trouvee;
        return { ...reste, createdAt: "", updatedAt: "" };
      },
      async commentaires(numero: number) {
        appels.push(`commentaires ${numero}`);
        return issues.find(({ number }) => number === numero)?.commentaires ?? [];
      },
    },
  };
}

test("le lecteur lit les issues ouvertes, puis l'auteur et les commentaires des seules issues `direction` ; un 304 rend la dernière liste, et les commentaires sont relus", async () => {
  const issues = [issue(50, { commentaires: [commentaire(CHEF, "More on this.", "2026-11-02T09:00:00Z")] }), issue(51, { labels: ["bug"] }), issue(52, { author: "passant" })];
  const faux = fauxGitHub(issues);
  const lire = lecteurDesDirections(faux.github);

  assert.deepEqual((await lire({ chefs: [CHEF], maintenant: MAINTENANT })).map(({ numero }) => numero), [50]);
  assert.deepEqual(faux.appels, ["ouvertes", "confirmer", "issue 50", "commentaires 50", "issue 52", "commentaires 52"]);

  issues[0]!.commentaires.push(commentaire(CHEF, "until: 2026-11-01", "2026-11-12T09:00:00Z"));
  faux.repondreInchange();
  assert.deepEqual(await lire({ chefs: [CHEF], maintenant: MAINTENANT }), [], "le chef l'a close par un commentaire : relu malgré le 304");
});

test("le lecteur refuse un « inchangé » à sa première lecture : il n'a aucune liste à rendre", async () => {
  const faux = fauxGitHub([]);
  faux.repondreInchange();
  await assert.rejects(lecteurDesDirections(faux.github)({ chefs: [CHEF], maintenant: MAINTENANT }), /first reading/);
});

test("la consigne nomme chaque direction, son lien, sa fin, son texte et les commentaires du chef ; sans direction, elle dit que l'usage seul décide", () => {
  const [direction] = lire([issue(60, { title: "Focus on onboarding", body: "Onboarding first.\nuntil: 2026-11-30", commentaires: [commentaire(CHEF, "The installer above all.", "2026-11-03T09:00:00Z")] })]);
  const consigne = consigneDesDirections([direction!]);
  assert.match(consigne, /#### #60 — Focus on onboarding/);
  assert.ok(consigne.includes(`${lien(60)} — jusqu'au 2026-11-30 inclus`), consigne);
  assert.match(consigne, /<direction>\nOnboarding first\.\nuntil: 2026-11-30\n<\/direction>/);
  assert.match(consigne, /<commentaires-du-chef>\n2026-11-03T09:00:00Z\nThe installer above all\.\n<\/commentaires-du-chef>/);
  assert.match(consigneDesDirections([]), /Aucune direction active/);
});
