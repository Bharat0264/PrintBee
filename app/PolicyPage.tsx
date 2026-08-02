import type { ReactNode } from "react";
const links = [["Terms", "/terms"], ["Privacy", "/privacy-policy"], ["Shipping", "/shipping-policy"], ["Cancellation & Refunds", "/cancellation-refunds"], ["Contact", "/contact"]];
export default function PolicyPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="policy-shell"><header className="policy-header"><a href="/"><strong>Print<span>Bee</span></strong></a><a href="/">Back to PrintBee</a></header><article className="policy-content"><h1>{title}</h1><p className="policy-date">Effective 2 August 2026</p>{children}</article><footer className="policy-footer">{links.map(([label, href]) => <a href={href} key={href}>{label}</a>)}</footer></main>;
}
