import {
  clearScreenDown,
  cursorTo,
  emitKeypressEvents,
  moveCursor,
} from "node:readline";
import type { Key } from "node:readline";

export type SelectionKey = "up" | "down" | "toggle" | "confirm" | "cancel";

export interface SelectionItem {
  value: string;
  label: string;
  checked: boolean;
}

export interface SelectionState {
  items: SelectionItem[];
  activeIndex: number;
}

export interface SelectionResult {
  confirmed: boolean;
  items: SelectionItem[];
  selectedValues: string[];
}

export interface SelectionIo {
  render(frame: string): void;
  clear(): void;
  readKey(): Promise<SelectionKey>;
  close(): void;
}

export function createSelectionState(items: SelectionItem[]): SelectionState {
  return {
    items: items.map((item) => ({ ...item })),
    activeIndex: 0,
  };
}

export function applySelectionKey(
  state: SelectionState,
  key: SelectionKey,
): { state: SelectionState; done: boolean; confirmed: boolean } {
  if (key === "confirm") {
    return { state, done: true, confirmed: true };
  }

  if (key === "cancel") {
    return { state, done: true, confirmed: false };
  }

  if (state.items.length === 0) {
    return { state, done: false, confirmed: false };
  }

  if (key === "up") {
    return {
      state: {
        ...state,
        activeIndex: Math.max(0, state.activeIndex - 1),
      },
      done: false,
      confirmed: false,
    };
  }

  if (key === "down") {
    return {
      state: {
        ...state,
        activeIndex: Math.min(state.items.length - 1, state.activeIndex + 1),
      },
      done: false,
      confirmed: false,
    };
  }

  const items = state.items.map((item, index) =>
    index === state.activeIndex ? { ...item, checked: !item.checked } : item,
  );

  return {
    state: { ...state, items },
    done: false,
    confirmed: false,
  };
}

export function renderSelectionFrame(title: string, state: SelectionState, detail?: string): string {
  const lines: string[] = [title];
  if (detail) {
    lines.push(detail);
  }
  lines.push("");

  for (let index = 0; index < state.items.length; index += 1) {
    const item = state.items[index];
    const cursor = index === state.activeIndex ? ">" : " ";
    const checkbox = item.checked ? "[x]" : "[ ]";
    lines.push(`${cursor} ${checkbox} ${item.label}`);
  }

  lines.push("");
  lines.push("Controls: up/down move, space toggle, enter confirm, q/esc/ctrl+c cancel");

  return lines.join("\n");
}

export async function runSelectionSession(
  title: string,
  items: SelectionItem[],
  io: SelectionIo,
  detail?: string,
): Promise<SelectionResult> {
  let state = createSelectionState(items);
  io.render(renderSelectionFrame(title, state, detail));

  while (true) {
    const key = await io.readKey();
    const next = applySelectionKey(state, key);
    state = next.state;

    if (next.done) {
      io.clear();
      io.close();
      return {
        confirmed: next.confirmed,
        items: state.items,
        selectedValues: state.items.filter((item) => item.checked).map((item) => item.value),
      };
    }

    io.render(renderSelectionFrame(title, state, detail));
  }
}

function mapKey(input: string, key: Key): SelectionKey | null {
  if (key.ctrl && key.name === "c") {
    return "cancel";
  }
  if (key.name === "up") {
    return "up";
  }
  if (key.name === "down") {
    return "down";
  }
  if (key.name === "space") {
    return "toggle";
  }
  if (key.name === "return" || key.name === "enter") {
    return "confirm";
  }
  if (key.name === "escape") {
    return "cancel";
  }
  if (!key.ctrl && !key.meta && input.toLowerCase() === "q") {
    return "cancel";
  }
  return null;
}

export function createNodeSelectionIo(
  stdin: NodeJS.ReadStream = process.stdin,
  stdout: NodeJS.WriteStream = process.stdout,
): SelectionIo {
  const queuedKeys: SelectionKey[] = [];
  let pendingResolve: ((key: SelectionKey) => void) | null = null;
  let renderedLineCount = 0;
  const wasRaw = "isRaw" in stdin ? Boolean(stdin.isRaw) : false;

  const onKeypress = (input: string, key: Key): void => {
    const mapped = mapKey(input, key);
    if (!mapped) {
      return;
    }
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(mapped);
      return;
    }
    queuedKeys.push(mapped);
  };

  emitKeypressEvents(stdin);
  stdin.on("keypress", onKeypress);
  stdin.setRawMode?.(true);
  stdin.resume();

  return {
    render(frame: string): void {
      if (renderedLineCount > 0) {
        moveCursor(stdout, 0, -renderedLineCount);
        cursorTo(stdout, 0);
        clearScreenDown(stdout);
      }
      stdout.write(frame);
      renderedLineCount = frame.split("\n").length;
    },
    clear(): void {
      if (renderedLineCount === 0) {
        return;
      }
      moveCursor(stdout, 0, -renderedLineCount);
      cursorTo(stdout, 0);
      clearScreenDown(stdout);
      renderedLineCount = 0;
    },
    readKey(): Promise<SelectionKey> {
      if (queuedKeys.length > 0) {
        return Promise.resolve(queuedKeys.shift()!);
      }
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
    close(): void {
      stdin.off("keypress", onKeypress);
      pendingResolve = null;
      stdin.setRawMode?.(wasRaw);
      stdin.pause();
    },
  };
}
