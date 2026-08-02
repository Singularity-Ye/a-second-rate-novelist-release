import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createObservabilityRepository } from "../repositories/observability.repository.js";
import {
  getObjectStorageBucket,
  getObjectStorageClient,
  getObjectStorageText,
  isObjectStorageConfigured,
} from "./object-storage.client.js";

export interface ExportObjectStorageShadowUploadInput {
  account_id: string;
  aggregate_key: "export_artifact" | "evidence_pack" | "risk_report" | "delivery_manifest";
  object_key: string;
  body: string;
  content_type: string;
}

export interface ExportObjectStorageShadowUploader {
  putObject(input: ExportObjectStorageShadowUploadInput & { bucket: string }): Promise<void>;
}

export interface ExportObjectStorageShadowReader {
  getObject(input: { bucket: string; object_key: string }): Promise<string | null>;
}

let uploaderOverride: ExportObjectStorageShadowUploader | null = null;
let readerOverride: ExportObjectStorageShadowReader | null = null;

const defaultUploader: ExportObjectStorageShadowUploader = {
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

export function __setExportObjectStorageShadowUploaderForTests(
  override: ExportObjectStorageShadowUploader | null,
) {
  uploaderOverride = override;
}

export function __setExportObjectStorageShadowReaderForTests(
  override: ExportObjectStorageShadowReader | null,
) {
  readerOverride = override;
}

export function scheduleExportObjectStorageShadowUpload(
  input: ExportObjectStorageShadowUploadInput,
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

export async function readExportObjectStorageShadow(input: {
  account_id: string;
  aggregate_key: "export_artifact" | "evidence_pack" | "risk_report" | "delivery_manifest";
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
