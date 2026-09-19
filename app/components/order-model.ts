export type CustomerOrder = {
  id: string; order_number?: string; status: string; payment_status: string;
  created_at: string; updated_at?: string; total_paise: number; location_name?: string;
  rider_name?: string | null; rider_mobile_number?: string | null; deliveryCode?: string | null;
  cancellation_reason?: string; feedback_submitted?: number;
  late_night_fee_paise?: number; has_payment_qr?: boolean; payment_rejection_reason?: string;
  items?: Array<{ fileName?: string; reference?: string; pages?: number; copies?: number; mode?: string; serviceId?: string; serviceName?: string; kind?: string; name?: string }>;
};

export const PRINT_STEPS = [
  ['CONFIRMED', 'Order confirmed', 'Your order is confirmed'],
  ['PRINTING', 'Printing', 'Your prints are taking shape'],
  ['READY_FOR_PICKUP', 'Ready for pickup', 'Your prints are ready'],
  ['RIDER_ASSIGNED', 'Partner assigned', 'Your PrintBee partner is assigned'],
  ['DELIVERED', 'Delivered', 'Delivered! Enjoy your prints'],
] as const;
export const REPORT_STEPS = [
  ['CONFIRMED', 'Order confirmed', 'Your report order is confirmed'],
  ['PLAGIARISM_SUBMITTED', 'Submitted for checking', 'Your paper is being checked'],
  ['PLAGIARISM_REPORT_RECEIVED', 'Report ready', 'Your report is ready'],
  ['DELIVERED', 'Report delivered', 'Your report has been delivered'],
] as const;
export function isReport(order: CustomerOrder) {
  return Boolean(order.items?.length && order.items.every(item => item.serviceId === 'turnitin-plagiarism-check'));
}
export function isActiveOrder(order: CustomerOrder) {
  return order.payment_status === 'PAID' && !['DELIVERED', 'CANCELLED'].includes(order.status);
}
export function activeOrders(orders: CustomerOrder[]) {
  return orders.filter(isActiveOrder).sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
}
export function orderStage(order: CustomerOrder) {
  const steps = isReport(order) ? REPORT_STEPS : PRINT_STEPS;
  const index = steps.findIndex(step => step[0] === order.status);
  return { steps, index, label: order.status === 'CANCELLED' ? 'Order cancelled' : index < 0 ? 'Order update' : steps[index][2] };
}
export function canShowOTP(order: CustomerOrder) {
  return !isReport(order) && order.payment_status === 'PAID' && order.status === 'RIDER_ASSIGNED' && Boolean(order.deliveryCode);
}
export function contactNumber(order: CustomerOrder) {
  const number = order.rider_mobile_number?.replace(/[\s()-]/g, '') || '';
  return /^\+?\d{7,15}$/.test(number) ? number : null;
}
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
