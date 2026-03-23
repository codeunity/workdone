import { describe, expect, it } from "bun:test";
import {
  applySelectionKey,
  createSelectionState,
  runSelectionSession,
  type SelectionIo,
  type SelectionKey,
} from "../src/core/selection";

class FakeSelectionIo implements SelectionIo {
  private index = 0;

  readonly frames: string[] = [];

  constructor(private readonly keys: SelectionKey[]) {}

  render(frame: string): void {
    this.frames.push(frame);
  }

  clear(): void {}

  readKey(): Promise<SelectionKey> {
    const key = this.keys[this.index];
    this.index += 1;
    return Promise.resolve(key);
  }

  close(): void {}
}

describe("selection state", () => {
  it("moves, toggles, and confirms", async () => {
    const io = new FakeSelectionIo(["down", "toggle", "confirm"]);
    const result = await runSelectionSession(
      "Select repositories",
      [
        { value: "a", label: "repo-a", checked: true },
        { value: "b", label: "repo-b", checked: true },
      ],
      io,
    );

    expect(result.confirmed).toBe(true);
    expect(result.selectedValues).toEqual(["a"]);
    expect(io.frames.length).toBeGreaterThan(1);
  });

  it("returns no persisted result on cancel", async () => {
    const io = new FakeSelectionIo(["toggle", "cancel"]);
    const result = await runSelectionSession(
      "Select repositories",
      [
        { value: "a", label: "repo-a", checked: true },
        { value: "b", label: "repo-b", checked: true },
      ],
      io,
    );

    expect(result.confirmed).toBe(false);
    expect(result.selectedValues).toEqual(["b"]);
  });

  it("clamps movement at the list bounds", () => {
    const initial = createSelectionState([
      { value: "a", label: "repo-a", checked: true },
      { value: "b", label: "repo-b", checked: true },
    ]);

    const movedUp = applySelectionKey(initial, "up");
    expect(movedUp.state.activeIndex).toBe(0);

    const movedDown = applySelectionKey(movedUp.state, "down");
    const movedPastEnd = applySelectionKey(movedDown.state, "down");
    expect(movedPastEnd.state.activeIndex).toBe(1);
  });
});
