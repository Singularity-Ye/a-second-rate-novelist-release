import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeEntryView } from "./home-entry-view";
import { loadSystemBinding } from "./room/system/system-layer";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("./room/system/system-layer", () => ({
  loadSystemBinding: vi.fn(),
}));

describe("home product entry", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends a first visit without a valid reincarnation record to the reincarnation flow", async () => {
    vi.mocked(loadSystemBinding).mockReturnValue(null);

    render(<HomeEntryView />);

    expect(screen.getByTestId("home-entry-page").getAttribute("data-entry-state")).toBe("resolving");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/room/reincarnation"));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("returns a user with a valid completed reincarnation record to the room", async () => {
    vi.mocked(loadSystemBinding).mockReturnValue({} as ReturnType<typeof loadSystemBinding>);

    render(<HomeEntryView />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/room"));
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
