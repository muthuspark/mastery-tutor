import { redirect } from "next/navigation";
import { currentUser } from "@/lib/access";
import { LoginForm } from "@/components/login-form";
export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <main id="main-content" tabIndex={-1} className="reading-shell login-page">
    <p className="eyebrow">Newton · Private beta</p>
    <h1 className="display mt-4 text-4xl leading-tight sm:text-5xl">A place to keep learning.</h1>
    <LoginForm />
  </main>;
}
