// The weekly quality report the second sends the chef (`rapport-hebdo-qualite.ts`):
// `week`, the ISO week it covers; `text`, the report as sent. It is a fact of
// the journal, so what was said can be read back with the app closed.
export type FaitRapportQualite = { type: "quality.reported"; payload: { week: string; text: string } };
