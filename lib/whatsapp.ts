/**
 * WhatsApp Cloud API notifications.
 *
 * Meta only allows free-form messages inside a 24h dialog window — the first
 * message must be an approved template. Create + approve the template in
 * Meta Business Manager (per locale), then set WHATSAPP_TEMPLATE_NAME.
 * Without env keys the send is skipped gracefully — the booking still exists.
 */

interface TemplateParams {
  to: string; // E.164 without '+'
  template: string;
  locale: string; // template language code, e.g. 'ka', 'ru', 'en'
  bodyParams: string[];
}

function credentials() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}

export function whatsappConfigured(): boolean {
  return credentials() !== null;
}

export async function sendWhatsAppTemplate(p: TemplateParams): Promise<boolean> {
  const creds = credentials();
  if (!creds) return false;

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: p.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: p.template,
          language: { code: p.locale },
          components: [
            {
              type: 'body',
              parameters: p.bodyParams.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
    }
  );
  return res.ok;
}
