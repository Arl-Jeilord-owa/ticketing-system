// mailer.js — Nodemailer configured for cPanel SMTP
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',  // true = SSL/TLS on port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    // Some cPanel hosts have self-signed certs — set to false only in dev
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
});

// Verify SMTP connection on startup (dev only)
if (process.env.NODE_ENV !== 'production') {
  transporter.verify()
    .then(() => console.log('[Mail] SMTP connection OK'))
    .catch(err => console.warn('[Mail] SMTP warning:', err.message));
}

/**
 * Generic send helper.
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 */
async function sendMail(to, subject, html) {
  return transporter.sendMail({
    from: process.env.SMTP_FROM || '"OMTPI HelpDesk" <noreply@omtpi.com.ph>',
    to,
    subject,
    html,
  });
}

/**
 * OTP email — used as fallback if SMS gateway is unavailable.
 * For PH/JP numbers, prefer an SMS gateway (Semaphore, Twilio, Vonage).
 */
async function sendOTPEmail(to, otp) {
  return sendMail(to, 'Your OMTPI HelpDesk OTP Code', `
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;padding:32px;color:#1a1a18;">
      <h2 style="margin-bottom:8px;">OMTPI HelpDesk</h2>
      <p>Your one-time password is:</p>
      <div style="font-size:36px;font-weight:600;letter-spacing:10px;
                  background:#f0f0ee;padding:20px 24px;border-radius:8px;
                  display:inline-block;margin:12px 0;">${otp}</div>
      <p style="color:#666;">This code expires in <strong>5 minutes</strong>.<br>
         Do not share it with anyone.</p>
      <hr style="border:none;border-top:1px solid #e0e0dd;margin:20px 0;">
      <p style="font-size:12px;color:#999;">OMTPI Support Team &mdash; omtpi.com.ph</p>
    </body></html>
  `);
}

/**
 * Ticket creation confirmation sent to the customer.
 */
async function sendTicketConfirmation(to, ticketNo, subject) {
  return sendMail(to, `[${ticketNo}] Support ticket received — OMTPI`, `
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;padding:32px;color:#1a1a18;">
      <h2 style="margin-bottom:4px;">OMTPI HelpDesk</h2>
      <p style="color:#666;margin-top:0;">Support ticket confirmation</p>
      <p>Hi,</p>
      <p>We've received your support request. Here are the details:</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px;margin:16px 0;">
        <tr>
          <td style="padding:8px 12px;background:#f5f5f3;border-radius:4px 0 0 0;font-weight:500;width:120px;">Ticket ID</td>
          <td style="padding:8px 12px;background:#f5f5f3;font-family:monospace;">${ticketNo}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:500;">Subject</td>
          <td style="padding:8px 12px;">${subject}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f5f5f3;font-weight:500;">Status</td>
          <td style="padding:8px 12px;background:#f5f5f3;">Open</td>
        </tr>
      </table>
      <p>Our team will review your ticket and follow up shortly.</p>
      <hr style="border:none;border-top:1px solid #e0e0dd;margin:20px 0;">
      <p style="font-size:12px;color:#999;">OMTPI Support Team &mdash; <a href="https://omtpi.com.ph" style="color:#378ADD;">omtpi.com.ph</a></p>
    </body></html>
  `);
}

/**
 * Notify an assigned agent that a new ticket was created.
 */
async function sendAgentNotification(agentEmail, ticketNo, subject, requester) {
  return sendMail(agentEmail, `[New Ticket] ${ticketNo} — ${subject}`, `
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;padding:32px;color:#1a1a18;">
      <h2>New ticket assigned</h2>
      <p>A new support ticket has been submitted and needs your attention.</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px;margin:16px 0;">
        <tr><td style="padding:8px 12px;background:#f5f5f3;font-weight:500;width:120px;">Ticket</td><td style="padding:8px 12px;background:#f5f5f3;font-family:monospace;">${ticketNo}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:500;">Subject</td><td style="padding:8px 12px;">${subject}</td></tr>
        <tr><td style="padding:8px 12px;background:#f5f5f3;font-weight:500;">Requester</td><td style="padding:8px 12px;background:#f5f5f3;">${requester}</td></tr>
      </table>
      <p><a href="${process.env.APP_URL}" style="background:#378ADD;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">View in HelpDesk</a></p>
      <hr style="border:none;border-top:1px solid #e0e0dd;margin:20px 0;">
      <p style="font-size:12px;color:#999;">OMTPI HelpDesk</p>
    </body></html>
  `);
}

module.exports = { sendMail, sendOTPEmail, sendTicketConfirmation, sendAgentNotification };
