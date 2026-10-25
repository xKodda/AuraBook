import Link from "next/link";
import { AuraMark } from "./aura-mark";

export function BrandMark({ href = "/", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="site-brand">
      <span className="brand-symbol">
        <AuraMark size={20} />
      </span>
      <span>
        AURA<span className="brand-accent">BOOK</span>
        {suffix && (
          <>
            <span className="brand-divider">/</span>
            {suffix}
          </>
        )}
      </span>
    </Link>
  );
}
