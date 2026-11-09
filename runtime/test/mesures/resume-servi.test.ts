// The summary the station serves with a project's ticket times (#3015).
import assert from "node:assert/strict";
import { test } from "node:test";
import { resumeServi } from "../../src/mesures/resume-servi.ts";

const MAINTENANT = Date.parse("2026-11-09T12:00:00Z");
const merge = (ticket: number, mergedAt: string) => ({ ticket, claimedAt: "2026-11-09T01:00:00Z", mergedAt, cuisson: 900, cuissonTests: 100, attentePasse: 60, revue: 120, ci: 200, merge: 30 });

test("tickets merged within the last 24 h: a ticket time value", () => {
  const resume = resumeServi([merge(1, "2026-11-08T13:00:00Z"), merge(2, "2026-11-09T09:00:00Z"), merge(3, "2026-11-09T11:00:00Z")], 2, MAINTENANT);
  assert.equal(resume?.n, 3);
  assert.ok((resume?.medianMin ?? 0) > 0 && (resume?.p75Min ?? 0) > 0);
});

test("no ticket merged in the last 24 h, or none at all: no value", () => {
  assert.equal(resumeServi([merge(1, "2026-11-08T11:00:00Z")], 2, MAINTENANT), null);
  assert.equal(resumeServi([], 2, MAINTENANT), null);
  assert.equal(resumeServi([{ ...merge(1, "2026-11-09T11:00:00Z"), mergedAt: undefined }], 2, MAINTENANT), null);
});
