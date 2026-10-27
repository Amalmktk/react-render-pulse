import Link from "next/link";
import { useRouter } from "next/router";

export default function OrderPage() {
  const { query } = useRouter();

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Link href="/">← All orders</Link>
      <h1>Order #{query.id}</h1>
      <p>Measured as the area page:/orders/[id] on the route /orders/[id].</p>
    </main>
  );
}
