// The facts of the repairs the kitchen makes alone (`reparations.ts`): one
// per repair, so that the chef reads on the project what was mended.
//
// `repair`: which repair (`env`, `package-manager`, `network`). `sentence`: what
// was repaired, in one sentence.
//
// `repair.network`: the hosts the kitchen opened to the door because the setup
// reaches them; `brancherReseau` adds them to every declaration it reads on the
// base, so they stay open until the base declares them.
export type FaitReparation = { type: "repair.done"; payload: { repair: string; sentence: string } } | { type: "repair.network"; payload: { hosts: string[] } };
