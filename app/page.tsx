"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

type PrintMode = "bw-single" | "bw-double" | "colour-single" | "colour-double";
type Prices = Record<PrintMode, number>;

const defaultPrices: Prices = {
  "bw-single": 2,
  "bw-double": 3,
  "colour-single": 8,
  "colour-double": 14,
};

const options: Array<{ id: PrintMode; title: string; note: string; icon: string }> = [
  { id: "bw-single", title: "B&W · Single side", note: "One printed side per A4 sheet", icon: "◐" },
  { id: "bw-double", title: "B&W · Double side", note: "Print on both sides of A4", icon: "◑" },
  { id: "colour-single", title: "Colour · Single side", note: "Full colour on one side", icon: "●" },
  { id: "colour-double", title: "Colour · Double side", note: "Full colour on both sides", icon: "◒" },
];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function Home() {
  const [prices, setPrices] = useState<Prices>(defaultPrices);
  const [draftPrices, setDraftPrices] = useState<Prices>(defaultPrices);
  const [mode, setMode] = useState<PrintMode>("bw-single");
  const [pages, setPages] = useState(12);
  const [copies, setCopies] = useState(1);
  const [fileName, setFileName] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("printbee-a4-prices");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Prices;
      setPrices(parsed);
      setDraftPrices(parsed);
    } catch {
      window.localStorage.removeItem("printbee-a4-prices");
    }
  }, []);

  const selected = options.find((item) => item.id === mode)!;
  const total = useMemo(() => pages * copies * prices[mode], [pages, copies, prices, mode]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const savePrices = () => {
    setPrices(draftPrices);
    window.localStorage.setItem("printbee-a4-prices", JSON.stringify(draftPrices));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PrintBee home">
          <Image src="/printbee-logo.png" width={74} height={74} alt="PrintBee" priority />
          <span><strong>Print<span>Bee</span></strong><small>Upload. Print. Delivered.</small></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <button className="admin-link" onClick={() => setAdminOpen(true)}>Admin pricing</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>●</span> A4 printing, delivered locally</div>
          <h1>Your documents.<br /><em>Printed right.</em></h1>
          <p>Upload a PDF or image, choose your A4 print style, and get crisp prints delivered to your door.</p>
          <div className="trust-row">
            <span>✓ Secure files</span><span>✓ Clear pricing</span><span>✓ Doorstep delivery</span>
          </div>
        </div>

        <section className="order-card" aria-label="Create print order">
          <div className="card-heading">
            <span className="step">1</span>
            <div><h2>Start your print</h2><p>PDF, JPG or PNG · A4 only</p></div>
          </div>

          <label className={`upload-zone ${fileName ? "has-file" : ""}`}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFile} />
            <span className="upload-icon">{fileName ? "✓" : "↑"}</span>
            <strong>{fileName || "Choose a document"}</strong>
            <small>{fileName ? "Ready to configure" : "or drag and drop it here"}</small>
          </label>

          <div className="field-label"><span className="step">2</span> Choose print type</div>
          <div className="option-grid">
            {options.map((item) => (
              <button
                key={item.id}
                className={mode === item.id ? "print-option selected" : "print-option"}
                onClick={() => setMode(item.id)}
                aria-pressed={mode === item.id}
              >
                <span className={`mode-icon ${item.id.startsWith("colour") ? "colour" : ""}`}>{item.icon}</span>
                <span><strong>{item.title}</strong><small>{inr.format(prices[item.id])} / page</small></span>
              </button>
            ))}
          </div>

          <div className="quantities">
            <label>Pages<input type="number" min="1" value={pages} onChange={(e) => setPages(Math.max(1, Number(e.target.value)))} /></label>
            <label>Copies<input type="number" min="1" value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))} /></label>
            <div className="paper"><small>Paper size</small><strong>A4</strong><span>210 × 297 mm</span></div>
          </div>

          <div className="estimate">
            <div><small>Estimated print total</small><strong>{inr.format(total)}</strong></div>
            <button disabled={!fileName}>Add to cart <span>→</span></button>
          </div>
          <p className="estimate-note">{pages} pages × {copies} {copies === 1 ? "copy" : "copies"} × {inr.format(prices[mode])} · {selected.title}</p>
        </section>
      </section>

      <section className="how" id="how">
        <div><span>01</span><strong>Upload</strong><p>Add your PDF or image securely.</p></div>
        <div><span>02</span><strong>Choose</strong><p>Pick one of four simple A4 options.</p></div>
        <div><span>03</span><strong>We deliver</strong><p>Fresh prints arrive at your door.</p></div>
      </section>

      <section className="pricing" id="pricing">
        <div className="section-intro">
          <div className="eyebrow"><span>●</span> Simple A4 pricing</div>
          <h2>No confusing paper choices.</h2>
          <p>Just choose black-and-white or colour, then single- or double-sided.</p>
        </div>
        <div className="price-list">
          {options.map((item) => (
            <article key={item.id}>
              <span className={`mode-icon ${item.id.startsWith("colour") ? "colour" : ""}`}>{item.icon}</span>
              <div><h3>{item.title}</h3><p>{item.note}</p></div>
              <strong>{inr.format(prices[item.id])}<small>/page</small></strong>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <div className="footer-brand"><Image src="/printbee-logo.png" width={86} height={86} alt="" /><div><strong>Print<span>Bee</span></strong><p>Upload. Print. Delivered.</p></div></div>
        <p>© 2026 PrintBee · Local A4 printing made easy.</p>
      </footer>

      {adminOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAdminOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setAdminOpen(false)} aria-label="Close">×</button>
            <div className="admin-badge">ADMIN</div>
            <h2 id="admin-title">A4 pricing controls</h2>
            <p>Update the customer price per printed page. Changes appear everywhere immediately.</p>
            <div className="admin-prices">
              {options.map((item) => (
                <label key={item.id}>
                  <span><strong>{item.title}</strong><small>{item.note}</small></span>
                  <span className="rupee">₹<input type="number" min="0" step="1" value={draftPrices[item.id]} onChange={(e) => setDraftPrices({ ...draftPrices, [item.id]: Math.max(0, Number(e.target.value)) })} /></span>
                </label>
              ))}
            </div>
            <button className="save-button" onClick={savePrices}>{saved ? "Prices saved ✓" : "Save new prices"}</button>
            <small className="admin-note">Prices are saved on this device for the current demo.</small>
          </section>
        </div>
      )}
    </main>
  );
}
