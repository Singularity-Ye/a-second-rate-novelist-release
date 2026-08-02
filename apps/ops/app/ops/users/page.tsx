import { Suspense } from "react";
import { UsersSearchView } from "./users-search-view";

export default function OpsUsersPage() {
  return (
    <Suspense fallback={<main data-testid="ops-users-page">Loading users...</main>}>
      <UsersSearchView />
    </Suspense>
  );
}
