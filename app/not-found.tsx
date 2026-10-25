import Link from "next/link";

export default function NotFound() {
  return (
    <main className="simple-state">
      <h1>No encontramos este negocio.</h1>
      <p>Revisa el enlace o consulta directamente con el local.</p>
      <Link href="/">Ir al inicio</Link>
    </main>
  );
}
