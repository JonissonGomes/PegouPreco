export async function sendVerificationSms(args: {
  toE164: string;
  code: string;
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
}) {
  const sid = args.accountSid?.trim() ?? '';
  const token = args.authToken?.trim() ?? '';
  const from = args.fromNumber?.trim() ?? '';
  if (!sid || !token || !from) {
    console.log(
      `[SMS] Twilio não configurado — código para ${args.toE164}: ${args.code}`,
    );
    return;
  }

  const to = args.toE164.startsWith('+') ? args.toE164 : `+${args.toE164}`;
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: `PegouPreço: seu código é ${args.code}`,
  });

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Twilio HTTP ${res.status}: ${text}`);
  }
}
