import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Image className="footer-books" src="/images/studies-books.webp" width={1774} height={887} sizes="160px" alt="" aria-hidden="true" />
      <div className="site-footer-content">
        <p className="footer-method">Read. Practice. Reflect.</p>
      </div>
    </footer>
  );
}
