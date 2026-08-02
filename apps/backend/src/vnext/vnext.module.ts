import { Logger, Module } from "@nestjs/common";
import { VnextConsentController } from "./api/vnext-consent.controller.js";
import { VnextExperienceController } from "./api/vnext-experience.controller.js";
import { VnextOriginGuard } from "./api/vnext-origin.guard.js";
import { VnextReadinessController } from "./api/vnext-readiness.controller.js";
import { VnextRestrictedSessionGuard } from "./api/vnext-restricted-session.guard.js";
import { VnextSafetyController } from "./api/vnext-safety.controller.js";
import { VnextSystemSupportController } from "./api/vnext-system-support.controller.js";
import { VnextModelProfileController } from "./api/vnext-model-profile.controller.js";
import { VnextWorldLabController, VnextWorldLabInternalTestGuard } from "./api/vnext-world-lab.controller.js";
import {
  InMemoryVnextSessionRateLimiter,
  VnextSessionController,
} from "./api/vnext-session.controller.js";
import { VnextSessionGuard } from "./api/vnext-session.guard.js";
import { AppealSafetyDecision } from "./application/appeal-safety-decision.js";
import { AcknowledgeContinuousUseReceipt } from "./application/acknowledge-continuous-use-receipt.js";
import { CancelSessionCreativeTasks } from "./application/cancel-session-creative-tasks.js";
import { CheckInputSafety } from "./application/check-input-safety.js";
import { CheckOutputSafety } from "./application/check-output-safety.js";
import { CorrectUnderstanding } from "./application/correct-understanding.js";
import {
  CreateGuestSession,
  readVnextSessionAdmissionPolicy,
  VNEXT_SESSION_POLICY,
} from "./application/create-guest-session.js";
import { EvaluateContinuousUseReminder } from "./application/evaluate-continuous-use-reminder.js";
import {
  ConfiguredProcessingBasisControlAuthority,
  ExpireProcessingBasis,
  VNEXT_PROCESSING_BASIS_CONTROL_AUTHORITY,
  type ProcessingBasisControlAuthority,
} from "./application/expire-processing-basis.js";
import { HandleSafetyCase } from "./application/handle-safety-case.js";
import { ListOwnedConsents } from "./application/list-owned-consents.js";
import { ListOwnedSafetyCases } from "./application/list-owned-safety-cases.js";
import { ReadExperienceDraft } from "./application/read-experience-draft.js";
import { ReadVnextReadiness } from "./application/read-vnext-readiness.js";
import { ResolveActiveSession } from "./application/resolve-active-session.js";
import { ResolveRestrictedSession } from "./application/resolve-restricted-session.js";
import { ReadExperienceProjection } from "./application/read-experience-projection.js";
import { RetryCurrentTask } from "./application/retry-current-task.js";
import { SubmitSourceMessage } from "./application/submit-source-message.js";
import {
  NoRegisteredSystemSupportLifeOpportunityPort,
  SystemSupportApplication,
} from "./application/system-support.js";
import { WithdrawConsent } from "./application/withdraw-consent.js";
import { ModelProfileSelectionService } from "./application/model-profile-selection.js";
import {
  VNEXT_COMPLIANCE_RECOVERY_REPOSITORY,
  type ComplianceRecoveryRepository,
  type ComplianceReadinessRepository,
  type ProcessingBasisControlRepository,
} from "./domain/compliance-readiness.js";
import {
  VNEXT_CORRECTION_ADMISSION_UOW,
  type VnextCorrectionAdmissionUow,
} from "./domain/correction-admission.uow.js";
import {
  VNEXT_EXPERIENCE_DRAFT_READER,
  type VnextExperienceDraftReader,
} from "./domain/experience-draft.reader.js";
import {
  VNEXT_EXPERIENCE_PROJECTION_READER,
  type VnextExperienceProjectionReader,
} from "./domain/experience-projection.reader.js";
import {
  VNEXT_EXPERIENCE_SUBMISSION_UOW,
  type VnextExperienceSubmissionUow,
} from "./domain/experience-submission.uow.js";
import {
  VNEXT_EXPERIENCE_RETRY_UOW,
  type VnextExperienceRetryUow,
} from "./domain/experience-retry.uow.js";
import {
  VNEXT_SAFETY_DISPOSITION_UOW,
  type SafetyDispositionUnitOfWork,
} from "./domain/safety-disposition.uow.js";
import {
  VNEXT_SAFETY_APPEAL_SEALER,
  type SafetyAppealSealer,
} from "./domain/safety-appeal-sealer.port.js";
import {
  SafetyPolicyUnavailableError,
  VNEXT_SAFETY_POLICY,
  type SafetyPolicyEvaluationInput,
  type SafetyPolicyPort,
} from "./domain/safety-policy.port.js";
import {
  VNEXT_CLOCK,
  VNEXT_SESSION_AUDIT,
  VNEXT_SESSION_RATE_LIMITER,
  VNEXT_SESSION_REPOSITORY,
  type VnextClock,
  type VnextSessionAuditEvent,
  type VnextSessionAuditPort,
} from "./domain/vnext-session.repository.js";
import {
  VNEXT_MODEL_PREFERENCE_REPOSITORY,
  type VnextModelPreferenceRepository,
} from "./domain/model-preference.repository.js";
import { VNEXT_MODEL_RUNTIME_ADMISSION } from "./domain/model-runtime-admission.port.js";
import {
  VNEXT_SOURCE_MESSAGE_REPOSITORY,
  VNEXT_STORY_TRUTH_AUDIT,
  type VnextStoryTruthAuditEvent,
  type VnextStoryTruthAuditPort,
} from "./domain/source-message.js";
import {
  VNEXT_SYNTHETIC_FIXTURE_AUTHORIZER,
  type SyntheticFixtureAuthorizer,
} from "./domain/synthetic-fixture.js";
import {
  VNEXT_SYSTEM_SUPPORT_LIFE_OPPORTUNITY_PORT,
  VNEXT_SYSTEM_SUPPORT_UOW,
  type SystemSupportLifeOpportunityPort,
  type SystemSupportUnitOfWork,
} from "./domain/system-support.uow.js";
import {
  VNEXT_COMMISSION_BRIEF_REPOSITORY,
  VNEXT_READER_MEMORY_REPOSITORY,
  VNEXT_STORY_WORKSPACE_REPOSITORY,
  VNEXT_UNDERSTANDING_REPOSITORY,
} from "./domain/understanding-draft.js";
import {
  VNEXT_READINESS_PORT,
  type VnextReadinessPort,
} from "./domain/vnext-readiness.port.js";
import { PrismaCommissionBriefRepository } from "./infrastructure/prisma-commission-brief.repository.js";
import {
  ConfiguredSyntheticFixtureAuthorizer,
  readConfiguredSyntheticFixtureCatalog,
} from "./infrastructure/configured-synthetic-fixture.authorizer.js";
import { ConfiguredSafetyAppealSealer } from "./infrastructure/configured-safety-appeal-sealer.js";
import {
  ComplianceRecoveryRepositoryFacade,
  ProcessingBasisControlRepositoryFacade,
} from "./infrastructure/compliance-repository.facades.js";
import { PrismaComplianceRepository } from "./infrastructure/prisma-compliance.repository.js";
import { PrismaCorrectionAdmissionUow } from "./infrastructure/prisma-correction-admission.uow.js";
import { PrismaExperienceDraftReader } from "./infrastructure/prisma-experience-draft.reader.js";
import { PrismaExperienceProjectionReader } from "./infrastructure/prisma-experience-projection.reader.js";
import { PrismaExperienceRetryUow } from "./infrastructure/prisma-experience-retry.uow.js";
import { PrismaExperienceSubmissionUow } from "./infrastructure/prisma-experience-submission.uow.js";
import { PrismaReaderMemoryRepository } from "./infrastructure/prisma-reader-memory.repository.js";
import { PrismaSafetyDispositionUow } from "./infrastructure/prisma-safety-disposition.uow.js";
import { PrismaSafetyOutboxRepository } from "./infrastructure/prisma-safety-outbox.repository.js";
import { PrismaSourceMessageRepository } from "./infrastructure/prisma-source-message.repository.js";
import { PrismaStoryWorkspaceRepository } from "./infrastructure/prisma-story-workspace.repository.js";
import { PrismaSystemSupportUow } from "./infrastructure/prisma-system-support.uow.js";
import { PrismaModelPreferenceRepository } from "./infrastructure/prisma-model-preference.repository.js";
import { readConfiguredModelProfileCatalog } from "./infrastructure/configured-model-profile-catalog.js";
import { createConfiguredModelRuntimeAdmission } from "./infrastructure/configured-model-runtime-admission.js";
import { PrismaUnderstandingRepository } from "./infrastructure/prisma-understanding.repository.js";
import {
  PrismaVnextSessionRepository,
  readContinuousUseIdleResetPolicy,
  VnextPrismaService,
} from "./infrastructure/prisma-vnext-session.repository.js";
import { SessionCookieService } from "./infrastructure/session-cookie.js";
import {
  readSyntheticSandboxSafetyPolicyConfig,
  SyntheticSandboxSafetyPolicy,
} from "./infrastructure/synthetic-sandbox-safety-policy.js";
import { ConfiguredImageGenerationJobService } from "./infrastructure/configured-image-generation-job.service.js";

class SystemVnextClock implements VnextClock {
  now() {
    return new Date();
  }
}

class VnextSessionAuditLogger implements VnextSessionAuditPort {
  private readonly logger = new Logger("VnextSessionAudit");

  record(event: VnextSessionAuditEvent) {
    this.logger.log(JSON.stringify(event));
  }
}

class VnextStoryTruthAuditLogger implements VnextStoryTruthAuditPort {
  private readonly logger = new Logger("VnextStoryTruthAudit");

  record(event: VnextStoryTruthAuditEvent) {
    this.logger.log(JSON.stringify(event));
  }
}

class UnavailableVnextSafetyPolicy implements SafetyPolicyPort {
  async evaluate(_input: SafetyPolicyEvaluationInput): Promise<never> {
    throw new SafetyPolicyUnavailableError();
  }
}

function configuredHttpSafetyPolicy(): SafetyPolicyPort {
  try {
    return new SyntheticSandboxSafetyPolicy(
      readSyntheticSandboxSafetyPolicyConfig(),
    );
  } catch {
    return new UnavailableVnextSafetyPolicy();
  }
}

function configuredPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : 0;
}

const VNEXT_PRIVATE_COMPLIANCE_STORE = Symbol(
  "VNEXT_PRIVATE_COMPLIANCE_STORE",
);
const VNEXT_PRIVATE_PROCESSING_BASIS_REPOSITORY = Symbol(
  "VNEXT_PRIVATE_PROCESSING_BASIS_REPOSITORY",
);

@Module({
  controllers: [
    VnextSessionController,
    VnextExperienceController,
    VnextConsentController,
    VnextSafetyController,
    VnextReadinessController,
    VnextWorldLabController,
    VnextSystemSupportController,
    VnextModelProfileController,
  ],
  providers: [
    VnextPrismaService,
    SessionCookieService,
    VnextOriginGuard,
    VnextSessionGuard,
    VnextRestrictedSessionGuard,
    VnextWorldLabInternalTestGuard,
    {
      provide: ConfiguredImageGenerationJobService,
      useFactory: () => new ConfiguredImageGenerationJobService(),
    },
    {
      provide: VNEXT_SESSION_POLICY,
      useFactory: () => readVnextSessionAdmissionPolicy(),
    },
    {
      provide: VNEXT_CLOCK,
      useClass: SystemVnextClock,
    },
    {
      provide: VNEXT_SESSION_AUDIT,
      useClass: VnextSessionAuditLogger,
    },
    {
      provide: VNEXT_STORY_TRUTH_AUDIT,
      useClass: VnextStoryTruthAuditLogger,
    },
    {
      provide: VNEXT_SESSION_RATE_LIMITER,
      useFactory: () =>
        new InMemoryVnextSessionRateLimiter(
          configuredPositiveInteger(process.env.VNEXT_SESSION_RATE_LIMIT_MAX, 20, 1_000),
          configuredPositiveInteger(
            process.env.VNEXT_SESSION_RATE_LIMIT_WINDOW_MS,
            60_000,
            3_600_000,
          ),
        ),
    },
    {
      provide: VNEXT_SESSION_REPOSITORY,
      useFactory: (client: VnextPrismaService) =>
        new PrismaVnextSessionRepository(
          client,
          undefined,
          readContinuousUseIdleResetPolicy().idleResetMs,
        ),
      inject: [VnextPrismaService],
    },
    {
      provide: VNEXT_SOURCE_MESSAGE_REPOSITORY,
      useFactory: (
        client: VnextPrismaService,
        audit: VnextStoryTruthAuditPort,
      ) => new PrismaSourceMessageRepository(client, audit),
      inject: [VnextPrismaService, VNEXT_STORY_TRUTH_AUDIT],
    },
    {
      provide: VNEXT_UNDERSTANDING_REPOSITORY,
      useFactory: (
        client: VnextPrismaService,
        audit: VnextStoryTruthAuditPort,
      ) => new PrismaUnderstandingRepository(client, undefined, audit),
      inject: [VnextPrismaService, VNEXT_STORY_TRUTH_AUDIT],
    },
    {
      provide: VNEXT_STORY_WORKSPACE_REPOSITORY,
      useFactory: (client: VnextPrismaService) =>
        new PrismaStoryWorkspaceRepository(client),
      inject: [VnextPrismaService],
    },
    {
      provide: VNEXT_COMMISSION_BRIEF_REPOSITORY,
      useFactory: (client: VnextPrismaService) =>
        new PrismaCommissionBriefRepository(client),
      inject: [VnextPrismaService],
    },
    {
      provide: VNEXT_READER_MEMORY_REPOSITORY,
      useFactory: (client: VnextPrismaService) =>
        new PrismaReaderMemoryRepository(client),
      inject: [VnextPrismaService],
    },
    {
      provide: VNEXT_PRIVATE_COMPLIANCE_STORE,
      useFactory: (client: VnextPrismaService) =>
        new PrismaComplianceRepository(client),
      inject: [VnextPrismaService],
    },
    {
      provide: VNEXT_COMPLIANCE_RECOVERY_REPOSITORY,
      useFactory: (store: ComplianceReadinessRepository) =>
        new ComplianceRecoveryRepositoryFacade(store),
      inject: [VNEXT_PRIVATE_COMPLIANCE_STORE],
    },
    {
      provide: VNEXT_PRIVATE_PROCESSING_BASIS_REPOSITORY,
      useFactory: (store: ComplianceReadinessRepository) =>
        new ProcessingBasisControlRepositoryFacade(store),
      inject: [VNEXT_PRIVATE_COMPLIANCE_STORE],
    },
    {
      provide: VNEXT_SAFETY_DISPOSITION_UOW,
      useFactory: (client: VnextPrismaService, clock: VnextClock) =>
        new PrismaSafetyDispositionUow(client, undefined, () => clock.now()),
      inject: [VnextPrismaService, VNEXT_CLOCK],
    },
    {
      provide: VNEXT_SAFETY_POLICY,
      useFactory: () => configuredHttpSafetyPolicy(),
    },
    {
      provide: VNEXT_SYNTHETIC_FIXTURE_AUTHORIZER,
      useFactory: () =>
        new ConfiguredSyntheticFixtureAuthorizer(
          readConfiguredSyntheticFixtureCatalog(),
        ),
    },
    {
      provide: VNEXT_READINESS_PORT,
      useFactory: (client: VnextPrismaService) =>
        new PrismaSafetyOutboxRepository(client),
      inject: [VnextPrismaService],
    },
    {
      provide: VNEXT_EXPERIENCE_SUBMISSION_UOW,
      useFactory: (client: VnextPrismaService, clock: VnextClock) =>
        new PrismaExperienceSubmissionUow(client, undefined, () => clock.now()),
      inject: [VnextPrismaService, VNEXT_CLOCK],
    },
    {
      provide: VNEXT_CORRECTION_ADMISSION_UOW,
      useFactory: (client: VnextPrismaService, clock: VnextClock) =>
        new PrismaCorrectionAdmissionUow(
          client,
          undefined,
          () => clock.now(),
        ),
      inject: [VnextPrismaService, VNEXT_CLOCK],
    },
    {
      provide: VNEXT_EXPERIENCE_RETRY_UOW,
      useFactory: (client: VnextPrismaService, clock: VnextClock) =>
        new PrismaExperienceRetryUow(client, undefined, () => clock.now()),
      inject: [VnextPrismaService, VNEXT_CLOCK],
    },
    {
      provide: VNEXT_EXPERIENCE_DRAFT_READER,
      useFactory: (client: VnextPrismaService, clock: VnextClock) =>
        new PrismaExperienceDraftReader(client, () => clock.now()),
      inject: [VnextPrismaService, VNEXT_CLOCK],
    },
    {
      provide: VNEXT_EXPERIENCE_PROJECTION_READER,
      useFactory: (client: VnextPrismaService, clock: VnextClock) =>
        new PrismaExperienceProjectionReader(client, () => clock.now()),
      inject: [VnextPrismaService, VNEXT_CLOCK],
    },
    {
      provide: VNEXT_MODEL_PREFERENCE_REPOSITORY,
      useFactory: (client: VnextPrismaService) =>
        new PrismaModelPreferenceRepository(client),
      inject: [VnextPrismaService],
    },
    {
      provide: ModelProfileSelectionService,
      useFactory: (repository: VnextModelPreferenceRepository) =>
        new ModelProfileSelectionService(
          repository,
          readConfiguredModelProfileCatalog(),
        ),
      inject: [VNEXT_MODEL_PREFERENCE_REPOSITORY],
    },
    {
      provide: VNEXT_MODEL_RUNTIME_ADMISSION,
      useFactory: () => createConfiguredModelRuntimeAdmission(),
    },
    {
      provide: VNEXT_SYSTEM_SUPPORT_UOW,
      useFactory: (client: VnextPrismaService, clock: VnextClock) =>
        new PrismaSystemSupportUow(client, undefined, () => clock.now()),
      inject: [VnextPrismaService, VNEXT_CLOCK],
    },
    {
      provide: VNEXT_SYSTEM_SUPPORT_LIFE_OPPORTUNITY_PORT,
      useClass: NoRegisteredSystemSupportLifeOpportunityPort,
    },
    {
      provide: SystemSupportApplication,
      useFactory: (
        uow: SystemSupportUnitOfWork,
        opportunities: SystemSupportLifeOpportunityPort,
      ) => new SystemSupportApplication(uow, opportunities),
      inject: [
        VNEXT_SYSTEM_SUPPORT_UOW,
        VNEXT_SYSTEM_SUPPORT_LIFE_OPPORTUNITY_PORT,
      ],
    },
    {
      provide: ReadExperienceDraft,
      useFactory: (reader: VnextExperienceDraftReader) =>
        new ReadExperienceDraft(reader),
      inject: [VNEXT_EXPERIENCE_DRAFT_READER],
    },
    {
      provide: ReadExperienceProjection,
      useFactory: (
        reader: VnextExperienceProjectionReader,
        readiness: ReadVnextReadiness,
      ) => new ReadExperienceProjection(reader, readiness),
      inject: [VNEXT_EXPERIENCE_PROJECTION_READER, ReadVnextReadiness],
    },
    {
      provide: HandleSafetyCase,
      useFactory: (uow: SafetyDispositionUnitOfWork) =>
        new HandleSafetyCase(uow),
      inject: [VNEXT_SAFETY_DISPOSITION_UOW],
    },
    {
      provide: CheckInputSafety,
      useFactory: (policy: SafetyPolicyPort, cases: HandleSafetyCase) =>
        new CheckInputSafety(policy, cases),
      inject: [VNEXT_SAFETY_POLICY, HandleSafetyCase],
    },
    {
      provide: CheckOutputSafety,
      useFactory: (policy: SafetyPolicyPort, cases: HandleSafetyCase) =>
        new CheckOutputSafety(policy, cases),
      inject: [VNEXT_SAFETY_POLICY, HandleSafetyCase],
    },
    {
      provide: SubmitSourceMessage,
      useFactory: (
        uow: VnextExperienceSubmissionUow,
        currentProjection: ReadExperienceProjection,
        inputSafety: CheckInputSafety,
        syntheticFixtures: SyntheticFixtureAuthorizer,
      ) =>
        new SubmitSourceMessage(
          uow,
          currentProjection,
          inputSafety,
          syntheticFixtures,
        ),
      inject: [
        VNEXT_EXPERIENCE_SUBMISSION_UOW,
        ReadExperienceProjection,
        CheckInputSafety,
        VNEXT_SYNTHETIC_FIXTURE_AUTHORIZER,
      ],
    },
    {
      provide: CorrectUnderstanding,
      useFactory: (
        uow: VnextCorrectionAdmissionUow,
        currentProjection: ReadExperienceProjection,
        inputSafety: CheckInputSafety,
        syntheticFixtures: SyntheticFixtureAuthorizer,
      ) =>
        new CorrectUnderstanding(
          uow,
          currentProjection,
          inputSafety,
          syntheticFixtures,
        ),
      inject: [
        VNEXT_CORRECTION_ADMISSION_UOW,
        ReadExperienceProjection,
        CheckInputSafety,
        VNEXT_SYNTHETIC_FIXTURE_AUTHORIZER,
      ],
    },
    {
      provide: RetryCurrentTask,
      useFactory: (
        uow: VnextExperienceRetryUow,
        currentProjection: ReadExperienceProjection,
      ) => new RetryCurrentTask(uow, currentProjection),
      inject: [VNEXT_EXPERIENCE_RETRY_UOW, ReadExperienceProjection],
    },
    {
      provide: CreateGuestSession,
      useFactory: (
        repository: PrismaVnextSessionRepository,
        cookies: SessionCookieService,
        policy: ReturnType<typeof readVnextSessionAdmissionPolicy>,
        clock: VnextClock,
        audit: VnextSessionAuditPort,
      ) => new CreateGuestSession(repository, cookies, policy, clock, audit),
      inject: [
        VNEXT_SESSION_REPOSITORY,
        SessionCookieService,
        VNEXT_SESSION_POLICY,
        VNEXT_CLOCK,
        VNEXT_SESSION_AUDIT,
      ],
    },
    {
      provide: ResolveActiveSession,
      useFactory: (
        repository: PrismaVnextSessionRepository,
        cookies: SessionCookieService,
        policy: ReturnType<typeof readVnextSessionAdmissionPolicy>,
        clock: VnextClock,
        audit: VnextSessionAuditPort,
      ) => new ResolveActiveSession(repository, cookies, policy, clock, audit),
      inject: [
        VNEXT_SESSION_REPOSITORY,
        SessionCookieService,
        VNEXT_SESSION_POLICY,
        VNEXT_CLOCK,
        VNEXT_SESSION_AUDIT,
      ],
    },
    {
      provide: ResolveRestrictedSession,
      useFactory: (
        repository: PrismaVnextSessionRepository,
        cookies: SessionCookieService,
        policy: ReturnType<typeof readVnextSessionAdmissionPolicy>,
        clock: VnextClock,
        audit: VnextSessionAuditPort,
      ) =>
        new ResolveRestrictedSession(repository, cookies, policy, clock, audit),
      inject: [
        VNEXT_SESSION_REPOSITORY,
        SessionCookieService,
        VNEXT_SESSION_POLICY,
        VNEXT_CLOCK,
        VNEXT_SESSION_AUDIT,
      ],
    },
    {
      provide: WithdrawConsent,
      useFactory: (
        repository: ComplianceRecoveryRepository,
        clock: VnextClock,
      ) => new WithdrawConsent(repository, clock),
      inject: [VNEXT_COMPLIANCE_RECOVERY_REPOSITORY, VNEXT_CLOCK],
    },
    {
      provide: ListOwnedConsents,
      useFactory: (repository: ComplianceRecoveryRepository) =>
        new ListOwnedConsents(repository),
      inject: [VNEXT_COMPLIANCE_RECOVERY_REPOSITORY],
    },
    {
      provide: ListOwnedSafetyCases,
      useFactory: (repository: ComplianceRecoveryRepository) =>
        new ListOwnedSafetyCases(repository),
      inject: [VNEXT_COMPLIANCE_RECOVERY_REPOSITORY],
    },
    {
      provide: VNEXT_PROCESSING_BASIS_CONTROL_AUTHORITY,
      useFactory: () => new ConfiguredProcessingBasisControlAuthority(),
    },
    {
      provide: ExpireProcessingBasis,
      useFactory: (
        repository: ProcessingBasisControlRepository,
        clock: VnextClock,
        controlAuthority: ProcessingBasisControlAuthority,
      ) => new ExpireProcessingBasis(repository, clock, controlAuthority),
      inject: [
        VNEXT_PRIVATE_PROCESSING_BASIS_REPOSITORY,
        VNEXT_CLOCK,
        VNEXT_PROCESSING_BASIS_CONTROL_AUTHORITY,
      ],
    },
    {
      provide: EvaluateContinuousUseReminder,
      useFactory: (
        repository: ComplianceRecoveryRepository,
        clock: VnextClock,
      ) => new EvaluateContinuousUseReminder(repository, clock),
      inject: [VNEXT_COMPLIANCE_RECOVERY_REPOSITORY, VNEXT_CLOCK],
    },
    {
      provide: AcknowledgeContinuousUseReceipt,
      useFactory: (
        repository: ComplianceRecoveryRepository,
        clock: VnextClock,
      ) => new AcknowledgeContinuousUseReceipt(repository, clock),
      inject: [VNEXT_COMPLIANCE_RECOVERY_REPOSITORY, VNEXT_CLOCK],
    },
    {
      provide: CancelSessionCreativeTasks,
      useFactory: (
        repository: ComplianceRecoveryRepository,
        clock: VnextClock,
      ) => new CancelSessionCreativeTasks(repository, clock),
      inject: [VNEXT_COMPLIANCE_RECOVERY_REPOSITORY, VNEXT_CLOCK],
    },
    {
      provide: VNEXT_SAFETY_APPEAL_SEALER,
      useFactory: () => new ConfiguredSafetyAppealSealer(),
    },
    {
      provide: AppealSafetyDecision,
      useFactory: (
        repository: ComplianceRecoveryRepository,
        clock: VnextClock,
        sealer: SafetyAppealSealer,
      ) => new AppealSafetyDecision(repository, clock, sealer),
      inject: [
        VNEXT_COMPLIANCE_RECOVERY_REPOSITORY,
        VNEXT_CLOCK,
        VNEXT_SAFETY_APPEAL_SEALER,
      ],
    },
    {
      provide: ReadVnextReadiness,
      useFactory: (port: VnextReadinessPort) => new ReadVnextReadiness(port),
      inject: [VNEXT_READINESS_PORT],
    },
  ],
  exports: [
    CreateGuestSession,
    ResolveActiveSession,
    ResolveRestrictedSession,
    SessionCookieService,
    VnextOriginGuard,
    VnextSessionGuard,
    VnextRestrictedSessionGuard,
    VNEXT_SESSION_REPOSITORY,
    ModelProfileSelectionService,
    VNEXT_MODEL_RUNTIME_ADMISSION,
    VNEXT_SESSION_POLICY,
    VNEXT_CLOCK,
    VNEXT_SESSION_AUDIT,
    VNEXT_SESSION_RATE_LIMITER,
    VNEXT_SOURCE_MESSAGE_REPOSITORY,
    VNEXT_UNDERSTANDING_REPOSITORY,
    VNEXT_STORY_WORKSPACE_REPOSITORY,
    VNEXT_COMMISSION_BRIEF_REPOSITORY,
    VNEXT_READER_MEMORY_REPOSITORY,
    VNEXT_EXPERIENCE_SUBMISSION_UOW,
    VNEXT_CORRECTION_ADMISSION_UOW,
    VNEXT_EXPERIENCE_RETRY_UOW,
    VNEXT_EXPERIENCE_DRAFT_READER,
    VNEXT_EXPERIENCE_PROJECTION_READER,
    VNEXT_COMPLIANCE_RECOVERY_REPOSITORY,
    VNEXT_SAFETY_DISPOSITION_UOW,
    VNEXT_SAFETY_POLICY,
    VNEXT_SYNTHETIC_FIXTURE_AUTHORIZER,
    VNEXT_READINESS_PORT,
    VNEXT_SYSTEM_SUPPORT_UOW,
    VNEXT_SYSTEM_SUPPORT_LIFE_OPPORTUNITY_PORT,
    CorrectUnderstanding,
    SubmitSourceMessage,
    RetryCurrentTask,
    ReadExperienceDraft,
    ReadExperienceProjection,
    WithdrawConsent,
    ListOwnedConsents,
    ListOwnedSafetyCases,
    EvaluateContinuousUseReminder,
    AcknowledgeContinuousUseReceipt,
    CancelSessionCreativeTasks,
    AppealSafetyDecision,
    HandleSafetyCase,
    CheckInputSafety,
    CheckOutputSafety,
    ReadVnextReadiness,
    SystemSupportApplication,
    VNEXT_STORY_TRUTH_AUDIT,
  ],
})
export class VnextModule {}

export { VNEXT_SESSION_POLICY } from "./application/create-guest-session.js";
