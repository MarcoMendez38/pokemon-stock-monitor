const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !password) {
    throw new Error('Faltan SMTP_USER o SMTP_PASSWORD para enviar correo');
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass: password }
  });
  return transporter;
}

async function sendEmail({ subject, text }) {
  if (process.env.EMAIL_ENABLED !== 'true') return { sent: false, reason: 'disabled' };
  const recipient = process.env.MAIL_TO;
  if (!recipient) throw new Error('Falta MAIL_TO para enviar correo');
  return getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: recipient,
    subject,
    text
  });
}

module.exports = { sendEmail };
