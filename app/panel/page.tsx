import { redirect } from "next/navigation";

// Ruta histórica: el panel vive en /dashboard.
export default function LegacyPanelPage() {
  redirect("/dashboard");
}
