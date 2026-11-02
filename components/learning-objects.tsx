import Image from "next/image";

/** Detailed pixel vignettes share the orchard's palette and natural ground line. */
export function LearningObjects() {
  return <section className="learning-world" aria-label="A place to keep learning">
    <section aria-labelledby="explore-title">
      <Image className="learning-world-art" src="/images/learning-books.webp" width={768} height={512} sizes="(max-width: 540px) 96px, 208px" alt="" />
      <h2 id="explore-title">Explore a topic</h2><p>Start with what sparks <br />your curiosity.</p>
    </section>
    <section aria-labelledby="understand-title">
      <Image className="learning-world-art" src="/images/learning-lantern.webp" width={768} height={512} sizes="(max-width: 540px) 96px, 208px" alt="" />
      <h2 id="understand-title">Understand it deeply</h2><p>Go beyond the surface <br />with clarity and context.</p>
    </section>
    <section aria-labelledby="keep-title">
      <Image className="learning-world-art" src="/images/learning-sapling.webp" width={768} height={512} sizes="(max-width: 540px) 96px, 208px" alt="" />
      <h2 id="keep-title">Keep what you learn</h2><p>Build lasting knowledge <br />at your own pace.</p>
    </section>
  </section>;
}
