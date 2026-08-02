import type {
  ArchiveIntentItem,
  ArchiveIntentListResponse,
  ArchiveIntentPatchDocument,
  IntentCorrectionRequest,
  IntentCorrectionResponse,
} from "@erliu/shared-contracts";
import { createAccountRepository } from "../../../common/repositories/account.repository.js";
import { createChatIntentRepository } from "../../../common/repositories/chat-intent.repository.js";
import { createReaderProfileRepository } from "../../../common/repositories/reader-profile.repository.js";
import { getReaderProfileByAccountToken } from "../../onboarding-profile/reader-profile-service.js";
import { recordDomainEvent } from "../../telemetry-intake/telemetry-intake.service.js";

function emitEvent(event_name: string, account_id: string, payload: Record<string, string | number | boolean | null>) {
  void recordDomainEvent({
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

export async function listArchiveIntents(account_token: string) {
  const account = await findAccountByToken(account_token);
  const items = (await createChatIntentRepository()
    .listMessageIntentsByAccount(account.account_id))
    .map((intent) => ({
      intent_id: intent.id,
      intent_envelope_id: intent.envelope_id,
      intent_type: intent.intent_type as ArchiveIntentItem["intent_type"],
      message_text: intent.message_text,
      ack_copy: intent.ack_copy,
      target_type: intent.target_type,
      target_id: intent.target_id,
      target_label: intent.target_label,
      target_object: intent.target_object,
      proposed_patch: intent.proposed_patch,
      confidence: {
        score: intent.confidence_score,
        band: intent.confidence_band,
      },
      route_hint: intent.route_hint,
      correction_state: intent.correction_state,
      status: intent.status,
      version_no: intent.version_no,
    }) satisfies ArchiveIntentItem);

  return {
    items,
    next_cursor: null,
  } satisfies ArchiveIntentListResponse;
}

function uniqueAppend(existing: string[], appended: string[]) {
  return Array.from(new Set([...existing, ...appended]));
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function correctArchiveIntent(input: IntentCorrectionRequest): Promise<IntentCorrectionResponse> {
  const chatIntentRepository = createChatIntentRepository();
  const accountRepository = createAccountRepository();
  const intent = await chatIntentRepository.findMessageIntentById(input.intent_id);

  if (!intent) {
    throw new Error(`Intent not found for id ${input.intent_id}`);
  }

  const patchDocument = input.patch_document as ArchiveIntentPatchDocument;
  const base_version =
    typeof patchDocument.base_version === "number" ? patchDocument.base_version : null;

  if (base_version !== null && base_version !== intent.version_no) {
    throw new Error("AUD-001 intent patch conflict");
  }

  const affected_objects: IntentCorrectionResponse["affected_objects"] = [];
  const account = await accountRepository.findAccountById(intent.account_id);

  if (!account) {
    throw new Error(`Account not found for intent ${input.intent_id}`);
  }

  if (input.new_target_type === "reader_profile") {
    await getReaderProfileByAccountToken(account.account_token);
    const profileRepository = createReaderProfileRepository();
    const ensured = await profileRepository.ensureProfileState(intent.account_id);
    const profile = ensured.profile;

    if (!profile) {
      throw new Error(`Profile not found for account ${intent.account_id}`);
    }

    const favoriteBooksAppend = toStringArray(
      patchDocument.reading_archive_patch?.favorite_books_append,
    );
    const relationshipPreferenceAppend = toStringArray(
      patchDocument.taste_archive_patch?.relationship_preference_append,
    );
    const redLinesAppend = toStringArray(
      patchDocument.boundaries_patch?.red_lines_append,
    );

    if (favoriteBooksAppend.length > 0) {
      profile.reading_archive.favorite_books = uniqueAppend(
        profile.reading_archive.favorite_books,
        favoriteBooksAppend,
      );
    }

    if (relationshipPreferenceAppend.length > 0) {
      profile.taste_archive.relationship_preference = uniqueAppend(
        profile.taste_archive.relationship_preference,
        relationshipPreferenceAppend,
      );
    }

    if (typeof patchDocument.taste_archive_patch?.pace === "string") {
      profile.taste_archive.pace = patchDocument.taste_archive_patch.pace;
    }

    if (typeof patchDocument.taste_archive_patch?.emotion === "string") {
      profile.taste_archive.emotion = patchDocument.taste_archive_patch.emotion;
    }

    if (typeof patchDocument.taste_archive_patch?.ending === "string") {
      profile.taste_archive.ending = patchDocument.taste_archive_patch.ending;
    }

    if (redLinesAppend.length > 0) {
      profile.boundaries.red_lines = uniqueAppend(profile.boundaries.red_lines, redLinesAppend);
    }

    if (typeof patchDocument.collaboration_mode === "string") {
      profile.collaboration_mode = patchDocument.collaboration_mode as typeof profile.collaboration_mode;
    }

    profile.profile_status = profile.profile_status === "confirmed" ? "evolving" : profile.profile_status;
    profile.version_no += 1;
    await profileRepository.saveProfileState({
      profile,
      session: ensured.session,
    });

    affected_objects.push({
      object_type: "reader_profile",
      object_id: profile.id,
    });
  }

  const latestIntent = await chatIntentRepository.findMessageIntentById(intent.id);

  if (!latestIntent) {
    throw new Error(`Intent not found for id ${intent.id}`);
  }

  latestIntent.target_type = input.new_target_type;
  latestIntent.target_id = input.new_target_id ?? null;
  latestIntent.target_label = input.new_target_type === "reader_profile" ? "读者档案" : latestIntent.target_label;
  latestIntent.target_object = {
    object_type: input.new_target_type === "reader_profile" ? "reader_profile" : latestIntent.target_object.object_type,
    object_id: affected_objects[0]?.object_id ?? input.new_target_id ?? null,
    object_label: input.new_target_type === "reader_profile" ? "读者档案" : latestIntent.target_object.object_label,
  };
  latestIntent.proposed_patch = {
    ...(latestIntent.proposed_patch ?? {}),
    patch_document: patchDocument,
  };
  latestIntent.route_hint = input.new_target_type === "reader_profile" ? "coordinator_only" : latestIntent.route_hint;
  latestIntent.correction_state = {
    status: input.new_target_type === "reader_profile" ? "replayed" : "corrected",
    entry_deep_link: latestIntent.deep_link,
    last_corrected_at: new Date().toISOString(),
  };
  latestIntent.patch_document = patchDocument as Record<string, unknown>;
  latestIntent.status = "corrected";
  latestIntent.version_no += 1;
  latestIntent.updated_at = new Date().toISOString();
  await chatIntentRepository.saveMessageIntent(latestIntent);
  const message = await chatIntentRepository.findMessageById(latestIntent.message_id);

  emitEvent("intent_corrected", latestIntent.account_id, {
    old_target_type: intent.target_type,
    new_target_type: input.new_target_type,
  });

  return {
    intent: {
      intent_id: latestIntent.id,
      intent_envelope_id: latestIntent.envelope_id,
      intent_type: latestIntent.intent_type as ArchiveIntentItem["intent_type"],
      message_text: message?.text ?? "",
      ack_copy: latestIntent.ack_copy,
      target_type: latestIntent.target_type,
      target_id: latestIntent.target_id,
      target_label: latestIntent.target_label,
      target_object: latestIntent.target_object,
      proposed_patch: latestIntent.proposed_patch,
      confidence: {
        score: latestIntent.confidence_score,
        band: latestIntent.confidence_band,
      },
      route_hint: latestIntent.route_hint,
      correction_state: latestIntent.correction_state,
      status: latestIntent.status,
      version_no: latestIntent.version_no,
    },
    affected_objects,
    replay_preview: {
      summary:
        input.new_target_type === "reader_profile"
          ? "这条最近记下现在会回流到读者档案，并影响后续理解。"
          : "这条最近记下已经按新目标重放。",
    },
  };
}
