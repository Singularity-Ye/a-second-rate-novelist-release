import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileSummary } from "./profile-summary";

describe("ProfileSummary", () => {
  it("renders profile sections and confirmation CTA", () => {
    render(
      <ProfileSummary
        profile={{
          reading_archive: { favorite_books: ["房思琪的初恋乐园"] },
          taste_archive: {
            relationship_preference: ["慢热拉扯"],
            pace: "slow-burn",
            emotion: "dense",
            ending: "bittersweet",
          },
          boundaries: { red_lines: ["羞辱桥段"] },
          collaboration_mode: "co_create",
          completion_status: {
            state: "confirm_pending",
            captured_dimensions: ["reading_archive", "taste_archive", "boundaries", "collaboration_mode"],
            pending_dimensions: [],
            conversation_cue: null,
          },
        }}
      />,
    );

    expect(screen.getByText("这一版，我先这样接住你")).toBeTruthy();
    expect(screen.getByText("你的边界我会先替你守住，后面也可以继续改。")).toBeTruthy();
    expect(screen.getByText("房思琪的初恋乐园")).toBeTruthy();
    expect(screen.getByRole("button", { name: "就按这个写我" })).toBeTruthy();
  });
});
