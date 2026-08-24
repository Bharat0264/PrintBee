import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  deliveryFeePaise: integer("delivery_fee_paise").notNull().default(1500),
  couponCode: text("coupon_code"),
  couponDeliveryDiscountPaise: integer("coupon_delivery_discount_paise").notNull().default(0),
  incampusDelivery: integer("incampus_delivery", { mode: "boolean" }).notNull().default(false),
  incampusType: text("incampus_type"),
  campusBuilding: text("campus_building"),
  classroomNumber: text("classroom_number"),
  incampusFeePaise: integer("incampus_fee_paise").notNull().default(0),
  platformFeePaise: integer("platform_fee_paise").notNull().default(350),
});

export const appUsers = sqliteTable("app_users", {
  email: text("email").primaryKey(),
  role: text("role", { enum: ["ADMIN", "AGENT"] }).notNull(),
  createdAt: text("created_at").notNull(),
  name: text("name"),
  mobileNumber: text("mobile_number"),
  approvalStatus: text("approval_status").notNull().default("APPROVED"),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(false),
});

export const adminMembers = sqliteTable("admin_members", {
  email: text("email").primaryKey(),
  role: text("role", { enum: ["OWNER", "OPERATIONS", "ACCOUNTANT", "SUPPORT"] }).notNull(),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  subscriptionJson: text("subscription_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const customerProfiles = sqliteTable("customer_profiles", {
  email: text("email").primaryKey(),
  referralCode: text("referral_code").notNull().unique(),
  referredByEmail: text("referred_by_email"),
  pointsBalance: integer("points_balance").notNull().default(10),
  createdAt: text("created_at").notNull(),
});

export const walletTransactions = sqliteTable("wallet_transactions", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  points: integer("points").notNull(),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  orderId: text("order_id"),
  createdAt: text("created_at").notNull(),
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

export const cartItems = sqliteTable("cart_items", {
  id: text("id").primaryKey(),
  customerEmail: text("customer_email").notNull(),
  uploadId: text("upload_id").notNull().unique(),
  itemJson: text("item_json").notNull(),
  createdAt: text("created_at").notNull(),
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
  deliveryLatitude: real("delivery_latitude"),
  deliveryLongitude: real("delivery_longitude"),
  deliveryAccuracy: real("delivery_accuracy"),
  deliveryAddress: text("delivery_address"),
  deliveryLandmark: text("delivery_landmark"),
  deliveryCapturedAt: text("delivery_captured_at"),
  deliveryDistanceMeters: integer("delivery_distance_meters"),
  storeLatitude: real("store_latitude"),
  storeLongitude: real("store_longitude"),
  platformFeePaise: integer("platform_fee_paise").notNull().default(350),
  packagingFeePaise: integer("packaging_fee_paise").notNull().default(0),
  totalPaise: integer("total_paise").notNull(),
  paymentGatewayFeePaise: integer("payment_gateway_fee_paise").notNull().default(0),
  surgeFeePaise: integer("surge_fee_paise").notNull().default(0),
  lateNightFeePaise: integer("late_night_fee_paise").notNull().default(0),
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
  paymentQrStorageKey: text("payment_qr_storage_key"),
  paymentQrFileName: text("payment_qr_file_name"),
  paymentQrDeletedAt: text("payment_qr_deleted_at"),
  hiddenAt: text("hidden_at"),
  hiddenBy: text("hidden_by"),
  pointsRedeemed: integer("points_redeemed").notNull().default(0),
  pointsDiscountPaise: integer("points_discount_paise").notNull().default(0),
  referralRewardedAt: text("referral_rewarded_at"),
  spendPointsAwarded: integer("spend_points_awarded").notNull().default(0),
});

export const storeLocation = sqliteTable("store_location", {
  id: text("id").primaryKey(), latitude: real("latitude").notNull(), longitude: real("longitude").notNull(), accuracy: real("accuracy"), updatedAt: text("updated_at").notNull(), updatedBy: text("updated_by"),
});

export const orderFeedback = sqliteTable("order_feedback", {
  orderId: text("order_id").primaryKey(),
  customerEmail: text("customer_email").notNull(),
  serviceRating: integer("service_rating").notNull(),
  riderRating: integer("rider_rating").notNull(),
  printQualityRating: integer("print_quality_rating").notNull(),
  overallRating: integer("overall_rating").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
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

export const riderWithdrawals = sqliteTable("rider_withdrawals", {
  id: text("id").primaryKey(),
  riderEmail: text("rider_email").notNull(),
  upiId: text("upi_id").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  status: text("status").notNull().default("REQUESTED"),
  requestedAt: text("requested_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const orderSequences = sqliteTable("order_sequences", {
  id: text("id").primaryKey(),
  nextValue: integer("next_value").notNull().default(1),
});

export const printServices = sqliteTable("print_services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  isBinding: integer("is_binding", { mode: "boolean" }).notNull().default(false),
  countsForPackaging: integer("counts_for_packaging", { mode: "boolean" }).notNull().default(true),
  pricePaise: integer("price_paise").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const printPrices = sqliteTable("print_prices", {
  id: text("id").primaryKey(),
  pricePaise: integer("price_paise").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const addons = sqliteTable("addons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  pricePaise: integer("price_paise").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orderAvailability = sqliteTable("order_availability", {
  id: text("id").primaryKey(),
  acceptingOrders: integer("accepting_orders", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
  launchAt: text("launch_at").notNull().default("2026-08-10T03:30:00.000Z"),
  launchMessage: text("launch_message").notNull().default("Site will be live from Aug 10 2026, 9 A.M. IST"),
});

export const checkoutFeeSettings = sqliteTable("checkout_fee_settings", {
  id: text("id").primaryKey(), gatewayEnabled: integer("gateway_enabled", { mode: "boolean" }).notNull().default(true), surgeEnabled: integer("surge_enabled", { mode: "boolean" }).notNull().default(false), surgeType: text("surge_type").notNull().default("PERCENT"), surgeValue: real("surge_value").notNull().default(0), lateNightEnabled: integer("late_night_enabled", { mode: "boolean" }).notNull().default(false), lateNightType: text("late_night_type").notNull().default("PERCENT"), lateNightValue: real("late_night_value").notNull().default(0), platformFeePaise: integer("platform_fee_paise").notNull().default(350), deliveryBaseFeePaise: integer("delivery_base_fee_paise").notNull().default(1000), deliveryFeePer100mPaise: integer("delivery_fee_per_100m_paise").notNull().default(100), packagingEnabled: integer("packaging_enabled", { mode: "boolean" }).notNull().default(false), packagingFeePaise: integer("packaging_fee_paise").notNull().default(0), updatedAt: text("updated_at").notNull(), updatedBy: text("updated_by"),
});

export const packagingChargeRules = sqliteTable("packaging_charge_rules", {
  id: text("id").primaryKey(),
  minPages: integer("min_pages").notNull(),
  maxPages: integer("max_pages").notNull(),
  chargePaise: integer("charge_paise").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
