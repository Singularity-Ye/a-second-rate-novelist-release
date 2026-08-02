/** @deprecated Use ../route-publish/route-publish.client.ts. */
import type { EditorDraft } from "./route-editor.model";
import type { FormalRouteSnapshot, RoutePublishIssue } from "./route-publish.contract";

export type PublishEditorDraftResponse = {
  ok: true;
  revision: {
    sceneId: string;
    revisionId: string;
    contentHash: string;
    publishedAt: string;
  };
  snapshot: FormalRouteSnapshot;
};

export class RoutePublishError extends Error {
  readonly issues: readonly RoutePublishIssue[];

  constructor(message: string, issues: readonly RoutePublishIssue[] = []) {
    super(message);
    this.name = "RoutePublishError";
    this.issues = issues;
  }
}

export async function publishEditorDraft(
  draft: EditorDraft,
  options: { sourceId?: string; sourceHash?: string; playbackSpeed?: number } = {},
): Promise<PublishEditorDraftResponse> {
  const response = await fetch("/api/room/route-snapshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ draft, ...options }),
  });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    code?: string;
    issues?: RoutePublishIssue[];
    revision?: PublishEditorDraftResponse["revision"];
    snapshot?: FormalRouteSnapshot;
  } | null;
  if (!response.ok || !payload?.ok || !payload.revision || !payload.snapshot) {
    throw new RoutePublishError(
      payload?.code ?? `route_publish_failed_${response.status}`,
      payload?.issues ?? [],
    );
  }
  return {
    ok: true,
    revision: payload.revision,
    snapshot: payload.snapshot,
  };
}
