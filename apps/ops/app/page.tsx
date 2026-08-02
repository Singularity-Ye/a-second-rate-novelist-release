export default function HomePage() {
  return (
    <main className="ops-main">
      <section className="ops-card">
        <strong>内部控制台已就绪</strong>
        <p className="ops-muted">从 overview、users、reviews 进入 M3 运营闭环。</p>
        <a className="ops-link" href="/ops/overview">
          打开 Overview
        </a>
      </section>
    </main>
  );
}
