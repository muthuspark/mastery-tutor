// Explicit test preload only. Production application code never imports this transport.
import { appendFileSync } from "node:fs";
if (process.env.LOGIN_TEST_OUTBOX && process.env.NODE_ENV !== "production") {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url) === "https://send.api.mailtrap.io/api/send") {
      const email = JSON.parse(options.body);
      if (email.to[0].email === "delivery-failure@example.com") return Response.json({ error: "private-provider-error" }, { status: 503 });
      if (email.category === "Invitation") return Response.json({ success: true, message_ids: ["controlled-invitation"] });
      appendFileSync(process.env.LOGIN_TEST_OUTBOX, `${JSON.stringify({ email: email.to[0].email, code: /code is (\d{6})/.exec(email.text)[1] })}\n`, { mode: 0o600 });
      return Response.json({ success: true, message_ids: ["controlled-acceptance"] });
    }
    if (String(url).startsWith("https://api.deepseek.com/")) return Response.json({ error: "Controlled AI outage" }, { status: 503 });
    return original(url, options);
  };
}
