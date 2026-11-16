import { redirect } from "next/navigation";

/** The service cart is now the "Services" tab of the cart (Update 01, Phase 06). */
export default function ServiceCartPage() {
  redirect("/cart?tab=services");
}
