import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { VnextAuthenticatedRequest } from "./vnext-session.guard.js";

export const VnextPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<VnextAuthenticatedRequest>().vnextPrincipal,
);
