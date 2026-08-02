import { Module } from "@nestjs/common";
import { AssetIngestionController } from "./modules/asset-ingestion/asset-ingestion.controller.js";
import { BetaAccessController } from "./modules/beta-access/beta-access.controller.js";
import { BetaOpsController } from "./modules/beta-ops/beta-ops.controller.js";
import { BranchServiceController } from "./modules/branch-service/branch-service.controller.js";
import { ChannelIngressController } from "./modules/channel-ingress/channel-ingress.controller.js";
import { CanonServiceController } from "./modules/canon-service/canon-service.controller.js";
import { ChapterRuntimeController } from "./modules/chapter-runtime/chapter-runtime.controller.js";
import { ChapterRevisionController } from "./modules/chapter-runtime/revision/chapter-revision.controller.js";
import { ChatRouterController } from "./modules/chat-router/chat-router.controller.js";
import { NovelistChatService } from "./modules/novelist-chat/novelist-chat.service.js";
import { RoomMessageRouter } from "./modules/novelist-chat/room-message-router.js";
import { VnextRoomMessageController } from "./modules/novelist-chat/vnext-room-message.controller.js";
import { ContextComposerController } from "./modules/context-composer/context-composer.controller.js";
import { OnboardingProfileController } from "./modules/onboarding-profile/onboarding.controller.js";
import { OpsConsoleController } from "./modules/ops-console/ops-console.controller.js";
import { SessionExchangeController } from "./modules/identity/session-exchange.controller.js";
import { IdentityMembershipController } from "./modules/identity-membership/identity-membership.controller.js";
import { HealthController } from "./modules/health/health.controller.js";
import { IntentCorrectionController } from "./modules/intent-audit/correction/intent-correction.controller.js";
import { RoomProjectionController } from "./modules/room-projection/room-projection.controller.js";
import { RightsExportController } from "./modules/rights-export/rights-export.controller.js";
import { TelemetryIntakeController } from "./modules/telemetry-intake/telemetry-intake.controller.js";
import { StoryIntakeController } from "./modules/story-intake/story-intake.controller.js";
import { StoryCenterController } from "./modules/story-center/story-center.controller.js";
import { ReportingCaseController } from "./modules/governance-compliance/reporting-case.controller.js";
import { VnextModule } from "./vnext/vnext.module.js";

@Module({
  imports: [VnextModule],
  controllers: [
    AssetIngestionController,
    BetaAccessController,
    BetaOpsController,
    BranchServiceController,
    ChannelIngressController,
    CanonServiceController,
    HealthController,
    SessionExchangeController,
    IdentityMembershipController,
    OnboardingProfileController,
    OpsConsoleController,
    ChatRouterController,
    VnextRoomMessageController,
    ContextComposerController,
    IntentCorrectionController,
    RoomProjectionController,
    RightsExportController,
    TelemetryIntakeController,
    StoryIntakeController,
    StoryCenterController,
    ChapterRuntimeController,
    ChapterRevisionController,
    ReportingCaseController,
  ],
  providers: [NovelistChatService, RoomMessageRouter],
})
export class AppModule {}
