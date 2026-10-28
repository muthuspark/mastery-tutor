// Explicit preload for the isolated production profiling server; never imported by the app.
import { appendFileSync } from 'node:fs';
if (process.env.PERFORMANCE_TEST_OUTBOX && process.env.MAILTRAP_API_KEY === 'local-test-only') {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) return original(input, options);
    if (url === 'https://send.api.mailtrap.io/api/send') {
      const mail = JSON.parse(options.body);
      appendFileSync(process.env.PERFORMANCE_TEST_OUTBOX, JSON.stringify({ email: mail.to[0].email, code: /code is (\d{6})/.exec(mail.text)?.[1] }) + '\n', { mode: 0o600 });
      return Response.json({ success: true, message_ids: ['local-only'] });
    }
    // Fail closed: these runs never contact external email, AI or image services.
    return Response.json({ error: 'External requests disabled in performance fixture' }, { status: 503 });
  };
}
