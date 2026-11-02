import { redirect } from "next/navigation";
import { currentUser } from "@/lib/access";
import { LoginForm } from "@/components/login-form";
import Image from "next/image";
import { LearningObjects } from "@/components/learning-objects";
import "./login.css";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <main id="main-content" tabIndex={-1} className="login-page">
    <div className="login-illustration">
      <Image
        src="/images/newton-under-apple-tree.webp"
        alt="Pixel art of Isaac Newton reading beneath an apple tree, an apple in his hand."
        width={1254}
        height={1254}
        sizes="(max-width: 900px) 272px, 620px"
        preload
      />
      <svg className="login-butterfly" aria-hidden="true" viewBox="0 0 20 16" shapeRendering="crispEdges"><path fill="#683c20" d="M1 1h5v2h2v3h4V3h2V1h5v7h-3v2h2v4h-5v-2h-2v4H9v-4H7v2H2v-4h2V8H1z"/><path fill="#e78423" d="M2 2h3v2h2v4H4V6H2zm12 2h2V2h2v4h-2v2h-3V5h1zM4 10h3v2H4zm9 0h3v2h-3z"/><path fill="#f9d478" d="M3 3h2v2H3zm12 0h2v2h-2z"/></svg>
    </div>
    <section className="login-welcome" aria-labelledby="login-title">
      <h1 id="login-title"><span>A little curiosity.</span><span>A lot to discover.</span></h1>
      <p className="login-tagline">Your private space to keep learning.</p>
      <LoginForm />
    </section>
    <LearningObjects />
  </main>;
}
