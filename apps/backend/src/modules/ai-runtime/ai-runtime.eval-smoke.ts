import path from "node:path";
import { writeAiRuntimeEvalSmokeBundleFile } from "./ai-runtime-observability.service.js";

function resolveSuiteId() {
  const flagIndex = process.argv.findIndex((item) => item === "--suite");
  const suite = flagIndex >= 0 ? process.argv[flagIndex + 1] : null;
  return suite === "creative-golden" ? "creative-golden" : "runtime-smoke";
}

function resolveOutputPath() {
  const suite = resolveSuiteId();
  const flagIndex = process.argv.findIndex((item) => item === "--out");
  const flagged = flagIndex >= 0 ? process.argv[flagIndex + 1] : null;
  const configured = flagged ?? process.env.AI_RUNTIME_EVAL_OUTPUT;

  return configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(
        process.cwd(),
        suite === "creative-golden"
          ? "../../infra/creative-golden-eval-smoke.json"
          : "../../infra/ai-runtime-eval-smoke.json",
      );
}

const suite = resolveSuiteId();
const output_path = resolveOutputPath();
const result = writeAiRuntimeEvalSmokeBundleFile(output_path, {
  env: process.env,
  suite,
  prompt_id: suite === "creative-golden" ? "creative-quality-golden" : "story-proposal-generate",
  task_key: suite === "creative-golden" ? "creative_quality_eval" : "story_proposal_generate",
  sample_seed_text:
    suite === "creative-golden"
      ? "创作质量 gate smoke：确认 creative-golden suite、budget、verdict plumbing 已可交给真实 provider/eval 继续执行。"
      : "想看一段慢热、潮湿、雨夜重逢的长篇。",
});

console.log(
  JSON.stringify(
    {
      suite_id: suite,
      output_path: result.output_path,
      route_keys: result.route_keys,
    },
    null,
    2,
  ),
);
