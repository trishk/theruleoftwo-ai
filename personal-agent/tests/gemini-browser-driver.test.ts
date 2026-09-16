// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  ConversationIdentityPin, atomicFillComposer, baselineSnapshotChanged, responseBelongsToGeneration, responseTextBlocks,
} from "../src/gemini-browser-driver.js";

describe("Gemini Quill composer compatibility", () => {
  it("treats the live visually-empty p/br scaffold as empty and fills it atomically", () => {
    const composer = document.createElement("div");
    composer.setAttribute("contenteditable", "true");
    composer.innerHTML = "<p><br></p>";
    Object.defineProperty(composer, "innerText", { configurable: true, value: "\n" });
    let inputEvents = 0;
    let changeEvents = 0;
    composer.addEventListener("input", () => { inputEvents += 1; });
    composer.addEventListener("change", () => { changeEvents += 1; });
    expect(composer.textContent).toBe("");
    expect(composer.innerText).toBe("\n");
    expect(atomicFillComposer(composer, "opaque prompt")).toBe("filled");
    expect(composer.textContent).toBe("opaque prompt");
    expect(inputEvents).toBe(1);
    expect(changeEvents).toBe(1);
  });

  it("fills a genuinely childless empty composer", () => {
    const composer = document.createElement("div");
    composer.setAttribute("contenteditable", "true");
    expect(composer.childNodes).toHaveLength(0);
    expect(atomicFillComposer(composer, "exact prompt")).toBe("filled");
    expect(composer.textContent).toBe("exact prompt");
  });

  it.each([" ", "\n", "\u00a0", "user draft"])("does not overwrite textual user content %j", (content) => {
    const composer = document.createElement("div");
    composer.setAttribute("contenteditable", "true");
    composer.textContent = content;
    const before = composer.innerHTML;
    expect(atomicFillComposer(composer, "opaque prompt")).toBe("not_empty");
    expect(composer.textContent).toBe(content);
    expect(composer.innerHTML).toBe(before);
  });

  it("does not overwrite textless non-scaffold content or emit editor events", () => {
    const composer = document.createElement("div");
    composer.setAttribute("contenteditable", "true");
    composer.innerHTML = "<img alt='user content'>";
    let inputEvents = 0;
    let changeEvents = 0;
    composer.addEventListener("input", () => { inputEvents += 1; });
    composer.addEventListener("change", () => { changeEvents += 1; });
    const before = composer.innerHTML;
    expect(composer.textContent).toBe("");
    expect(atomicFillComposer(composer, "opaque prompt")).toBe("not_empty");
    expect(composer.innerHTML).toBe(before);
    expect(inputEvents).toBe(0);
    expect(changeEvents).toBe(0);
  });
});

describe("Gemini response baseline and extraction", () => {
  it("resets baseline stability when either response count or last text changes", () => {
    expect(baselineSnapshotChanged(1, "old", 1, "hydrated old")).toBe(true);
    expect(baselineSnapshotChanged(1, "old", 2, "old")).toBe(true);
    expect(baselineSnapshotChanged(1, "old", 1, "old")).toBe(false);
  });

  it("does not accept stale same-node hydration without stop-control evidence", () => {
    expect(responseBelongsToGeneration(false, "response_mutated", "hydrated old", "old")).toBe(false);
    expect(responseBelongsToGeneration(false, "stop_control", "new answer", "old")).toBe(true);
    expect(responseBelongsToGeneration(true, "response_appended", "new answer", "old")).toBe(true);
  });

  it("extracts all leaf content blocks in DOM order without nested duplicates", () => {
    const container = document.createElement("model-response");
    container.innerHTML = "<message-content><div class='markdown'>A</div></message-content><div class='markdown'>B</div><message-content>C</message-content>";
    const elements = Array.from(container.querySelectorAll(".markdown, message-content"));
    for (const element of elements) Object.defineProperty(element, "innerText", { value: element.textContent ?? "" });
    expect(responseTextBlocks(elements)).toEqual(["A", "B", "C"]);
  });
});

describe("Gemini conversation identity pinning", () => {
  it("rejects mapped A to B even if a later observation could return to A", () => {
    const pin = new ConversationIdentityPin({ kind: "mapped", id: "A" });
    expect(pin.observe("https://gemini.google.com/app/A")).toBe("A");
    expect(() => pin.observe("https://gemini.google.com/app/B")).toThrow("conversation_changed");
  });

  it("pins the first fresh ID and rejects a later different ID", () => {
    const stable = new ConversationIdentityPin({ kind: "fresh" });
    expect(stable.observe("https://gemini.google.com/app")).toBeNull();
    expect(stable.observe("https://gemini.google.com/app/X")).toBe("X");
    expect(stable.observe("https://gemini.google.com/app/X")).toBe("X");
    expect(() => stable.observe("https://gemini.google.com/app/Y")).toThrow("conversation_changed");
  });
});
