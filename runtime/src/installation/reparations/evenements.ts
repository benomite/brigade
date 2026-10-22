// The facts of the repairs the kitchen makes alone (`reparations.ts`): one
// per repair, so that the chef reads on the project what was mended.
//
// `repair`: which repair (`env`, `package-manager`, `network`). `sentence`: what
// was repaired, in one sentence.
export type FaitReparation = { type: "repair.done"; payload: { repair: string; sentence: string } };
