"use client";

import Link from "next/link";
import { useState } from "react";
import { useRenderMonitor } from "react-render-pulse";

const ORDERS = Array.from({ length: 300 }, (_, i) => ({
  id: 1000 + i,
  status: (["open", "shipped", "cancelled"] as const)[i % 3],
  total: ((i * 37) % 500) + 9.99,
}));

export function OrdersTable() {
  const [status, setStatus] = useState("all");
  const orders = ORDERS.filter((o) => status === "all" || o.status === status);

  return (
    <>
      <StatusFilter value={status} onChange={setStatus} />
      <table>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link href={`/orders/${o.id}`}>#{o.id}</Link>
              </td>
              <td>{o.status}</td>
              <td>${o.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
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
