import { Suspense } from "react";
import { AssetWorkbenchView } from "./asset-workbench-view";

export default function AssetWorkbenchPage() {
  return (
    <Suspense fallback={<main data-testid="asset-workbench-page">正在打开资料整理台...</main>}>
      <AssetWorkbenchView />
    </Suspense>
  );
}
