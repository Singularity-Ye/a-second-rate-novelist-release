import { describe, expect, it } from "vitest";
import { splitManuscriptAnalysisParagraphs } from "./manuscript-analysis-text";

describe("manuscript analysis text", () => {
  it("groups a newline-free summary into readable sentence paragraphs", () => {
    expect(splitManuscriptAnalysisParagraphs("第一句交代人物。第二句补充冲突。第三句留下伏笔。第四句推动接力。"))
      .toEqual(["第一句交代人物。第二句补充冲突。", "第三句留下伏笔。第四句推动接力。"]);
  });

  it("preserves explicit paragraph breaks and ignores surrounding whitespace", () => {
    expect(splitManuscriptAnalysisParagraphs("  第一段。\n\n第二段。  ")).toEqual(["第一段。", "第二段。"]);
  });

  it("keeps closing dialogue punctuation attached to the sentence", () => {
    expect(splitManuscriptAnalysisParagraphs("“先问清楚？”他说。她点头。"))
      .toEqual(["“先问清楚？”他说。", "她点头。"]);
    expect(splitManuscriptAnalysisParagraphs("他说完了。”下一句开始。"))
      .toEqual(["他说完了。”下一句开始。"]);
    expect(splitManuscriptAnalysisParagraphs("他说完了。\n\n”\n下一段开始。"))
      .toEqual(["他说完了。”", "下一段开始。"]);
  });
});
