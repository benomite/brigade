// The risk ranking of a project's kinds of action (spec 2026-11-24-simplified-process, rule 10, #4230): publishing,
// paying or writing to a client always reaches the chef; fixing a typo never does.
//
// Each kind of action has a rank: `chef` (the chef must answer before it runs) or `safe` (no chef needed). The project
// sheet (`.claude/brigade/projet.json`, its `risks` field) holds the ranks the chef set; a kind it does not rank takes
// its default below, and a kind with no default is `chef`. A ticket says its kinds of action by its `kind:<kind>`
// labels.
//
// The pass reads the ranking from the sheet at the base at each merge (`de-la-fiche.ts`), so a rank the chef
// changes applies from the next ticket, with no restart. Its ranks decide on top of the observe / propose / act levels
// (`autonomie/agents/porte.ts`): `chef` parks the merge for the chef even on `act`; `safe` leaves the level alone.

const RANGS = ["chef", "safe"] as const;
export type Rang = (typeof RANGS)[number];
// The ranks the project sheet sets, by kind of action.
export type ClassementDesRisques = Record<string, Rang>;

// The kinds of action the kitchen knows, and their default rank: every outward-facing kind is `chef`.
const RANGS_PAR_DEFAUT: Readonly<ClassementDesRisques> = {
  publish: "chef",
  pay: "chef",
  "write-to-client": "chef",
  "fix-typo": "safe",
};

// What each known kind will do, said plainly to the chef. Another kind is said by its name, dashes as spaces.
const DITS: Readonly<Record<string, string>> = { "write-to-client": "write to a client", "fix-typo": "fix a typo" };

const PREFIXE_SORTE = "kind:";
const SORTE = /^[a-z][a-z0-9-]*$/;

export class ClassementInvalide extends Error {
  readonly cle: string;
  constructor(cle: string, message: string) {
    super(`\`${cle}\` ${message}`);
    this.cle = cle;
  }
}

// The ranking the sheet's `risks` field holds, or a refusal that says which entry is wrong.
export function classementDe(valeur: unknown): ClassementDesRisques {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) throw new ClassementInvalide("risks", "must be an object of ranks by kind of action, such as `{ \"publish\": \"chef\" }`");
  const classement: ClassementDesRisques = {};
  for (const [sorte, rang] of Object.entries(valeur)) {
    if (!SORTE.test(sorte)) throw new ClassementInvalide(`risks.${sorte}`, "is not a kind of action: lowercase letters, digits and dashes, starting with a letter");
    if (!(RANGS as readonly unknown[]).includes(rang)) throw new ClassementInvalide(`risks.${sorte}`, "must be `chef` or `safe`");
    classement[sorte] = rang as Rang;
  }
  return classement;
}

// The rank of a kind of action: the sheet's, else its default, else `chef`.
function rangDe(sorte: string, classement: ClassementDesRisques | null): Rang {
  return classement?.[sorte] ?? RANGS_PAR_DEFAUT[sorte] ?? "chef";
}

// The kinds of action a ticket's labels say.
const sortesDuTicket =(labels: readonly string[]): string[] => labels.filter((label) => label.startsWith(PREFIXE_SORTE)).map((label) => label.slice(PREFIXE_SORTE.length));

const ditDeLaSorte =(sorte: string): string => DITS[sorte] ?? sorte.replaceAll("-", " ");

// What the risk ranking says of a ticket at the pass: null when its labels say no kind of action. `chef` when one of
// its kinds is ranked `chef` — or when the sheet cannot be read: the chef then answers, nothing is guessed in its place.
export type RisqueDuTicket = { rang: Rang; ceQuIlFera: string; pourquoi: string };

export function risqueDuTicket(labels: readonly string[], lire: () => ClassementDesRisques | null): RisqueDuTicket | null {
  const sortes = sortesDuTicket(labels);
  if (sortes.length === 0) return null;
  const ceQuIlFera = sortes.map(ditDeLaSorte).join(" and ");
  let classement: ClassementDesRisques | null;
  try {
    classement = lire();
  } catch (erreur) {
    return { rang: "chef", ceQuIlFera, pourquoi: `the project sheet's risk ranking cannot be read (${erreur instanceof Error ? erreur.message : String(erreur)})` };
  }
  const aLaChef = sortes.filter((sorte) => rangDe(sorte, classement) === "chef");
  if (aLaChef.length === 0) return { rang: "safe", ceQuIlFera, pourquoi: `its kinds of action are ranked 'safe': ${sortes.join(", ")}` };
  return { rang: "chef", ceQuIlFera, pourquoi: `its kind of action is ranked 'chef' in the project's risk ranking: ${aLaChef.join(", ")}` };
}
