import test from "node:test"; import assert from "node:assert/strict"; import { readFile } from "node:fs/promises";
const orders=await readFile(new URL("../app/api/orders/route.ts",import.meta.url),"utf8"); const app=await readFile(new URL("../app/PrintBeeApp.tsx",import.meta.url),"utf8");
test("gateway and surge fees are controlled and calculated server-side",()=>{ assert.match(orders,/feeBasePaise \* 0\.01/); assert.match(orders,/packagingFeePaise \+ surgeFeePaise \+ paymentGatewayFeePaise/); assert.match(app,/High-demand surge charge/); assert.match(app,/Payment gateway fee \(1%\)/); });
