import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createObservabilityRepository } from "../repositories/observability.repository.js";
import {
  getObjectStorageBucket,
  getObjectStorageClient,
  isObjectStorageConfigured,
} from "./object-storage.client.js";

export interface ProjectionObjectStorageShadowUploadInput {
  account_id: string;
  aggregate_key: "context_bundle" | "persona_snapshot";
  object_key: string;
  body: string;
  content_type: string;
}

export interface ProjectionObjectStorageShadowUploader {
  putObject(input: ProjectionObjectStorageShadowUploadInput & { bucket: string }): Promise<void>;
}

let uploaderOverride: ProjectionObjectStorageShadowUploader | null = null;

const defaultUploader: ProjectionObjectStorageShadowUploader = {
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

export function __setProjectionObjectStorageShadowUploaderForTests(
  override: ProjectionObjectStorageShadowUploader | null,
) {
  uploaderOverride = override;
}

export function scheduleProjectionObjectStorageShadowUpload(
  input: ProjectionObjectStorageShadowUploadInput,
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
