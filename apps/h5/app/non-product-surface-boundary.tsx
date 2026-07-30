import Link from "next/link";
import {
  classifyNonProductSurface,
  type SearchParamRecord,
  withSurfaceBoundaryContext,
} from "./lib/non-product-surfaces";

export function NonProductSurfaceBoundary({
  pathname,
  searchParams,
}: {
  pathname: string;
  searchParams: SearchParamRecord;
}) {
  const surface = classifyNonProductSurface(pathname);

  if (!surface) {
    return null;
  }

  return (
    <main className="surface" data-testid="surface-boundary-page">
      <section className="story-section">
        <p className="story-section__eyebrow">产品边界</p>
        <h1 className="story-section__title">{surface.title}</h1>
        <p className="story-section__copy">{surface.description}</p>
        <ul className="tag-row">
          <li>{surface.label}</li>
          <li>不进入主导航</li>
          <li>普通用户回主链继续</li>
        </ul>
        <p data-testid="surface-boundary-copy">
          受控验收或历史回看会使用单独的内部入口；普通用户请直接回房间、书架或“我的”继续。
        </p>
      </section>

      <section className="story-section">
        <div className="story-section__header">
          <p className="story-section__eyebrow">继续动作</p>
          <h2 className="story-section__title">回到当前产品主链</h2>
          <p className="story-section__copy">
            这页不再承接主产品下一步，所以默认把你送回当前仍然有效的三个入口。
          </p>
        </div>
        <div className="story-cell-list story-cell-list--three">
          <Link className="story-cell story-cell--link" href={withSurfaceBoundaryContext("/", searchParams)}>
            <strong>回首页</strong>
            <span>重新从当前产品入口进入，不在这里继续迷路。</span>
          </Link>
          <Link className="story-cell story-cell--link" href={withSurfaceBoundaryContext("/room", searchParams)}>
            <strong>回房间</strong>
            <span>回到正在推进的故事和可点击空间里继续。</span>
          </Link>
          <Link className="story-cell story-cell--link" href={withSurfaceBoundaryContext("/profile", searchParams)}>
            <strong>去我的</strong>
            <span>如果你想看账号、通知和边界，就从“我的”继续。</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
