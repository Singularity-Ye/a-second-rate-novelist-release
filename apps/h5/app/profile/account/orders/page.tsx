import { Suspense } from "react";
import { OrdersView } from "./orders-view";

export default function OrdersPage() {
  return (
    <Suspense fallback={<main data-testid="orders-page">Loading orders...</main>}>
      <OrdersView />
    </Suspense>
  );
}
