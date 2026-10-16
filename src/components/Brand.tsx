import Link from "next/link";

export default function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand${light ? " brand-light" : ""}`} aria-label="ClasTrac home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m3 9 9-5 9 5-9 5-9-5Z" />
          <path d="M7 11.2v4.1c2.9 2.2 7.1 2.2 10 0v-4.1M21 9v6" />
        </svg>
      </span>
      <span>clastrac<span className="brand-period">.</span></span>
    </Link>
  );
}
