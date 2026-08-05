/** Semantic node kinds used by an AOS-style map projection. */
export type GraphMapNodeKind =
  | "note"
  | "folder"
  | "area"
  | "platform"
  | "period"
  | "status"
  | "project"
  | "agent";

/**
 * Edges are the semantic layer. A physical folder is only one relation type;
 * it must not be mistaken for the note's whole classification.
 */
export type GraphRelationType =
  | "belongs_to_folder"
  | "classified_as_area"
  | "captured_from_platform"
  | "captured_in_period"
  | "has_status"
  | "derived_from"
  | "scheduled_for"
  | "related_to";

export type GraphEvidenceSource = "frontmatter" | "path" | "wikilink" | "inferred";

export interface GraphMapNodeMetadata {
  mapKind: GraphMapNodeKind;
  key: string;
  count?: number;
  sourcePaths?: string[];
}

export interface GraphRelationMetadata {
  relationType: GraphRelationType;
  facetKind?: GraphMapNodeKind;
  value?: string;
  evidence: GraphEvidenceSource;
  confidence?: "explicit" | "inferred";
  sourcePath?: string;
}

export function graphFacetNodeId(kind: GraphMapNodeKind, value: string): string {
  return `aos-facet:${kind}:${encodeURIComponent(value.trim() || "other")}`;
}

export function graphRelationId(source: string, target: string, relationType: GraphRelationType): string {
  return `aos-relation:${relationType}:${source}:${target}`;
}
