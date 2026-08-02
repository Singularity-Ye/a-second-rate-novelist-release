import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { MotionDemoRoom } from "./motion-demo-room";

describe("MotionDemoRoom", () => {
  it("renders correctly with initial seated mode", () => {
    render(<MotionDemoRoom />);
    expect(screen.getByTestId("motion-demo-room")).toBeTruthy();
    expect(screen.getByText("✍️ 坐姿写作中")).toBeTruthy();
  });

  it("handles stand up and movement interaction", () => {
    render(<MotionDemoRoom />);
    const standUpBtn = screen.getByText("🚶 站立离座");
    fireEvent.click(standUpBtn);

    expect(screen.getAllByText(/离座过渡/).length).toBeGreaterThan(0);

    const eatBtn = screen.getByText("🍵 前往饭桌");
    fireEvent.click(eatBtn);
    expect(screen.getAllByText(/摇晃滑行中/).length).toBeGreaterThan(0);
  });

});
