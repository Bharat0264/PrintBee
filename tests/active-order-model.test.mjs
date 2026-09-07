import test from 'node:test';
import assert from 'node:assert/strict';
import { activeOrders, canShowOTP, contactNumber, orderStage, formatFileSize } from '../app/components/order-model.ts';
const base = { id:'qa', order_number:'QA ONLY', status:'CONFIRMED', payment_status:'PAID', created_at:'2026-09-07T12:00:00Z', total_paise:100, deliveryCode:'000000', items:[{ serviceId:'document-printing' }] };
test('active orders exclude completed, cancelled and unverified payments', () => {
  assert.equal(activeOrders([base, {...base,id:'d',status:'DELIVERED'}, {...base,id:'c',status:'CANCELLED'}, {...base,id:'p',payment_status:'PENDING'}, {...base,id:'f',payment_status:'FAILED'}]).length,1);
});
test('multiple active orders sort by available update time, falling back to creation', () => {
  assert.deepEqual(activeOrders([base,{...base,id:'new',created_at:'2026-09-07T13:00:00Z'},{...base,id:'updated',updated_at:'2026-09-07T14:00:00Z'}]).map(x=>x.id),['updated','new','qa']);
});
test('OTP only shown for a paid, rider-assigned print order with a server code', () => {
  for (const status of ['CONFIRMED','PRINTING','READY_FOR_PICKUP','DELIVERED','CANCELLED']) assert.equal(canShowOTP({...base,status}),false);
  assert.equal(canShowOTP({...base,status:'RIDER_ASSIGNED'}),true);
  assert.equal(canShowOTP({...base,status:'RIDER_ASSIGNED',payment_status:'PENDING'}),false);
  assert.equal(canShowOTP({...base,status:'RIDER_ASSIGNED',deliveryCode:null}),false);
  assert.equal(canShowOTP({...base,status:'RIDER_ASSIGNED',items:[{serviceId:'turnitin-plagiarism-check'}]}),false);
});
test('actual print statuses map correctly without invented delivery stages', () => {
  const statuses = ['CONFIRMED','PRINTING','READY_FOR_PICKUP','RIDER_ASSIGNED','DELIVERED'];
  statuses.forEach((status,index)=>assert.equal(orderStage({...base,status}).index,index));
  assert.equal(orderStage({...base,status:'UNKNOWN'}).index,-1);
  assert.equal(orderStage({...base,status:'CANCELLED'}).label,'Order cancelled');
});
test('plagiarism report journey uses existing report stages', () => {
  const result=orderStage({...base,status:'PLAGIARISM_REPORT_RECEIVED',items:[{serviceId:'turnitin-plagiarism-check'}]});
  assert.equal(result.index,2); assert.equal(result.steps.length,4);
});
test('contact links accept only phone-shaped values',()=>{
  assert.equal(contactNumber({...base,rider_mobile_number:'+91 90000 00000'}),'+919000000000');
  assert.equal(contactNumber({...base,rider_mobile_number:'javascript:alert(1)'}),null);
});
test('small file sizes never round to 0.00 MB',()=>{
  assert.equal(formatFileSize(512),'512 B'); assert.equal(formatFileSize(2048),'2.0 KB'); assert.equal(formatFileSize(1048576),'1.00 MB');
});
