import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  attachReferenceAsset,
  confirmReferenceAsset,
  extractReferenceAsset,
  getReferenceAssetDetail,
  listReferenceAssetLibrary,
  revokeReferenceAsset,
  uploadReferenceAsset,
} from "./asset-ingestion.service.js";

@Controller()
export class AssetIngestionController {
  @Post("/assets")
  async upload(
    @Body() body: {
      account_token: string;
      story_id?: string;
      scope: "story" | "user_private_library";
      file_name: string;
      mime_type: string;
      client_request_id: string;
    },
  ) {
    return successEnvelope(await uploadReferenceAsset(body));
  }

  @Get("/assets/library")
  async library(
    @Query("account_token") account_token: string,
    @Query("story_id") story_id?: string,
    @Query("query") query?: string,
    @Query("scope") scope?: "all" | "story" | "user_private_library",
    @Query("status") status?: "all" | "uploaded" | "review_pending" | "ready" | "failed" | "revoked",
  ) {
    return successEnvelope(
      await listReferenceAssetLibrary({
        account_token,
        ...(story_id === undefined ? {} : { story_id }),
        ...(query === undefined ? {} : { query }),
        ...(scope === undefined ? {} : { scope }),
        ...(status === undefined ? {} : { status }),
      }),
    );
  }

  @Post("/assets/:assetId/extract")
  async extract(
    @Param("assetId") assetId: string,
    @Body() body: {
      extract_modes: Array<"character" | "location" | "relationship" | "style" | "theme" | "conflict_pattern">;
      client_request_id: string;
    },
  ) {
    return successEnvelope(
      await extractReferenceAsset({
        asset_id: assetId,
        ...body,
      }),
    );
  }

  @Post("/assets/:assetId/confirm")
  async confirm(
    @Param("assetId") assetId: string,
    @Body() body: {
      accepted_extract_refs: string[];
      rejected_extract_refs: string[];
      client_request_id: string;
    },
  ) {
    return successEnvelope(
      await confirmReferenceAsset({
        asset_id: assetId,
        ...body,
      }),
    );
  }

  @Post("/assets/:assetId/attachments")
  async attach(
    @Param("assetId") assetId: string,
    @Body() body: {
      target_type: "story" | "canon_item";
      target_id: string;
      usage_mode: "style" | "lore" | "character" | "world_rule" | "mood";
      client_request_id: string;
    },
  ) {
    return successEnvelope(
      await attachReferenceAsset({
        asset_id: assetId,
        ...body,
      }),
    );
  }

  @Post("/assets/:assetId/revoke")
  async revoke(
    @Param("assetId") assetId: string,
    @Body() body: {
      revoke_mode: string;
      reason: string;
      client_request_id: string;
    },
  ) {
    return successEnvelope(
      await revokeReferenceAsset({
        asset_id: assetId,
        ...body,
      }),
    );
  }

  @Get("/assets/:assetId")
  async detail(@Param("assetId") assetId: string) {
    return successEnvelope(
      await getReferenceAssetDetail({
        asset_id: assetId,
      }),
    );
  }
}
