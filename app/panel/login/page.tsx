import { redirect } from "next/navigation";

// Ruta histórica: el acceso vive en /login.
export default function LegacyPanelLoginPage() {
  redirect("/login");
}
