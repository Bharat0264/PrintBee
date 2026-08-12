"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  { id: "colour-single", title: "Colour · Single side", note: "Full colour on one side", icon: "●" },
];
const singleSideOptions = options.filter((item) => item.id.endsWith("single"));

function printModeLabel(mode?: string) {
  return mode?.startsWith("colour") ? "Colour · Single side" : "B&W · Single side";
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const HOSTED_IMAGE_TARGET_BYTES = 700 * 1024;
const CHUNKED_UPLOAD_THRESHOLD_BYTES = 700 * 1024;
const IMAGE_EXTENSIONS = /\.(heic|jpe?g|png|webp|gif|bmp|tiff?)$/i;
const OPTIMIZABLE_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const PRINTABLE_FILE_EXTENSIONS = /\.(pdf|heic|jpe?g|png|webp|gif|bmp|tiff?|docx?|pptx?|xlsx?|odt|ods|odp|rtf|txt|csv)$/i;
const MIXED_PRINT_SERVICES = new Set(["document-printing", "document-binding"]);
const GEN_Z_MEMES = [
  "POV: You skipped the Xerox queue and chose peace. 😌",
  "Your assignment is printing itself. Main-character logistics. ✨",
  "Queue for printouts? Bestie, we have delivery now. 🛵",
  "Scan. Relax. Let PrintBee carry the academic comeback. 🐝",
  "No cash hunt, no queue arc — just upload and vibe. 📄",
  "Deadline approaching? Stay calm; the bee is on the way. 🚀",
];

function parsePageNumbers(value: string, totalPages: number) {
  const pageNumbers = new Set<number>();
  const invalid: string[] = [];
  for (const part of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) { invalid.push(part); continue; }
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > totalPages) { invalid.push(part); continue; }
    for (let page = start; page <= end; page += 1) pageNumbers.add(page);
  }
  return { count: pageNumbers.size, invalid, pages: [...pageNumbers].sort((a, b) => a - b) };
}

function formatPageRanges(pageNumbers: number[]) {
  if (!pageNumbers.length) return "NA";
  const ranges: string[] = [];
  let start = pageNumbers[0];
  let end = start;
  for (const page of pageNumbers.slice(1)) {
    if (page === end + 1) { end = page; continue; }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    start = page;
    end = page;
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(", ");
}

async function optimizeImageForUpload(file: File) {
  if (!OPTIMIZABLE_IMAGE_EXTENSIONS.test(file.name) || file.size <= HOSTED_IMAGE_TARGET_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 5000;
    const initialScale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    let blob: Blob | null = null;
    for (const quality of [0.92, 0.84, 0.76, 0.68]) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This image could not be prepared for upload.");
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= HOSTED_IMAGE_TARGET_BYTES) break;
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
    if (!blob) throw new Error("This image could not be prepared for upload.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

async function fetchUpload(input: RequestInfo | URL, init: RequestInit, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function uploadPrintableFile(file: File, pageCount: number, onProgress?: (percent: number) => void) {
  if (file.size <= CHUNKED_UPLOAD_THRESHOLD_BYTES) {
    const form = new FormData();
    form.append("file", file);
    form.append("pageCount", String(pageCount));
    const response = await fetchUpload("/api/uploads", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.uploadId) throw new Error(data.error ?? "Document upload failed. Please try again.");
    return data;
  }

  const details = { fileName: file.name, fileSize: file.size, pageCount, contentType: file.type };
  const initResponse = await fetchUpload("/api/uploads/chunked?action=init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) });
  const init = await initResponse.json().catch(() => ({}));
  if (!initResponse.ok || !init.sessionId || !init.uploadId || !init.chunkSize) throw new Error(init.error ?? "Document upload could not start. Please try again.");
  const chunkCount = Math.ceil(file.size / init.chunkSize);
  let uploadedChunks = 0;
  const uploadedParts: Array<{ partNumber: number; etag: string }> = [];
  const uploadChunk = async (index: number) => {
    const chunk = file.slice(index * init.chunkSize, Math.min(file.size, (index + 1) * init.chunkSize));
    const partResponse = await fetchUpload(`/api/uploads/chunked?action=part&sessionId=${encodeURIComponent(init.sessionId)}&uploadId=${encodeURIComponent(init.uploadId)}&fileName=${encodeURIComponent(file.name)}&index=${index}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
    const part = await partResponse.json().catch(() => ({}));
    if (!partResponse.ok) {
      throw new Error(part.error ?? `Upload stopped at part ${index + 1}. Please try again.`);
    }
    if (!part.partNumber || !part.etag) throw new Error(`Upload part ${index + 1} could not be verified. Please try again.`);
    uploadedParts[index] = { partNumber: part.partNumber, etag: part.etag };
    uploadedChunks += 1;
    onProgress?.(Math.round((uploadedChunks / chunkCount) * 100));
  };
  for (let start = 0; start < chunkCount; start += 4) {
    await Promise.all(Array.from({ length: Math.min(4, chunkCount - start) }, (_, offset) => uploadChunk(start + offset)));
  }
  const completeResponse = await fetchUpload("/api/uploads/chunked?action=complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...details, sessionId: init.sessionId, uploadId: init.uploadId, parts: uploadedParts }) });
  const completed = await completeResponse.json().catch(() => ({}));
  if (!completeResponse.ok || !completed.uploadId) throw new Error(completed.error ?? "Document upload could not be completed. Please try again.");
  return completed;
}

type Viewer = { email: string; isAdmin: boolean } | null;
type LocationOption = { id: string; name: string; delivery_fee_paise?: number; platform_fee_paise?: number };
type PrintService = { id: string; name: string; description: string; active: number; is_binding: number; price_paise: number; counts_for_packaging: number };
type PackagingRule = { id: string; min_pages: number; max_pages: number; charge_paise: number };
type SupabaseConfig = { url: string; anonKey: string } | null;
type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type ColourChoice = "" | "bw" | "colour" | "mixed";

function printSummary(items: any[] = []) {
  const totals = { bwSingle: 0, bwDouble: 0, colourSingle: 0, colourDouble: 0 };
  for (const item of items) {
    const pages = Math.max(1, Number(item.pages) || 1) * Math.max(1, Number(item.copies) || 1);
    const colourPages = Math.max(0, Math.min(Number(item.pages) || 1, Number(item.colourPages) || 0)) * Math.max(1, Number(item.copies) || 1);
    if (item.colourPageNumbers !== undefined) {
      if (item.mode?.endsWith("double")) { totals.bwDouble += pages - colourPages; totals.colourDouble += colourPages; }
      else { totals.bwSingle += pages - colourPages; totals.colourSingle += colourPages; }
      continue;
    }
    if (item.mode === "bw-single") totals.bwSingle += pages;
    if (item.mode === "bw-double") totals.bwDouble += pages;
    if (item.mode === "colour-single") totals.colourSingle += pages;
    if (item.mode === "colour-double") totals.colourDouble += pages;
  }
  return totals;
}

function revenueSummary(orders: any[] = [], fallbackPrices: Prices) {
  const totals = { colourPrints: 0, colourPages: 0, colourAmount: 0, bwPrints: 0, bwPages: 0, bwAmount: 0, delivery: 0, handling: 0, platform: 0 };
  for (const order of orders) {
    totals.delivery += Number(order.delivery_fee_paise) || 0;
    totals.handling += Number(order.packaging_fee_paise) || 0;
    totals.platform += Number(order.platform_fee_paise) || 0;
    for (const item of order.items ?? []) {
      const documentPages = Math.max(1, Number(item.pages) || 1);
      const copies = Math.max(1, Number(item.copies) || 1);
      const colourPerCopy = item.colourPageNumbers !== undefined ? Math.max(0, Math.min(documentPages, Number(item.colourPages) || 0)) : item.mode?.startsWith("colour") ? documentPages : 0;
      const bwPerCopy = documentPages - colourPerCopy;
      if (colourPerCopy > 0) totals.colourPrints += copies;
      if (bwPerCopy > 0) totals.bwPrints += copies;
      totals.colourPages += colourPerCopy * copies;
      totals.bwPages += bwPerCopy * copies;
      totals.colourAmount += colourPerCopy * copies * Number(item.colourUnitPrice ?? (item.mode?.startsWith("colour") ? item.unitPrice : fallbackPrices["colour-single"]));
      totals.bwAmount += bwPerCopy * copies * Number(item.bwUnitPrice ?? (item.mode?.startsWith("bw") && item.colourPageNumbers === undefined ? item.unitPrice : fallbackPrices["bw-single"]));
    }
  }
  return totals;
}

type CartItem = {
  id: string;
  uploadId: string;
  fileName: string;
  fileType: "PDF" | "IMAGE" | "DOCUMENT";
  pages: number;
  copies: number;
  mode: PrintMode;
  unitPrice: number;
  bwUnitPrice?: number;
  colourUnitPrice?: number;
  total: number;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  countsForPackaging: boolean;
  printInstructions?: string;
  colourPages?: number;
  colourPageNumbers?: string;
  bwPageNumbers?: string;
  whatsappNumber?: string;
};

export default function PrintBeeApp({ viewer, supabaseConfig }: { viewer: Viewer; supabaseConfig: SupabaseConfig }) {
  const [prices, setPrices] = useState<Prices>(defaultPrices);
  const [draftPrices, setDraftPrices] = useState<Prices>(defaultPrices);
  const [mode, setMode] = useState<PrintMode>("bw-single");
  const [pages, setPages] = useState(12);
  const [copies, setCopies] = useState(1);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"PDF" | "IMAGE" | "DOCUMENT">("PDF");
  const [countingPages, setCountingPages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerPassword, setReviewerPassword] = useState("");
  const [role, setRole] = useState<string | null>(viewer?.isAdmin ? "ADMIN" : null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [isRiderAvailable, setIsRiderAvailable] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [myReferralCode, setMyReferralCode] = useState("");
  const [hasReferrer, setHasReferrer] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletMessage, setWalletMessage] = useState("");
  const [pointsBalance, setPointsBalance] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [feedbackOrder, setFeedbackOrder] = useState<any>(null);
  const [feedback, setFeedback] = useState({ serviceRating: 0, riderRating: 0, printQualityRating: 0, overallRating: 0, description: "" });
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [loginMode, setLoginMode] = useState<"CUSTOMER" | "PARTNER">("CUSTOMER");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [memeQuote, setMemeQuote] = useState(GEN_Z_MEMES[0]);
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [launchAt, setLaunchAt] = useState("2026-08-10T03:30:00.000Z");
  const [launchInput, setLaunchInput] = useState("2026-08-10T09:00");
  const [launchMessage, setLaunchMessage] = useState("Site will be live from Aug 10 2026, 9 A.M. IST");
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const [gatewayEnabled, setGatewayEnabled] = useState(true);
  const [surgeEnabled, setSurgeEnabled] = useState(false);
  const [surgeType, setSurgeType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [surgeValue, setSurgeValue] = useState(0);
  const [lateNightEnabled, setLateNightEnabled] = useState(false);
  const [lateNightType, setLateNightType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [lateNightValue, setLateNightValue] = useState(0);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [locationId, setLocationId] = useState("");
  const [orderError, setOrderError] = useState("");
  const [orderResult, setOrderResult] = useState<{ id: string; orderNumber: string; deliveryCode?: string | null; locationName: string; totalPaise: number; lateNightFeePaise?: number; paid: boolean; paymentMode?: string } | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
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
  const [appQr, setAppQr] = useState("");
  const [riderOrders, setRiderOrders] = useState<any[]>([]);
  const [riderEarnings, setRiderEarnings] = useState<any>(null);
  const [withdrawUpi, setWithdrawUpi] = useState("");
  const [saved, setSaved] = useState(false);
  const [riderPayment, setRiderPayment] = useState({ riderEmail: "", amount: "", paymentDate: new Date().toISOString().slice(0, 10), note: "" });
  const [grantPointDrafts, setGrantPointDrafts] = useState<Record<string, string>>({});
  const [riderApplicationOpen, setRiderApplicationOpen] = useState(false);
  const [riderApplication, setRiderApplication] = useState({ name: "", mobileNumber: "" });
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [expandedScanner, setExpandedScanner] = useState<{ src: string; alt: string } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationToast, setNotificationToast] = useState<{ title: string; body: string } | null>(null);
  const [notificationPromptOpen, setNotificationPromptOpen] = useState(false);
  const [adminSection, setAdminSection] = useState<"dashboard" | "revenue" | "orders" | "locations" | "riders" | "services" | "packaging">("dashboard");
  const [dashboardRange, setDashboardRange] = useState<"today" | "week" | "month">("today");
  const [printServices, setPrintServices] = useState<PrintService[]>([]);
  const [packagingRules, setPackagingRules] = useState<PackagingRule[]>([]);
  const [packagingDraft, setPackagingDraft] = useState({ id: "", minPages: 1, maxPages: 25, charge: 0 });
  const [serviceId, setServiceId] = useState("document-printing");
  const [printInstructions, setPrintInstructions] = useState("");
  const [colourPageNumbers, setColourPageNumbers] = useState("");
  const [colourChoice, setColourChoice] = useState<ColourChoice>("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [newService, setNewService] = useState({ id: "", name: "", description: "", isBinding: false, countsForPackaging: true, price: 0 });

  useEffect(() => {
    const randomValues = new Uint32Array(1);
    crypto.getRandomValues(randomValues);
    setMemeQuote(GEN_Z_MEMES[randomValues[0] % GEN_Z_MEMES.length]);
  }, [viewer?.email]);

  useEffect(() => {
    const loadPrices = async (syncAdminDraft = false) => {
      const response = await fetch("/api/print-prices", { cache: "no-store" });
      if (!response.ok) return;
      const pricePaise = await response.json() as Record<PrintMode, number>;
      const sharedPrices = Object.fromEntries(Object.entries(pricePaise).map(([id, value]) => [id, value / 100])) as Prices;
      setPrices(sharedPrices);
      if (syncAdminDraft) setDraftPrices(sharedPrices);
    };
    loadPrices(true).catch(() => {});
    const refresh = window.setInterval(() => loadPrices().catch(() => {}), 15000);
    const refreshOnFocus = () => loadPrices().catch(() => {});
    window.addEventListener("focus", refreshOnFocus);
    return () => { window.clearInterval(refresh); window.removeEventListener("focus", refreshOnFocus); };
  }, []);

  useEffect(() => { fetch("/api/fee-settings", { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).then((data) => { if (typeof data.gatewayEnabled === "boolean") setGatewayEnabled(data.gatewayEnabled); setSurgeEnabled(Boolean(data.surgeEnabled)); setSurgeType(data.surgeType === "FIXED" ? "FIXED" : "PERCENT"); setSurgeValue(Number(data.surgeValue) || 0); setLateNightEnabled(Boolean(data.lateNightEnabled)); setLateNightType(data.lateNightType === "FIXED" ? "FIXED" : "PERCENT"); setLateNightValue(Number(data.lateNightValue) || 0); }).catch(() => {}); }, []);

  useEffect(() => {
    const loadAvailability = async () => {
      const response = await fetch("/api/order-availability", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setAcceptingOrders(Boolean(data.acceptingOrders));
        setLaunchAt(data.launchAt);
        setLaunchMessage(data.launchMessage);
        const ist = new Date(new Date(data.launchAt).getTime() + 330 * 60 * 1000).toISOString().slice(0, 16);
        setLaunchInput(ist);
      }
    };
    loadAvailability().catch(() => {});
    const refresh = window.setInterval(() => loadAvailability().catch(() => {}), 15000);
    return () => window.clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (acceptingOrders) return;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [acceptingOrders]);

  useEffect(() => {
    if (!viewer) return;
    fetch("/api/me").then((response) => response.json()).then(async (data) => {
      setRole(data.role); setApprovalStatus(data.approvalStatus ?? null); setIsRiderAvailable(Boolean(data.isAvailable)); setMyReferralCode(data.referralCode ?? ""); setPointsBalance(Number(data.pointsBalance) || 0); setHasReferrer(Boolean(data.hasReferrer));
      const pendingCode = window.localStorage.getItem("printbee-referral-code");
      if (pendingCode && !data.hasReferrer) {
        const linked = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralCode: pendingCode }) });
        const result = await linked.json().catch(() => ({}));
        setAuthMessage(linked.ok ? "Referral code verified and linked to your account." : result.error ?? "Referral code could not be verified.");
        if (linked.ok) setHasReferrer(true);
      }
      window.localStorage.removeItem("printbee-referral-code");
    }).catch(() => {});
  }, [viewer]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
    if (!code) return;
    setReferralCode(code);
    window.localStorage.setItem("printbee-referral-code", code);
    if (!viewer) setLoginOpen(true); else setWalletOpen(true);
  }, [viewer?.email]);

  useEffect(() => {
    if (!viewer || viewer.isAdmin) return;
    const checkWalletCredits = async () => {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setPointsBalance(Number(data.pointsBalance) || 0);
      const credit = data.latestCredit;
      if (!credit?.id) return;
      const seenKey = `printbee-wallet-credit-${viewer.email}`;
      if (window.localStorage.getItem(seenKey) === credit.id) return;
      window.localStorage.setItem(seenKey, credit.id);
      setNotificationToast({ title: `+${credit.points} wallet points`, body: credit.description });
      await sendOrderNotification(`+${credit.points} PrintBee wallet points`, credit.description, `wallet-${credit.id}`);
    };
    checkWalletCredits().catch(() => {});
    const refresh = window.setInterval(() => checkWalletCredits().catch(() => {}), 15000);
    return () => window.clearInterval(refresh);
  }, [viewer?.email]);

  useEffect(() => {
    if (!viewer) return;
    fetch("/api/cart", { cache: "no-store" }).then((response) => response.ok ? response.json() : []).then((items) => setCart(Array.isArray(items) ? items : [])).catch(() => {});
  }, [viewer?.email]);

  useEffect(() => {
    const storedMode = window.localStorage.getItem("printbee-login-mode");
    if (storedMode === "PARTNER") setLoginMode("PARTNER");
  }, []);

  useEffect(() => {
    if (!viewer || viewer.isAdmin || loginMode !== "PARTNER") return;
    loadRiderOrders();
    const refresh = window.setInterval(loadRiderOrders, 15000);
    return () => window.clearInterval(refresh);
  }, [viewer, loginMode, approvalStatus]);

  useEffect(() => {
    if (!myOrdersOpen || !viewer) return;
    const refresh = window.setInterval(async () => {
      const response = await fetch("/api/orders/my", { cache: "no-store" });
      if (response.ok) setMyOrders(await response.json());
    }, 15000);
    return () => window.clearInterval(refresh);
  }, [myOrdersOpen, viewer]);

  useEffect(() => {
    QRCode.toDataURL(window.location.origin, {
      width: 280,
      margin: 2,
      color: { dark: "#171a20", light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then(setAppQr).catch(() => setAppQr(""));
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => setNotificationMessage("Notification setup failed. Reload the page and try again."));
    }
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "default") setNotificationPromptOpen(true);
    }
    fetch("/api/print-services", { cache: "no-store" }).then((response) => response.ok ? response.json() : []).then(setPrintServices).catch(() => {});
    fetch("/api/packaging-charges").then((response) => response.ok ? response.json() : []).then(setPackagingRules).catch(() => {});
  }, []);

  useEffect(() => {
    if (!notificationToast) return;
    const timer = window.setTimeout(() => setNotificationToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notificationToast]);

  useEffect(() => {
    if (!adminOpen || adminSection !== "orders") return;
    let lastNewest = dashboard?.orders?.[0]?.id ?? "";
    const refresh = window.setInterval(async () => {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json();
      const newest = next.orders?.[0]?.id ?? "";
      if (lastNewest && newest && newest !== lastNewest) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const context = new AudioContextClass();
          [0, 0.22].forEach((delay) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.35, context.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.18);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(context.currentTime + delay);
            oscillator.stop(context.currentTime + delay + 0.2);
          });
        } catch {}
        sendOrderNotification("New PrintBee order", `${next.orders[0].order_number} has just arrived.`, `admin-${newest}`);
      }
      lastNewest = newest;
      setDashboard(next);
    }, 5000);
    return () => window.clearInterval(refresh);
  }, [adminOpen, adminSection]);

  useEffect(() => {
    if (!viewer || viewer.isAdmin || loginMode !== "CUSTOMER") return;
    checkCustomerNotifications();
    const refresh = window.setInterval(checkCustomerNotifications, 15000);
    return () => window.clearInterval(refresh);
  }, [viewer, loginMode, notificationPermission]);

  const selected = options.find((item) => item.id === mode)!;
  const selectedService = printServices.find((service) => service.id === serviceId);
  const servicePrice = (selectedService?.price_paise ?? 0) / 100;
  const usesMixedPagePricing = MIXED_PRINT_SERVICES.has(serviceId);
  const colourPageResult = useMemo(() => parsePageNumbers(colourPageNumbers, pages), [colourPageNumbers, pages]);
  const colourPageCount = colourChoice === "colour" ? pages : colourChoice === "mixed" ? colourPageResult.count : 0;
  const bwPageCount = pages - colourPageCount;
  const bwPageNumbers = useMemo(() => {
    if (colourChoice === "bw") return formatPageRanges(Array.from({ length: pages }, (_, index) => index + 1));
    if (colourChoice === "colour") return "NA";
    if (colourChoice !== "mixed" || colourPageResult.invalid.length) return "";
    const colourSet = new Set(colourPageResult.pages);
    return formatPageRanges(Array.from({ length: pages }, (_, index) => index + 1).filter((page) => !colourSet.has(page)));
  }, [colourChoice, colourPageResult, pages]);
  const side = "single";
  const mixedPrintTotal = (bwPageCount * prices[`bw-${side}`] + colourPageCount * prices[`colour-${side}`]) * copies;
  const total = usesMixedPagePricing ? mixedPrintTotal + servicePrice : pages * copies * prices[mode] + servicePrice;
  const colourPagesValid = colourChoice === "bw" || colourChoice === "colour" || (colourChoice === "mixed" && colourPageNumbers.trim().length > 0 && colourPageResult.invalid.length === 0);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      event.target.value = "";
      setFileName("");
      setSelectedFile(null);
      setUploadError(`"${file.name}" is too large. Please upload a PDF or image smaller than 50 MB.`);
      return;
    }
    if (!PRINTABLE_FILE_EXTENSIONS.test(file.name)) {
      event.target.value = "";
      setUploadError("This file type cannot be printed. Choose a document, spreadsheet, presentation, text file, or image.");
      return;
    }
    setFileName(file.name);
    setSelectedFile(file);
    setColourChoice("");
    setColourPageNumbers("");
    setUploadError("");
    setCountingPages(true);
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        setPages(pdf.getPageCount());
        setFileType("PDF");
      } else if (IMAGE_EXTENSIONS.test(file.name)) {
        setPages(1);
        setFileType("IMAGE");
      } else {
        setPages(1);
        setFileType("DOCUMENT");
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
    if (usesMixedPagePricing && !colourPagesValid) return setUploadError("Enter valid colour page numbers, or select NA if there are no colour pages.");
    if (selectedFile.size > MAX_UPLOAD_BYTES) return setUploadError("This file is larger than the 50 MB upload limit.");
    setCountingPages(true);
    setUploadProgress(0);
    setUploadError("");
    let uploadFile = selectedFile;
    try {
      uploadFile = await optimizeImageForUpload(selectedFile);
    } catch {
      setCountingPages(false);
      return setUploadError("This image could not be optimized for upload. Please save it as JPG or WebP and try again.");
    }
    let uploaded: any;
    try {
      uploaded = await uploadPrintableFile(uploadFile, pages, setUploadProgress);
    } catch (error) {
      return setUploadError(error instanceof Error ? error.message : "The document could not be uploaded. Check your connection and try again.");
    } finally {
      setCountingPages(false);
      setUploadProgress(null);
    }
    const service = printServices.find((item) => item.id === serviceId);
    const cartItem: CartItem = {
        id: crypto.randomUUID(),
        uploadId: uploaded.uploadId,
        fileName,
        fileType,
        pages,
        copies,
        mode: usesMixedPagePricing ? (colourChoice === "colour" ? "colour-single" : "bw-single") : mode,
        unitPrice: usesMixedPagePricing ? (mixedPrintTotal / Math.max(1, pages * copies)) : prices[mode],
        bwUnitPrice: prices["bw-single"],
        colourUnitPrice: prices["colour-single"],
        total,
        serviceId,
        serviceName: service?.name ?? "Document printing",
        servicePrice: (service?.price_paise ?? 0) / 100,
        countsForPackaging: Boolean(service?.counts_for_packaging ?? 1),
        printInstructions: printInstructions.trim(),
        colourPages: usesMixedPagePricing ? colourPageCount : undefined,
        colourPageNumbers: usesMixedPagePricing ? (colourChoice === "bw" ? "NA" : colourChoice === "colour" ? "All pages" : colourPageNumbers.trim()) : undefined,
        bwPageNumbers: usesMixedPagePricing ? bwPageNumbers : undefined,
        whatsappNumber: whatsappNumber.replace(/\D/g, ""),
      };
    try {
      const cartResponse = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cartItem) });
      const cartResult = await cartResponse.json().catch(() => ({}));
      if (!cartResponse.ok) throw new Error(cartResult.error ?? "The cart could not be saved.");
    } catch (error) {
      await fetch(`/api/cart?uploadId=${encodeURIComponent(cartItem.uploadId)}`, { method: "DELETE" }).catch(() => {});
      return setUploadError(error instanceof Error ? error.message : "The cart could not be saved. Please try again.");
    }
    setCart((items) => [...items, cartItem]);
    setFileName("");
    setSelectedFile(null);
    setPages(1);
    setCopies(1);
    setPrintInstructions("");
    setColourPageNumbers("");
    setColourChoice("");
  };

  const removeFromCart = async (item: CartItem) => {
    const response = await fetch(`/api/cart?uploadId=${encodeURIComponent(item.uploadId)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return setUploadError(data.error ?? "This item could not be removed. Please try again.");
    }
    setCart((items) => items.filter((current) => current.id !== item.id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
  const cartServiceCharges = cart.reduce((sum, item) => sum + (item.servicePrice || 0), 0);
  const cartPrintingTotal = cartTotal - cartServiceCharges;
  const cartPrintedPages = cart.reduce((sum, item) => sum + (item.countsForPackaging !== false ? item.pages * item.copies : 0), 0);
  const packagingFee = (packagingRules.find((rule) => cartPrintedPages >= rule.min_pages && cartPrintedPages <= rule.max_pages)?.charge_paise ?? 0) / 100;

  const savePrices = async () => {
    const response = await fetch("/api/print-prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftPrices) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setNotificationMessage(data.error ?? "Prices could not be saved."); return; }
    setPrices(Object.fromEntries(Object.entries(data).map(([id, value]) => [id, Number(value) / 100])) as Prices);
    setNotificationMessage("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const toggleOrderAvailability = async () => {
    const next = !acceptingOrders;
    const response = await fetch("/api/order-availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptingOrders: next, launchAt, launchMessage }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setNotificationMessage(data.error ?? "Order availability could not be updated."); return; }
    setAcceptingOrders(Boolean(data.acceptingOrders));
    setNotificationMessage(data.acceptingOrders ? "Orders are ON. Customers can place orders now." : "Orders are OFF. Customers will see that service will be live soon.");
  };

  const saveLaunchSchedule = async () => {
    const parsedSchedule = new Date(`${launchInput}:00+05:30`);
    if (!launchInput || Number.isNaN(parsedSchedule.getTime()) || !launchMessage.trim()) { setNotificationMessage("Enter a valid IST launch time and message."); return; }
    const scheduledAt = parsedSchedule.toISOString();
    const response = await fetch("/api/order-availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptingOrders, launchAt: scheduledAt, launchMessage }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setNotificationMessage(data.error ?? "Launch schedule could not be saved."); return; }
    setLaunchAt(data.launchAt);
    setLaunchMessage(data.launchMessage);
    setCountdownNow(Date.now());
    setNotificationMessage("Launch countdown and message saved.");
  };

  const countdownMs = Math.max(0, new Date(launchAt).getTime() - countdownNow);
  const countdown = {
    days: Math.floor(countdownMs / 86400000),
    hours: Math.floor((countdownMs % 86400000) / 3600000),
    minutes: Math.floor((countdownMs % 3600000) / 60000),
    seconds: Math.floor((countdownMs % 60000) / 1000),
  };

  const saveFeeSettings = async (updates: Partial<{ gatewayEnabled: boolean; surgeEnabled: boolean; surgeType: "PERCENT" | "FIXED"; surgeValue: number; lateNightEnabled: boolean; lateNightType: "PERCENT" | "FIXED"; lateNightValue: number }> = {}) => {
    const settings = { gatewayEnabled, surgeEnabled, surgeType, surgeValue, lateNightEnabled, lateNightType, lateNightValue, ...updates };
    const response = await fetch("/api/fee-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setNotificationMessage(data.error ?? "Fee settings could not be saved."); return; }
    setGatewayEnabled(data.gatewayEnabled); setSurgeEnabled(data.surgeEnabled); setSurgeType(data.surgeType); setSurgeValue(data.surgeValue); setLateNightEnabled(data.lateNightEnabled); setLateNightType(data.lateNightType); setLateNightValue(data.lateNightValue); setNotificationMessage("Checkout fee settings saved.");
  };

  const supabase = supabaseConfig
    ? createBrowserClient(
        supabaseConfig.url,
        supabaseConfig.anonKey,
      )
    : null;

  const signInWithGoogle = async (mode: "CUSTOMER" | "PARTNER" = "CUSTOMER") => {
    window.localStorage.setItem("printbee-login-mode", mode);
    setLoginMode(mode);
    if (referralCode.trim()) window.localStorage.setItem("printbee-referral-code", referralCode.trim().toUpperCase());
    if (!supabase) return setAuthMessage("Authentication is awaiting Supabase configuration.");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const signInWithPassword = async () => {
    setAuthMessage("");
    if (!supabase) return setAuthMessage("Authentication is awaiting configuration.");
    if (!reviewerEmail.trim() || !reviewerPassword) return setAuthMessage("Enter the reviewer email and password.");
    window.localStorage.setItem("printbee-login-mode", "CUSTOMER");
    const { error } = await supabase.auth.signInWithPassword({ email: reviewerEmail.trim(), password: reviewerPassword });
    if (error) return setAuthMessage("The email or password is incorrect.");
    if (referralCode.trim()) window.localStorage.setItem("printbee-referral-code", referralCode.trim().toUpperCase());
    window.location.reload();
  };

  const signOut = async () => {
    window.localStorage.removeItem("printbee-login-mode");
    await supabase?.auth.signOut();
    window.location.reload();
  };

  const switchLoginMode = (mode: "CUSTOMER" | "PARTNER") => {
    window.localStorage.setItem("printbee-login-mode", mode);
    setLoginMode(mode);
    setLoginOpen(false);
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
      body: JSON.stringify({ customerName, mobileNumber, locationId, items: cart, totalPaise: Math.round(cartTotal * 100), usePoints }),
    });
    const data = await response.json();
    if (!response.ok) return setOrderError(data.error ?? "Order could not be placed");
    setCart([]);
    if (data.pointsRedeemed) setPointsBalance((current) => Math.max(0, current - data.pointsRedeemed));
    const pendingResult = { ...data, paid: false };
    setOrderResult(pendingResult);
    await startRazorpayPayment(pendingResult);
  };

  const startRazorpayPayment = async (order: { id: string; orderNumber?: string; totalPaise?: number }) => {
    setOrderError("");
    setPaymentProcessing(true);
    try {
      if (!document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Checkout failed to load"));
          document.head.appendChild(script);
        });
      }
      const createResponse = await fetch("/api/payments/razorpay/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id }) });
      const paymentOrder = await createResponse.json();
      if (!createResponse.ok) throw new Error(paymentOrder.error ?? "Payment could not be started");
      const RazorpayCheckout = (window as unknown as { Razorpay?: new (options: Record<string, unknown>) => { open(): void } }).Razorpay;
      if (!RazorpayCheckout) throw new Error("Razorpay Checkout is unavailable");
      const checkout = new RazorpayCheckout({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: "PrintBee",
        description: `Payment for ${paymentOrder.orderNumber}`,
        order_id: paymentOrder.razorpayOrderId,
        prefill: { name: customerName, email: viewer?.email, contact: mobileNumber },
        theme: { color: "#e0ad00" },
        handler: async (result: RazorpayResult) => {
          const verifyResponse = await fetch("/api/payments/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, ...result }) });
          const verified = await verifyResponse.json();
          if (!verifyResponse.ok) return setOrderError(verified.error ?? "Payment verification failed");
          setOrderResult((current) => current?.id === order.id ? { ...current, paid: true, deliveryCode: verified.deliveryCode } : current);
          await sendOrderNotification("Payment successful", `${paymentOrder.orderNumber} was paid and verified.`, `${order.id}-paid`);
          await checkCustomerNotifications();
        },
        modal: { ondismiss: () => setPaymentProcessing(false) },
      });
      checkout.open();
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Payment could not be started");
    } finally {
      setPaymentProcessing(false);
    }
  };

  const openMyOrders = async () => {
    if (!viewer) return setLoginOpen(true);
    const response = await fetch("/api/orders/my", { cache: "no-store" });
    if (response.ok) setMyOrders(await response.json());
    setMyOrdersOpen(true);
  };

  const sendOrderNotification = async (title: string, body: string, tag: string) => {
    setNotificationToast({ title, body });
    navigator.vibrate?.([180, 80, 180]);
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.36);
    } catch {}
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    try {
      if ("serviceWorker" in navigator) {
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Service worker timeout")), 3000)),
        ]);
        await registration.showNotification(title, { body, tag, icon: "/printbee-logo.png", badge: "/printbee-logo.png" });
      } else {
        new Notification(title, { body, tag, icon: "/printbee-logo.png" });
      }
      return true;
    } catch {
      try {
        new Notification(title, { body, tag, icon: "/printbee-logo.png" });
        return true;
      } catch {
        return false;
      }
    }
  };

  const enableNotifications = async () => {
    setNotificationMessage("");
    if (!("Notification" in window)) return setNotificationMessage("This browser does not support notifications. On iPhone, add PrintBee to the Home Screen and open it from there.");
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      setNotificationPromptOpen(false);
      window.localStorage.removeItem(`printbee-order-notifications-${viewer?.email ?? "user"}`);
      const sent = await sendOrderNotification("PrintBee notifications enabled", "This is a test. Order updates will appear like this while PrintBee is open.", `printbee-enabled-${Date.now()}`);
      setNotificationMessage(sent ? "Test notification sent. Check your notification tray." : "Permission was granted, but this browser blocked the test notification.");
    } else if (permission === "denied") {
      setNotificationPromptOpen(false);
      setNotificationMessage("Notifications are blocked. Allow them in your browser’s site settings, then reload PrintBee.");
    }
  };

  const testNotifications = async () => {
    const sent = await sendOrderNotification("PrintBee test notification", "Notifications are working on this device.", `printbee-test-${Date.now()}`);
    setNotificationMessage(sent ? "Test notification sent. Check your notification tray." : "The browser did not deliver the notification. Check site and device notification settings.");
  };

  const checkCustomerNotifications = async () => {
    try {
      const response = await fetch("/api/orders/my", { cache: "no-store" });
      if (!response.ok) return;
      const orders = await response.json() as any[];
      setMyOrders(orders);
      const storageKey = `printbee-order-notifications-${viewer?.email ?? "user"}`;
      const previous = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, any>;
      for (const order of orders) {
        if (order.payment_status !== "PAID") continue;
        const before = previous[order.id];
        if ((!before || before.payment_status !== "PAID") && Date.now() - new Date(order.created_at).getTime() < 30 * 60 * 1000) await sendOrderNotification("Order received", `${order.order_number} has been paid and received by PrintBee.`, `${order.id}-received`);
        if (order.has_payment_qr && !before?.has_payment_qr) await sendOrderNotification("Payment QR generated", `${order.order_number}: Pay while we deliver. Open My Orders and scan the payment scanner. Displaying the scanner may take a little time.`, `${order.id}-qr`);
        if (order.status === "PRINTING" && before?.status !== "PRINTING") await sendOrderNotification("Printing started", `${order.order_number} is now being printed.`, `${order.id}-printing`);
        if (order.status === "READY_FOR_PICKUP" && before?.status !== "READY_FOR_PICKUP") await sendOrderNotification("Ready for pickup", `${order.order_number} is printed and ready for a delivery partner.`, `${order.id}-ready`);
        if (order.status === "RIDER_ASSIGNED" && before?.status !== "RIDER_ASSIGNED") await sendOrderNotification("Delivery partner assigned", `${order.rider_name || "A delivery partner"} is assigned to ${order.order_number}.`, `${order.id}-rider`);
        if (order.payment_status === "PAID" && before?.payment_status !== "PAID") await sendOrderNotification("Payment verified", `Payment for ${order.order_number} was received and verified. Share the OTP only after receiving your prints.`, `${order.id}-paid`);
        if (order.status === "DELIVERED" && before?.status !== "DELIVERED") await sendOrderNotification("Order delivered", `${order.order_number} has been marked delivered. Thank you for using PrintBee.`, `${order.id}-delivered`);
      }
      const snapshot = Object.fromEntries(orders.map((order) => [order.id, { status: order.status, payment_status: order.payment_status, has_payment_qr: Boolean(order.has_payment_qr) }]));
      window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch {}
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

  const reviewPayment = async (orderId: string, decision: "APPROVE" | "REJECT", missing?: "REFERENCE" | "AMOUNT" | "BOTH") => {
    const response = await fetch("/api/admin/orders/payment-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, decision, missing }) });
    const data = await response.json();
    setAdminMessage(response.ok ? (decision === "APPROVE" ? "Payment approved. Order can now move to printing." : data.reason) : data.error);
    await openAdminDashboard();
  };

  const deleteOrderFiles = async (orderId: string) => {
    if (!window.confirm("Delete the stored documents for this completed order? Order, customer and payment records will be preserved.")) return;
    const response = await fetch("/api/admin/orders/delete-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
    const data = await response.json();
    setAdminMessage(response.ok ? `${data.deleted} stored document${data.deleted === 1 ? "" : "s"} deleted. All order and payment records were preserved.` : data.error);
    await openAdminDashboard();
  };

  const uploadPaymentQr = async (orderId: string, file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/orders/${orderId}/payment-qr`, { method: "POST", body: form });
    const data = await response.json();
    setAdminMessage(response.ok ? "Order payment scanner uploaded. It is now visible to the customer and assigned rider." : data.error);
    await openAdminDashboard();
  };

  const deleteOrder = async (order: any) => {
    const confirmation = window.prompt(`Permanently delete only order ${order.order_number} and its stored documents? This cannot be undone. Type ${order.order_number} to continue.`);
    if (confirmation?.trim().toUpperCase() !== order.order_number) return setAdminMessage("Order deletion cancelled.");
    const response = await fetch("/api/admin/orders/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    });
    const data = await response.json();
    setAdminMessage(response.ok ? `${data.orderNumber} and ${data.deletedFiles} stored file${data.deletedFiles === 1 ? "" : "s"} permanently deleted.` : data.error);
    if (response.ok) await openAdminDashboard();
  };

  const setOrderHidden = async (orderId: string, hidden: boolean) => {
    if (hidden && !window.confirm("Hide this order from the main dashboard, revenue, profit, location and rider totals, and all exports? You can restore it from Hidden orders.")) return;
    const response = await fetch("/api/admin/orders/visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, hidden }),
    });
    const data = await response.json();
    setAdminMessage(response.ok ? (hidden ? "Order moved to Hidden orders." : "Order restored to the main dashboard and calculations.") : data.error);
    if (response.ok) await openAdminDashboard();
  };

  const exportOrdersPdf = async (range: "1d" | "30d" | "custom") => {
    if (range === "custom" && (!exportFrom || !exportTo)) return setAdminMessage("Choose both custom export dates.");
    setExporting(true);
    setAdminMessage("");
    try {
      const query = new URLSearchParams({ range });
      if (range === "custom") {
        query.set("from", exportFrom);
        query.set("to", exportTo);
      }
      const response = await fetch(`/api/admin/orders/export?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Export could not be created");
      const pdf = await PDFDocument.create();
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pageSize: [number, number] = [595.28, 841.89];
      let page = pdf.addPage(pageSize);
      let y = 800;
      const drawHeader = () => {
        page.drawText("PrintBee Orders Report", { x: 40, y, size: 18, font: bold, color: rgb(0.08, 0.08, 0.1) });
        y -= 22;
        page.drawText(`${new Date(data.from).toLocaleString("en-IN")} to ${new Date(data.to).toLocaleString("en-IN")} | Visible orders only`, { x: 40, y, size: 8, font: regular });
        y -= 18;
      };
      drawHeader();
      let collected = 0;
      for (const order of data.orders as any[]) {
        if (y < 105) {
          page = pdf.addPage(pageSize);
          y = 800;
          drawHeader();
        }
        collected += order.payment_status === "PAID" ? Number(order.total_paise) : 0;
        page.drawText(`${order.order_number} | ${new Date(order.created_at).toLocaleString("en-IN")}`, { x: 40, y, size: 10, font: bold });
        y -= 13;
        page.drawText(`${order.customer_name} | ${order.mobile_number} | ${order.location_name}`.slice(0, 92), { x: 40, y, size: 8, font: regular });
        y -= 12;
        page.drawText(`Print INR ${(order.printing_subtotal_paise / 100).toFixed(2)} | Delivery INR ${(order.delivery_fee_paise / 100).toFixed(2)} | Platform INR ${(order.platform_fee_paise / 100).toFixed(2)} | Total INR ${(order.total_paise / 100).toFixed(2)}`, { x: 40, y, size: 8, font: regular });
        y -= 12;
        page.drawText(`${order.payment_status} | ${order.status} | Rider: ${order.rider_email || "Not assigned"}`.slice(0, 100), { x: 40, y, size: 8, font: regular });
        y -= 18;
      }
      if (!data.orders.length) page.drawText("No visible orders were found in this date range.", { x: 40, y, size: 11, font: regular });
      const firstPage = pdf.getPages()[0];
      firstPage.drawText(`Orders: ${data.orders.length}   Paid revenue: INR ${(collected / 100).toFixed(2)}`, { x: 40, y: 28, size: 9, font: bold });
      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `printbee-orders-${range === "custom" ? `${exportFrom}-to-${exportTo}` : range}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setAdminMessage(`PDF exported with ${data.orders.length} visible order${data.orders.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Export could not be created");
    } finally {
      setExporting(false);
    }
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

  const setRiderAvailability = async (available: boolean) => {
    const response = await fetch("/api/rider/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setIsRiderAvailable(Boolean(data.isAvailable)); else setDeliveryMessage(data.error ?? "Availability could not be updated");
  };

  const rejectRiderOrder = async (orderId: string) => {
    const response = await fetch("/api/rider/orders/reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
    const data = await response.json().catch(() => ({}));
    setDeliveryMessage(response.ok ? "Assignment rejected. The admin can now choose another available rider." : data.error);
    if (response.ok) await loadRiderOrders();
  };

  const grantOrderPoints = async (orderId: string) => {
    const points = Math.round(Number(grantPointDrafts[orderId]));
    if (!points) return;
    const response = await fetch("/api/admin/orders/points", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, points }) });
    const data = await response.json().catch(() => ({}));
    setAdminMessage(response.ok ? `${points} wallet points credited to the customer.` : data.error ?? "Points could not be credited");
    if (response.ok) setGrantPointDrafts((drafts) => ({ ...drafts, [orderId]: "" }));
  };

  const linkExistingReferral = async () => {
    setWalletMessage("");
    const response = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralCode }) });
    const data = await response.json().catch(() => ({}));
    setWalletMessage(response.ok ? "Referral code verified. You are now linked to future referral offers." : data.error ?? "Referral code could not be verified");
    if (response.ok) { setHasReferrer(true); window.localStorage.removeItem("printbee-referral-code"); }
  };

  const shareReferral = async () => {
    const link = `${window.location.origin}/?ref=${encodeURIComponent(myReferralCode)}`;
    try {
      if (navigator.share) await navigator.share({ title: "PrintBee", text: `Use my PrintBee referral code ${myReferralCode}`, url: link });
      else { await navigator.clipboard.writeText(link); setWalletMessage("Referral link copied to your clipboard."); }
    } catch { /* The user can cancel the share sheet. */ }
  };

  const submitFeedback = async () => {
    setFeedbackMessage("");
    const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: feedbackOrder?.id, ...feedback }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setFeedbackMessage(data.error ?? "Feedback could not be submitted");
    setFeedbackMessage("Thank you! Your feedback was submitted.");
    setMyOrders((orders) => orders.map((order) => order.id === feedbackOrder.id ? { ...order, feedback_submitted: 1 } : order));
    window.setTimeout(() => { setFeedbackOrder(null); setFeedbackMessage(""); }, 900);
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

  const addPrintService = async () => {
    const response = await fetch("/api/print-services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newService) });
    const data = await response.json();
    setAdminMessage(response.ok ? `${data.name} saved in the customer service options.` : data.error);
    if (response.ok) {
      setNewService({ id: "", name: "", description: "", isBinding: false, countsForPackaging: true, price: 0 });
      const servicesResponse = await fetch("/api/print-services");
      if (servicesResponse.ok) setPrintServices(await servicesResponse.json());
    }
  };

  const removePrintService = async (id: string) => {
    const response = await fetch("/api/print-services", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (response.ok) setPrintServices((items) => items.filter((item) => item.id !== id));
  };

  const savePackagingRule = async () => {
    const response = await fetch("/api/packaging-charges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packagingDraft) });
    const data = await response.json();
    setAdminMessage(response.ok ? "Handling charge saved." : data.error);
    if (response.ok) {
      const rulesResponse = await fetch("/api/packaging-charges");
      if (rulesResponse.ok) setPackagingRules(await rulesResponse.json());
      setPackagingDraft({ id: "", minPages: 1, maxPages: 25, charge: 0 });
    }
  };

  const deletePackagingRule = async (id: string) => {
    await fetch("/api/packaging-charges", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const response = await fetch("/api/packaging-charges");
    if (response.ok) setPackagingRules(await response.json());
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

  const updateLocationFees = async (locationId: string, deliveryFee: number, platformFee: number) => {
    const response = await fetch("/api/admin/locations/fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId, deliveryFee, platformFee }) });
    const data = await response.json();
    setAdminMessage(response.ok ? "Location fees updated." : data.error);
    await openAdminDashboard();
  };

  const editLocationFees = async (location: any) => {
    const delivery = window.prompt(`Delivery charge for ${location.name} (₹)`, String((location.delivery_fee_paise ?? 1500) / 100));
    if (delivery === null) return;
    const platform = window.prompt(`Platform fee for ${location.name} (₹)`, String((location.platform_fee_paise ?? 350) / 100));
    if (platform === null) return;
    await updateLocationFees(location.id, Number(delivery), Number(platform));
  };

  const renameLocation = async (location: any) => {
    const name = window.prompt("Enter the new delivery location name", location.name);
    if (!name || name.trim() === location.name) return;
    const response = await fetch("/api/admin/locations/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: location.id, action: "RENAME", name }) });
    const data = await response.json();
    setAdminMessage(response.ok ? `Location renamed to ${data.name}.` : data.error);
    await openAdminDashboard();
  };

  const deleteLocation = async (location: any) => {
    if (!window.confirm(`Remove "${location.name}" from customer delivery options? Historical order records will be preserved.`)) return;
    const response = await fetch("/api/admin/locations/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: location.id, action: "DELETE" }) });
    const data = await response.json();
    setAdminMessage(response.ok ? `${location.name} removed from delivery options.` : data.error);
    await openAdminDashboard();
  };

  const approveRider = async (email: string, approved: boolean) => {
    const response = await fetch("/api/admin/riders/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, approved }) });
    const data = await response.json();
    setAdminMessage(response.ok ? `Rider application ${approved ? "approved" : "rejected"}.` : data.error);
    await openAdminDashboard();
  };

  const removeRider = async (email: string) => {
    if (!window.confirm(`Remove ${email} from the delivery application? Their completed ride and payment history will be preserved.`)) return;
    const response = await fetch("/api/admin/riders/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const data = await response.json();
    setAdminMessage(response.ok ? "Delivery partner removed. Active assigned orders were returned to ready for pickup." : data.error);
    await openAdminDashboard();
  };

  const updateWithdrawalStatus = async (withdrawalId: string, status: string) => {
    const response = await fetch("/api/admin/withdrawals/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ withdrawalId, status }) });
    const data = await response.json();
    setAdminMessage(response.ok ? "Withdrawal status updated." : data.error);
    await openAdminDashboard();
  };

  const submitRiderApplication = async () => {
    if (!viewer) return setAuthMessage("Sign in with Google first, then choose delivery partner registration again.");
    const response = await fetch("/api/rider/application", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(riderApplication) });
    const data = await response.json();
    setAuthMessage(response.ok ? "Details submitted. Once verified by admin, you can continue as a delivery partner." : data.error);
    if (response.ok) setApprovalStatus("PENDING");
  };

  const verifyDelivery = async () => {
    const response = await fetch("/api/orders/verify-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber: deliveryOrderNumber, code: deliveryCode }) });
    const data = await response.json();
    setDeliveryMessage(response.ok ? "Delivery verified. Order marked delivered ✓" : data.error);
    if (response.ok) {
      await sendOrderNotification("Delivery completed", `${deliveryOrderNumber} was delivered. Its uploaded documents have been permanently deleted.`, `${deliveryOrderNumber}-delivered`);
      setDeliveryOrderNumber("");
      setDeliveryCode("");
      await loadRiderOrders();
    }
  };

  const loadRiderOrders = async () => {
    const response = await fetch("/api/rider/orders");
    if (response.ok) {
      const orders = await response.json() as any[];
      setRiderOrders(orders);
      if (!viewer?.isAdmin) {
        const storageKey = `printbee-rider-notifications-${viewer?.email ?? "rider"}`;
        const previous = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, any>;
        for (const order of orders) {
          const before = previous[order.id];
          if (!before) await sendOrderNotification("Order assigned", `${order.order_number} is assigned to you for delivery.`, `${order.id}-rider-assigned`);
          if (order.has_payment_qr && !before?.has_payment_qr) await sendOrderNotification("Payment QR ready", `${order.order_number}: the admin payment scanner is ready to show the customer.`, `${order.id}-rider-qr`);
          if (order.payment_status === "PAID" && before?.payment_status !== "PAID") await sendOrderNotification("Payment verified", `${order.order_number} is paid. The scanner has been removed; collect only the delivery OTP.`, `${order.id}-rider-paid`);
          if (before?.status && order.status !== before.status) await sendOrderNotification("Order updated", `${order.order_number} is now ${String(order.status).replaceAll("_", " ").toLowerCase()}.`, `${order.id}-${order.status}`);
        }
        const snapshot = Object.fromEntries(orders.map((order) => [order.id, { status: order.status, payment_status: order.payment_status, has_payment_qr: Boolean(order.has_payment_qr) }]));
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
      }
    }
    if (!viewer?.isAdmin) {
      const earningsResponse = await fetch("/api/rider/earnings");
      if (earningsResponse.ok) setRiderEarnings(await earningsResponse.json());
    }
  };

  const requestWithdrawal = async () => {
    const response = await fetch("/api/rider/earnings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upiId: withdrawUpi }) });
    const data = await response.json();
    setDeliveryMessage(response.ok ? `Withdrawal requested for ${inr.format(data.amountPaise / 100)}.` : data.error);
    if (response.ok) { setWithdrawUpi(""); await loadRiderOrders(); }
  };

  const openDeliveryQueue = async () => {
    await loadRiderOrders();
    setDeliveryOpen(true);
  };

  const checkoutLocation = locations.find((location) => location.id === locationId);
  const checkoutDeliveryFee = (checkoutLocation?.delivery_fee_paise ?? 1500) / 100;
  const checkoutPlatformFee = (checkoutLocation?.platform_fee_paise ?? 350) / 100;
  const surgeBase = cartTotal + checkoutDeliveryFee + checkoutPlatformFee;
  const checkoutSurgeFee = surgeEnabled ? surgeType === "FIXED" ? surgeValue : surgeBase * surgeValue / 100 : 0;
  const checkoutLateNightFee = lateNightEnabled ? lateNightType === "FIXED" ? lateNightValue : surgeBase * lateNightValue / 100 : 0;
  const checkoutGatewayFee = gatewayEnabled ? surgeBase * .01 : 0;
  const checkoutBeforePoints = cartTotal + checkoutDeliveryFee + checkoutPlatformFee + packagingFee + checkoutSurgeFee + checkoutLateNightFee + checkoutGatewayFee;
  const redeemablePoints = Math.min(pointsBalance, Math.max(0, Math.floor((checkoutBeforePoints - 1) * 15)));
  const pointsDiscount = usePoints ? Math.floor(redeemablePoints * 100 / 15) / 100 : 0;
  const revenueNow = new Date();
  const revenueStart = dashboardRange === "today" ? new Date(revenueNow.getFullYear(), revenueNow.getMonth(), revenueNow.getDate()) : dashboardRange === "week" ? new Date(revenueNow.getFullYear(), revenueNow.getMonth(), revenueNow.getDate() - 6) : new Date(revenueNow.getFullYear(), revenueNow.getMonth(), 1);
  const dashboardOrdersForRange = (dashboard?.orders ?? []).filter((order: any) => new Date(order.created_at) >= revenueStart);
  const revenueTotals = revenueSummary(dashboardOrdersForRange, prices);
  const dashboardSummaryForRange = {
    total: dashboardOrdersForRange.length,
    paid: dashboardOrdersForRange.filter((order: any) => order.payment_status === "PAID").length,
    unpaid: dashboardOrdersForRange.filter((order: any) => order.payment_status !== "PAID").length,
    delivered: dashboardOrdersForRange.filter((order: any) => order.status === "DELIVERED").length,
    ready: dashboardOrdersForRange.filter((order: any) => order.status === "READY_FOR_PICKUP").length,
    revenuePaise: dashboardOrdersForRange.reduce((sum: number, order: any) => sum + (Number(order.total_paise) || 0), 0),
  };
  const printTotalsForRange = printSummary(dashboardOrdersForRange.flatMap((order: any) => order.items || []));

  if (viewer && !viewer.isAdmin && loginMode === "PARTNER") {
    const partnerApproved = role === "AGENT" && approvalStatus === "APPROVED";
    return (
      <main className="partner-portal">
        <header className="partner-topbar">
          <a className="brand" href="#" aria-label="PrintBee delivery partner"><img src="/printbee-logo.png" width={60} height={60} alt="PrintBee" /><span><strong>Print<span>Bee</span></strong><small>Delivery Partner</small></span></a>
          <div><button onClick={() => switchLoginMode("CUSTOMER")}>Use PrintBee as customer</button><button onClick={signOut}>Sign out</button></div>
        </header>
        {!partnerApproved ? (
          <section className="partner-application-card">
            <div className="admin-badge">DELIVERY PARTNER APPLICATION</div>
            <h1>{approvalStatus === "PENDING" ? "Verification pending" : "Complete your rider profile"}</h1>
            {approvalStatus === "PENDING" ? <p>Your details were submitted successfully. Once verified by the admin, you can continue as a delivery partner.</p> : <>
              <p>You are signed in with <strong>{viewer.email}</strong>. Enter your details and submit them for admin verification.</p>
              <label>Full name<input value={riderApplication.name} onChange={(e) => setRiderApplication({ ...riderApplication, name: e.target.value })} placeholder="Your full name" /></label>
              <label>Mobile number<input inputMode="numeric" value={riderApplication.mobileNumber} onChange={(e) => setRiderApplication({ ...riderApplication, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile number" /></label>
              <button disabled={!riderApplication.name.trim() || riderApplication.mobileNumber.length !== 10} onClick={submitRiderApplication}>Submit for admin verification</button>
            </>}
            {approvalStatus === "REMOVED" && <p className="customer-error">Your delivery-partner access was removed. You may submit your details again for a new admin review.</p>}
            {authMessage && <p className="auth-message">{authMessage}</p>}
          </section>
        ) : (
          <div className="partner-dashboard">
            <section className="partner-welcome"><div><div className="admin-badge">DELIVERY PARTNER</div><h1>Your delivery dashboard</h1><p>Only orders assigned to your account are shown here.</p></div><div className="availability-control"><span>Available for delivery</span><button role="switch" aria-checked={isRiderAvailable} className={`availability-toggle ${isRiderAvailable ? "available" : ""}`} onClick={() => setRiderAvailability(!isRiderAvailable)}><i /><b>{isRiderAvailable ? "YES" : "NO"}</b></button><button onClick={loadRiderOrders}>Refresh orders</button></div></section>
            {riderEarnings && <section className="partner-earnings">
              <div><small>Successful rides</small><strong>{riderEarnings.totalRides}</strong></div><div><small>Total earnings</small><strong>{inr.format(riderEarnings.earnedPaise / 100)}</strong></div><div><small>Available balance</small><strong>{inr.format(riderEarnings.availablePaise / 100)}</strong></div>
              <p>You earn 75% of the delivery fee for each OTP-verified delivery.</p>
              <label>UPI ID<input value={withdrawUpi} onChange={(e) => setWithdrawUpi(e.target.value)} placeholder="yourname@upi" /></label><button disabled={riderEarnings.availablePaise <= 0 || !withdrawUpi.trim()} onClick={requestWithdrawal}>Withdraw available earnings</button>
              <div className="partner-withdrawal-history">{riderEarnings.withdrawals?.map((withdrawal: any) => <span key={withdrawal.id}><b>{inr.format(withdrawal.amount_paise / 100)}</b><small>{withdrawal.status === "REQUESTED" ? "Withdraw requested" : withdrawal.status === "IN_PROGRESS" ? "In progress" : "Amount sent to bank"} · {withdrawal.upi_id}</small></span>)}</div>
              <div className="rider-order-earnings"><h3>Earnings by delivered order</h3>{riderEarnings.deliveredOrders?.length ? riderEarnings.deliveredOrders.map((order: any) => <article key={order.id}><span><b>{order.order_number}</b><small>{order.location_name} · {new Date(order.delivered_at).toLocaleDateString("en-IN")}</small></span><strong>{inr.format(order.earned_paise / 100)}<small>75% of {inr.format(order.delivery_fee_paise / 100)}</small></strong></article>) : <p>No completed delivery earnings yet.</p>}</div>
            </section>}
            <section className="assigned-orders"><div className="section-title"><div><h2>Assigned orders</h2><p>One rider can receive multiple orders, including several orders at the same location.</p></div><span>{riderOrders.length} active</span></div>
              {riderOrders.length ? riderOrders.map((order) => <article key={order.order_number} className={deliveryOrderNumber === order.order_number ? "selected" : ""}><div><strong>{order.order_number}</strong><small>{order.location_name}</small></div><div><strong>{order.customer_name}</strong><small className="customer-phone">{order.mobile_number}</small></div><span className="status-chip">{order.payment_status === "PAID" ? "PAYMENT VERIFIED" : order.status}</span><div className="delivery-actions"><a href={`tel:${order.mobile_number}`} aria-label={`Call ${order.customer_name} at ${order.mobile_number}`}>Call customer</a><button onClick={() => { setDeliveryOrderNumber(order.order_number); setDeliveryCode(""); }}>{order.payment_status === "PAID" ? "Enter delivery OTP" : "Deliver & verify OTP"}</button><button className="reject-assignment" onClick={() => rejectRiderOrder(order.id)}>Reject assignment</button></div>{Boolean(order.has_payment_qr) && order.payment_status !== "PAID" && <div className="order-payment-qr"><div><strong>Collect {inr.format(order.total_paise / 100)}</strong><small>Show this scanner to the customer for pay on delivery. Tap the scanner to enlarge.</small></div><button className="scanner-expand-button" onClick={() => setExpandedScanner({ src: `/api/orders/${order.id}/payment-qr`, alt: `Payment scanner for ${order.order_number}` })}><img src={`/api/orders/${order.id}/payment-qr`} alt={`Payment scanner for ${order.order_number}`} /></button></div>}{order.payment_status === "PAID" && <div className="payment-cleared-note"><strong>Payment received and verified</strong><small>No payment scanner is required. Collect the customer OTP after handing over the order.</small></div>}</article>) : <div className="empty-partner-orders">No active orders are assigned to you.</div>}
            </section>
            {deliveryOrderNumber && <section className="otp-verification"><div><div className="admin-badge">FINAL DELIVERY STEP</div><h2>Verify customer OTP</h2><p>Order <strong>{deliveryOrderNumber}</strong>. Hand over the prints first, then ask the customer for the six-digit OTP.</p></div><label>Customer OTP<input className="code-input" value={deliveryCode} onChange={(e) => setDeliveryCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" /></label><button disabled={deliveryCode.length !== 6} onClick={verifyDelivery}>Verify OTP & mark delivered</button></section>}
            {deliveryMessage && <p className="partner-message">{deliveryMessage}</p>}
          </div>
        )}
      </main>
    );
  }

  return (
    <main>
      {notificationPromptOpen && (
        <div className="modal-backdrop notification-permission-backdrop" role="presentation">
          <section className="notification-permission-modal" role="dialog" aria-modal="true" aria-labelledby="notification-permission-title">
            <img src="/printbee-logo.png" width={76} height={76} alt="PrintBee" />
            <h2 id="notification-permission-title">Allow order notifications?</h2>
            <p>Get alerts when an order is created, the admin uploads a payment QR, printing starts, a rider is assigned, payment is verified, and delivery is completed.</p>
            <button className="save-button" onClick={enableNotifications}>Allow notifications</button>
            <button className="notification-later" onClick={() => setNotificationPromptOpen(false)}>Not now</button>
          </section>
        </div>
      )}
      {notificationToast && <div className="notification-toast" role="status" aria-live="assertive"><span>🔔</span><div><strong>{notificationToast.title}</strong><p>{notificationToast.body}</p></div><button onClick={() => setNotificationToast(null)} aria-label="Dismiss notification">×</button></div>}
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PrintBee home">
          <img src="/printbee-logo.png" width={74} height={74} alt="PrintBee" />
          <span><strong>Print<span>Bee</span></strong><small>Upload. Print. Delivered.</small></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          {viewer?.isAdmin && <button className="admin-link" onClick={openAdminDashboard}>Admin dashboard</button>}
          {role === "ADMIN" && <button className="admin-link" onClick={openDeliveryQueue}>Delivery</button>}
          {role === "AGENT" && approvalStatus === "APPROVED" && <button className="admin-link" onClick={() => switchLoginMode("PARTNER")}>Partner portal</button>}
          {viewer && <button className="home-wallet-button" onClick={() => { setWalletOpen(true); setWalletMessage(""); }} aria-label={`Wallet balance ${pointsBalance} points`}><span>◉</span><b>{pointsBalance}</b></button>}
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
          <p className="delivery-location-note"><strong>Select the nearest delivery location and share your exact delivery location after a delivery partner is assigned.</strong></p>
          <div className="trust-row">
            <span>✓ Secure files</span><span>✓ Clear pricing</span><span>✓ Doorstep delivery</span>
          </div>
          <div className="payment-home-note">
            <strong>Fed up begging for cash and long queues in DTPs and Xerox centers?</strong>
            <span>Scan and relax — we deliver your documents safely.</span>
            <blockquote className="gen-z-meme">“{memeQuote}”</blockquote>
            {viewer && !viewer.isAdmin && notificationPermission !== "granted" && <button onClick={enableNotifications}>Enable mobile order notifications</button>}
            {notificationPermission === "granted" && <button onClick={testNotifications}>Test alerts: sound + banner</button>}
            {notificationMessage && <small className="notification-message">{notificationMessage}</small>}
          </div>
          {viewer && !viewer.isAdmin && myOrders.some((order) => order.payment_status === "PAID" && !["DELIVERED", "CANCELLED"].includes(order.status)) && (
            <div className="home-active-orders">
              <div><strong>Active order delivery OTP</strong><small>Share this OTP only after receiving your printed documents.</small></div>
              {myOrders.filter((order) => order.payment_status === "PAID" && !["DELIVERED", "CANCELLED"].includes(order.status)).map((order) => (
                <article key={order.id}>
                  <span><small>Order ID</small><strong>{order.order_number}</strong></span>
                  <span><small>Delivery OTP</small><b>{order.deliveryCode}</b></span>
                  <span><small>Status</small><strong>{order.status.replaceAll("_", " ")}</strong></span>
                  {Boolean(order.has_payment_qr) && order.payment_status !== "PAID" && (
                    <div className="home-payment-scanner">
                      <span><strong>Payment scanner ready</strong><small>Pay while we deliver. Tap the scanner to open it full-screen.</small></span>
                      <button className="scanner-expand-button" onClick={() => setExpandedScanner({ src: `/api/orders/${order.id}/payment-qr`, alt: `Payment scanner for ${order.order_number}` })}>
                        <img src={`/api/orders/${order.id}/payment-qr`} alt={`Payment scanner for ${order.order_number}`} />
                      </button>
                    </div>
                  )}
                  {order.payment_status === "PAID" && <div className="home-payment-verified"><strong>Payment received and verified</strong><small>The payment scanner has been removed. Keep this OTP until delivery.</small></div>}
                </article>
              ))}
              <button onClick={openMyOrders}>View all orders</button>
            </div>
          )}
        </div>

        <section className="order-card" aria-label="Create print order">
          {acceptingOrders ? <>
          <div className="card-heading">
            <span className="step">1</span>
            <div><h2>Start your print</h2><p>Documents, spreadsheets, presentations and images · A4 only</p></div>
          </div>

          <label className={`upload-zone ${fileName ? "has-file" : ""}`}>
            <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp,.rtf,.txt,.csv,.jpg,.jpeg,.png,.heic,.webp,.gif,.bmp,.tif,.tiff" onChange={handleFile} />
            <span className="upload-icon">{countingPages ? "…" : fileName ? "✓" : "↑"}</span>
            <strong>{fileName || "Choose a document"}</strong>
            <small>{uploadProgress !== null ? `Uploading… ${uploadProgress}%` : countingPages ? "Counting pages…" : fileName ? `${pages} ${pages === 1 ? "page" : "pages"} detected` : "or drag and drop it here"}</small>
          </label>
          <p className="file-retention-note"><strong>Document privacy:</strong> Your uploaded files will be deleted once the order is delivered or cancelled. Maximum file size: 50 MB.</p>
          {uploadError && <p className="upload-error">{uploadError}</p>}

          {fileName && <>
          <div className="field-label"><span className="step">2</span> Choose service</div>
          <div className="service-option-grid" role="radiogroup" aria-label="Print service">
            {printServices.map((service) => <button type="button" role="radio" aria-checked={serviceId === service.id} className={serviceId === service.id ? "selected" : ""} key={service.id} onClick={() => setServiceId(service.id)}><span><strong>{service.name}</strong><small>{service.description}</small></span><b>{service.price_paise ? `+${inr.format(service.price_paise / 100)}` : "Included"}</b></button>)}
          </div>
          {Boolean(printServices.find((service) => service.id === serviceId)?.is_binding) && (
            <div className="binding-fields">
              <strong>Binding instructions</strong>
              <p>Binding work takes 15–25 minutes to deliver based on your location.</p>
              <label>WhatsApp number<input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10-digit WhatsApp number" /></label>
              <label>Additional binding instructions<textarea maxLength={125} value={printInstructions} onChange={(e) => setPrintInstructions(e.target.value)} placeholder="Any special instructions for binding" /><small>{printInstructions.length}/125 characters</small></label>
            </div>
          )}

          {usesMixedPagePricing && (
            <div className="binding-fields">
              <strong><span className="step">3</span> Choose colour pages</strong>
              <p>Select B&amp;W for no colour pages, Colour for every page, or enter only the pages that need colour.</p>
              <div className="service-option-grid" role="radiogroup" aria-label="Colour printing choice">
                <button type="button" role="radio" aria-checked={colourChoice === "bw"} className={colourChoice === "bw" ? "selected" : ""} onClick={() => { setColourChoice("bw"); setColourPageNumbers(""); setMode("bw-single"); setUploadError(""); }}><span><strong>B&amp;W</strong><small>No colour pages</small></span><b>{inr.format(prices["bw-single"])} / page</b></button>
                <button type="button" role="radio" aria-checked={colourChoice === "colour"} className={colourChoice === "colour" ? "selected" : ""} onClick={() => { setColourChoice("colour"); setColourPageNumbers(""); setMode("colour-single"); setUploadError(""); }}><span><strong>Colour</strong><small>Print every page in colour</small></span><b>{inr.format(prices["colour-single"])} / page</b></button>
                <button type="button" role="radio" aria-checked={colourChoice === "mixed"} className={colourChoice === "mixed" ? "selected" : ""} onClick={() => { setColourChoice("mixed"); setMode("bw-single"); setUploadError(""); }}><span><strong>Select colour pages</strong><small>All remaining pages will be B&amp;W</small></span><b>Mixed pricing</b></button>
              </div>
              {colourChoice === "mixed" && <label>Colour page numbers<input value={colourPageNumbers} onChange={(e) => { setColourPageNumbers(e.target.value); setUploadError(""); }} placeholder="Example: 1-4, 12, 18-20" /></label>}
              {colourChoice === "mixed" && colourPageNumbers.trim() && colourPageResult.invalid.length > 0 && <small className="upload-error">Check: {colourPageResult.invalid.join(", ")}. Pages must be between 1 and {pages}.</small>}
              {colourChoice === "mixed" && colourPagesValid && <div className="payment-instruction" role="status"><strong>Automatic page assignment</strong><span>Colour: {formatPageRanges(colourPageResult.pages)}</span><span>B&amp;W: {bwPageNumbers}</span><span>The remaining pages are automatically priced as B&amp;W.</span></div>}
            </div>
          )}

          <div className="quantities">
            <label>Pages<input type="number" min="1" value={pages} onChange={(e) => setPages(Math.max(1, Number(e.target.value)))} /></label>
            <label>Copies<input type="number" min="1" value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))} /></label>
            <div className="paper"><small>Paper size</small><strong>A4</strong><span>210 × 297 mm</span></div>
          </div>

          <div className="estimate">
            <div><small>Estimated print total</small><strong>{inr.format(total)}</strong></div>
            <button disabled={!fileName || countingPages || (usesMixedPagePricing && !colourPagesValid) || (Boolean(printServices.find((service) => service.id === serviceId)?.is_binding) && whatsappNumber.length !== 10)} onClick={addToCart}>Add to cart <span>→</span></button>
          </div>
          <p className="estimate-note">{usesMixedPagePricing ? `${bwPageCount} B&W + ${colourPageCount} colour pages × ${copies} ${copies === 1 ? "copy" : "copies"} · Single sided` : `${pages} pages × ${copies} ${copies === 1 ? "copy" : "copies"} × ${inr.format(prices[mode])} · ${selected.title}`}{servicePrice > 0 ? ` + ${inr.format(servicePrice)} ${selectedService?.name} charge` : ""}</p>
          <div className="payment-instruction" role="note">
            <strong>Secure Razorpay payment</strong>
            <span>Create your order, then pay online through Razorpay before printing begins.</span>
          </div>
          </>}
          </> : <div className="service-unavailable" role="status"><span>Coming soon</span><h2>Service will be live soon</h2><div className="launch-countdown" aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes and ${countdown.seconds} seconds remaining`}><b>{countdown.days}<small>Days</small></b><b>{String(countdown.hours).padStart(2, "0")}<small>Hours</small></b><b>{String(countdown.minutes).padStart(2, "0")}<small>Minutes</small></b><b>{String(countdown.seconds).padStart(2, "0")}<small>Seconds</small></b></div><p className="launch-message">{launchMessage}</p></div>}
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
                const itemOption = options.find((option) => option.id === item.mode);
                return (
                  <article className="cart-item" key={item.id}>
                    <div className="file-badge">{item.fileType === "PDF" ? "PDF" : item.fileType === "IMAGE" ? "IMG" : "DOC"}</div>
                    <div className="cart-file"><h3>{item.fileName}</h3><p>{item.serviceName} · {item.pages} {item.pages === 1 ? "page" : "pages"} · A4 · {itemOption?.title ?? printModeLabel(item.mode)} · {item.copies} {item.copies === 1 ? "copy" : "copies"}</p>{item.colourPageNumbers !== undefined && <p>Colour pages: {item.colourPageNumbers} · B&amp;W pages: {item.bwPageNumbers ?? `remaining ${item.pages - (item.colourPages ?? 0)} pages`}</p>}{item.printInstructions && <p>{item.printInstructions}{item.whatsappNumber ? ` · WhatsApp ${item.whatsappNumber}` : ""}</p>}<small>{item.colourPageNumbers !== undefined ? `${item.pages - (item.colourPages ?? 0)} B&W + ${item.colourPages ?? 0} colour × ${item.copies}` : `${item.pages} × ${item.copies} × ${inr.format(item.unitPrice)}`}{item.servicePrice > 0 ? ` + ${inr.format(item.servicePrice)} service charge` : ""}</small></div>
                    <strong>{inr.format(item.total)}</strong>
                    <button className="remove-item" onClick={() => removeFromCart(item)} aria-label={`Remove ${item.fileName}`}>×</button>
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
          <p>Choose black-and-white or colour. All printing is single-sided.</p>
        </div>
        <div className="price-list">
          {singleSideOptions.map((item) => (
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
        <nav className="footer-policy-links" aria-label="Policies"><a href="/terms">Terms</a><a href="/privacy-policy">Privacy</a><a href="/shipping-policy">Shipping</a><a href="/cancellation-refunds">Cancellation &amp; Refunds</a><a href="/contact">Contact</a></nav>
        <p>© 2026 PrintBee · Local A4 printing made easy.</p>
      </footer>

      {adminOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAdminOpen(false)}>
          <section className="admin-modal admin-portal" role="dialog" aria-modal="true" aria-labelledby="admin-title" onMouseDown={(e) => e.stopPropagation()}>
            <aside className="admin-sidebar">
              <div className="admin-sidebar-brand"><img src="/printbee-logo.png" alt="" /><strong>PrintBee Admin</strong></div>
              {([["dashboard", "Dashboard", "⌂"], ["revenue", "Revenue", "₹"], ["orders", "Orders", "▤"], ["locations", "Locations", "⌖"], ["riders", "Rider approvals", "♙"], ["services", "Print services", "＋"], ["packaging", "Handling charges", "₹"]] as const).map(([id, label, icon]) => <button key={id} className={adminSection === id ? "active" : ""} onClick={() => { setAdminSection(id); window.setTimeout(() => document.getElementById(`admin-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}><span>{icon}</span>{label}{id === "orders" && <b>{dashboard?.orders?.length ?? 0}</b>}</button>)}
              {notificationPermission !== "granted" && <button onClick={enableNotifications}><span>♬</span>Enable order alerts</button>}
              {notificationPermission === "granted" && <button onClick={testNotifications}><span>♬</span>Test sound + banner</button>}
              <button className="admin-sidebar-exit" onClick={() => setAdminOpen(false)}>← Back to website</button>
            </aside>
            <div className="admin-main">
            <button className="close" onClick={() => setAdminOpen(false)} aria-label="Close">×</button>
            <div className="admin-badge">ADMIN</div>
            {notificationMessage && <p className="panel-message">{notificationMessage}</p>}
            <h2 id="admin-services">Print service controls</h2>
            <p>Update the customer price per printed page. Changes appear everywhere immediately.</p>
            <div className={`order-toggle-panel ${acceptingOrders ? "on" : "off"}`}>
              <span><strong>Accept customer orders</strong><small>{acceptingOrders ? "ON — customers can place orders" : "OFF — customers see ‘Service will be live soon’"}</small></span>
              <button type="button" role="switch" aria-checked={acceptingOrders} onClick={toggleOrderAvailability}><i />{acceptingOrders ? "ON" : "OFF"}</button>
            </div>
            <div className="launch-schedule-panel">
              <h3>Customer launch countdown</h3>
              <p>Set the public launch time in Indian Standard Time and the note shown below the timer.</p>
              <label>Launch date and time (IST)<input type="datetime-local" value={launchInput} onChange={(e) => setLaunchInput(e.target.value)} /></label>
              <label>Launch note<input maxLength={160} value={launchMessage} onChange={(e) => setLaunchMessage(e.target.value)} /></label>
              <button type="button" onClick={saveLaunchSchedule}>Save launch timer</button>
            </div>
            <div className="service-admin fee-controls">
              <h3>Checkout fee controls</h3>
              <div className={`order-toggle-panel ${gatewayEnabled ? "on" : "off"}`}><span><strong>Payment gateway fee (1%)</strong><small>Calculated on printing + delivery + platform; handling excluded. Hidden from customer breakdown.</small></span><button role="switch" aria-checked={gatewayEnabled} onClick={() => saveFeeSettings({ gatewayEnabled: !gatewayEnabled })}><i />{gatewayEnabled ? "ON" : "OFF"}</button></div>
              <div className={`order-toggle-panel ${surgeEnabled ? "on" : "off"}`}><span><strong>Surge charge</strong><small>Shown to customers as a high-demand charge.</small></span><button role="switch" aria-checked={surgeEnabled} onClick={() => saveFeeSettings({ surgeEnabled: !surgeEnabled })}><i />{surgeEnabled ? "ON" : "OFF"}</button></div>
              <div className="service-admin-form"><select value={surgeType} onChange={(e) => setSurgeType(e.target.value as "PERCENT" | "FIXED")}><option value="PERCENT">Percentage (%)</option><option value="FIXED">Fixed amount (₹)</option></select><input type="number" min="0" step="0.01" value={surgeValue} onChange={(e) => setSurgeValue(Math.max(0, Number(e.target.value)))} /><button onClick={() => saveFeeSettings()}>Save surge charge</button></div>
              <div className={`order-toggle-panel ${lateNightEnabled ? "on" : "off"}`}><span><strong>Late-night delivery fee</strong><small>Shown separately in checkout and saved with each order.</small></span><button role="switch" aria-checked={lateNightEnabled} onClick={() => saveFeeSettings({ lateNightEnabled: !lateNightEnabled })}><i />{lateNightEnabled ? "ON" : "OFF"}</button></div>
              <div className="service-admin-form"><select value={lateNightType} onChange={(e) => setLateNightType(e.target.value as "PERCENT" | "FIXED")}><option value="PERCENT">Percentage (%)</option><option value="FIXED">Fixed amount (₹)</option></select><input aria-label="Late-night delivery fee value" type="number" min="0" max={lateNightType === "PERCENT" ? 100 : undefined} step="0.01" value={lateNightValue} onChange={(e) => setLateNightValue(Math.max(0, Number(e.target.value)))} /><button onClick={() => saveFeeSettings()}>Save late-night fee</button></div>
            </div>
            <div className="admin-prices">
              {singleSideOptions.map((item) => (
                <label key={item.id}>
                  <span><strong>{item.title}</strong><small>{item.note}</small></span>
                  <span className="rupee">₹<input type="number" min="0" step="0.01" value={draftPrices[item.id]} onChange={(e) => setDraftPrices({ ...draftPrices, [item.id]: Math.max(0, Number(e.target.value)) })} /></span>
                </label>
              ))}
            </div>
            <button className="save-button" onClick={savePrices}>{saved ? "Prices saved ✓" : "Save new prices"}</button>
            <div className="service-admin">
              <h3>{newService.id ? "Edit service option" : "Add a print, documentation, or finishing service"}</h3>
              <div className="service-admin-form"><input value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })} placeholder="Example: Soft binding" /><input maxLength={125} value={newService.description} onChange={(e) => setNewService({ ...newService, description: e.target.value })} placeholder="Description (125 characters)" /><label className="service-price-field">Price (₹)<input type="number" min="0" step=".01" value={newService.price} onChange={(e) => setNewService({ ...newService, price: Math.max(0, Number(e.target.value)) })} /></label><label><input type="checkbox" checked={newService.isBinding} onChange={(e) => setNewService({ ...newService, isBinding: e.target.checked })} /> Request page instructions and WhatsApp</label><button onClick={addPrintService}>{newService.id ? "Save changes" : "Add service"}</button>{newService.id && <button className="secondary-button" onClick={() => setNewService({ id: "", name: "", description: "", isBinding: false, countsForPackaging: true, price: 0 })}>Cancel</button>}</div>
              <label className="packaging-count-toggle"><input type="checkbox" checked={newService.countsForPackaging} onChange={(e) => setNewService({ ...newService, countsForPackaging: e.target.checked })} /> Count this service's pages for handling charges</label>
              <div className="service-chips">{printServices.map((service) => <span key={service.id}><b>{service.name} · {inr.format(service.price_paise / 100)}</b><small>{service.description}</small><small>{service.counts_for_packaging ? "Printed pages count toward handling charges" : "Pages excluded from handling charges"}</small><button onClick={() => setNewService({ id: service.id, name: service.name, description: service.description, isBinding: Boolean(service.is_binding), countsForPackaging: Boolean(service.counts_for_packaging), price: service.price_paise / 100 })}>Edit</button>{!["document-printing", "document-binding"].includes(service.id) && <button onClick={() => removePrintService(service.id)}>Remove</button>}</span>)}</div>
            </div>
            <div className="service-admin packaging-admin" id="admin-packaging">
              <h2>Handling charges</h2>
              <p>Add or edit non-overlapping page ranges. For example, “Below 30” means pages 1–29, followed by 30–50. The matching charge is calculated automatically at checkout.</p>
              <div className="dashboard-range" aria-label="Quick handling charge page ranges">
                <button type="button" onClick={() => setPackagingDraft({ id: "", minPages: 1, maxPages: 29, charge: 0 })}>Below 30</button>
                <button type="button" onClick={() => setPackagingDraft({ id: "", minPages: 30, maxPages: 50, charge: 0 })}>30–50</button>
                <button type="button" onClick={() => setPackagingDraft({ id: "", minPages: 51, maxPages: 9999, charge: 0 })}>Above 50</button>
              </div>
              <div className="service-admin-form"><label>From pages<input type="number" min="1" value={packagingDraft.minPages} onChange={(e) => setPackagingDraft({ ...packagingDraft, minPages: Number(e.target.value) })} /></label><label>To pages<input type="number" min="1" value={packagingDraft.maxPages} onChange={(e) => setPackagingDraft({ ...packagingDraft, maxPages: Number(e.target.value) })} /></label><label>Handling charge (₹)<input type="number" min="0" step=".01" value={packagingDraft.charge} onChange={(e) => setPackagingDraft({ ...packagingDraft, charge: Number(e.target.value) })} /></label><button onClick={savePackagingRule}>{packagingDraft.id ? "Save edited charge" : "Add charge"}</button></div>
              {packagingDraft.id && <button className="secondary-button" onClick={() => setPackagingDraft({ id: "", minPages: 1, maxPages: 29, charge: 0 })}>Cancel editing</button>}
              <div className="service-chips">{packagingRules.map((rule) => <span key={rule.id}><b>{rule.min_pages === 1 && rule.max_pages === 29 ? "Below 30" : rule.min_pages === 30 && rule.max_pages === 50 ? "30–50" : rule.min_pages === 51 && rule.max_pages === 9999 ? "Above 50" : `${rule.min_pages}–${rule.max_pages}`} pages · {inr.format(rule.charge_paise / 100)}</b><button onClick={() => { setPackagingDraft({ id: rule.id, minPages: rule.min_pages, maxPages: rule.max_pages, charge: rule.charge_paise / 100 }); document.getElementById("admin-packaging")?.scrollIntoView({ behavior: "smooth" }); }}>Edit</button><button onClick={() => deletePackagingRule(rule.id)}>Remove</button></span>)}</div>
            </div>
            <div className="admin-divider" />
            <h3 id="admin-locations">Delivery locations</h3>
            <p>Customers can select only locations added here.</p>
            <div className="inline-admin-form"><input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Example: Madhapur" /><button onClick={addLocation}>Add</button></div>
            <h3>Delivery agents</h3>
            <p>Add the Google email used by each delivery agent.</p>
            <div className="inline-admin-form"><input value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} placeholder="agent@gmail.com" /><button onClick={addAgent}>Add</button></div>
            {adminMessage && <p className="panel-message">{adminMessage}</p>}
            {dashboard && (
              <div className="dashboard-block">
                <div className="admin-divider" />
                <h2 id="admin-dashboard">Operations dashboard</h2>
                <div className="dashboard-range"><button className={dashboardRange === "today" ? "active" : ""} onClick={() => setDashboardRange("today")}>Today</button><button className={dashboardRange === "week" ? "active" : ""} onClick={() => setDashboardRange("week")}>This week</button><button className={dashboardRange === "month" ? "active" : ""} onClick={() => setDashboardRange("month")}>This month</button></div>
                <div className="metric-grid">
                  <div><small>Total orders</small><strong>{dashboardSummaryForRange.total}</strong></div>
                  <div><small>Paid</small><strong>{dashboardSummaryForRange.paid}</strong></div>
                  <div><small>Unpaid</small><strong>{dashboardSummaryForRange.unpaid}</strong></div>
                  <div><small>Delivered</small><strong>{dashboardSummaryForRange.delivered}</strong></div>
                  <div><small>Ready</small><strong>{dashboardSummaryForRange.ready}</strong></div>
                  <div><small>Paid revenue</small><strong>{inr.format(dashboardSummaryForRange.revenuePaise / 100)}</strong></div>
                  <div><small>B&amp;W pages</small><strong>{printTotalsForRange.bwSingle + printTotalsForRange.bwDouble}</strong></div><div><small>Colour pages</small><strong>{printTotalsForRange.colourSingle + printTotalsForRange.colourDouble}</strong></div>
                </div>
                <div className="admin-divider" />
                <h2 id="admin-revenue">Revenue</h2>
                <p>Paid printing and fee revenue for the selected period.</p>
                <div className="metric-grid revenue-summary-grid">
                  <div><small>Colour prints</small><strong>{revenueTotals.colourPrints}</strong></div>
                  <div><small>Colour pages</small><strong>{revenueTotals.colourPages}</strong></div>
                  <div><small>Colour amount received</small><strong>{inr.format(revenueTotals.colourAmount)}</strong></div>
                  <div><small>B&amp;W prints</small><strong>{revenueTotals.bwPrints}</strong></div>
                  <div><small>B&amp;W pages</small><strong>{revenueTotals.bwPages}</strong></div>
                  <div><small>B&amp;W amount received</small><strong>{inr.format(revenueTotals.bwAmount)}</strong></div>
                  <div><small>Delivery charges revenue</small><strong>{inr.format(revenueTotals.delivery / 100)}</strong></div>
                  <div><small>Handling fee revenue</small><strong>{inr.format(revenueTotals.handling / 100)}</strong></div>
                  <div><small>Platform fee revenue</small><strong>{inr.format(revenueTotals.platform / 100)}</strong></div>
                </div>
                <h3>Location performance</h3>
                <p>Orders and paid revenue across every delivery location.</p>
                <div className="location-table">
                  <div className="table-head"><span>Location & fees</span><span>Orders</span><span>Delivered</span><span>Revenue</span></div>
                  {dashboard.locationStats?.length ? dashboard.locationStats.map((location: any) => (
                    <div key={location.id}>
                      <span><i className={location.active ? "active-dot" : ""} />{location.name}<small>{location.active ? "Active" : "Inactive"} · Delivery {inr.format((location.delivery_fee_paise ?? 1500) / 100)} · Platform {inr.format((location.platform_fee_paise ?? 350) / 100)}</small>{location.active && <span className="location-actions"><button className="text-action" onClick={() => renameLocation(location)}>Rename</button><button className="text-action" onClick={() => editLocationFees(location)}>Edit fees</button><button className="text-action delete" onClick={() => deleteLocation(location)}>Delete</button></span>}</span>
                      <strong>{location.orders ?? 0}</strong>
                      <strong>{location.delivered ?? 0}</strong>
                      <strong>{inr.format((location.revenue_paise ?? 0) / 100)}</strong>
                    </div>
                  )) : <p>No locations added yet.</p>}
                </div>
                <h3 id="admin-riders">Pending rider applications</h3>
                <div className="application-list">{dashboard.riderApplications?.length ? dashboard.riderApplications.map((application: any) => <article key={application.email}><span><strong>{application.name}</strong><small>{application.email} · {application.mobile_number}</small></span><div><button onClick={() => approveRider(application.email, true)}>Approve</button><button className="reject" onClick={() => approveRider(application.email, false)}>Reject</button></div></article>) : <p>No rider applications awaiting review.</p>}</div>
                <h3>Active users</h3>
                <p>Customers who have placed orders, sorted by latest activity.</p>
                <div className="active-users">
                  {dashboard.activeUsers?.length ? dashboard.activeUsers.map((user: any) => <article key={user.email}><span className="user-avatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email} · {user.mobile_number}</small><small>Last order {new Date(user.last_order_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></span><span><strong>{user.order_count}</strong><small>Orders</small></span><span><strong>{inr.format((user.paid_spend_paise ?? 0) / 100)}</strong><small>Paid spend</small></span></article>) : <p>No active users yet.</p>}
                </div>
                <h3>Customer wallets</h3>
                <p>Every account's available balance, redeemed points, total credits, and points earned from delivered orders.</p>
                <div className="wallet-users-table"><div className="wallet-users-head"><span>User</span><span>Available</span><span>Spent</span><span>Credited</span><span>Delivered orders</span></div>{dashboard.walletUsers?.length ? dashboard.walletUsers.map((user: any) => <article key={user.email}><span><strong>{user.email}</strong><small>{user.referral_code}{user.latest_order_number ? ` · Latest ${user.latest_order_number}` : ""}</small></span><b>{user.available_points}</b><b>{user.spent_points}</b><b>{user.total_credited_points}</b><span><strong>{user.delivered_spend_points} points</strong><small>1 point per ₹10 after delivery</small></span></article>) : <p>No wallets yet.</p>}</div>
                <h3>Revenue by order</h3>
                <p>Paid order revenue, rider earnings, and PrintBee revenue per order.</p>
                <div className="revenue-table">
                  <div className="revenue-head"><span>Order</span><span>Revenue</span><span>Delivery partner</span><span>Rider fee</span><span>Admin revenue</span></div>
                  {dashboard.revenueOrders?.length ? dashboard.revenueOrders.map((entry: any) => <article key={entry.order_number}><span><strong>{entry.order_number}</strong><small>{new Date(entry.created_at).toLocaleDateString("en-IN")}</small></span><strong>{inr.format(entry.revenue_paise / 100)}</strong><span><strong>{entry.rider_name}</strong><small>{entry.rider_email || "Awaiting assignment"}</small></span><strong>{inr.format(entry.rider_fee_paise / 100)}</strong><span><strong>{inr.format(entry.admin_revenue_paise / 100)}</strong><small>Print {inr.format(entry.printing_subtotal_paise / 100)} + handling {inr.format((entry.packaging_fee_paise ?? 0) / 100)} + platform {inr.format(entry.platform_fee_paise / 100)} + 20% delivery</small></span></article>) : <p>No paid-order revenue yet.</p>}
                </div>
                <div className="order-export-panel">
                  <div><h3>Export orders</h3><p>Download a PDF containing visible orders only. Hidden orders are excluded.</p></div>
                  <div className="export-actions">
                    <button disabled={exporting} onClick={() => exportOrdersPdf("1d")}>Last 1 day PDF</button>
                    <button disabled={exporting} onClick={() => exportOrdersPdf("30d")}>Last 30 days PDF</button>
                    <label>From<input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} /></label>
                    <label>To<input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} /></label>
                    <button disabled={exporting || !exportFrom || !exportTo} onClick={() => exportOrdersPdf("custom")}>{exporting ? "Creating PDF..." : "Export custom PDF"}</button>
                  </div>
                </div>
                <h3>Rider performance</h3>
                <div className="rider-stats">{dashboard.riders?.length ? dashboard.riders.map((rider: any) => <div key={rider.email}><span><b>{rider.name || "Delivery partner"}</b><small>{rider.email} · {rider.mobile_number || "No mobile"}</small><small>{rider.delivered ?? 0} successful rides · {rider.assigned ?? 0} assigned</small></span><strong>{inr.format((rider.earned_paise ?? 0) / 100)}<small>Total earned</small></strong><button className="remove-rider" onClick={() => removeRider(rider.email)}>Remove partner</button></div>) : <p>No riders added yet.</p>}</div>
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
                <h3>Rider withdrawal requests</h3>
                <p>Review the UPI ID and move each request through the payout flow.</p>
                <div className="withdrawal-admin">{dashboard.riderWithdrawals?.length ? dashboard.riderWithdrawals.map((withdrawal: any) => <article key={withdrawal.id}><span><strong>{withdrawal.rider_email}</strong><small>UPI: {withdrawal.upi_id}</small><small>Requested {new Date(withdrawal.requested_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></span><strong>{inr.format(withdrawal.amount_paise / 100)}</strong><select value={withdrawal.status} onChange={(e) => updateWithdrawalStatus(withdrawal.id, e.target.value)}><option value="REQUESTED">Withdraw requested</option><option value="IN_PROGRESS">In progress</option><option value="SENT">Amount sent to bank</option></select></article>) : <p>No withdrawal requests yet.</p>}</div>
                <h3 id="admin-orders">Live orders <small className="live-refresh">● Live · refreshes every 5 seconds</small></h3>
                <div className="orders-table-head"><span>Order &amp; documents</span><span>Payment QR</span><span>Status</span><span>Delivery partner</span><span>Earnings</span><span>Export</span></div>
                <div className="admin-orders">{dashboard.orders?.length ? dashboard.orders.map((order: any) => (
                  <article key={order.id}>
                    <div className="order-customer">
                      <strong>{order.order_number}</strong>
                      <small><b>Customer:</b> {order.customer_name} · {order.mobile_number}</small>
                      <small><b>Email:</b> {order.customer_email}</small>
                      <small><b>Delivery:</b> {order.location_name}</small>
                      <small><b>Ordered:</b> {new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>
                    </div>
                    <span className="status-chip">{order.payment_status} · {order.status}</span>
                    <strong>{inr.format(order.total_paise / 100)}</strong>
                    <div className="payment-review-details"><span><small>Payment method</small><strong>{order.payment_status === "PAY_ON_DELIVERY" ? "Pay on delivery" : order.payment_reference || order.payment_status}</strong></span><span><small>Amount to collect</small><strong>{inr.format(order.total_paise / 100)}</strong></span><span><small>Payment gateway fee</small><strong>{inr.format((order.payment_gateway_fee_paise ?? 0) / 100)}</strong></span><span><small>Surge charge</small><strong>{inr.format((order.surge_fee_paise ?? 0) / 100)}</strong></span><span><small>Late-night delivery fee</small><strong>{inr.format((order.late_night_fee_paise ?? 0) / 100)}</strong></span></div>
                    {order.payment_status === "PAID" && order.payment_verified_at && <div className="payment-cleared-note"><strong>Payment received and verified</strong><small>Verified {new Date(order.payment_verified_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} by {order.payment_verified_by}. Scanner deleted from admin, customer and delivery-partner views.</small></div>}
                    {Boolean(order.has_payment_qr) && <div className="admin-payment-qr"><strong>Legacy payment scanner</strong><img src={`/api/orders/${order.id}/payment-qr`} alt={`Payment scanner for ${order.order_number}`} /></div>}
                    {order.payment_status === "PAY_ON_DELIVERY" && order.status !== "CANCELLED" && <div className="payment-review-actions"><button className="mini-action" onClick={() => reviewPayment(order.id, "APPROVE")}>Payment received & verified</button></div>}
                    {order.payment_status === "PENDING" && order.status !== "CANCELLED" && <div className="payment-review-actions"><button className="mini-action" disabled={!order.payment_reference} onClick={() => reviewPayment(order.id, "APPROVE")}>Payment verified</button><button onClick={() => reviewPayment(order.id, "REJECT", "REFERENCE")}>Wrong payment ID</button><button onClick={() => reviewPayment(order.id, "REJECT", "AMOUNT")}>Wrong amount</button><button onClick={() => reviewPayment(order.id, "REJECT", "BOTH")}>Both mismatch</button></div>}
                    {order.payment_rejection_reason && <div className="cancelled-note"><strong>Payment rejected</strong><small>{order.payment_rejection_reason}</small></div>}
                    {order.status === "CANCELLED" && <div className="cancelled-note"><strong>Cancelled</strong><small>{order.cancellation_reason}</small></div>}
                    <div className="document-details">
                      <strong>Documents</strong>
                      {(() => { const total = printSummary(order.items); return <div className="print-summary"><span>B&amp;W: {total.bwSingle + total.bwDouble} pages</span><span>Colour: {total.colourSingle + total.colourDouble} pages</span></div>; })()}
                      {order.items?.length ? order.items.map((item: any, index: number) => (
                        <div key={`${item.uploadId ?? item.fileName}-${index}`}>
                          <span>{item.fileName ?? `Document ${index + 1}`}</span>
                          <small>Doc {index + 1}: {item.pages ?? 1} pages · {item.copies ?? 1} copies · {printModeLabel(item.mode)}{item.serviceName ? ` · ${item.serviceName}` : ""}</small>
                          {item.colourPageNumbers !== undefined && <small><b>Colour pages:</b> {item.colourPageNumbers} · all remaining pages B&amp;W</small>}
                          {item.bwPageNumbers && <small><b>B&amp;W pages:</b> {item.bwPageNumbers}</small>}
                          {item.printInstructions && <small><b>Instructions:</b> {item.printInstructions} · WhatsApp {item.whatsappNumber}</small>}
                        </div>
                      )) : <small>No document details saved for this legacy order.</small>}
                    </div>
                    <div className="file-links">{order.files?.length ? order.files.map((file: any) => file.deleted_at ? <span className="deleted-file" key={file.id}>{file.original_name} · deleted {new Date(file.deleted_at).toLocaleDateString("en-IN")}</span> : <a key={file.id} href={`/api/admin/files/${file.id}/download`}>Download {file.original_name}</a>) : <span>Legacy order — document was not stored</span>}</div>
                    {(["DELIVERED", "CANCELLED"].includes(String(order.status).toUpperCase()) || order.delivered_at || order.cancelled_at) && (order.files?.some((file: any) => !file.deleted_at) ? <button className="delete-files-action" onClick={() => deleteOrderFiles(order.id)}>Delete {order.files.filter((file: any) => !file.deleted_at).length} document{order.files.filter((file: any) => !file.deleted_at).length === 1 ? "" : "s"} from storage</button> : <div className="files-cleared-note">No stored documents remain for this order.</div>)}
                    <select disabled={order.status === "CANCELLED" || order.payment_status === "REJECTED"} value={order.status} onChange={(e) => updateOrderStatus(order.id, e.target.value)}>
                      {order.status === "CANCELLED" && <option value="CANCELLED">Cancelled</option>}
                      <option value="CONFIRMED">Confirmed</option><option value="PRINTING">Printing</option><option value="READY_FOR_PICKUP">Ready for pickup</option><option value="RIDER_ASSIGNED">Rider assigned</option>
                    </select>
                    <select disabled={order.status === "CANCELLED" || order.payment_status === "REJECTED"} value={order.rider_email ?? ""} onChange={(e) => assignRider(order.id, e.target.value)}>
                      <option value="">Assign available rider</option>{dashboard.riders.filter((rider: any) => rider.is_available).map((rider: any) => <option key={rider.email} value={rider.email}>{rider.name || rider.email} · Available</option>)}
                    </select>
                    <div className="give-points-control"><input type="number" min="1" max="10000" step="1" value={grantPointDrafts[order.id] ?? ""} onChange={(event) => setGrantPointDrafts((drafts) => ({ ...drafts, [order.id]: event.target.value }))} placeholder="Give points (optional)" aria-label={`Points to give customer for ${order.order_number}`} /><button disabled={!Number(grantPointDrafts[order.id])} onClick={() => grantOrderPoints(order.id)}>Give points</button></div>
                    <div className="order-earnings"><span>Rider <b>{inr.format((order.delivery_fee_paise * .75) / 100)}</b></span><span>Admin <b>{inr.format((order.printing_subtotal_paise + order.platform_fee_paise + order.delivery_fee_paise * .2) / 100)}</b></span></div>
                    <div className="order-record-actions"><button className="hide-order-action" onClick={() => setOrderHidden(order.id, true)}>Hide from dashboard &amp; exports</button><button className="delete-order-action" onClick={() => deleteOrder(order)}>Delete this order</button></div>
                  </article>
                )) : <p>No orders yet.</p>}</div>
                <h3>Hidden orders</h3>
                <p>Archived orders are excluded from the dashboard, revenue/profit, location and rider totals, active users, and exports.</p>
                <div className="hidden-orders">{dashboard.hiddenOrders?.length ? dashboard.hiddenOrders.map((order: any) => (
                  <article key={order.id}>
                    <span><strong>{order.order_number}</strong><small>{order.customer_name} · {order.location_name}</small><small>Ordered {new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></span>
                    <span><strong>{inr.format(order.total_paise / 100)}</strong><small>{order.payment_status} · {order.status}</small></span>
                    <span><small>Hidden {new Date(order.hidden_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small><button onClick={() => setOrderHidden(order.id, false)}>Restore order</button><button className="delete-order-action" onClick={() => deleteOrder(order)}>Delete this order</button></span>
                  </article>
                )) : <p>No hidden orders.</p>}</div>
              </div>
            )}
            <small className="admin-note">Print services and A4 prices are shared with all customers.</small>
            </div>
          </section>
        </div>
      )}

      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCheckoutOpen(false)}>
          <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setCheckoutOpen(false)} aria-label="Close">×</button>
            {orderResult ? (
              <div className="order-success">
                <span>{orderResult.paid ? "✓" : "₹"}</span><h2>{orderResult.paid ? "Order placed" : "Complete payment"}</h2>
                <p>Order <strong>{orderResult.orderNumber}</strong> · {orderResult.locationName}</p>
                <div className="payment-pending"><small>Payment status</small><strong>{orderResult.paid ? "PAID" : "PAYMENT REQUIRED"}</strong></div>
                {(orderResult.lateNightFeePaise ?? 0) > 0 && <div className="payment-pending"><small>Late-night delivery fee</small><strong>{inr.format((orderResult.lateNightFeePaise ?? 0) / 100)}</strong></div>}
                {orderResult.paid && orderResult.deliveryCode && <div><small>Your delivery code</small><strong>{orderResult.deliveryCode}</strong></div>}
                <p>{orderResult.paid ? "Payment verified. Give this code to the delivery agent only after receiving your prints." : `Pay ${inr.format(orderResult.totalPaise / 100)} securely through Razorpay so printing can begin.`}</p>
                {!orderResult.paid && <button className="save-button" disabled={paymentProcessing} onClick={() => startRazorpayPayment(orderResult)}>{paymentProcessing ? "Starting payment..." : `Pay ${inr.format(orderResult.totalPaise / 100)} now`}</button>}
                {orderError && <p className="panel-message">{orderError}</p>}
                <button className="save-button" onClick={() => { setCheckoutOpen(false); setOrderResult(null); }}>Done</button>
              </div>
            ) : (
              <>
                <div className="admin-badge">CHECKOUT</div>
                <h2 id="checkout-title">Delivery details</h2>
                <p>Enter your details and select an admin-approved delivery location.</p>
                <p className="delivery-location-note"><strong>Select the nearest delivery location and share your exact delivery location after a delivery partner is assigned.</strong></p>
                <label className="checkout-field">Full name<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" /></label>
                <label className="checkout-field">Mobile number<input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" inputMode="numeric" /></label>
                <label className="checkout-field">Delivery location<select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Select a location</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>
                {!locations.length && <p className="panel-message">No delivery locations are available yet. The admin must add one first.</p>}
                <div className="fee-breakdown"><div><span>Printing subtotal</span><strong>{inr.format(cartPrintingTotal)}</strong></div>{cartServiceCharges > 0 && <div className="binding-charge-row"><span>Binding charges</span><strong>{inr.format(cartServiceCharges)}</strong></div>}<div><span>Delivery fee</span><strong>{inr.format(checkoutDeliveryFee)}</strong></div><div><span>Platform fee</span><strong>{inr.format(checkoutPlatformFee)}</strong></div><div><span>Handling charge ({cartPrintedPages} pages)</span><strong>{inr.format(packagingFee)}</strong></div>{surgeEnabled && <div className="surge-charge-row"><span>High-demand surge charge</span><strong>{inr.format(checkoutSurgeFee)}</strong></div>}{lateNightEnabled && <div className="surge-charge-row"><span>Late-night delivery fee</span><strong>{inr.format(checkoutLateNightFee)}</strong></div>}{gatewayEnabled && <div><span>Payment gateway fee</span><strong>{inr.format(checkoutGatewayFee)}</strong></div>}{pointsDiscount > 0 && <div className="points-discount-row"><span>Points discount ({redeemablePoints} points)</span><strong>−{inr.format(pointsDiscount)}</strong></div>}</div>
                <button type="button" className={`wallet-balance-button ${usePoints ? "selected" : ""}`} disabled={redeemablePoints < 1} onClick={() => setUsePoints((current) => !current)}><span className="wallet-icon">₹</span><span><strong>{usePoints ? "Wallet applied" : "Use wallet balance"}</strong><small>{pointsBalance} points · worth {inr.format(pointsBalance / 15)} · every point is redeemable</small></span><b>{usePoints ? "✓" : "Use"}</b></button>
                <div className="checkout-total"><span>Estimated total</span><strong>{inr.format(Math.max(0, checkoutBeforePoints - pointsDiscount))}</strong></div>
                <div className="points-earned-preview"><span>◉</span><div><strong>You’ll earn {Math.floor(Math.max(0, checkoutBeforePoints - pointsDiscount) / 10)} wallet points</strong><small>Credited after this order is successfully delivered.</small></div></div>
                <div className="pay-on-delivery-note"><strong>Secure online payment:</strong> After creating the order, complete payment through Razorpay. Printing begins only after verified payment.</div>
                {orderError && <p className="form-error">{orderError}</p>}
                <button className="save-button" disabled={!locations.length || paymentProcessing} onClick={placeOrder}>{paymentProcessing ? "Starting Razorpay..." : "Pay now"}</button>
              </>
            )}
          </section>
        </div>
      )}

      {walletOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setWalletOpen(false)}>
          <section className="checkout-modal wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setWalletOpen(false)} aria-label="Close wallet">×</button>
            <div className="wallet-heading"><span>◉</span><div><small>PRINTBEE WALLET</small><h2 id="wallet-title">{pointsBalance} points</h2><p>Worth {inr.format(pointsBalance / 15)} · every point can be redeemed at checkout.</p></div></div>
            <div className="earn-more-card"><div className="admin-badge">EARN MORE</div><h3>Invite friends to PrintBee</h3><p>Share your unique referral code or link. You earn 10 points whenever a referred account places an order.</p><label>Your referral code<input readOnly value={myReferralCode} /></label><label>Shareable referral link<input readOnly value={typeof window === "undefined" ? "" : `${window.location.origin}/?ref=${myReferralCode}`} /></label><button className="save-button" disabled={!myReferralCode} onClick={shareReferral}>Share referral link</button></div>
            {!hasReferrer ? <div className="existing-referral-card"><h3>Have a referral code?</h3><p>Existing users can link a valid code too. This is optional and can be done once.</p><label className="checkout-field">Referral code<input value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="PBXXXXXXXX" /></label><button className="save-button" disabled={!referralCode.trim()} onClick={linkExistingReferral}>Verify referral code</button></div> : <div className="referral-linked">✓ A referral code is linked to your account.</div>}
            {walletMessage && <p className="panel-message">{walletMessage}</p>}
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
            {!viewer?.isAdmin && riderEarnings && <div className="rider-wallet">
              <div><small>Successful rides</small><strong>{riderEarnings.totalRides}</strong></div>
              <div><small>Total earned</small><strong>{inr.format(riderEarnings.earnedPaise / 100)}</strong></div>
              <div><small>Available to withdraw</small><strong>{inr.format(riderEarnings.availablePaise / 100)}</strong></div>
              <p>You earn 75% of the delivery fee for every successfully delivered order.</p>
              <label>UPI ID<input value={withdrawUpi} onChange={(e) => setWithdrawUpi(e.target.value)} placeholder="yourname@upi" /></label>
              <button disabled={riderEarnings.availablePaise <= 0 || !withdrawUpi.trim()} onClick={requestWithdrawal}>Withdraw available earnings</button>
              <div className="rider-withdrawals">{riderEarnings.withdrawals?.map((withdrawal: any) => <span key={withdrawal.id}><b>{inr.format(withdrawal.amount_paise / 100)}</b><small>{withdrawal.status === "REQUESTED" ? "Withdraw requested" : withdrawal.status === "IN_PROGRESS" ? "In progress" : "Amount sent to bank"} · {withdrawal.upi_id}</small></span>)}</div>
            </div>}
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
            {myReferralCode && <div className="referral-wallet"><span><small>Your referral code</small><strong>{myReferralCode}</strong></span><span><small>Points balance</small><strong>{pointsBalance}</strong></span><p>Share your code. You earn 10 points whenever a referred account places an order. Redeem 15 points for ₹1 at checkout.</p></div>}
            {myOrders.some((order) => (order.late_night_fee_paise ?? 0) > 0) && <div className="fee-breakdown">{myOrders.filter((order) => (order.late_night_fee_paise ?? 0) > 0).map((order) => <div key={`late-night-${order.id}`}><span>{order.order_number} · Late-night delivery fee</span><strong>{inr.format(order.late_night_fee_paise / 100)}</strong></div>)}</div>}
            {myOrders.some((order) => order.payment_status === "PENDING" && order.status !== "CANCELLED") && <div className="customer-error"><strong>Payment required</strong><p>Complete payment before PrintBee starts printing.</p>{myOrders.filter((order) => order.payment_status === "PENDING" && order.status !== "CANCELLED").map((order) => <button className="save-button" key={order.id} disabled={paymentProcessing} onClick={() => startRazorpayPayment(order)}>Pay {inr.format(order.total_paise / 100)} for {order.order_number}</button>)}</div>}
            {myOrders.length ? myOrders.map((order) => <article key={order.id}><div><strong>{order.order_number}</strong><small>{order.location_name} · {new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>{order.cancellation_reason && <small>Cancelled: {order.cancellation_reason}</small>}</div><span className="status-chip">{order.payment_status === "PAY_ON_DELIVERY" ? "PAY ON DELIVERY" : order.payment_status} · {order.status}</span><strong>{inr.format(order.total_paise / 100)}</strong><div className="order-progress"><span className="done">Order confirmed</span><span className={["PRINTING", "READY_FOR_PICKUP", "RIDER_ASSIGNED", "DELIVERED"].includes(order.status) ? "done" : ""}>Printing</span><span className={["READY_FOR_PICKUP", "RIDER_ASSIGNED", "DELIVERED"].includes(order.status) ? "done" : ""}>Ready</span><span className={["RIDER_ASSIGNED", "DELIVERED"].includes(order.status) ? "done" : ""}>Rider assigned</span><span className={order.payment_status === "PAID" ? "done" : "current"}>{order.payment_status === "PAID" ? "Payment received" : "Pay on delivery"}</span><span className={order.status === "DELIVERED" ? "done" : ""}>Delivered</span></div>{order.payment_rejection_reason && <div className="customer-error">{order.payment_rejection_reason}</div>}{Boolean(order.has_payment_qr) && order.status !== "DELIVERED" && <div className="customer-payment-qr"><div><strong>Pay {inr.format(order.total_paise / 100)}</strong><small>Use this scanner now or pay when your delivery partner arrives. Tap the scanner to enlarge.</small></div><button className="scanner-expand-button" onClick={() => setExpandedScanner({ src: `/api/orders/${order.id}/payment-qr`, alt: `Payment scanner for ${order.order_number}` })}><img src={`/api/orders/${order.id}/payment-qr`} alt={`Payment scanner for ${order.order_number}`} /></button></div>}{order.rider_name && <div className="assigned-rider"><span><small>Delivery partner assigned</small><strong>{order.rider_name}</strong>{order.rider_mobile_number && <b>{order.rider_mobile_number}</b>}</span>{order.rider_mobile_number && <a href={`tel:${order.rider_mobile_number}`}>Call delivery partner</a>}</div>}{order.status !== "CANCELLED" && ["RIDER_ASSIGNED", "DELIVERED"].includes(order.status) && <div className="customer-code"><span><small>Order ID</small><b>{order.order_number}</b></span><span><small>Delivery OTP · share only after receiving prints</small><strong>{order.deliveryCode}</strong></span></div>}</article>) : <p>No orders yet.</p>}
            {myOrders.filter((order) => order.status === "DELIVERED" && !order.feedback_submitted).map((order) => <button key={`feedback-${order.id}`} className="feedback-invite" onClick={() => { setFeedbackOrder(order); setFeedback({ serviceRating: 0, riderRating: 0, printQualityRating: 0, overallRating: 0, description: "" }); }}>Rate your delivered order {order.order_number} (optional)</button>)}
          </section>
        </div>
      )}

      {expandedScanner && (
        <div className="scanner-fullscreen" role="dialog" aria-modal="true" aria-label="Full-screen payment scanner" onClick={() => setExpandedScanner(null)}>
          <button onClick={() => setExpandedScanner(null)} aria-label="Close full-screen scanner">×</button>
          <img src={expandedScanner.src} alt={expandedScanner.alt} onClick={(event) => event.stopPropagation()} />
          <strong>Tap outside the scanner to close</strong>
        </div>
      )}

      {feedbackOrder && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setFeedbackOrder(null)}>
          <section className="checkout-modal feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setFeedbackOrder(null)} aria-label="Close feedback form">×</button>
            <div className="admin-badge">OPTIONAL FEEDBACK</div><h2 id="feedback-title">How was order {feedbackOrder.order_number}?</h2><p>Your ratings help us improve future deliveries.</p>
            {([['serviceRating', 'PrintBee service'], ['riderRating', 'Rider rating'], ['printQualityRating', 'Print quality'], ['overallRating', 'Overall experience']] as const).map(([field, label]) => <fieldset className="star-field" key={field}><legend>{label}</legend><div>{[1,2,3,4,5].map((star) => <button key={star} type="button" className={feedback[field] >= star ? "selected" : ""} onClick={() => setFeedback({ ...feedback, [field]: star })} aria-label={`${label}: ${star} star${star === 1 ? '' : 's'}`}>★</button>)}</div></fieldset>)}
            <label className="checkout-field">Small description <small>Optional</small><textarea rows={4} maxLength={1000} value={feedback.description} onChange={(event) => setFeedback({ ...feedback, description: event.target.value })} placeholder="Tell us what went well or what we can improve" /></label>
            {feedbackMessage && <p className="panel-message">{feedbackMessage}</p>}
            <button className="save-button" disabled={[feedback.serviceRating, feedback.riderRating, feedback.printQualityRating, feedback.overallRating].some((rating) => rating === 0)} onClick={submitFeedback}>Submit feedback</button>
            <button className="skip-feedback" onClick={() => setFeedbackOrder(null)}>Maybe later</button>
          </section>
        </div>
      )}

      {loginOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setLoginOpen(false)}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setLoginOpen(false)} aria-label="Close">×</button>
            <img src="/printbee-logo.png" width={88} height={88} alt="PrintBee" />
            <h2 id="login-title">Welcome to PrintBee</h2>
            <p>Choose how you want to use PrintBee. The same Google email can be used in both modes.</p>
            <button className="google-button" onClick={() => signInWithGoogle("CUSTOMER")}><span>G</span> Login with Google as user</button>
            <button className="partner-button" onClick={() => signInWithGoogle("PARTNER")}><span>G</span> Login with Google as delivery partner</button>
            <label className="checkout-field referral-input">Referral code <small>Optional · only for a new account</small><input value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="PBXXXXXXXX" /></label>
            <div className="reviewer-login-divider"><span>Website reviewer access</span></div>
            <label className="checkout-field">Email<input type="email" autoComplete="username" value={reviewerEmail} onChange={(e) => setReviewerEmail(e.target.value)} /></label>
            <label className="checkout-field">Password<input type="password" autoComplete="current-password" value={reviewerPassword} onChange={(e) => setReviewerPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") signInWithPassword(); }} /></label>
            <button className="save-button" onClick={signInWithPassword}>Sign in with email</button>
            {approvalStatus === "PENDING" && <p className="auth-message">Your delivery partner application is awaiting admin verification.</p>}
            {authMessage && <p className="auth-message">{authMessage}</p>}
            <small>By continuing, you agree to PrintBee's <a href="/terms">terms</a> and <a href="/privacy-policy">privacy policy</a>.</small>
          </section>
        </div>
      )}

      {riderApplicationOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRiderApplicationOpen(false)}>
          <section className="login-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setRiderApplicationOpen(false)} aria-label="Close">×</button>
            <div className="admin-badge">DELIVERY PARTNER</div>
            <h2>Register as a rider</h2>
            <p>Submit the details once verified by admin you can continue as delivery partner.</p>
            {!viewer && <button className="google-button" onClick={() => signInWithGoogle("PARTNER")}><span>G</span> Login with Google as delivery partner</button>}
            <label className="checkout-field">Full name<input value={riderApplication.name} onChange={(e) => setRiderApplication({ ...riderApplication, name: e.target.value })} /></label>
            <label className="checkout-field">Mobile number<input inputMode="numeric" value={riderApplication.mobileNumber} onChange={(e) => setRiderApplication({ ...riderApplication, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
            <button className="save-button" disabled={!viewer || !riderApplication.name.trim() || riderApplication.mobileNumber.length !== 10} onClick={submitRiderApplication}>Submit for admin verification</button>
            {authMessage && <p className="auth-message">{authMessage}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
