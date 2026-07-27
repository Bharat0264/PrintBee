import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const appUsers = sqliteTable("app_users", {
  email: text("email").primaryKey(),
  role: text("role", { enum: ["ADMIN", "AGENT"] }).notNull(),
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
  totalPaise: integer("total_paise").notNull(),
  deliveryCodeHash: text("delivery_code_hash").notNull(),
  status: text("status", { enum: ["PLACED", "DELIVERED"] }).notNull().default("PLACED"),
  createdAt: text("created_at").notNull(),
  deliveredAt: text("delivered_at"),
  deliveredBy: text("delivered_by"),
});
