import { Controller, Get } from "@nestjs/common";
import { getTruthSourceHealthSnapshot } from "../../common/truth-source/truth-source.config.js";
import { getAiRuntimeHealthSnapshot } from "../ai-runtime/ai-runtime.config.js";

@Controller()
export class HealthController {
  @Get("healthz")
  getHealth() {
    return {
      data: {
        status: "ok",
        environment_key: process.env.OPS_ENVIRONMENT ?? process.env.APP_ENV ?? "local",
        runtime: getAiRuntimeHealthSnapshot(),
        truth_source: getTruthSourceHealthSnapshot(),
        timestamp: new Date().toISOString(),
      },
    };
  }
}
