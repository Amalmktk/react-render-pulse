import { useMemo, useState } from "react";
import { RenderMonitor, useRenderMonitor } from "react-render-pulse";

interface Order {
  id: number;
  customer: string;
  status: "open" | "shipped" | "cancelled";
  total: number;
}

const STATUSES = ["open", "shipped", "cancelled"] as const;

const ORDERS: Order[] = Array.from({ length: 400 }, (_, i) => ({
  id: 1000 + i,
  customer: `Customer ${(i * 7919) % 997}`,
  status: STATUSES[i % 3] ?? "open",
  total: Math.round(((i * 37) % 500) * 100 + 999) / 100,
}));

export function App() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const orders = useMemo(
    () =>
      ORDERS.filter(
        (o) => (status === "all" || o.status === status) && o.customer.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, status],
  );

  return (
    <RenderMonitor id="orders-page">
      <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1>Orders</h1>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <input
            aria-label="Search customers"
            placeholder="Search customers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <PriceChart orders={orders} />

        <RenderMonitor id="orders-table">
          <OrdersTable orders={orders} />
        </RenderMonitor>
      </main>
    </RenderMonitor>
  );
}

function PriceChart({ orders }: { orders: Order[] }) {
  useRenderMonitor("price-chart");
  const max = Math.max(...orders.map((o) => o.total), 1);

  return (
    <svg width="100%" height={80} viewBox={`0 0 ${Math.max(orders.length, 1)} 80`} preserveAspectRatio="none">
      <title>Order totals</title>
      {orders.map((o, i) => (
        <rect key={o.id} x={i} y={80 - (o.total / max) * 80} width={0.8} height={(o.total / max) * 80} fill="#2a78d6" />
      ))}
    </svg>
  );
}

function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th align="left">Order</th>
          <th align="left">Customer</th>
          <th align="left">Status</th>
          <th align="right">Total</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <Row key={o.id} order={o} />
        ))}
      </tbody>
    </table>
  );
}

// Deliberately unmemoized and a little expensive, so the table shows up as the slow area.
function Row({ order }: { order: Order }) {
  let checksum = 0;
  for (let i = 0; i < 2000; i++) checksum = (checksum + i * order.id) % 9973;

  return (
    <tr data-checksum={checksum}>
      <td>#{order.id}</td>
      <td>{order.customer}</td>
      <td>{order.status}</td>
      <td align="right">${order.total.toFixed(2)}</td>
    </tr>
  );
}
