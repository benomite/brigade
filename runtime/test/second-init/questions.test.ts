import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { answer, nextQuestion, startQueue, type UnsettledPoint } from "../../src/second-init/questions.ts";

const lang: UnsettledPoint = { id: "lang", question: "Which language do your tickets use?", recommended: "English" };
const ci: UnsettledPoint = { id: "ci", question: "Should a green CI be required before a merge?", recommended: "yes" };

describe("second-init question queue", () => {
  test("an empty list yields no question", () => {
    assert.equal(nextQuestion(startQueue([])), null);
  });

  test("one point yields one question stating its recommendation, then nothing", () => {
    const queue = startQueue([lang]);
    const q = nextQuestion(queue);
    assert.equal(q?.id, "lang");
    assert.match(q?.text ?? "", /Which language/);
    assert.match(q?.text ?? "", /recommended: English/);
    assert.equal(nextQuestion(answer(queue, "yes")), null);
  });

  test("several points come in order, one at a time", () => {
    let queue = startQueue([lang, ci]);
    assert.equal(nextQuestion(queue)?.id, "lang");
    assert.equal(nextQuestion(queue)?.id, "lang");
    queue = answer(queue, "French");
    assert.equal(nextQuestion(queue)?.id, "ci");
    queue = answer(queue, "ok");
    assert.equal(nextQuestion(queue), null);
    assert.deepEqual(queue.answers, [
      { id: "lang", value: "French", accepted: false },
      { id: "ci", value: "yes", accepted: true },
    ]);
  });

  test("one word accepting records the recommended value", () => {
    for (const word of ["yes", "ok", "OK", " Oui ", "yes."]) {
      const queue = answer(startQueue([lang]), word);
      assert.deepEqual(queue.answers, [{ id: "lang", value: "English", accepted: true }], word);
    }
  });

  test("any other reply records what the user wrote", () => {
    const queue = answer(startQueue([lang]), "  Spanish, mostly ");
    assert.deepEqual(queue.answers, [{ id: "lang", value: "Spanish, mostly", accepted: false }]);
  });

  test("a blank reply answers nothing and keeps the question", () => {
    const queue = answer(startQueue([lang]), "   ");
    assert.equal(nextQuestion(queue)?.id, "lang");
    assert.deepEqual(queue.answers, []);
  });

  test("points settled by reading the repository are never asked", () => {
    const queue = startQueue([{ ...lang, settled: "English" }, ci]);
    assert.equal(nextQuestion(queue)?.id, "ci");
    assert.equal(nextQuestion(answer(queue, "yes")), null);
  });
});
