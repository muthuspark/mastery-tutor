import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div><p className="footer-wordmark">Mastery Tutor</p><p className="footer-note">A place to turn curiosity into understanding.</p></div>
        <nav aria-label="Footer navigation"><Link href="/">Your studies</Link><Link href="/settings">Personalize your learning</Link></nav>
        <p className="footer-method">Read. Practice. Reflect.</p>
      </div>
    </footer>
  );
}
