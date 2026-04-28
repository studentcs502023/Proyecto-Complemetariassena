import nodemailer from 'nodemailer';
import { getConfig } from '../utils/configHelper.util.js';
import { env } from '../config/env.js';

let transporter = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  // Use environment variables for SMTP configuration
  // These should be defined in .env and exposed via env.js
  transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(env.EMAIL_PORT || '587'),
    secure: env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS
    }
  });

  return transporter;
};

/**
 * Send an email
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.body  - HTML string
 */
const send = async ({ to, subject, body }) => {
  try {
    const transport = await getTransporter();
    const senderEmail = await getConfig('NOTIFICATION_EMAIL') || env.EMAIL_USER;

    await transport.sendMail({
      from: `"REPFORA E.P. - SENA" <${senderEmail}>`,
      to,
      subject,
      html: body
    });
  } catch (error) {
    console.error('[EmailService] Error sending mail:', error.message);
    throw error; // Let the notification service handle the error logging
  }
};

export default { send };
