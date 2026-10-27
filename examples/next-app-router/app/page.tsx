import Link from "next/link";
import { RenderMonitor } from "react-render-pulse";
import { OrdersTable } from "./orders/OrdersTable";

// A Server Component can render <RenderMonitor> directly: the package's main
// entry is marked "use client", so it becomes a client boundary here.
export default function Page() {
  return (
    <main>
      <h1>Orders</h1>
      <p>
        Open an order, e.g. <Link href="/orders/1001">#1001</Link>.
      </p>
      <RenderMonitor id="orders-table">
        <OrdersTable />
      </RenderMonitor>
    </main>
  );
}
