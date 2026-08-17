import { logger } from "./logger";
import type { Inquiry } from "@workspace/db";

export async function sendInquiryEmail(
  inquiry: Inquiry,
  photoKeys: string[],
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.INQUIRY_NOTIFICATION_EMAIL;

  if (!apiKey || !toEmail) {
    logger.warn(
      "Email notification skipped: RESEND_API_KEY or INQUIRY_NOTIFICATION_EMAIL not configured",
    );
    return;
  }

  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

  const photoSection =
    photoKeys.length > 0
      ? `\n\nPHOTOS (${photoKeys.length} submitted)\n${photoKeys
          .map((key, i) => `  ${i + 1}. ${R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key}`)
          .join("\n")}`
      : "\n\nPHOTOS\n  None submitted";

  const emailBody = `
NEW PROPERTY INQUIRY — Rehman INC
Inquiry #: ${inquiry.inquiryNumber}
Submitted: ${inquiry.createdAt.toLocaleString("en-US", { timeZone: "America/New_York" })}

═══════════════════════════════════
PROPERTY
═══════════════════════════════════
Address:       ${inquiry.address}
City:          ${inquiry.city}
State:         ${inquiry.state}
ZIP:           ${inquiry.zip}
Property Type: ${inquiry.propertyType ?? "Not specified"}
Bedrooms:      ${inquiry.bedrooms ?? "Not specified"}
Bathrooms:     ${inquiry.bathrooms ?? "Not specified"}
Sq. Footage:   ${inquiry.squareFootage ?? "Not specified"}
Occupied:      ${inquiry.occupied ?? "Not specified"}
Condition:     ${inquiry.propertyCondition ?? "Not specified"}
Repairs:       ${inquiry.repairs ?? "None specified"}

═══════════════════════════════════
SELLER
═══════════════════════════════════
Name:               ${inquiry.fullName}
Email:              ${inquiry.email}
Phone:              ${inquiry.phone}
Preferred Contact:  ${inquiry.preferredContact ?? "Not specified"}

═══════════════════════════════════
SELLING INFORMATION
═══════════════════════════════════
Why Selling: ${inquiry.sellingReason ?? "Not specified"}
Timeline:    ${inquiry.sellingTimeline ?? "Not specified"}

═══════════════════════════════════
INQUIRY INFO
═══════════════════════════════════
Inquiry Number:  ${inquiry.inquiryNumber}
Source:          ${inquiry.source ?? "Website (direct)"}
UTM Source:      ${inquiry.utmSource ?? "—"}
UTM Medium:      ${inquiry.utmMedium ?? "—"}
UTM Campaign:    ${inquiry.utmCampaign ?? "—"}
${photoSection}
`.trim();

  const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a2e1a;color:#fff;padding:24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:2px">REHMAN INC</h1>
    <p style="margin:8px 0 0;opacity:0.8;font-size:14px">New Property Inquiry — ${inquiry.inquiryNumber}</p>
  </div>
  <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0">
    <h2 style="color:#1a2e1a;font-size:16px;margin:0 0 16px">Property</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#666;width:140px">Address</td><td><strong>${inquiry.address}, ${inquiry.city}, ${inquiry.state} ${inquiry.zip}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666">Type</td><td>${inquiry.propertyType ?? "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Bedrooms</td><td>${inquiry.bedrooms ?? "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Bathrooms</td><td>${inquiry.bathrooms ?? "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Sq. Footage</td><td>${inquiry.squareFootage ?? "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Occupied</td><td>${inquiry.occupied ?? "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Condition</td><td>${inquiry.propertyCondition ?? "—"}</td></tr>
      ${inquiry.repairs ? `<tr><td style="padding:6px 0;color:#666">Repairs</td><td>${inquiry.repairs}</td></tr>` : ""}
    </table>
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0">
    <h2 style="color:#1a2e1a;font-size:16px;margin:0 0 16px">Seller</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#666;width:140px">Name</td><td><strong>${inquiry.fullName}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666">Email</td><td><a href="mailto:${inquiry.email}" style="color:#1a7a1a">${inquiry.email}</a></td></tr>
      <tr><td style="padding:6px 0;color:#666">Phone</td><td><a href="tel:${inquiry.phone}" style="color:#1a7a1a">${inquiry.phone}</a></td></tr>
      <tr><td style="padding:6px 0;color:#666">Preferred</td><td>${inquiry.preferredContact ?? "—"}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0">
    <h2 style="color:#1a2e1a;font-size:16px;margin:0 0 16px">Selling Information</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#666;width:140px">Why Selling</td><td>${inquiry.sellingReason ?? "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Timeline</td><td>${inquiry.sellingTimeline ?? "—"}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0">
    <h2 style="color:#1a2e1a;font-size:16px;margin:0 0 16px">Photos</h2>
    ${
      photoKeys.length > 0
        ? `<p style="font-size:14px">${photoKeys.length} photo(s) submitted:</p><ul style="font-size:13px;color:#666">
        ${photoKeys.map((key) => `<li><a href="${R2_PUBLIC_URL}/${key}" style="color:#1a7a1a">${key}</a></li>`).join("")}
      </ul>`
        : `<p style="font-size:14px;color:#666">No photos submitted.</p>`
    }
    <div style="background:#1a2e1a;color:#fff;padding:12px 16px;border-radius:6px;margin-top:16px;font-size:13px">
      Inquiry #: ${inquiry.inquiryNumber} &nbsp;|&nbsp; Source: ${inquiry.source ?? "Website"} &nbsp;|&nbsp; ${inquiry.createdAt.toLocaleString("en-US")}
    </div>
  </div>
</div>
`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Rehman INC Inquiries <noreply@rehmaninc.com>",
      to: [toEmail],
      subject: `NEW PROPERTY INQUIRY — ${inquiry.address}, ${inquiry.city}, ${inquiry.state} — Rehman INC`,
      text: emailBody,
      html: htmlBody,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API error ${response.status}: ${text}`);
  }

  logger.info(
    { inquiryNumber: inquiry.inquiryNumber },
    "Inquiry notification email sent",
  );
}
