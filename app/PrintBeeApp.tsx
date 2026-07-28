"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";

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
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Viewer = { email: string; isAdmin: boolean } | null;
type LocationOption = { id: string; name: string };
type SupabaseConfig = { url: string; anonKey: string } | null;
const RAZORPAY_PAYMENT_LINK = "https://razorpay.me/@PrintBee";

type CartItem = {
  id: string;
  uploadId: string;
  fileName: string;
  fileType: "PDF" | "IMAGE";
  pages: number;
  copies: number;
  mode: PrintMode;
  unitPrice: number;
  total: number;
};

export default function PrintBeeApp({ viewer, supabaseConfig }: { viewer: Viewer; supabaseConfig: SupabaseConfig }) {
  const [prices, setPrices] = useState<Prices>(defaultPrices);
  const [draftPrices, setDraftPrices] = useState<Prices>(defaultPrices);
  const [mode, setMode] = useState<PrintMode>("bw-single");
  const [pages, setPages] = useState(12);
  const [copies, setCopies] = useState(1);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"PDF" | "IMAGE">("PDF");
  const [countingPages, setCountingPages] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [role, setRole] = useState<string | null>(viewer?.isAdmin ? "ADMIN" : null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [locationId, setLocationId] = useState("");
  const [orderError, setOrderError] = useState("");
  const [orderResult, setOrderResult] = useState<{ id: string; orderNumber: string; deliveryCode: string; locationName: string; totalPaise: number; paid: boolean } | null>(null);
  const [newLocation, setNewLocation] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryOrderNumber, setDeliveryOrderNumber] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [dashboard, setDashboard] = useState<any>(null);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [paymentReference, setPaymentReference] = useState("");
  const [appQr, setAppQr] = useState("");
  const [riderOrders, setRiderOrders] = useState<any[]>([]);
  const [saved, setSaved] = useState(false);
  const [riderPayment, setRiderPayment] = useState({ riderEmail: "", amount: "", paymentDate: new Date().toISOString().slice(0, 10), note: "" });

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

  useEffect(() => {
    if (!viewer) return;
    fetch("/api/me").then((response) => response.json()).then((data) => setRole(data.role)).catch(() => {});
  }, [viewer]);

  useEffect(() => {
    QRCode.toDataURL(window.location.origin, {
      width: 280,
      margin: 2,
      color: { dark: "#171a20", light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then(setAppQr).catch(() => setAppQr(""));
  }, []);

  const selected = options.find((item) => item.id === mode)!;
  const total = useMemo(() => pages * copies * prices[mode], [pages, copies, prices, mode]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSelectedFile(file);
    setUploadError("");
    setCountingPages(true);
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        setPages(pdf.getPageCount());
        setFileType("PDF");
      } else if (file.type.startsWith("image/")) {
        setPages(1);
        setFileType("IMAGE");
      } else {
        throw new Error("Please choose a PDF, JPG, PNG or WEBP file.");
      }
    } catch (error) {
      setFileName("");
      setSelectedFile(null);
      setUploadError(error instanceof Error ? error.message : "This file could not be read.");
    } finally {
      setCountingPages(false);
    }
  };

  const addToCart = async () => {
    if (!viewer) return setLoginOpen(true);
    if (!fileName || !selectedFile || countingPages) return;
    setCountingPages(true);
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("pageCount", String(pages));
    const uploadResponse = await fetch("/api/uploads", { method: "POST", body: form });
    const uploaded = await uploadResponse.json();
    if (!uploadResponse.ok) { setCountingPages(false); return setUploadError(uploaded.error); }
    setCart((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        uploadId: uploaded.uploadId,
        fileName,
        fileType,
        pages,
        copies,
        mode,
        unitPrice: prices[mode],
        total,
      },
    ]);
    setFileName("");
    setSelectedFile(null);
    setPages(1);
    setCopies(1);
    setCountingPages(false);
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);

  const savePrices = () => {
    setPrices(draftPrices);
    window.localStorage.setItem("printbee-a4-prices", JSON.stringify(draftPrices));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const supabase = supabaseConfig
    ? createBrowserClient(
        supabaseConfig.url,
        supabaseConfig.anonKey,
      )
    : null;

  const signInWithGoogle = async () => {
    if (!supabase) return setAuthMessage("Authentication is awaiting Supabase configuration.");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    window.location.reload();
  };

  const loadLocations = async () => {
    const response = await fetch("/api/locations");
    const data = await response.json() as LocationOption[];
    setLocations(data);
    if (data.length && !locationId) setLocationId(data[0].id);
  };

  const openCheckout = async () => {
    if (!viewer) return setLoginOpen(true);
    await loadLocations();
    setCheckoutOpen(true);
  };

  const placeOrder = async () => {
    setOrderError("");
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName, mobileNumber, locationId, items: cart, totalPaise: Math.round(cartTotal * 100) }),
    });
    const data = await response.json();
    if (!response.ok) return setOrderError(data.error ?? "Order could not be placed");
    setCart([]);
    const pendingResult = { ...data, paid: false };
    setOrderResult(pendingResult);
    setPaymentReference("");
  };

  const openMyOrders = async () => {
    if (!viewer) return setLoginOpen(true);
    const response = await fetch("/api/orders/my");
    if (response.ok) setMyOrders(await response.json());
    setMyOrdersOpen(true);
  };

  const submitPaymentReference = async () => {
    if (!orderResult) return;
    const response = await fetch("/api/orders/payment-reference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: orderResult.id, reference: paymentReference }) });
    const data = await response.json();
    if (!response.ok) return setOrderError(data.error);
    setOrderError("Payment reference submitted for admin verification.");
  };

  const markPaid = async (orderId: string) => {
    const response = await fetch("/api/admin/orders/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
    const data = await response.json();
    setAdminMessage(response.ok ? "Order marked paid." : data.error);
    await openAdminDashboard();
  };

  const cancelOrder = async (orderId: string) => {
    if (!window.confirm("Cancel this order because the paid amount does not match?")) return;
    const response = await fetch("/api/admin/orders/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, reason: "Payment amount mismatch" }),
    });
    const data = await response.json();
    setAdminMessage(response.ok ? "Order cancelled for payment amount mismatch." : data.error);
    await openAdminDashboard();
  };

  const openAdminDashboard = async () => {
    setAdminOpen(true);
    const response = await fetch("/api/admin/dashboard");
    if (response.ok) setDashboard(await response.json());
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    await fetch("/api/admin/orders/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, status }) });
    await openAdminDashboard();
  };

  const assignRider = async (orderId: string, riderEmail: string) => {
    if (!riderEmail) return;
    const response = await fetch("/api/admin/orders/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, riderEmail }) });
    const data = await response.json();
    if (!response.ok) setAdminMessage(data.error);
    await openAdminDashboard();
  };

  const addLocation = async () => {
    const response = await fetch("/api/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newLocation }) });
    const data = await response.json();
    setAdminMessage(response.ok ? `Location “${data.name}” added.` : data.error);
    if (response.ok) setNewLocation("");
  };

  const addAgent = async () => {
    const response = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: agentEmail }) });
    const data = await response.json();
    setAdminMessage(response.ok ? `${data.email} can now verify deliveries.` : data.error);
    if (response.ok) setAgentEmail("");
  };

  const recordRiderPayment = async () => {
    const response = await fetch("/api/admin/rider-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...riderPayment, amount: Number(riderPayment.amount) }),
    });
    const data = await response.json();
    setAdminMessage(response.ok ? "Rider payment recorded successfully." : data.error);
    if (response.ok) {
      setRiderPayment((current) => ({ ...current, amount: "", note: "" }));
      await openAdminDashboard();
    }
  };

  const verifyDelivery = async () => {
    const response = await fetch("/api/orders/verify-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber: deliveryOrderNumber, code: deliveryCode }) });
    const data = await response.json();
    setDeliveryMessage(response.ok ? "Delivery verified. Order marked delivered ✓" : data.error);
    if (response.ok) {
      setDeliveryOrderNumber("");
      setDeliveryCode("");
      await loadRiderOrders();
    }
  };

  const loadRiderOrders = async () => {
    const response = await fetch("/api/rider/orders");
    if (response.ok) setRiderOrders(await response.json());
  };

  const openDeliveryQueue = async () => {
    await loadRiderOrders();
    setDeliveryOpen(true);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PrintBee home">
          <img src="/printbee-logo.png" width={74} height={74} alt="PrintBee" />
          <span><strong>Print<span>Bee</span></strong><small>Upload. Print. Delivered.</small></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          {viewer?.isAdmin && <button className="admin-link" onClick={openAdminDashboard}>Admin dashboard</button>}
          {(role === "ADMIN" || role === "AGENT") && <button className="admin-link" onClick={openDeliveryQueue}>Delivery</button>}
          {viewer && <button className="admin-link" onClick={openMyOrders}>My orders</button>}
          {viewer ? (
            <button className="login-link" onClick={signOut} title={viewer.email}>Sign out</button>
          ) : (
            <button className="login-link" onClick={() => setLoginOpen(true)}>Sign in</button>
          )}
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
            <span className="upload-icon">{countingPages ? "…" : fileName ? "✓" : "↑"}</span>
            <strong>{fileName || "Choose a document"}</strong>
            <small>{countingPages ? "Counting pages…" : fileName ? `${pages} ${pages === 1 ? "page" : "pages"} detected` : "or drag and drop it here"}</small>
          </label>
          {uploadError && <p className="upload-error">{uploadError}</p>}

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
            <button disabled={!fileName || countingPages} onClick={addToCart}>Add to cart <span>→</span></button>
          </div>
          <p className="estimate-note">{pages} pages × {copies} {copies === 1 ? "copy" : "copies"} × {inr.format(prices[mode])} · {selected.title}</p>
          <div className="payment-instruction" role="note">
            <strong>Payment instruction</strong>
            <span>Pay the exact order total and submit the correct Razorpay payment ID or UTR. Orders with a mismatched amount or payment reference will be cancelled.</span>
          </div>
        </section>
      </section>

      <section className="cart-section" id="cart" aria-labelledby="cart-title">
        <div className="cart-heading">
          <div><div className="eyebrow"><span>●</span> Your print cart</div><h2 id="cart-title">{cart.length ? `${cart.length} ${cart.length === 1 ? "document" : "documents"} ready` : "Your cart is empty"}</h2></div>
          {cart.length > 0 && <strong>{inr.format(cartTotal)}</strong>}
        </div>
        {cart.length === 0 ? (
          <div className="empty-cart"><span>▤</span><p>Upload a document above and click <strong>Add to cart</strong>.</p></div>
        ) : (
          <>
            <div className="cart-items">
              {cart.map((item) => {
                const itemOption = options.find((option) => option.id === item.mode)!;
                return (
                  <article className="cart-item" key={item.id}>
                    <div className="file-badge">{item.fileType === "PDF" ? "PDF" : "IMG"}</div>
                    <div className="cart-file"><h3>{item.fileName}</h3><p>{item.pages} {item.pages === 1 ? "page" : "pages"} · A4 · {itemOption.title} · {item.copies} {item.copies === 1 ? "copy" : "copies"}</p><small>{item.pages} × {item.copies} × {inr.format(item.unitPrice)}</small></div>
                    <strong>{inr.format(item.total)}</strong>
                    <button className="remove-item" onClick={() => setCart((items) => items.filter((current) => current.id !== item.id))} aria-label={`Remove ${item.fileName}`}>×</button>
                  </article>
                );
              })}
            </div>
            <div className="cart-summary">
              <div><span>Printing subtotal</span><strong>{inr.format(cartTotal)}</strong></div>
              <button onClick={openCheckout}>Proceed to checkout →</button>
            </div>
          </>
        )}
      </section>

      <section className="how" id="how">
        <div><span>01</span><strong>Upload</strong><p>Add your PDF or image securely.</p></div>
        <div><span>02</span><strong>Choose</strong><p>Pick one of four simple A4 options.</p></div>
        <div><span>03</span><strong>We deliver</strong><p>Fresh prints arrive at your door.</p></div>
      </section>

      <section className="app-scanner" aria-labelledby="app-scanner-title">
        <div>
          <div className="eyebrow"><span>●</span> Share PrintBee</div>
          <h2 id="app-scanner-title">Scan to open the app</h2>
          <p>Point any phone camera at this code to open PrintBee and start a print order.</p>
        </div>
        <div className="scanner-card">
          {appQr ? <img src={appQr} width={220} height={220} alt="QR code to open the PrintBee application" /> : <span>Preparing scanner…</span>}
          <strong>Open PrintBee</strong>
        </div>
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
        <div className="footer-brand"><img src="/printbee-logo.png" width={86} height={86} alt="" /><div><strong>Print<span>Bee</span></strong><p>Upload. Print. Delivered.</p></div></div>
        <p>© 2026 PrintBee · Local A4 printing made easy.</p>
      </footer>

      {adminOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAdminOpen(false)}>
          <section className="admin-modal admin-portal" role="dialog" aria-modal="true" aria-labelledby="admin-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setAdminOpen(false)} aria-label="Close">×</button>
            <div className="admin-badge">ADMIN</div>
            <h2 id="admin-title">A4 pricing controls</h2>
            <p>Update the customer price per printed page. Changes appear everywhere immediately.</p>
            <div className="admin-prices">
              {options.map((item) => (
                <label key={item.id}>
                  <span><strong>{item.title}</strong><small>{item.note}</small></span>
                  <span className="rupee">₹<input type="number" min="0" step="0.01" value={draftPrices[item.id]} onChange={(e) => setDraftPrices({ ...draftPrices, [item.id]: Math.max(0, Number(e.target.value)) })} /></span>
                </label>
              ))}
            </div>
            <button className="save-button" onClick={savePrices}>{saved ? "Prices saved ✓" : "Save new prices"}</button>
            <div className="admin-divider" />
            <h3>Delivery locations</h3>
            <p>Customers can select only locations added here.</p>
            <div className="inline-admin-form"><input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Example: Madhapur" /><button onClick={addLocation}>Add</button></div>
            <h3>Delivery agents</h3>
            <p>Add the Google email used by each delivery agent.</p>
            <div className="inline-admin-form"><input value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} placeholder="agent@gmail.com" /><button onClick={addAgent}>Add</button></div>
            {adminMessage && <p className="panel-message">{adminMessage}</p>}
            {dashboard && (
              <div className="dashboard-block">
                <div className="admin-divider" />
                <h2>Operations dashboard</h2>
                <div className="metric-grid">
                  <div><small>Total orders</small><strong>{dashboard.summary?.total ?? 0}</strong></div>
                  <div><small>Paid</small><strong>{dashboard.summary?.paid ?? 0}</strong></div>
                  <div><small>Unpaid</small><strong>{dashboard.summary?.unpaid ?? 0}</strong></div>
                  <div><small>Delivered</small><strong>{dashboard.summary?.delivered ?? 0}</strong></div>
                  <div><small>Ready</small><strong>{dashboard.summary?.ready ?? 0}</strong></div>
                  <div><small>Paid revenue</small><strong>{inr.format((dashboard.summary?.revenue_paise ?? 0) / 100)}</strong></div>
                </div>
                <h3>Location performance</h3>
                <p>Orders and paid revenue across every delivery location.</p>
                <div className="location-table">
                  <div className="table-head"><span>Location</span><span>Orders</span><span>Delivered</span><span>Revenue</span></div>
                  {dashboard.locationStats?.length ? dashboard.locationStats.map((location: any) => (
                    <div key={location.id}>
                      <span><i className={location.active ? "active-dot" : ""} />{location.name}<small>{location.active ? "Active" : "Inactive"}</small></span>
                      <strong>{location.orders ?? 0}</strong>
                      <strong>{location.delivered ?? 0}</strong>
                      <strong>{inr.format((location.revenue_paise ?? 0) / 100)}</strong>
                    </div>
                  )) : <p>No locations added yet.</p>}
                </div>
                <h3>Rider performance</h3>
                <div className="rider-stats">{dashboard.riders?.length ? dashboard.riders.map((rider: any) => <div key={rider.email}><span>{rider.email}<small>{rider.delivered ?? 0} delivered · {rider.assigned ?? 0} assigned</small></span><strong>{inr.format((rider.income_paise ?? 0) / 100)}<small>Total paid</small></strong></div>) : <p>No riders added yet.</p>}</div>
                <div className="payout-panel">
                  <div><h3>Record rider payment</h3><p>Save an amount paid to a rider for a specific day.</p></div>
                  <div className="payout-form">
                    <label>Rider<select value={riderPayment.riderEmail} onChange={(e) => setRiderPayment({ ...riderPayment, riderEmail: e.target.value })}><option value="">Select rider</option>{dashboard.riders?.map((rider: any) => <option key={rider.email} value={rider.email}>{rider.email}</option>)}</select></label>
                    <label>Amount (₹)<input type="number" min="1" step="0.01" value={riderPayment.amount} onChange={(e) => setRiderPayment({ ...riderPayment, amount: e.target.value })} placeholder="500" /></label>
                    <label>Date<input type="date" value={riderPayment.paymentDate} onChange={(e) => setRiderPayment({ ...riderPayment, paymentDate: e.target.value })} /></label>
                    <label>Note<input value={riderPayment.note} onChange={(e) => setRiderPayment({ ...riderPayment, note: e.target.value })} placeholder="Optional note" /></label>
                    <button onClick={recordRiderPayment} disabled={!riderPayment.riderEmail || !riderPayment.amount}>Record payment</button>
                  </div>
                </div>
                <h3>Recent rider payments</h3>
                <div className="payout-history">{dashboard.riderPayments?.length ? dashboard.riderPayments.slice(0, 12).map((payment: any) => <article key={payment.id}><span><strong>{payment.rider_email}</strong><small>{new Date(`${payment.payment_date}T00:00:00`).toLocaleDateString("en-IN")}{payment.note ? ` · ${payment.note}` : ""}</small></span><strong>{inr.format(payment.amount_paise / 100)}</strong></article>) : <p>No rider payments recorded yet.</p>}</div>
                <h3>Live orders</h3>
                <div className="admin-orders">{dashboard.orders?.length ? dashboard.orders.map((order: any) => (
                  <article key={order.id}>
                    <div className="order-customer">
                      <strong>{order.order_number}</strong>
                      <small>{order.customer_name} · {order.mobile_number}</small>
                      <small>{order.customer_email} · {order.location_name}</small>
                      <small>Placed {new Date(order.created_at).toLocaleString("en-IN")}</small>
                    </div>
                    <span className="status-chip">{order.payment_status} · {order.status}</span>
                    <strong>{inr.format(order.total_paise / 100)}</strong>
                    {order.payment_reference && <small>Payment ref: {order.payment_reference}</small>}
                    {order.payment_status === "PENDING" && order.payment_reference && <button className="mini-action" onClick={() => markPaid(order.id)}>Mark paid</button>}
                    {order.status !== "DELIVERED" && order.status !== "CANCELLED" && <button className="cancel-action" onClick={() => cancelOrder(order.id)}>Cancel — amount mismatch</button>}
                    {order.status === "CANCELLED" && <div className="cancelled-note"><strong>Cancelled</strong><small>{order.cancellation_reason}</small></div>}
                    <div className="document-details">
                      <strong>Documents</strong>
                      {order.items?.length ? order.items.map((item: any, index: number) => (
                        <div key={`${item.uploadId ?? item.fileName}-${index}`}>
                          <span>{item.fileName ?? `Document ${index + 1}`}</span>
                          <small>{item.pages ?? 1} pages · {item.copies ?? 1} copies · {options.find((option) => option.id === item.mode)?.title ?? item.mode ?? "A4 print"}</small>
                        </div>
                      )) : <small>No document details saved for this legacy order.</small>}
                    </div>
                    <div className="file-links">{order.files?.length ? order.files.map((file: any) => <a key={file.id} href={`/api/admin/files/${file.id}/download`}>Download {file.original_name}</a>) : <span>Legacy order — document was not stored</span>}</div>
                    <select disabled={order.status === "CANCELLED"} value={order.status} onChange={(e) => updateOrderStatus(order.id, e.target.value)}>
                      {order.status === "CANCELLED" && <option value="CANCELLED">Cancelled</option>}
                      <option value="CONFIRMED">Confirmed</option><option value="PRINTING">Printing</option><option value="READY_FOR_PICKUP">Ready for pickup</option><option value="RIDER_ASSIGNED">Rider assigned</option>
                    </select>
                    <select disabled={order.status === "CANCELLED"} value={order.rider_email ?? ""} onChange={(e) => assignRider(order.id, e.target.value)}>
                      <option value="">Assign rider</option>{dashboard.riders.map((rider: any) => <option key={rider.email} value={rider.email}>{rider.email}</option>)}
                    </select>
                  </article>
                )) : <p>No orders yet.</p>}</div>
              </div>
            )}
            <small className="admin-note">Prices are saved on this device for the current demo.</small>
          </section>
        </div>
      )}

      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCheckoutOpen(false)}>
          <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setCheckoutOpen(false)} aria-label="Close">×</button>
            {orderResult ? (
              <div className="order-success">
                <span>✓</span><h2>Order placed</h2>
                <p>Order <strong>{orderResult.orderNumber}</strong> · {orderResult.locationName}</p>
                <div className={orderResult.paid ? "payment-paid" : "payment-pending"}><small>Payment status</small><strong>{orderResult.paid ? "PAID" : "PENDING"}</strong></div>
                <div><small>Your delivery code</small><strong>{orderResult.deliveryCode}</strong></div>
                <p>{orderResult.paid ? "Give this code to the delivery agent only after receiving your prints." : `Pay exactly ${inr.format(orderResult.totalPaise / 100)} using the PrintBee payment link. Use ${orderResult.orderNumber} as the payment note.`}</p>
                {!orderResult.paid && (
                  <>
                    <div className="payment-warning" role="alert"><strong>Important:</strong> Pay exactly {inr.format(orderResult.totalPaise / 100)} and enter the matching payment ID or UTR below. If either the amount or reference does not match, this order will be cancelled.</div>
                    <a className="save-button" href={RAZORPAY_PAYMENT_LINK} target="_blank" rel="noreferrer">Open Razorpay payment link</a>
                    <label className="checkout-field">Razorpay payment ID / UTR<input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Enter the reference after payment" /></label>
                    <button className="save-button" disabled={paymentReference.trim().length < 6} onClick={submitPaymentReference}>Submit payment reference</button>
                  </>
                )}
                {orderError && <p className="panel-message">{orderError}</p>}
                <button className="save-button" onClick={() => { setCheckoutOpen(false); setOrderResult(null); }}>Done</button>
              </div>
            ) : (
              <>
                <div className="admin-badge">CHECKOUT</div>
                <h2 id="checkout-title">Delivery details</h2>
                <p>Enter your details and select an admin-approved delivery location.</p>
                <label className="checkout-field">Full name<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" /></label>
                <label className="checkout-field">Mobile number<input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" inputMode="numeric" /></label>
                <label className="checkout-field">Delivery location<select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Select a location</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>
                {!locations.length && <p className="panel-message">No delivery locations are available yet. The admin must add one first.</p>}
                <div className="fee-breakdown"><div><span>Printing subtotal</span><strong>{inr.format(cartTotal)}</strong></div><div><span>Delivery fee</span><strong>{inr.format(15)}</strong></div><div><span>Platform fee</span><strong>{inr.format(3.5)}</strong></div></div>
                <div className="checkout-total"><span>To pay</span><strong>{inr.format(cartTotal + 18.5)}</strong></div>
                <div className="payment-warning" role="alert"><strong>Payment verification required:</strong> You must pay the exact total and submit the matching Razorpay payment ID or UTR. A mismatched amount or reference will result in order cancellation.</div>
                {orderError && <p className="form-error">{orderError}</p>}
                <button className="save-button" disabled={!locations.length} onClick={placeOrder}>Place order and get payment link</button>
              </>
            )}
          </section>
        </div>
      )}

      {deliveryOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeliveryOpen(false)}>
          <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="delivery-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setDeliveryOpen(false)} aria-label="Close">×</button>
            <div className="admin-badge">DELIVERY AGENT</div>
            <h2 id="delivery-title">Verify delivery</h2>
            <p>Ask the customer for their six-digit code only after handing over the prints.</p>
            <div className="rider-queue">
              <h3>My assigned orders</h3>
              {riderOrders.length ? riderOrders.map((order) => <button key={order.order_number} onClick={() => setDeliveryOrderNumber(order.order_number)}><strong>{order.order_number}</strong><span>{order.customer_name} · {order.location_name}</span><small>{order.mobile_number} · {order.status}</small></button>) : <p>No active assigned orders.</p>}
            </div>
            <label className="checkout-field">Order number<input value={deliveryOrderNumber} onChange={(e) => setDeliveryOrderNumber(e.target.value.toUpperCase())} placeholder="PB12345678" /></label>
            <label className="checkout-field">Customer delivery code<input className="code-input" value={deliveryCode} onChange={(e) => setDeliveryCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" /></label>
            <button className="save-button" onClick={verifyDelivery}>Verify and mark delivered</button>
            {deliveryMessage && <p className="panel-message">{deliveryMessage}</p>}
          </section>
        </div>
      )}

      {myOrdersOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setMyOrdersOpen(false)}>
          <section className="orders-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setMyOrdersOpen(false)} aria-label="Close">×</button>
            <div className="admin-badge">CUSTOMER</div><h2>My orders</h2>
            {myOrders.length ? myOrders.map((order) => <article key={order.id}><div><strong>{order.order_number}</strong><small>{order.location_name} · {new Date(order.created_at).toLocaleDateString("en-IN")}</small>{order.cancellation_reason && <small>Cancelled: {order.cancellation_reason}</small>}</div><span className="status-chip">{order.payment_status} · {order.status}</span><strong>{inr.format(order.total_paise / 100)}</strong>{order.status !== "CANCELLED" && <div className="customer-code"><small>Delivery code</small><strong>{order.deliveryCode}</strong></div>}</article>) : <p>No orders yet.</p>}
          </section>
        </div>
      )}

      {loginOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setLoginOpen(false)}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setLoginOpen(false)} aria-label="Close">×</button>
            <img src="/printbee-logo.png" width={88} height={88} alt="PrintBee" />
            <h2 id="login-title">Welcome to PrintBee</h2>
            <p>Sign in securely with Google to save your orders and track delivery.</p>
            <button className="google-button" onClick={signInWithGoogle}><span>G</span> Continue with Google</button>
            {authMessage && <p className="auth-message">{authMessage}</p>}
            <small>By continuing, you agree to PrintBee’s terms and privacy policy.</small>
          </section>
        </div>
      )}
    </main>
  );
}
