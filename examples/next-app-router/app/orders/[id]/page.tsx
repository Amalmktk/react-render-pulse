import Link from "next/link";
import { RenderMonitor } from "react-render-pulse";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main>
      <Link href="/">← All orders</Link>
      <RenderMonitor id="order-details">
        <h1>Order #{id}</h1>
        <p>Reported under the route /orders/[id], so every order page is grouped together.</p>
      </RenderMonitor>
    </main>
  );
}
