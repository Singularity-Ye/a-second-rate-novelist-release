import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import { getTruthSourceHealthSnapshot } from "./truth-source.config.js";
import { disconnectPrismaClient } from "./prisma.client.js";
import { disconnectObjectStorageClient, getObjectStorageText } from "./object-storage.client.js";
import { disconnectRedisClient } from "./redis.client.js";
import {
  toAcceptedChapterObjectKey,
  toChapterDraftObjectKey,
  toChapterRevisionObjectKey,
} from "./creative-artifact.contract.js";
import { upsertShadowAccount } from "../../modules/identity/shadow-account-registry.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../../modules/story-intake/story-intake.service.js";
import {
  drainQueuedRuntimeTasks,
  getRuntimeTaskById,
  queueChapterGenerationTask,
} from "../../modules/runtime-tasks/runtime-tasks.service.js";
import { acceptChapter, createChapterRevision } from "../../modules/chapter-runtime/revision/chapter-revision.service.js";
import { getChapterById } from "../../modules/chapter-runtime/chapter-runtime.service.js";
import { composeContextBundle } from "../../modules/context-composer/context-composer.service.js";
import {
  createExportJob,
  createRiskCheck,
  getEvidencePackDownload,
  getExportArtifactDownload,
  getExportJobDetail,
} from "../../modules/rights-export/rights-export.service.js";

const RUNTIME_TASK_QUEUE_KEY = "story-runtime:chapter-generate";
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_INTERVAL_MS = 250;

type PrimaryPayload = {
  accounts: Array<{ account_token: string; account_id: string }>;
  storyWorkspaces: Array<{ id: string; title: string; current_chapter_id?: string | null }>;
  storyIntakeSessions: Array<{ id: string }>;
  storyProposals: Array<{ id: string; session_id: string }>;
  chapters: Array<{ id: string; story_id: string; body_text: string }>;
  chapterRevisions: Array<{ id: string; chapter_id: string; revised_text: string }>;
  contextBundles: Array<{ id: string; story_id: string }>;
  runtimeTasks: Array<{ id: string; story_id: string }>;
  exportJobs: Array<{ id: string; story_id: string; evidence_pack_id?: string | null }>;
  exportArtifacts: Array<{ id: string; export_job_id: string; object_key: string; file_body: string }>;
  evidencePacks: Array<{ id: string; story_id: string; object_key: string; download_body: string }>;
};

function ensureEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

function requireString(value: string | null, label: string): string {
  assert.equal(typeof value, "string", `${label} should resolve to string`);
  return value as string;
}

function resolveAppDataFile() {
  if (process.env.APP_DATA_FILE?.trim()) {
    return process.env.APP_DATA_FILE;
  }

  const smokeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../.tmp/tc-cdx-084");
  mkdirSync(smokeDir, { recursive: true });
  const appDataFile = path.join(smokeDir, "live-smoke-state.json");
  process.env.APP_DATA_FILE = appDataFile;
  return appDataFile;
}

function createS3Client() {
  return new S3Client({
    region: ensureEnv("AWS_REGION"),
    endpoint: ensureEnv("S3_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: ensureEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: ensureEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
}

async function ensureBucket(client: S3Client, bucket: string) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function waitFor<T>(
  label: string,
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
) {
  const startedAt = Date.now();
  let lastValue: T | null = null;
  let lastError: unknown = null;

  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    try {
      const value = await fn();
      lastValue = value;
      lastError = null;

      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }

  if (lastError instanceof Error) {
    throw new Error(`${label} timed out: ${lastError.message}`);
  }

  throw new Error(`${label} timed out. lastValue=${JSON.stringify(lastValue, null, 2)}`);
}

async function readPrimaryPayload(prisma: PrismaClient) {
  const snapshot = await prisma.appStateSnapshot.findUnique({
    where: {
      stateKey: "default",
    },
  });

  assert(snapshot, "missing primary app_state_snapshot row");
  return snapshot.payload as unknown as PrimaryPayload;
}

async function updatePrimaryPayload(
  prisma: PrismaClient,
  mutate: (payload: PrimaryPayload) => void,
) {
  const payload = structuredClone(await readPrimaryPayload(prisma));
  mutate(payload);

  await prisma.appStateSnapshot.update({
    where: {
      stateKey: "default",
    },
    data: {
      payload: payload as unknown as object,
      stateVersion: {
        increment: 1,
      },
    },
  });
}

async function main() {
  const appDataFile = resolveAppDataFile();
  const databaseUrl = ensureEnv("DATABASE_URL");
  const redisUrl = ensureEnv("REDIS_URL");
  const bucket = ensureEnv("S3_BUCKET");
  const s3Client = createS3Client();
  await ensureBucket(s3Client, bucket);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  const redis = createClient({
    url: redisUrl,
  });
  await redis.connect();

  const runId = `${Date.now()}`;
  const accountToken = `wx-openid-tc-cdx-084-${runId}`;
  const storyTitle = `TC-CDX-084 Smoke ${runId}`;
  const sessionRequestId = `req-tc-cdx-084-session-${runId}`;
  const proposalsRequestId = `req-tc-cdx-084-proposals-${runId}`;
  const acceptRequestId = `req-tc-cdx-084-accept-${runId}`;
  const chapterRequestId = `req-tc-cdx-084-chapter-${runId}`;
  const revisionRequestId = `req-tc-cdx-084-revision-${runId}`;
  const exportRequestId = `req-tc-cdx-084-export-${runId}`;

  try {
    const account = await upsertShadowAccount({
      account_token: accountToken,
      channel: "wechat",
      target_route: "/room",
    });

    const intakeSession = await createStoryIntakeSession({
      account_token: accountToken,
      entry_surface: "chat",
      intake_mode: "only_feeling",
      brief_payload: {
        seed_text: storyTitle,
      },
      client_request_id: sessionRequestId,
    });

    const generated = await generateStoryProposals(
      {
        session_id: intakeSession.session_id,
        client_request_id: proposalsRequestId,
      },
      {
        runtime: {
          env: {},
        },
      },
    );

    assert(generated.proposals.length >= 1, "story proposals were not generated");
    const selectedProposal = generated.proposals[0];
    assert(selectedProposal, "missing first generated proposal");

    const accepted = await acceptStoryProposal({
      proposal_id: selectedProposal.proposal_id,
      client_request_id: acceptRequestId,
      commission_adjustments: {
        tone_hint: "保持慢热、克制、拉扯。",
      },
      launch_first_chapter: false,
    });
    const acceptedTitle =
      typeof accepted.commission_brief.title === "string"
        ? accepted.commission_brief.title
        : accepted.story_id;

    const shadowAccount = await waitFor(
      "postgres shadow account",
      () =>
        prisma.account.findUnique({
          where: {
            accountToken,
          },
        }),
      (value) => Boolean(value),
    );
    const shadowWorkspace = await waitFor(
      "postgres shadow workspace",
      () =>
        prisma.storyWorkspace.findFirst({
          where: {
            title: acceptedTitle,
          },
        }),
      (value) => Boolean(value),
    );
    const shadowSession = await waitFor(
      "postgres shadow intake session",
      () =>
        prisma.storyIntakeSession.findUnique({
          where: {
            id: intakeSession.session_id,
          },
        }),
      (value) => Boolean(value),
    );
    const shadowProposalCount = await waitFor(
      "postgres shadow proposals",
      () =>
        prisma.storyProposal.count({
          where: {
            sessionId: intakeSession.session_id,
          },
        }),
      (value) => value >= generated.proposals.length,
    );

    const queued = await queueChapterGenerationTask({
      story_id: accepted.story_id,
      target: "first_chapter",
      client_request_id: chapterRequestId,
    });

    const queuedRedisPayload = await waitFor(
      "redis runtime queue payload",
      async () => {
        const values = await redis.lRange(RUNTIME_TASK_QUEUE_KEY, 0, -1);
        return values.find((value) => value.includes(queued.job_id)) ?? null;
      },
      (value) => Boolean(value),
    );

    await drainQueuedRuntimeTasks();

    const runtimeTask = await waitFor(
      "completed runtime task",
      () => getRuntimeTaskById(queued.job_id),
      (value) => value.status === "succeeded" && Boolean(value.result_chapter_id),
    );
    const chapterId = runtimeTask.result_chapter_id;
    assert(chapterId, "runtime task did not produce chapter id");

    const chapterDraftKey = toChapterDraftObjectKey(accepted.story_id, chapterId);
    const draftArtifactRaw = requireString(await waitFor(
      "chapter draft artifact",
      () =>
        getObjectStorageText({
          bucket,
          object_key: chapterDraftKey,
        }),
      (value) => typeof value === "string" && value.includes(chapterId),
    ), "chapter draft artifact");

    await acceptChapter({
      chapter_id: chapterId,
      client_request_id: `${chapterRequestId}-accept`,
    });

    const acceptedChapterKey = toAcceptedChapterObjectKey(accepted.story_id, chapterId);
    const acceptedArtifactRaw = requireString(await waitFor(
      "accepted chapter artifact",
      () =>
        getObjectStorageText({
          bucket,
          object_key: acceptedChapterKey,
        }),
      (value) => typeof value === "string" && value.includes("\"artifact_type\":\"accepted_chapter\""),
    ), "accepted chapter artifact");

    const revision = await createChapterRevision({
      chapter_id: chapterId,
      client_request_id: revisionRequestId,
      revision_kind: "light_edit",
      instruction_text: "把暧昧的拉扯写得更细一点。",
      anchor_range: {
        start_paragraph: 1,
        end_paragraph: 2,
      },
    });
    assert(revision.revision, "chapter revision was not created");
    const revisionKey = toChapterRevisionObjectKey(
      accepted.story_id,
      chapterId,
      revision.revision.revision_id,
    );
    const revisionArtifactRaw = requireString(await waitFor(
      "chapter revision artifact",
      () =>
        getObjectStorageText({
          bucket,
          object_key: revisionKey,
        }),
      (value) => typeof value === "string" && value.includes(revision.revision!.revision_id),
    ), "chapter revision artifact");

    const bundle = await composeContextBundle({
      story_id: accepted.story_id,
      task_type: "write",
      token_budget: 160,
    });
    const projectionKey = `projection-snapshots/stories/${accepted.story_id}/context-bundles/${bundle.bundle_id}.json`;
    const projectionArtifactRaw = requireString(await waitFor(
      "projection snapshot artifact",
      () =>
        getObjectStorageText({
          bucket,
          object_key: projectionKey,
        }),
      (value) => typeof value === "string" && value.includes(bundle.bundle_id),
    ), "projection snapshot artifact");

    const riskCheck = await createRiskCheck({
      story_id: accepted.story_id,
      export_purpose: "beta_review",
      branch_ids: [],
      asset_refs: [],
      label_mode_requested: "embedded_notice",
      include_submission_statement: true,
    });
    assert.equal(riskCheck.result, "pass");

    const exportJob = await createExportJob({
      story_id: accepted.story_id,
      export_purpose: "beta_review",
      formats: ["docx", "md"],
      chapter_range: {
        mode: "range",
        start_chapter_no: 1,
        end_chapter_no: 1,
      },
      branch_ids: [],
      include_evidence: true,
      include_rights_statement: true,
      label_mode_preference: "embedded_notice",
      risk_check_id: riskCheck.risk_check_id,
      client_request_id: exportRequestId,
    });
    assert.equal(exportJob.status, "succeeded");

    const exportDetail = await getExportJobDetail({
      story_id: accepted.story_id,
      job_id: exportJob.job_id,
    });
    assert.equal(exportDetail.artifacts.length, 2);
    assert(exportDetail.evidence_pack_id, "export job did not produce evidence pack");

    const artifactResults = await Promise.all(
      exportDetail.artifacts.map((artifact) =>
        waitFor(
          `export artifact ${artifact.artifact_id}`,
          () =>
            getObjectStorageText({
              bucket,
              object_key: `exports/${exportJob.job_id}/${artifact.format}`,
            }),
          (value) =>
            typeof value === "string" &&
            value.includes(`EXPORT FORMAT: ${artifact.format}`) &&
            value.includes(`TITLE: ${acceptedTitle}`),
        ).then((body) => ({
          artifact_id: artifact.artifact_id,
          object_key: `exports/${exportJob.job_id}/${artifact.format}`,
          body: requireString(body, `export artifact ${artifact.artifact_id}`),
        })),
      ),
    );

    const evidencePack = await getEvidencePackDownload({
      pack_id: exportDetail.evidence_pack_id,
    });
    const evidenceBody = requireString(await waitFor(
      "evidence pack artifact",
      () =>
        getObjectStorageText({
          bucket,
          object_key: evidencePack.object_key,
        }),
      (value) => typeof value === "string" && value.includes(exportJob.job_id),
    ), "evidence pack artifact");

    const initialPrimaryPayload = await waitFor(
      "primary app state snapshot",
      () => readPrimaryPayload(prisma),
      (value) =>
        value.accounts.some((item) => item.account_token === accountToken) &&
        value.storyWorkspaces.some((item) => item.id === accepted.story_id) &&
        value.runtimeTasks.some((item) => item.id === queued.job_id) &&
        value.exportJobs.some((item) => item.id === exportJob.job_id),
    );

    const chapterInPrimary = initialPrimaryPayload.chapters.find((item) => item.id === chapterId);
    assert(chapterInPrimary, "accepted chapter missing from primary app state");
    const exportArtifactInPrimary = initialPrimaryPayload.exportArtifacts.find(
      (item) => item.export_job_id === exportJob.job_id,
    );
    assert(exportArtifactInPrimary, "export artifact missing from primary app state");
    const evidencePackInPrimary = initialPrimaryPayload.evidencePacks.find((item) => item.id === exportDetail.evidence_pack_id);
    assert(evidencePackInPrimary, "evidence pack missing from primary app state");

    await updatePrimaryPayload(prisma, (payload) => {
      const chapter = payload.chapters.find((item) => item.id === chapterId);
      if (chapter) {
        chapter.body_text = "corrupted-postgres-primary-copy";
      }

      const artifact = payload.exportArtifacts.find((item) => item.id === exportArtifactInPrimary.id);
      if (artifact) {
        artifact.file_body = "corrupted-postgres-primary-export";
      }

      const pack = payload.evidencePacks.find((item) => item.id === evidencePackInPrimary.id);
      if (pack) {
        pack.download_body = "corrupted-postgres-primary-evidence";
      }
    });

    const chapterFromReadSide = await getChapterById(accepted.story_id, chapterId);
    assert.notEqual(chapterFromReadSide.body_text, "corrupted-postgres-primary-copy");
    assert.equal(chapterFromReadSide.body_text, JSON.parse(acceptedArtifactRaw).body_text);

    const exportArtifactDownload = await getExportArtifactDownload({
      artifact_id: exportArtifactInPrimary.id,
    });
    const exportArtifactObject = artifactResults.find((item) => item.artifact_id === exportArtifactInPrimary.id);
    assert(exportArtifactObject, "missing export artifact object storage proof");
    assert.notEqual(exportArtifactDownload.file_body, "corrupted-postgres-primary-export");
    assert.equal(exportArtifactDownload.file_body, exportArtifactObject.body);

    const evidencePackDownload = await getEvidencePackDownload({
      pack_id: evidencePackInPrimary.id,
    });
    assert.notEqual(evidencePackDownload.download_body, "corrupted-postgres-primary-evidence");
    assert.equal(evidencePackDownload.download_body, evidenceBody);

    const jsonState = JSON.parse(readFileSync(appDataFile, "utf8")) as Record<string, unknown>;
    assert(!JSON.stringify(jsonState).includes(accountToken), "JSON compatibility file should not receive account writes");
    assert(!JSON.stringify(jsonState).includes(accepted.story_id), "JSON compatibility file should not receive story writes");
    assert(!JSON.stringify(jsonState).includes(exportJob.job_id), "JSON compatibility file should not receive export writes");

    const health = getTruthSourceHealthSnapshot();
    assert.equal(health.requested_mode, "postgres_primary");
    assert.equal(health.active_driver_kind, "postgres_prisma");
    assert.equal(health.json_role, "seed_or_mock_only");
    assert.equal(health.slice_rollout.story_intake.mode, "primary");
    assert.equal(health.slice_rollout.runtime_tasks.mode, "primary");
    assert.equal(health.slice_rollout.creative_artifacts.mode, "primary");
    assert.equal(health.slice_rollout.export_artifacts.mode, "primary");
    assert.equal(health.slice_rollout.projection_snapshots.mode, "primary");

    const summary = {
      evidence_level: "runtime",
      app_data_file: appDataFile,
      account_id: account.account_id,
      story_id: accepted.story_id,
      intake_session_id: intakeSession.session_id,
      runtime_task_id: queued.job_id,
      runtime_queue_payload: queuedRedisPayload,
      chapter_id: chapterId,
      revision_id: revision.revision.revision_id,
      context_bundle_id: bundle.bundle_id,
      export_job_id: exportJob.job_id,
      evidence_pack_id: exportDetail.evidence_pack_id,
      postgres_shadow: {
        account_id: shadowAccount!.id,
        workspace_id: shadowWorkspace!.id,
        intake_session_id: shadowSession!.id,
        proposal_count: shadowProposalCount,
      },
      object_storage_keys: {
        chapter_draft: chapterDraftKey,
        accepted_chapter: acceptedChapterKey,
        chapter_revision: revisionKey,
        context_bundle: projectionKey,
        export_artifacts: artifactResults.map((item) => item.object_key),
        evidence_pack: evidencePack.object_key,
      },
      read_side_proof: {
        chapter_body_from_object_storage: chapterFromReadSide.body_text,
        export_artifact_from_object_storage: exportArtifactDownload.file_body.slice(0, 120),
        evidence_pack_from_object_storage: evidencePackDownload.download_body.slice(0, 120),
      },
      object_storage_samples: {
        chapter_draft: draftArtifactRaw.slice(0, 120),
        accepted_chapter: acceptedArtifactRaw.slice(0, 120),
        chapter_revision: revisionArtifactRaw.slice(0, 120),
        projection_snapshot: projectionArtifactRaw.slice(0, 120),
        export_artifacts: artifactResults.map((item) => ({
          object_key: item.object_key,
          sample: item.body.slice(0, 120),
        })),
        evidence_pack: evidenceBody.slice(0, 120),
      },
      truth_source_health: health,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await redis.quit().catch(() => undefined);
    await disconnectRedisClient().catch(() => undefined);
    disconnectObjectStorageClient();
    await prisma.$disconnect().catch(() => undefined);
    await disconnectPrismaClient().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
