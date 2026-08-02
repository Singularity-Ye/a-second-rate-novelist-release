import type { EditorDraft } from "../geometry-test/route-editor.model";
import type { CanonicalRouteRevision, FormalRouteSnapshot, RoutePublishIssue } from "./contract";

export type PublishEditorDraftResponse = {
  ok: true;
  revision: CanonicalRouteRevision;
  snapshot: FormalRouteSnapshot;
  issues: readonly RoutePublishIssue[];
};

export class RoutePublishError extends Error {
  readonly issues: readonly RoutePublishIssue[];

  constructor(message: string, issues: readonly RoutePublishIssue[] = []) {
    super(message);
    this.name = "RoutePublishError";
    this.issues = issues;
  }
}

/** Explicitly promote the current 3001 draft into the snapshot consumed by 3000. */
export async function publishEditorDraft(
  draft: EditorDraft,
  options: { playbackSpeed?: number } = {},
): Promise<PublishEditorDraftResponse> {
  const response = await fetch("/api/room/route-snapshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      draft,
      ...(typeof options.playbackSpeed === "number" ? { speedMultiplier: options.playbackSpeed } : {}),
    }),
  });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    code?: string;
    issues?: RoutePublishIssue[];
    revision?: CanonicalRouteRevision;
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
    issues: payload.issues ?? [],
  };
}
