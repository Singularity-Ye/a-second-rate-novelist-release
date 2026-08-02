import type { StoryProposalCandidate } from "../opencode-runtime/opencode-runtime.service.js";

const PROPOSAL_BLUEPRINTS = [
  {
    title: "雨夜列车",
    summary: "旧城夜班车上的重逢拉扯。",
    relationship: "旧识重逢",
    atmosphere: "潮湿、克制、暧昧",
  },
  {
    title: "玻璃海",
    summary: "海风里的失而复得。",
    relationship: "错过后的再靠近",
    atmosphere: "清冷、试探、余温未散",
  },
  {
    title: "倒带告白",
    summary: "在告白失败前一夜重写命运。",
    relationship: "从朋友边缘逼近恋人",
    atmosphere: "时差感、拉扯感、命运回弹",
  },
] as const;

export function buildFallbackStoryProposalCandidates(input: {
  seedText: string;
}): StoryProposalCandidate[] {
  return PROPOSAL_BLUEPRINTS.map((blueprint) => ({
    title: blueprint.title,
    summary: `${blueprint.summary} 基底感觉：${input.seedText}`,
    relationship: blueprint.relationship,
    atmosphere: blueprint.atmosphere,
  }));
}
