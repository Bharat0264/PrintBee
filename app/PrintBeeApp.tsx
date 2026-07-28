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
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type Viewer = { email: string; isAdmin: boolean } | null;
type LocationOption = { id: string; name: string; delivery_fee_paise?: number; platform_fee_paise?: number };
type SupabaseConfig = { url: string; anonKey: string } | null;

function printSummary(items: any[] = []) {
  const totals = { bwSingle: 0, bwDouble: 0, colourSingle: 0, colourDouble: 0 };
  for (const item of items) {
    const pages = Math.max(1, Number(item.pages) || 1) * Math.max(1, Number(item.copies) || 1);
    if (item.mode === "bw-single") totals.bwSingle += pages;
    if (item.mode === "bw-double") totals.bwDouble += pages;
    if (item.mode === "colour-single") totals.colourSingle += pages;
    if (item.mode === "colour-double") totals.colourDouble += pages;
  }
  return totals;
}

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
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<"CUSTOMER" | "PARTNER">("CUSTOMER");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [locationId, setLocationId] = useState("");
  const [orderError, setOrderError] = useState("");
  const [orderResult, setOrderResult] = useState<{ id: string; orderNumber: string; deliveryCode: string; locationName: string; totalPaise: number; paid: boolean; paymentMode?: string } | null>(null);
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
  const [riderApplicationOpen, setRiderApplicationOpen] = useState(false);
  const [riderApplication, setRiderApplication] = useState({ name: "", mobileNumber: "" });
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [expandedScanner, setExpandedScanner] = useState<{ src: string; alt: string } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

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
    fetch("/api/me").then((response) => response.json()).then((data) => { setRole(data.role); setApprovalStatus(data.approvalStatus ?? null); }).catch(() => {});
  }, [viewer]);

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
      const response = await fetch("/api/orders/my");
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
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if ("Notification" in window) setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!viewer || viewer.isAdmin || loginMode !== "CUSTOMER") return;
    checkCustomerNotifications();
    const refresh = window.setInterval(checkCustomerNotifications, 15000);
    return () => window.clearInterval(refresh);
  }, [viewer, loginMode, notificationPermission]);

  const selected = options.find((item) => item.id === mode)!;
  const total = useMemo(() => pages * copies * prices[mode], [pages, copies, prices, mode]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      event.target.value = "";
      setFileName("");
      setSelectedFile(null);
      setUploadError(`"${file.name}" is too large. Please upload a PDF or image smaller than 25 MB.`);
      return;
    }
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
    if (selectedFile.size > MAX_UPLOAD_BYTES) return setUploadError("This file is larger than the 25 MB upload limit.");
    setCountingPages(true);
    setUploadError("");
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("pageCount", String(pages));
    let uploaded: any;
    try {
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: form });
      const responseText = await uploadResponse.text();
      try {
        uploaded = responseText ? JSON.parse(responseText) : {};
      } catch {
        uploaded = { error: uploadResponse.status === 413 || responseText.toLowerCase().includes("payload too large") ? "This document is too large to upload. Please compress it below 25 MB and try again." : "The upload service returned an unexpected response. Please try again." };
      }
      if (!uploadResponse.ok || !uploaded.uploadId) return setUploadError(uploaded.error ?? "Document upload failed. Please try again.");
    } catch {
      return setUploadError("The document could not be uploaded. Check your connection and try again.");
    } finally {
      setCountingPages(false);
    }
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

  const signInWithGoogle = async (mode: "CUSTOMER" | "PARTNER" = "CUSTOMER") => {
    window.localStorage.setItem("printbee-login-mode", mode);
    setLoginMode(mode);
    if (!supabase) return setAuthMessage("Authentication is awaiting Supabase configuration.");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
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
      body: JSON.stringify({ customerName, mobileNumber, locationId, items: cart, totalPaise: Math.round(cartTotal * 100) }),
    });
    const data = await response.json();
    if (!response.ok) return setOrderError(data.error ?? "Order could not be placed");
    setCart([]);
    const pendingResult = { ...data, paid: false };
    setOrderResult(pendingResult);
  };

  const openMyOrders = async () => {
    if (!viewer) return setLoginOpen(true);
    const response = await fetch("/api/orders/my");
    if (response.ok) setMyOrders(await response.json());
    setMyOrdersOpen(true);
  };

  const sendOrderNotification = async (title: string, body: string, tag: string) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, { body, tag, icon: "/printbee-logo.png", badge: "/printbee-logo.png" });
    } catch {
      new Notification(title, { body, tag, icon: "/printbee-logo.png" });
    }
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) return setAuthMessage("Mobile notifications are not supported by this browser.");
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      await sendOrderNotification("PrintBee notifications enabled", "We will notify you as your order moves from printing to delivery.", "printbee-enabled");
    }
  };

  const checkCustomerNotifications = async () => {
    try {
      const response = await fetch("/api/orders/my");
      if (!response.ok) return;
      const orders = await response.json() as any[];
      const storageKey = `printbee-order-notifications-${viewer?.email ?? "user"}`;
      const previous = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, any>;
      for (const order of orders) {
        const before = previous[order.id];
        if (!before && Date.now() - new Date(order.created_at).getTime() < 10 * 60 * 1000) await sendOrderNotification("Order received", `${order.order_number} has been received by PrintBee.`, `${order.id}-received`);
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
      setDeliveryOrderNumber("");
      setDeliveryCode("");
      await loadRiderOrders();
    }
  };

  const loadRiderOrders = async () => {
    const response = await fetch("/api/rider/orders");
    if (response.ok) setRiderOrders(await response.json());
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
            <section className="partner-welcome"><div><div className="admin-badge">DELIVERY PARTNER</div><h1>Your delivery dashboard</h1><p>Only orders assigned to your account are shown here.</p></div><button onClick={loadRiderOrders}>Refresh orders</button></section>
            {riderEarnings && <section className="partner-earnings">
              <div><small>Successful rides</small><strong>{riderEarnings.totalRides}</strong></div><div><small>Total earnings</small><strong>{inr.format(riderEarnings.earnedPaise / 100)}</strong></div><div><small>Available balance</small><strong>{inr.format(riderEarnings.availablePaise / 100)}</strong></div>
              <p>You earn 75% of the delivery fee for each OTP-verified delivery.</p>
              <label>UPI ID<input value={withdrawUpi} onChange={(e) => setWithdrawUpi(e.target.value)} placeholder="yourname@upi" /></label><button disabled={riderEarnings.availablePaise <= 0 || !withdrawUpi.trim()} onClick={requestWithdrawal}>Withdraw available earnings</button>
              <div className="partner-withdrawal-history">{riderEarnings.withdrawals?.map((withdrawal: any) => <span key={withdrawal.id}><b>{inr.format(withdrawal.amount_paise / 100)}</b><small>{withdrawal.status === "REQUESTED" ? "Withdraw requested" : withdrawal.status === "IN_PROGRESS" ? "In progress" : "Amount sent to bank"} · {withdrawal.upi_id}</small></span>)}</div>
            </section>}
            <section className="assigned-orders"><div className="section-title"><div><h2>Assigned orders</h2><p>One rider can receive multiple orders, including several orders at the same location.</p></div><span>{riderOrders.length} active</span></div>
              {riderOrders.length ? riderOrders.map((order) => <article key={order.order_number} className={deliveryOrderNumber === order.order_number ? "selected" : ""}><div><strong>{order.order_number}</strong><small>{order.location_name}</small></div><div><strong>{order.customer_name}</strong><small className="customer-phone">{order.mobile_number}</small></div><span className="status-chip">{order.payment_status === "PAID" ? "PAYMENT VERIFIED" : order.status}</span><div className="delivery-actions"><a href={`tel:${order.mobile_number}`} aria-label={`Call ${order.customer_name} at ${order.mobile_number}`}>Call customer</a><button onClick={() => { setDeliveryOrderNumber(order.order_number); setDeliveryCode(""); }}>{order.payment_status === "PAID" ? "Enter delivery OTP" : "Deliver & verify OTP"}</button></div>{Boolean(order.has_payment_qr) && order.payment_status !== "PAID" && <div className="order-payment-qr"><div><strong>Collect {inr.format(order.total_paise / 100)}</strong><small>Show this scanner to the customer for pay on delivery. Tap the scanner to enlarge.</small></div><button className="scanner-expand-button" onClick={() => setExpandedScanner({ src: `/api/orders/${order.id}/payment-qr`, alt: `Payment scanner for ${order.order_number}` })}><img src={`/api/orders/${order.id}/payment-qr`} alt={`Payment scanner for ${order.order_number}`} /></button></div>}{order.payment_status === "PAID" && <div className="payment-cleared-note"><strong>Payment received and verified</strong><small>No payment scanner is required. Collect the customer OTP after handing over the order.</small></div>}</article>) : <div className="empty-partner-orders">No active orders are assigned to you.</div>}
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
          <div className="payment-home-note">
            <strong>Scan the payment scanner from My Orders and pay while we deliver.</strong>
            <span>Displaying the scanner may take some time after the admin uploads it.</span>
            {viewer && !viewer.isAdmin && notificationPermission !== "granted" && <button onClick={enableNotifications}>Enable mobile order notifications</button>}
            {notificationPermission === "granted" && <small>Mobile order notifications are enabled.</small>}
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
          <p className="file-retention-note"><strong>Document privacy:</strong> Your uploaded files will be deleted once the order is delivered or cancelled. Maximum file size: 25 MB.</p>
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
            <strong>No prepaid payment</strong>
            <span>Pay online using your order’s scanner or scan and pay when the delivery partner arrives.</span>
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
                <h3>Pending rider applications</h3>
                <div className="application-list">{dashboard.riderApplications?.length ? dashboard.riderApplications.map((application: any) => <article key={application.email}><span><strong>{application.name}</strong><small>{application.email} · {application.mobile_number}</small></span><div><button onClick={() => approveRider(application.email, true)}>Approve</button><button className="reject" onClick={() => approveRider(application.email, false)}>Reject</button></div></article>) : <p>No rider applications awaiting review.</p>}</div>
                <h3>Active users</h3>
                <p>Customers who have placed orders, sorted by latest activity.</p>
                <div className="active-users">
                  {dashboard.activeUsers?.length ? dashboard.activeUsers.map((user: any) => <article key={user.email}><span className="user-avatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email} · {user.mobile_number}</small><small>Last order {new Date(user.last_order_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></span><span><strong>{user.order_count}</strong><small>Orders</small></span><span><strong>{inr.format((user.paid_spend_paise ?? 0) / 100)}</strong><small>Paid spend</small></span></article>) : <p>No active users yet.</p>}
                </div>
                <h3>Revenue</h3>
                <p>Paid order revenue, rider earnings, and PrintBee revenue per order.</p>
                <div className="revenue-table">
                  <div className="revenue-head"><span>Order</span><span>Revenue</span><span>Delivery partner</span><span>Rider fee</span><span>Admin revenue</span></div>
                  {dashboard.revenueOrders?.length ? dashboard.revenueOrders.map((entry: any) => <article key={entry.order_number}><span><strong>{entry.order_number}</strong><small>{new Date(entry.created_at).toLocaleDateString("en-IN")}</small></span><strong>{inr.format(entry.revenue_paise / 100)}</strong><span><strong>{entry.rider_name}</strong><small>{entry.rider_email || "Awaiting assignment"}</small></span><strong>{inr.format(entry.rider_fee_paise / 100)}</strong><span><strong>{inr.format(entry.admin_revenue_paise / 100)}</strong><small>Print {inr.format(entry.printing_subtotal_paise / 100)} + platform {inr.format(entry.platform_fee_paise / 100)} + 20% delivery</small></span></article>) : <p>No paid-order revenue yet.</p>}
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
                <h3>Live orders</h3>
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
                    <div className="payment-review-details"><span><small>Payment method</small><strong>{order.payment_status === "PAY_ON_DELIVERY" ? "Pay on delivery" : order.payment_reference || order.payment_status}</strong></span><span><small>Amount to collect</small><strong>{inr.format(order.total_paise / 100)}</strong></span></div>
                    {order.payment_status === "PAID" && order.payment_verified_at && <div className="payment-cleared-note"><strong>Payment received and verified</strong><small>Verified {new Date(order.payment_verified_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} by {order.payment_verified_by}. Scanner deleted from admin, customer and delivery-partner views.</small></div>}
                    {!["DELIVERED", "CANCELLED"].includes(order.status) && <div className="admin-payment-qr"><label>{order.has_payment_qr ? "Replace order payment scanner" : "Add order payment scanner"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadPaymentQr(order.id, e.target.files?.[0])} /></label>{Boolean(order.has_payment_qr) && <img src={`/api/orders/${order.id}/payment-qr`} alt={`Payment scanner for ${order.order_number}`} />}</div>}
                    {order.payment_status === "PAY_ON_DELIVERY" && order.status !== "CANCELLED" && <div className="payment-review-actions"><button className="mini-action" onClick={() => reviewPayment(order.id, "APPROVE")}>Payment received & verified</button></div>}
                    {order.payment_status === "PENDING" && order.status !== "CANCELLED" && <div className="payment-review-actions"><button className="mini-action" disabled={!order.payment_reference} onClick={() => reviewPayment(order.id, "APPROVE")}>Payment verified</button><button onClick={() => reviewPayment(order.id, "REJECT", "REFERENCE")}>Wrong payment ID</button><button onClick={() => reviewPayment(order.id, "REJECT", "AMOUNT")}>Wrong amount</button><button onClick={() => reviewPayment(order.id, "REJECT", "BOTH")}>Both mismatch</button></div>}
                    {order.payment_rejection_reason && <div className="cancelled-note"><strong>Payment rejected</strong><small>{order.payment_rejection_reason}</small></div>}
                    {order.status === "CANCELLED" && <div className="cancelled-note"><strong>Cancelled</strong><small>{order.cancellation_reason}</small></div>}
                    <div className="document-details">
                      <strong>Documents</strong>
                      {(() => { const total = printSummary(order.items); return <div className="print-summary"><span>B&amp;W single: {total.bwSingle} pages</span><span>B&amp;W double: {total.bwDouble} pages</span><span>Colour single: {total.colourSingle} pages</span><span>Colour double: {total.colourDouble} pages</span></div>; })()}
                      {order.items?.length ? order.items.map((item: any, index: number) => (
                        <div key={`${item.uploadId ?? item.fileName}-${index}`}>
                          <span>{item.fileName ?? `Document ${index + 1}`}</span>
                          <small>{item.pages ?? 1} pages · {item.copies ?? 1} copies · {options.find((option) => option.id === item.mode)?.title ?? item.mode ?? "A4 print"}</small>
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
                      <option value="">Assign rider</option>{dashboard.riders.map((rider: any) => <option key={rider.email} value={rider.email}>{rider.email}</option>)}
                    </select>
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
                <div className="payment-pending"><small>Payment method</small><strong>{orderResult.paymentMode === "PAY_ON_DELIVERY" ? "PAY ON DELIVERY" : orderResult.paid ? "PAID" : "PENDING"}</strong></div>
                <div><small>Your delivery code</small><strong>{orderResult.deliveryCode}</strong></div>
                <p>{orderResult.paymentMode === "PAY_ON_DELIVERY" ? `No prepaid payment is required. Pay exactly ${inr.format(orderResult.totalPaise / 100)} using the order scanner shown in My orders or by your delivery partner, then share the OTP only after receiving your prints.` : orderResult.paid ? "Give this code to the delivery agent only after receiving your prints." : `Pay exactly ${inr.format(orderResult.totalPaise / 100)} using the PrintBee payment link. Use ${orderResult.orderNumber} as the payment note.`}</p>
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
                <div className="fee-breakdown"><div><span>Printing subtotal</span><strong>{inr.format(cartTotal)}</strong></div><div><span>Delivery fee</span><strong>{inr.format(checkoutDeliveryFee)}</strong></div><div><span>Platform fee</span><strong>{inr.format(checkoutPlatformFee)}</strong></div></div>
                <div className="checkout-total"><span>To pay</span><strong>{inr.format(cartTotal + checkoutDeliveryFee + checkoutPlatformFee)}</strong></div>
                <div className="pay-on-delivery-note"><strong>Pay on delivery:</strong> No prepaid payment is required. Your order scanner will appear in My orders after the admin adds it, and your delivery partner can also show it at your doorstep.</div>
                {orderError && <p className="form-error">{orderError}</p>}
                <button className="save-button" disabled={!locations.length} onClick={placeOrder}>Place pay-on-delivery order</button>
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
            {myOrders.length ? myOrders.map((order) => <article key={order.id}><div><strong>{order.order_number}</strong><small>{order.location_name} · {new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>{order.cancellation_reason && <small>Cancelled: {order.cancellation_reason}</small>}</div><span className="status-chip">{order.payment_status === "PAY_ON_DELIVERY" ? "PAY ON DELIVERY" : order.payment_status} · {order.status}</span><strong>{inr.format(order.total_paise / 100)}</strong><div className="order-progress"><span className="done">Order confirmed</span><span className={["PRINTING", "READY_FOR_PICKUP", "RIDER_ASSIGNED", "DELIVERED"].includes(order.status) ? "done" : ""}>Printing</span><span className={["READY_FOR_PICKUP", "RIDER_ASSIGNED", "DELIVERED"].includes(order.status) ? "done" : ""}>Ready</span><span className={["RIDER_ASSIGNED", "DELIVERED"].includes(order.status) ? "done" : ""}>Rider assigned</span><span className={order.payment_status === "PAID" ? "done" : "current"}>{order.payment_status === "PAID" ? "Payment received" : "Pay on delivery"}</span><span className={order.status === "DELIVERED" ? "done" : ""}>Delivered</span></div>{order.payment_rejection_reason && <div className="customer-error">{order.payment_rejection_reason}</div>}{Boolean(order.has_payment_qr) && order.status !== "DELIVERED" && <div className="customer-payment-qr"><div><strong>Pay {inr.format(order.total_paise / 100)}</strong><small>Use this scanner now or pay when your delivery partner arrives. Tap the scanner to enlarge.</small></div><button className="scanner-expand-button" onClick={() => setExpandedScanner({ src: `/api/orders/${order.id}/payment-qr`, alt: `Payment scanner for ${order.order_number}` })}><img src={`/api/orders/${order.id}/payment-qr`} alt={`Payment scanner for ${order.order_number}`} /></button></div>}{order.rider_name && <div className="assigned-rider"><span><small>Delivery partner assigned</small><strong>{order.rider_name}</strong>{order.rider_mobile_number && <b>{order.rider_mobile_number}</b>}</span>{order.rider_mobile_number && <a href={`tel:${order.rider_mobile_number}`}>Call delivery partner</a>}</div>}{order.status !== "CANCELLED" && ["RIDER_ASSIGNED", "DELIVERED"].includes(order.status) && <div className="customer-code"><span><small>Order ID</small><b>{order.order_number}</b></span><span><small>Delivery OTP · share only after receiving prints</small><strong>{order.deliveryCode}</strong></span></div>}</article>) : <p>No orders yet.</p>}
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

      {loginOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setLoginOpen(false)}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setLoginOpen(false)} aria-label="Close">×</button>
            <img src="/printbee-logo.png" width={88} height={88} alt="PrintBee" />
            <h2 id="login-title">Welcome to PrintBee</h2>
            <p>Choose how you want to use PrintBee. The same Google email can be used in both modes.</p>
            <button className="google-button" onClick={() => signInWithGoogle("CUSTOMER")}><span>G</span> Login with Google as user</button>
            <button className="partner-button" onClick={() => signInWithGoogle("PARTNER")}><span>G</span> Login with Google as delivery partner</button>
            {approvalStatus === "PENDING" && <p className="auth-message">Your delivery partner application is awaiting admin verification.</p>}
            {authMessage && <p className="auth-message">{authMessage}</p>}
            <small>By continuing, you agree to PrintBee’s terms and privacy policy.</small>
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
