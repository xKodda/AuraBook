import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="auth-shell">
      <div className="auth-card nf-card">
        <span className="auth-sent-icon nf-icon"><SearchX size={26} /></span>
        <h1>No encontramos esta página</h1>
        <p>Si buscabas la página de reservas de un negocio, revisa el enlace o pídeselo directamente al local.</p>
        <div className="nf-actions">
          <Link href="/" className="btn-primary">Ir al inicio</Link>
          <Link href="/login" className="btn-secondary">Ingresar a mi panel</Link>
        </div>
      </div>
    </main>
  );
}
