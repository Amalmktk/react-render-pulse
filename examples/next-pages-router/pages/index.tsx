import Link from "next/link";
import { useState } from "react";
import { RenderMonitor, useRenderMonitor } from "react-render-pulse";

const ORDERS = Array.from({ length: 300 }, (_, i) => ({
  id: 1000 + i,
  status: (["open", "shipped", "cancelled"] as const)[i % 3],
}));

export default function OrdersPage() {
  const [status, setStatus] = useState("all");
  const orders = ORDERS.filter((o) => status === "all" || o.status === status);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Orders</h1>
      <StatusFilter value={status} onChange={setStatus} />
      <RenderMonitor id="orders-table">
        <table>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/orders/${o.id}`}>#{o.id}</Link>
                </td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RenderMonitor>
    </main>
  );
}

function StatusFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  useRenderMonitor("status-filter");

  return (
    <select aria-label="Status" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="shipped">Shipped</option>
      <option value="cancelled">Cancelled</option>
    </select>
  );
}
