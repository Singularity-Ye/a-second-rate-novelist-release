import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import type { ExportJobCreateRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  createExportJob,
  createRiskCheck,
  getEvidencePackDetail,
  getEvidencePackDownload,
  getExportArtifactDownload,
  getExportManifestDownload,
  getExportCapabilities,
  getExportJobDetail,
  getDeliveryManifestDownload,
  getRiskReportDownload,
  getRightsStatementDownload,
  listStoryExports,
  submitLabelWaiverRequest,
} from "./rights-export.service.js";

@Controller()
export class RightsExportController {
  @Get("/stories/:storyId/exports")
  async list(@Param("storyId") storyId: string) {
    return successEnvelope(await listStoryExports({ story_id: storyId }));
  }

  @Get("/stories/:storyId/exports/capabilities")
  async capabilities(@Param("storyId") storyId: string) {
    return successEnvelope(await getExportCapabilities({ story_id: storyId }));
  }

  @Post("/stories/:storyId/rights/risk-checks")
  riskCheck(
    @Param("storyId") storyId: string,
    @Body() body: {
      export_purpose: string;
      branch_ids: string[];
      asset_refs: string[];
      label_mode_requested: "embedded_notice" | "label_waiver_requested";
      include_submission_statement: boolean;
    },
  ) {
    return this.riskCheckAsync(storyId, body);
  }

  @Get("/stories/:storyId/rights/risk-reports/:riskCheckId/download")
  async downloadRiskReport(
    @Param("storyId") storyId: string,
    @Param("riskCheckId") riskCheckId: string,
    @Res() response: {
      setHeader: (name: string, value: string) => void;
      send: (body: string) => void;
    },
  ) {
    const report = await getRiskReportDownload({
      story_id: storyId,
      risk_check_id: riskCheckId,
    });
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="${report.risk_check_id}-risk-report.json"`);
    response.send(report.download_body);
  }

  private async riskCheckAsync(
    storyId: string,
    body: {
      export_purpose: string;
      branch_ids: string[];
      asset_refs: string[];
      label_mode_requested: "embedded_notice" | "label_waiver_requested";
      include_submission_statement: boolean;
    },
  ) {
    return successEnvelope(
      await createRiskCheck({
        story_id: storyId,
        ...body,
      }),
    );
  }

  @Post("/stories/:storyId/exports")
  create(
    @Param("storyId") storyId: string,
    @Body() body: ExportJobCreateRequest,
    @Res({ passthrough: true }) response: { status: (code: number) => void },
  ) {
    return this.createAsync(storyId, body, response);
  }

  private async createAsync(
    storyId: string,
    body: ExportJobCreateRequest,
    response: { status: (code: number) => void },
  ) {
    const result = await createExportJob({
      story_id: storyId,
      ...body,
    });

    if (result.status === "blocked") {
      response.status(409);
    } else {
      response.status(202);
    }

    return successEnvelope(result);
  }

  @Get("/stories/:storyId/exports/:jobId")
  async detail(@Param("storyId") storyId: string, @Param("jobId") jobId: string) {
    return successEnvelope(
      await getExportJobDetail({
        story_id: storyId,
        job_id: jobId,
      }),
    );
  }

  @Get("/stories/:storyId/exports/:jobId/delivery-manifest")
  async downloadDeliveryManifest(
    @Param("storyId") storyId: string,
    @Param("jobId") jobId: string,
    @Res() response: {
      setHeader: (name: string, value: string) => void;
      send: (body: string) => void;
    },
  ) {
    const manifest = await getDeliveryManifestDownload({
      story_id: storyId,
      job_id: jobId,
    });
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="${jobId}-delivery-manifest.json"`);
    response.send(manifest.download_body);
  }

  @Get("/stories/:storyId/exports/:jobId/export-manifest")
  async downloadExportManifest(
    @Param("storyId") storyId: string,
    @Param("jobId") jobId: string,
    @Res() response: {
      setHeader: (name: string, value: string) => void;
      send: (body: string) => void;
    },
  ) {
    const manifest = await getExportManifestDownload({
      story_id: storyId,
      job_id: jobId,
    });
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="${jobId}-export-manifest.json"`);
    response.send(manifest.file_body);
  }

  @Get("/stories/:storyId/evidence-packs/:packId")
  async evidencePack(@Param("storyId") storyId: string, @Param("packId") packId: string) {
    return successEnvelope(
      await getEvidencePackDetail({
        story_id: storyId,
        pack_id: packId,
      }),
    );
  }

  @Post("/stories/:storyId/label-waiver-requests")
  waiver(
    @Param("storyId") storyId: string,
    @Body() body: {
      export_job_id: string;
      justification: string;
      target_channel: string;
      user_acknowledgements: string[];
    },
  ) {
    return this.waiverAsync(storyId, body);
  }

  private async waiverAsync(
    storyId: string,
    body: {
      export_job_id: string;
      justification: string;
      target_channel: string;
      user_acknowledgements: string[];
    },
  ) {
    return successEnvelope(
      await submitLabelWaiverRequest({
        story_id: storyId,
        ...body,
      }),
    );
  }

  @Get("/exports/artifacts/:artifactId/download")
  async downloadArtifact(
    @Param("artifactId") artifactId: string,
    @Res() response: {
      setHeader: (name: string, value: string) => void;
      send: (body: string) => void;
    },
  ) {
    const artifact = await getExportArtifactDownload({ artifact_id: artifactId });
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="${artifact.file_name}"`);
    response.send(artifact.file_body);
  }

  @Get("/evidence-packs/:packId/download")
  async downloadEvidencePack(
    @Param("packId") packId: string,
    @Res() response: {
      setHeader: (name: string, value: string) => void;
      send: (body: string) => void;
    },
  ) {
    const pack = await getEvidencePackDownload({ pack_id: packId });
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="${pack.id}.json"`);
    response.send(pack.download_body);
  }

  @Get("/exports/jobs/:jobId/rights-statement")
  async downloadRightsStatement(
    @Param("jobId") jobId: string,
    @Res() response: {
      setHeader: (name: string, value: string) => void;
      send: (body: string) => void;
    },
  ) {
    const job = await getRightsStatementDownload({ job_id: jobId });
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="${job.id}-rights-statement.txt"`);
    response.send(job.rights_statement_body ?? "");
  }
}
