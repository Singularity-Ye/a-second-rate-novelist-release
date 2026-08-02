import type { OnboardingStepKey, ReaderProfileView } from "@erliu/shared-contracts";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createReaderProfileRepository } from "../../common/repositories/reader-profile.repository.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

const PROFILE_DIMENSIONS: OnboardingStepKey[] = [
  "reading_archive",
  "taste_archive",
  "boundaries",
  "collaboration_mode",
];

const CONVERSATION_CUES: Record<OnboardingStepKey, string> = {
  reading_archive: "默认私密。我想先知道，哪本书、哪个作者，或者哪段故事最容易把你留下来？",
  taste_archive: "如果我真要替你写，会更该靠近哪种关系、节奏、情绪和结尾？",
  boundaries: "那我也先替你把边界守住：有没有你一看到就会出戏的题材、桥段或尺度？",
  collaboration_mode: "最后一个小问题。你更想安心追故事，还是愿意一起共创，在关键节点再来拍板？",
};

function getCapturedDimensions(answers: Partial<Record<OnboardingStepKey, string>>) {
  return PROFILE_DIMENSIONS.filter((dimension) => Boolean(answers[dimension]));
}

function getPendingDimensions(answers: Partial<Record<OnboardingStepKey, string>>) {
  return PROFILE_DIMENSIONS.filter((dimension) => !answers[dimension]);
}

function resolveConversationCue(answers: Partial<Record<OnboardingStepKey, string>>) {
  const nextDimension = getPendingDimensions(answers)[0] ?? null;
  return nextDimension ? CONVERSATION_CUES[nextDimension] : null;
}

function buildOnboardingAck(step_key: OnboardingStepKey, answer_text: string) {
  const answer = answer_text.trim();

  switch (step_key) {
    case "reading_archive":
      return `好，这条阅读来路我先记住了：${answer}`;
    case "taste_archive":
      return `我大概摸到你的口味线了：${answer}`;
    case "boundaries":
      return `这条边界我先替你守住：${answer}`;
    case "collaboration_mode":
      return `明白了，我们先按这种合作方式来：${answer}`;
  }
}

async function emitEvent(
  event_name: string,
  account_id: string,
  payload: Record<string, string | number | boolean | null>,
) {
  await recordDomainEvent({
    event_name,
    account_id,
    payload,
  });
}

async function findAccountByToken(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);

  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

function splitLines(answer: string) {
  return answer
    .split(/[，,。；;！!？?\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferCollaborationMode(answer: string): "read_only" | "co_create" | "director" {
  if (answer.includes("导演")) {
    return "director";
  }

  if (answer.includes("共创") || answer.includes("一起") || answer.includes("改")) {
    return "co_create";
  }

  return "read_only";
}

async function buildProfileProjection(account_id: string): Promise<ReaderProfileView> {
  const repository = createReaderProfileRepository();
  const { session, profile, created_session } = await repository.ensureProfileState(account_id);
  const captured_dimensions = getCapturedDimensions(session.answers);
  const pending_dimensions = getPendingDimensions(session.answers);

  if (created_session) {
    await emitEvent("onboarding_start", account_id, { entry_point: "chat", channel: "wechat" });
  }

  return {
    profile_id: profile.id,
    account_id,
    reading_archive: profile.reading_archive,
    taste_archive: profile.taste_archive,
    boundaries: profile.boundaries,
    collaboration_mode: profile.collaboration_mode,
    safety_mode: profile.safety_mode,
    profile_status: profile.profile_status,
    last_confirmed_at: profile.last_confirmed_at,
    completion_status: {
      state:
        profile.profile_status === "confirmed"
          ? "confirmed"
          : captured_dimensions.length === 0
            ? "collecting"
            : pending_dimensions.length > 0
              ? "resumable"
              : "confirm_pending",
      captured_dimensions,
      pending_dimensions,
      conversation_cue: resolveConversationCue(session.answers),
    },
  };
}

export async function collectOnboardingStep({
  account_token,
  step_key,
  answer_text,
}: {
  account_token: string;
  step_key?: OnboardingStepKey;
  answer_text: string;
}): Promise<{ ack_copy: string; profile: ReaderProfileView }> {
  const account = await findAccountByToken(account_token);
  const repository = createReaderProfileRepository();
  const { session, profile, created_session } = await repository.ensureProfileState(account.account_id);
  const target_dimension = step_key ?? getPendingDimensions(session.answers)[0];

  if (!target_dimension) {
    throw new Error("ONB-002 onboarding already captured");
  }

  session.answers[target_dimension] = answer_text.trim();
  session.updated_at = new Date().toISOString();
  session.status = getPendingDimensions(session.answers).length === 0 ? "confirm_pending" : "collecting";

  if (target_dimension === "reading_archive") {
    profile.reading_archive.favorite_books = [answer_text.trim()];
  }

  if (target_dimension === "taste_archive") {
    profile.taste_archive = {
      relationship_preference: [answer_text.trim()],
      pace: "slow-burn",
      emotion: "dense",
      ending: "bittersweet",
    };
  }

  if (target_dimension === "boundaries") {
    profile.boundaries.red_lines = splitLines(answer_text).slice(0, 10);
  }

  if (target_dimension === "collaboration_mode") {
    profile.collaboration_mode = inferCollaborationMode(answer_text);
  }

  profile.safety_mode = profile.boundaries.red_lines.some((item) => item.includes("未成年"))
    ? "minor_safe"
    : "default";
  profile.profile_status = session.status === "confirm_pending" ? "draft" : profile.profile_status;
  profile.version_no += 1;

  await repository.saveProfileState({
    profile,
    session,
  });

  if (created_session) {
    await emitEvent("onboarding_start", account.account_id, { entry_point: "chat", channel: "wechat" });
  }
  await emitEvent("onboarding_step_complete", account.account_id, {
    step_name: target_dimension,
    has_manual_edits: false,
  });

  const updated = await buildProfileProjection(account.account_id);

  if (updated.completion_status.state === "confirm_pending") {
    await emitEvent("onboarding_complete", account.account_id, {
      collaboration_mode: updated.collaboration_mode,
      safety_mode: updated.safety_mode,
    });
  }

  return {
    ack_copy: buildOnboardingAck(target_dimension, answer_text),
    profile: updated,
  };
}

export async function getReaderProfileByAccountToken(account_token: string): Promise<ReaderProfileView> {
  const account = await findAccountByToken(account_token);
  return buildProfileProjection(account.account_id);
}

export async function confirmReaderProfile({
  account_token,
}: {
  account_token: string;
}): Promise<ReaderProfileView> {
  const account = await findAccountByToken(account_token);
  const repository = createReaderProfileRepository();
  const profile = await repository.findProfileByAccountId(account.account_id);
  const session = await repository.findOnboardingSessionByAccountId(account.account_id);

  if (!profile || !session || getPendingDimensions(session.answers).length > 0) {
    throw new Error("ONB-001 onboarding steps incomplete");
  }

  profile.profile_status = "confirmed";
  profile.last_confirmed_at = new Date().toISOString();
  profile.version_no += 1;
  session.status = "confirmed";
  session.updated_at = new Date().toISOString();
  await repository.saveProfileState({
    profile,
    session,
  });

  await emitEvent("profile_confirmed", account.account_id, {
    favorite_books_count: profile.reading_archive.favorite_books.length,
    manual_edit_count: 0,
  });

  return buildProfileProjection(account.account_id);
}
