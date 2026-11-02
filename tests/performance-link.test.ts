import assert from "node:assert/strict";
import test from "node:test";
import { performanceLink } from "../src/lib/performance-link";

test("performance links preserve the app origin and exclude unrelated query parameters and fragments", () => {
  assert.equal(
    performanceLink(
      "https://stage.example/some-path?invite=private-fixture#account",
      "entry-123",
    ),
    "https://stage.example/?entry=entry-123",
  );
  const link = new URL(
    performanceLink("http://127.0.0.1:3007/?view=studio", "one&two"),
  );
  assert.equal(link.origin, "http://127.0.0.1:3007");
  assert.equal(link.searchParams.get("entry"), "one&two");
  assert.equal([...link.searchParams].length, 1);
});
