import { describe, expect, it } from "vitest";
import { validateWorldLabDraft, WORLD_LAB_DRAFT_VERSION } from "./world-lab-persistence";
import { createInteractiveStory } from "./interactive-branch";
import { createOpeningWorld } from "./world-lab-data";

function snapshot() {
  return {
    version: WORLD_LAB_DRAFT_VERSION,
    savedAt: "2026-07-20T12:00:00.000Z",
    worlds: [],
    manuscripts: [],
    forecastSandboxes: [],
    interactiveStories: {},
    activeWorldId: null,
    activeStoryId: null,
    selectedTurnId: "turn-0",
    graphScope: "world",
    railView: "graph",
    runtimeModel: null,
  } as const;
}

describe("World Lab local draft schema", () => {
  it("accepts the current version without runtime credentials", () => {
    expect(validateWorldLabDraft(snapshot())).toEqual(snapshot());
  });

  it("rejects unknown versions, malformed navigation and corrupt payloads", () => {
    expect(validateWorldLabDraft({ ...snapshot(), version: 99 })).toBeNull();
    expect(validateWorldLabDraft({ ...snapshot(), graphScope: "everything" })).toBeNull();
    expect(validateWorldLabDraft({ ...snapshot(), worlds: "not-an-array" })).toBeNull();
  });

  it("migrates a v1 interactive story without losing its branch head", () => {
    const world = createOpeningWorld("immortal", "secret");
    const current = createInteractiveStory(world, world.stories[0]!);
    const { checkpoints: _checkpoints, nextCheckpointSequence: _nextCheckpointSequence, ...legacyStory } = current;
    const migrated = validateWorldLabDraft({
      ...snapshot(),
      version: 1,
      worlds: [world],
      interactiveStories: { [current.storyId]: legacyStory },
      activeWorldId: world.id,
      activeStoryId: current.storyId,
    });

    expect(migrated?.version).toBe(WORLD_LAB_DRAFT_VERSION);
    expect(migrated?.manuscripts).toEqual([]);
    expect(migrated?.forecastSandboxes).toEqual([]);
    expect(migrated?.interactiveStories[current.storyId]).toMatchObject({ checkpoints: [], nextCheckpointSequence: 1, activeBranchId: "main" });
  });

  it("migrates a v2 checkpoint draft by adding an empty memory ledger to old turns", () => {
    const world = createOpeningWorld("immortal", "secret");
    const current = createInteractiveStory(world, world.stories[0]!);
    const legacyTurns = current.turns.map(({ memoryUpdates: _memoryUpdates, ...turn }) => turn);
    const migrated = validateWorldLabDraft({
      ...snapshot(),
      version: 2,
      worlds: [world],
      interactiveStories: { [current.storyId]: { ...current, turns: legacyTurns } },
      activeWorldId: world.id,
      activeStoryId: current.storyId,
    });

    expect(migrated?.version).toBe(WORLD_LAB_DRAFT_VERSION);
    expect(migrated?.interactiveStories[current.storyId]?.turns[0]?.memoryUpdates).toEqual([]);
  });

  it("rejects checkpoints that point outside their recorded branch", () => {
    const world = createOpeningWorld("immortal", "secret");
    const current = createInteractiveStory(world, world.stories[0]!);
    const corrupt = {
      ...current,
      checkpoints: [{ id: "checkpoint-1", title: "坏存档", turnId: "turn-missing", branchId: "main", createdAt: "2026-07-20T12:00:00.000Z", order: 1 }],
      nextCheckpointSequence: 2,
    };
    expect(validateWorldLabDraft({
      ...snapshot(),
      worlds: [world],
      interactiveStories: { [current.storyId]: corrupt },
      activeWorldId: world.id,
      activeStoryId: current.storyId,
    })).toBeNull();
  });

  it("restores a rights-attested imported manuscript and rejects dangling world sources", () => {
    const text = "第一章 雨夜\n他在门外等了一夜。";
    const manuscript = {
      id: "manuscript-1234567890abcdef",
      title: "雨夜",
      filename: "雨夜.md",
      format: "markdown",
      encoding: "utf-8",
      sizeBytes: new TextEncoder().encode(text).byteLength,
      sha256: "a".repeat(64),
      text,
      chapters: [{ id: "chapter-1", title: "第一章 雨夜", start: 0, end: text.length, text }],
      continuationChapterId: "chapter-1",
      rightsAttested: true,
      importedAt: "2026-07-20T12:00:00.000Z",
    } as const;
    expect(validateWorldLabDraft({ ...snapshot(), manuscripts: [manuscript] })?.manuscripts).toEqual([manuscript]);
    const world = { ...createOpeningWorld("mystery", "secret"), sourceManuscriptId: manuscript.id };
    expect(validateWorldLabDraft({ ...snapshot(), worlds: [world], manuscripts: [] })).toBeNull();
  });

  it("persists craft evidence separately from story worlds and canon facts", () => {
    const craftLibrary = [{
      kind: "technique" as const,
      id: "craft-technique-test",
      key: "adversary-reframe",
      status: "candidate" as const,
      technique: {
        key: "adversary-reframe",
        label: "敌方畅想后被己方截断",
        pattern: "先写对手的完整盘算，再切到己方重新命名这份盘算。",
        evidence: "视角切换后，前面的希望被解释为已被观察的对象。",
        useWhen: "信息差发生逆转时",
        risk: "不能凭空制造全知视角。",
      },
      sources: [{
        manuscriptId: "manuscript-1234567890abcdef",
        manuscriptTitle: "雨夜",
        filename: "雨夜.md",
        sha256: "a".repeat(64),
        genre: "修仙",
        chapterIds: ["chapter-1"],
        firstObservedAt: "2026-07-20T12:00:00.000Z",
        lastObservedAt: "2026-07-20T12:00:00.000Z",
      }],
      firstSeenAt: "2026-07-20T12:00:00.000Z",
      lastSeenAt: "2026-07-20T12:00:00.000Z",
    }];

    const restored = validateWorldLabDraft({ ...snapshot(), craftLibrary });
    expect(restored?.craftLibrary).toEqual(craftLibrary);
    expect(restored?.worlds).toEqual([]);
    expect(restored?.manuscripts).toEqual([]);
  });

  it("persists director library cards only when their non-canon boundary is explicit", () => {
    const trace = {
      traceId: "trace-library-test",
      provider: "company-router",
      model: "gpt-test",
      workflowVersion: "vnext.story-director-library.v1" as const,
      outputHash: "e".repeat(64),
    };
    const knowledgeCard = {
      id: "director-knowledge-test",
      storyId: "story-test",
      topic: "天罡地支",
      summary: "用于整理时间秩序与修行象征。",
      concepts: ["天干", "地支"],
      culturalContext: "传统历法与象数语境。",
      applicationToStory: "可作为果位与门规的分层索引。",
      sourceNote: "AI 知识整理，需人工核验。",
      caveats: ["不可把整理结果直接视为史实。"],
      status: "active" as const,
      createdAt: "2026-07-20T12:00:00.000Z",
      notCanon: true as const,
      notManuscript: true as const,
      trace,
    };
    expect(validateWorldLabDraft({ ...snapshot(), directorKnowledgeCards: [knowledgeCard] })?.directorKnowledgeCards).toEqual([knowledgeCard]);
    expect(validateWorldLabDraft({ ...snapshot(), directorKnowledgeCards: [{ ...knowledgeCard, notCanon: false }] })).toBeNull();
  });

  it.each([
    { apiKey: "should-never-persist" },
    { authorization: "Bearer should-never-persist" },
    { nested: { VNEXT_LOCAL_ROUTE_ADAPTER_TOKEN: "should-never-persist" } },
    { cookie: "should-never-persist" },
  ])("rejects credential-shaped fields: %o", (forbidden) => {
    expect(validateWorldLabDraft({ ...snapshot(), forbidden })).toBeNull();
  });
});
