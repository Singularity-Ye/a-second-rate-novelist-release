import { describe, expect, it } from "vitest";
import { toFrontstageErrorCopy } from "./frontstage-copy";

describe("frontstage copy", () => {
  it("folds explicit technical transport failures back into frontstage fallback copy", () => {
    expect(toFrontstageErrorCopy(new Error("Failed to fetch"), "fallback copy")).toBe("fallback copy");
    expect(toFrontstageErrorCopy(new Error("history failed"), "fallback copy")).toBe("fallback copy");
    expect(toFrontstageErrorCopy(new Error("Beta access API failed: 500"), "fallback copy")).toBe("fallback copy");
  });

  it("keeps readable business-facing copy when it is already phrased for the user", () => {
    expect(toFrontstageErrorCopy(new Error("保存失败，请稍后再试。"), "fallback copy")).toBe("保存失败，请稍后再试。");
    expect(toFrontstageErrorCopy(new Error("请先补全作品名称，再继续提交。"), "fallback copy")).toBe(
      "请先补全作品名称，再继续提交。",
    );
  });
});
