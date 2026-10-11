import nodemailer from "nodemailer";
import { logger } from "./logger";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM;
  if (!transporter || !from) {
    logger.info({ recipientDomain: to.split("@")[1] ?? "unknown", subject }, "Email queued in stub mode; configure SMTP_HOST and SMTP_FROM to send");
    return;
  }
  await transporter.sendMail({ from, to, subject, text });
}

export function sendWelcomeEmail(to: string, name: string): Promise<void> {
  return sendEmail(to, "Welcome to Nexora", `Hi ${name}, your Nexora account is ready. Choose a subject and start your first hunt.`);
}

export function sendAssignmentNotification(to: string, title: string, dueAt: Date): Promise<void> {
  return sendEmail(to, "New Nexora assignment", `${title} is due ${dueAt.toLocaleDateString()}. Open Nexora to view the assignment.`);
}
