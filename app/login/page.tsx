import { redirect } from "next/navigation";
import { currentUser } from "@/lib/access";
import { LoginForm } from "@/components/login-form";
import Image from "next/image";
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
        sizes="(max-width: 900px) 272px, (min-width: 1600px) 752px, 48vw"
        preload
      />
    </div>
    <section className="login-welcome" aria-labelledby="login-title">
      <h1 id="login-title"><span>A little curiosity.</span><span>A lot to discover.</span></h1>
      <LoginForm />
    </section>
  </main>;
}
