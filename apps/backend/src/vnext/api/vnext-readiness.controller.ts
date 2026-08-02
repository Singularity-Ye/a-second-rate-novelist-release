import {
  Controller,
  Get,
  HttpException,
  Inject,
  Res,
} from "@nestjs/common";
import { vnextReadinessResponseSchema } from "@erliu/shared-contracts/vnext-experience";
import { ReadVnextReadiness } from "../application/read-vnext-readiness.js";

interface ReadinessResponse {
  setHeader(name: string, value: string): void;
}

@Controller("vnext")
export class VnextReadinessController {
  constructor(
    @Inject(ReadVnextReadiness)
    private readonly readiness: ReadVnextReadiness,
  ) {}

  @Get("readyz")
  async read(@Res({ passthrough: true }) response: ReadinessResponse) {
    response.setHeader("Cache-Control", "no-store");
    const result = vnextReadinessResponseSchema.parse(
      await this.readiness.execute(),
    );
    if (result.status !== "ready") {
      throw new HttpException(result, 503);
    }
    return result;
  }
}
