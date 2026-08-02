import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetsView } from "./assets-view";

describe("ops assets view", () => {
  it("renders the asset pack management lanes promised by the X4 IA skeleton", () => {
    render(<AssetsView />);

    expect(screen.getByTestId("ops-assets-page").textContent).toContain("资产包管理后台");
    expect(screen.getByTestId("ops-assets-page").textContent).toContain("平台原创模板包");
    expect(screen.getByTestId("ops-assets-page").textContent).toContain("授权资产包");
    expect(screen.getByTestId("ops-assets-page").textContent).toContain("上架审核");
  });
});
