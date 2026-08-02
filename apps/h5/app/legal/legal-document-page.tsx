import Link from "next/link";
import { LEGAL_DOCUMENTS, type LegalDocumentSlug } from "./legal-documents";

export function LegalDocumentPage({ slug }: { slug: LegalDocumentSlug }) {
  const document = LEGAL_DOCUMENTS.find((item) => item.slug === slug);

  if (!document) {
    return <main data-testid={`legal-${slug}-page`}>这份说明暂时还没准备好。</main>;
  }

  return (
    <main className="surface" data-testid={`legal-${slug}-page`}>
      <section className="hero-card">
        <p className="hero-card__eyebrow">规则说明</p>
        <h1>{document.title}</h1>
        <p>{document.summary}</p>
        <p className="surface-meta">版本 {document.version}</p>
      </section>

      <section className="panel-card">
        <p className="panel-card__eyebrow">关键口径</p>
        <ul className="f9-bullet-list">
          {document.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="panel-card">
        <p className="panel-card__eyebrow">需要帮助</p>
        <div className="f9-link-grid">
          <Link href="/report/new">举报与求助</Link>
          <Link href="/legal/terms">服务协议</Link>
          <Link href="/legal/privacy">隐私政策</Link>
          <Link href="/legal/aigc">作品标识说明</Link>
        </div>
      </section>
    </main>
  );
}
