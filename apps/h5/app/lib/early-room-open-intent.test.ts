import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEarlyRoomOpenIntentScript,
  EARLY_ROOM_HYDRATED_DATASET_KEY,
  EARLY_ROOM_OPEN_PENDING_DATASET_KEY,
} from "./early-room-open-intent";

describe("early room open intent", () => {
  afterEach(() => {
    delete document.documentElement.dataset[EARLY_ROOM_HYDRATED_DATASET_KEY];
    delete document.documentElement.dataset[EARLY_ROOM_OPEN_PENDING_DATASET_KEY];
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("captures a pre-hydration click once, then leaves hydrated clicks to React", () => {
    const button = document.createElement("button");
    button.dataset.roomEntryAction = "open-novelist";
    button.setAttribute("aria-expanded", "false");
    const child = document.createElement("span");
    button.append(child);
    document.body.append(button);

    Function(buildEarlyRoomOpenIntentScript())();

    const earlyClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    child.dispatchEvent(earlyClick);
    expect(earlyClick.defaultPrevented).toBe(true);
    expect(document.documentElement.dataset[EARLY_ROOM_OPEN_PENDING_DATASET_KEY]).toBe("true");

    delete document.documentElement.dataset[EARLY_ROOM_OPEN_PENDING_DATASET_KEY];
    document.documentElement.dataset[EARLY_ROOM_HYDRATED_DATASET_KEY] = "true";
    const hydratedClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    child.dispatchEvent(hydratedClick);
    expect(hydratedClick.defaultPrevented).toBe(false);
    expect(document.documentElement.dataset[EARLY_ROOM_OPEN_PENDING_DATASET_KEY]).toBeUndefined();
  });
});
