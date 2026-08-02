"use client";

import React from "react";

export function AssetsView() {
  return (
    <main className="ops-main" data-testid="ops-assets-page">
      <section className="ops-card ops-hero-card">
        <p className="ops-muted">Asset Packs</p>
        <h2>资产包管理后台</h2>
        <p>把平台原创模板包、授权资产包和上架审核放到统一后台信息架构里，避免后续仍靠孤立页面或线下表格流转。</p>
      </section>
      <section className="ops-grid ops-secondary-grid">
        <article className="ops-card">
          <strong>平台原创模板包</strong>
          <p>角色模板、世界模板、冲突模式和风格样张的上架节奏与版本说明。</p>
        </article>
        <article className="ops-card">
          <strong>授权资产包</strong>
          <p>记录来源、授权期限、适用范围和是否可进入导出权利链。</p>
        </article>
        <article className="ops-card">
          <strong>上架审核</strong>
          <p>先接 skeleton 路由，后续再接内容审核和素材市场判断。</p>
        </article>
      </section>
      <section className="ops-card">
        <strong>Current Skeleton Scope</strong>
        <ul className="ops-list">
          <li className="ops-item">
            <p>这版先交付 IA 与后台路由骨架，不冒充已经具备完整素材市场审核与 CMS。</p>
          </li>
        </ul>
      </section>
    </main>
  );
}
