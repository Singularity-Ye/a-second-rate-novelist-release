import { Suspense } from "react";
import { PersonaDetailView } from "./persona-detail-view";

export default function RoomPersonaPage() {
  return (
    <Suspense fallback={<main data-testid="room-persona-page">Loading persona...</main>}>
      <PersonaDetailView />
    </Suspense>
  );
}
