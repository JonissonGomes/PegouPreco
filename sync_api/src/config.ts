import dotenv from 'dotenv';

dotenv.config();

function flag(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function emailList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? '8080', 10) || 8080,
  mongoUri: process.env.MONGODB_URI ?? process.env.MONGO_URI ?? '',
  mongoDb: process.env.MONGODB_DB ?? 'pegou_preco',
  skipEmailVerification: flag(process.env.SKIP_EMAIL_VERIFICATION),
  skipSmsVerification: flag(process.env.SKIP_SMS_VERIFICATION),
  exposeOtpInResponse: flag(process.env.EXPOSE_OTP_IN_RESPONSE),
  emailUser: process.env.EMAIL_USER ?? '',
  emailPass: process.env.EMAIL_PASS ?? '',
  emailLogoUrl: process.env.EMAIL_LOGO_URL ?? '',
  twilioSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioFrom: process.env.TWILIO_FROM_NUMBER ?? '',
  jevApiKey: process.env.JEV_API_KEY ?? '',
  /** E-mails com role admin (CRUD de mercados). Separados por vírgula. */
  adminEmails: emailList(process.env.ADMIN_EMAILS),
  /** Domínio do passkey (Digital Asset Links). */
  passkeyRpId: (process.env.PASSKEY_RP_ID ?? 'pegoupreco.onrender.com').trim(),
  passkeyRpName: process.env.PASSKEY_RP_NAME ?? 'PegouPreço',
  /** SHA-256 do certificado de assinatura do APK (debug keystore do projeto). */
  passkeySha256: (
    process.env.PASSKEY_ANDROID_SHA256 ??
    'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C'
  )
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean),
};
