import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Cuenta eliminada | AuraBook", robots: { index: false, follow: false } };

/** Destino después de eliminar el último negocio (y con él, la cuenta). */
export default function AccountDeletedPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <span className="success-icon" style={{ margin: "0 auto 18px" }}><CheckCircle2 size={30} /></span>
          <h2>Tu cuenta fue eliminada</h2>
          <p>Borramos tu negocio, sus reservas y los datos de tus clientes. Gracias por haber usado AuraBook.</p>
        </div>
        <Link href="/" className="btn-secondary" style={{ width: "100%" }}>Volver al inicio</Link>
      </div>
    </div>
  );
}
