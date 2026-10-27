import { useState } from "react";
import { Link, Outlet, useParams, type RouteObject } from "react-router";
import { RenderMonitor, useRenderMonitor } from "react-render-pulse";

const ORDERS = Array.from({ length: 300 }, (_, i) => ({
  id: 1000 + i,
  status: (["open", "shipped", "cancelled"] as const)[i % 3],
}));

function Layout() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <nav>
        <Link to="/">Orders</Link>
      </nav>
      <RenderMonitor id="route-outlet">
        <Outlet />
      </RenderMonitor>
    </div>
  );
}

function Orders() {
  const [status, setStatus] = useState("all");
  const orders = ORDERS.filter((o) => status === "all" || o.status === status);

  return (
    <>
      <h1>Orders</h1>
      <StatusFilter value={status} onChange={setStatus} />
      <RenderMonitor id="orders-table">
        <table>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/orders/${o.id}`}>#{o.id}</Link>
                </td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RenderMonitor>
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

function Order() {
  const { orderId } = useParams();
  return (
    <RenderMonitor id="order-details">
      <h1>Order #{orderId}</h1>
      <p>Reported under the route /orders/:orderId.</p>
    </RenderMonitor>
  );
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Orders /> },
      { path: "orders/:orderId", element: <Order /> },
    ],
  },
];
