import { Suspense } from "react";
import { ChatSessionView } from "./chat-session-view";
import { FRONTSTAGE_LOADING } from "../lib/frontstage-copy";

export default function ChatPage() {
  return (
    <Suspense fallback={<main data-testid="chat-page">{FRONTSTAGE_LOADING.chat}</main>}>
      <ChatSessionView />
    </Suspense>
  );
}
