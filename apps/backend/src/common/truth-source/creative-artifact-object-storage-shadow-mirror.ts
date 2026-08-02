import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createObservabilityRepository } from "../repositories/observability.repository.js";
import {
  getObjectStorageBucket,
  getObjectStorageClient,
  getObjectStorageText,
  isObjectStorageConfigured,
} from "./object-storage.client.js";

export interface CreativeArtifactObjectStorageShadowUploadInput {
  account_id: string;
  aggregate_key:
    | "genre_brief"
    | "proposal_set"
    | "selected_proposal"
    | "commission_brief"
    | "canon_seed"
    | "outline_bundle"
    | "scene_card_set"
    | "chapter_draft"
    | "reader_review"
    | "accepted_chapter"
    | "chapter_revision"
    | "export_manifest";
  object_key: string;
  body: string;
  content_type: string;
}

export interface CreativeArtifactObjectStorageShadowUploader {
  putObject(input: CreativeArtifactObjectStorageShadowUploadInput & { bucket: string }): Promise<void>;
}

export interface CreativeArtifactObjectStorageShadowReader {
  getObject(input: { bucket: string; object_key: string }): Promise<string | null>;
}

let uploaderOverride: CreativeArtifactObjectStorageShadowUploader | null = null;
let readerOverride: CreativeArtifactObjectStorageShadowReader | null = null;

const defaultUploader: CreativeArtifactObjectStorageShadowUploader = {
  async putObject(input) {
    const client = getObjectStorageClient();

    await client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.object_key,
        Body: input.body,
        ContentType: input.content_type,
      }),
    );
  },
};

export function __setCreativeArtifactObjectStorageShadowUploaderForTests(
  override: CreativeArtifactObjectStorageShadowUploader | null,
) {
  uploaderOverride = override;
}

export function __setCreativeArtifactObjectStorageShadowReaderForTests(
  override: CreativeArtifactObjectStorageShadowReader | null,
) {
  readerOverride = override;
}

export function scheduleCreativeArtifactObjectStorageShadowUpload(
  input: CreativeArtifactObjectStorageShadowUploadInput,
) {
  if (!uploaderOverride && !isObjectStorageConfigured()) {
    return;
  }

  const uploader = uploaderOverride ?? defaultUploader;
  const bucket = getObjectStorageBucket();

  void uploader.putObject({
    ...input,
    bucket,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Error";

    createObservabilityRepository().appendDomainEvent({
      event_name: "truth_source_shadow_mirror_failed",
      account_id: input.account_id,
      mirror_to_audit: true,
      payload: {
        aggregate_key: input.aggregate_key,
        target_driver: "s3_object_storage",
        object_key: input.object_key,
        error_name: name,
        error_message: message,
      },
    });
  });
}

export async function readCreativeArtifactObjectStorageShadow(input: {
  account_id: string;
  aggregate_key:
    | "genre_brief"
    | "proposal_set"
    | "selected_proposal"
    | "commission_brief"
    | "canon_seed"
    | "outline_bundle"
    | "scene_card_set"
    | "chapter_draft"
    | "accepted_chapter"
    | "reader_review"
    | "export_manifest";
  object_key: string;
}) {
  if (!readerOverride && !isObjectStorageConfigured()) {
    return null;
  }

  const bucket = getObjectStorageBucket();
  const reader = readerOverride ?? {
    getObject: ({ bucket: currentBucket, object_key }: { bucket: string; object_key: string }) =>
      getObjectStorageText({
        bucket: currentBucket,
        object_key,
      }),
  };

  try {
    return await reader.getObject({
      bucket,
      object_key: input.object_key,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Error";

    createObservabilityRepository().appendDomainEvent({
      event_name: "truth_source_shadow_mirror_failed",
      account_id: input.account_id,
      mirror_to_audit: true,
      payload: {
        aggregate_key: input.aggregate_key,
        target_driver: "s3_object_storage",
        object_key: input.object_key,
        operation: "read",
        error_name: name,
        error_message: message,
      },
    });

    return null;
  }
}
