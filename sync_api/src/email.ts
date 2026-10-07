import nodemailer from 'nodemailer';

export async function sendVerificationEmail(args: {
  user: string;
  pass: string;
  to: string;
  code: string;
  logoUrl?: string;
}) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {user: args.user, pass: args.pass},
  });

  const logo = args.logoUrl
    ? `<img src="${args.logoUrl}" height="48"/>`
    : '<h2>PegouPreço</h2>';

  await transporter.sendMail({
    from: `"PegouPreço" <${args.user}>`,
    to: args.to,
    subject: `Seu código PegouPreço: ${args.code}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px">
        ${logo}
        <p>Olá! Use o código abaixo para confirmar sua conta:</p>
        <p style="font-size:28px;font-weight:800;letter-spacing:6px">${args.code}</p>
        <p>Válido por 15 minutos. Se não foi você, ignore este e-mail.</p>
      </div>
    `,
  });
}
