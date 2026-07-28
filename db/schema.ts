import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  deliveryFeePaise: integer("delivery_fee_paise").notNull().default(1500),
  platformFeePaise: integer("platform_fee_paise").notNull().default(350),
});

export const appUsers = sqliteTable("app_users", {
  email: text("email").primaryKey(),
  role: text("role", { enum: ["ADMIN", "AGENT"] }).notNull(),
  createdAt: text("created_at").notNull(),
  name: text("name"),
  mobileNumber: text("mobile_number"),
  approvalStatus: text("approval_status").notNull().default("APPROVED"),
});

export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  customerEmail: text("customer_email").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  sizeBytes: integer("size_bytes").notNull(),
  pageCount: integer("page_count").notNull(),
  orderId: text("order_id"),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name").notNull(),
  mobileNumber: text("mobile_number").notNull(),
  locationId: text("location_id").notNull(),
  locationName: text("location_name").notNull(),
  itemsJson: text("items_json").notNull(),
  printingSubtotalPaise: integer("printing_subtotal_paise").notNull().default(0),
  deliveryFeePaise: integer("delivery_fee_paise").notNull().default(1500),
  platformFeePaise: integer("platform_fee_paise").notNull().default(350),
  totalPaise: integer("total_paise").notNull(),
  deliveryCodeHash: text("delivery_code_hash").notNull(),
  deliveryCodeEncrypted: text("delivery_code_encrypted"),
  status: text("status").notNull().default("PAYMENT_PENDING"),
  paymentStatus: text("payment_status").notNull().default("PENDING"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  paymentReference: text("payment_reference"),
  riderEmail: text("rider_email"),
  createdAt: text("created_at").notNull(),
  deliveredAt: text("delivered_at"),
  deliveredBy: text("delivered_by"),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: text("cancelled_at"),
  cancelledBy: text("cancelled_by"),
  paymentRejectionReason: text("payment_rejection_reason"),
  paymentVerifiedAt: text("payment_verified_at"),
  paymentVerifiedBy: text("payment_verified_by"),
});

export const riderPayments = sqliteTable("rider_payments", {
  id: text("id").primaryKey(),
  riderEmail: text("rider_email").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  paymentDate: text("payment_date").notNull(),
  note: text("note"),
  recordedBy: text("recorded_by").notNull(),
  createdAt: text("created_at").notNull(),
});
