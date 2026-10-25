import Link from "next/link";
import { Sparkles } from "lucide-react";

export function BrandMark({ href = "/", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="site-brand">
      <span className="brand-symbol">
        <Sparkles size={18} strokeWidth={2.3} />
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
