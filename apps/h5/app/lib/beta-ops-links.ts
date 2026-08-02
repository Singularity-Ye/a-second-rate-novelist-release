export function buildFeedbackHref(input: {
  surface: "chat" | "room" | "export" | "account";
  account_token?: string | null | undefined;
  story_id?: string | null | undefined;
  target_type: "chat_thread" | "room_session" | "export_job" | "account_overview";
  target_id: string;
  target_label?: string | null | undefined;
  token?: string | null | undefined;
}) {
  const params = new URLSearchParams();
  params.set("surface", input.surface);
  params.set("target_type", input.target_type);
  params.set("target_id", input.target_id);
  if (input.target_label) {
    params.set("target_label", input.target_label);
  }
  if (input.story_id) {
    params.set("story_id", input.story_id);
  }

  return `/feedback?${params.toString()}`;
}
