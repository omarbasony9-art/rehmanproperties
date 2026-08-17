import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, inquiriesTable, propertyPhotosTable } from "@workspace/db";
import { count, sql } from "drizzle-orm";
import { sendInquiryEmail } from "../lib/email";

const router: IRouter = Router();

// Simple in-memory rate limiter (per IP, 3 submissions per hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 3;

  const existing = rateLimitMap.get(ip);
  if (!existing || existing.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= maxRequests) {
    return false;
  }
  existing.count++;
  return true;
}

// Sanitize a string field
function sanitize(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val !== "string") return null;
  return val.trim().slice(0, 5000);
}

// POST /inquiries
router.post("/inquiries", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (!checkRateLimit(ip)) {
    res
      .status(429)
      .json({ error: "Too many submissions. Please try again later." });
    return;
  }

  const body = req.body ?? {};

  // Required field validation
  const address = sanitize(body.address);
  const city = sanitize(body.city);
  const state = sanitize(body.state);
  const zip = sanitize(body.zip);
  const fullName = sanitize(body.fullName);
  const email = sanitize(body.email);
  const phone = sanitize(body.phone);
  const preferredContact = sanitize(body.preferredContact);
  const contactConsent = body.contactConsent;

  if (!address || address.length < 3) {
    res.status(400).json({ error: "A valid property address is required." });
    return;
  }
  if (!city) {
    res.status(400).json({ error: "City is required." });
    return;
  }
  if (!state || state.length < 2) {
    res.status(400).json({ error: "State is required." });
    return;
  }
  if (!zip || zip.length < 5) {
    res.status(400).json({ error: "A valid ZIP code is required." });
    return;
  }
  if (!fullName || fullName.length < 2) {
    res.status(400).json({ error: "Full name is required." });
    return;
  }
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    res.status(400).json({ error: "A valid phone number is required." });
    return;
  }
  if (!["call", "text", "email"].includes(preferredContact ?? "")) {
    res.status(400).json({ error: "Preferred contact method is required." });
    return;
  }
  if (contactConsent !== true) {
    res.status(400).json({ error: "Contact consent is required." });
    return;
  }

  // Optional fields
  const validPropertyTypes = [
    "single_family",
    "multi_family",
    "condo",
    "townhouse",
    "land",
    "other",
  ];
  const propertyTypeRaw = sanitize(body.propertyType);
  const propertyType =
    propertyTypeRaw && validPropertyTypes.includes(propertyTypeRaw)
      ? propertyTypeRaw
      : null;

  const validConditions = [
    "excellent",
    "good",
    "needs_some_work",
    "needs_major_repairs",
  ];
  const conditionRaw = sanitize(body.propertyCondition);
  const propertyCondition =
    conditionRaw && validConditions.includes(conditionRaw) ? conditionRaw : null;

  const validTimelines = [
    "asap",
    "within_30_days",
    "one_to_three_months",
    "three_to_six_months",
    "just_exploring",
  ];
  const timelineRaw = sanitize(body.sellingTimeline);
  const sellingTimeline =
    timelineRaw && validTimelines.includes(timelineRaw) ? timelineRaw : null;

  // Photo keys validation (must be non-empty strings, max 15)
  const rawPhotoKeys: unknown[] = Array.isArray(body.photoKeys)
    ? body.photoKeys
    : [];
  const photoKeys = rawPhotoKeys
    .filter((k) => typeof k === "string" && k.length > 0)
    .slice(0, 15) as string[];

  // Generate inquiry number
  const [{ total }] = await db
    .select({ total: count() })
    .from(inquiriesTable);
  const seq = String(Number(total) + 1).padStart(5, "0");
  const year = new Date().getFullYear();
  const inquiryNumber = `REH-${year}-${seq}`;

  // Insert inquiry
  const [inquiry] = await db
    .insert(inquiriesTable)
    .values({
      inquiryNumber,
      status: "new",
      fullName: fullName!,
      email: email!,
      phone: phone!,
      preferredContact: preferredContact!,
      address: address!,
      city: city!,
      state: state!,
      zip: zip!,
      propertyType,
      bedrooms: sanitize(body.bedrooms),
      bathrooms: sanitize(body.bathrooms),
      squareFootage: sanitize(body.squareFootage),
      occupied: sanitize(body.occupied),
      propertyCondition,
      repairs: sanitize(body.repairs),
      sellingReason: sanitize(body.sellingReason),
      sellingTimeline,
      contactConsent: true,
      source: sanitize(body.source) ?? "website",
      utmSource: sanitize(body.utmSource),
      utmMedium: sanitize(body.utmMedium),
      utmCampaign: sanitize(body.utmCampaign),
    })
    .returning();

  // Insert photo records
  if (photoKeys.length > 0) {
    await db.insert(propertyPhotosTable).values(
      photoKeys.map((key) => ({
        inquiryId: inquiry.id,
        objectKey: key,
        originalFilename: key.split("/").pop() ?? key,
        mimeType: null,
      })),
    );
  }

  req.log.info(
    { inquiryNumber, photoCount: photoKeys.length },
    "New inquiry submitted",
  );

  // Send email notification (non-blocking)
  sendInquiryEmail(inquiry, photoKeys).catch((err: unknown) => {
    req.log.error({ err }, "Failed to send inquiry notification email");
  });

  const firstName = fullName!.split(" ")[0] ?? fullName;

  res.status(201).json({
    id: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    message:
      "Your inquiry has been received. We will contact you shortly.",
    firstName,
  });
});

// POST /inquiries/upload-url
router.post("/inquiries/upload-url", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const filename = sanitize(body.filename);
  const mimeType = sanitize(body.mimeType);

  if (!filename) {
    res.status(400).json({ error: "filename is required." });
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!mimeType || !allowedTypes.includes(mimeType)) {
    res
      .status(400)
      .json({ error: "Invalid file type. Allowed: JPEG, PNG, WEBP" });
    return;
  }

  // Extension from mime type
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const ext = extMap[mimeType] ?? "jpg";
  const objectKey = `photos/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;

  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

  if (
    R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_BUCKET_NAME
  ) {
    // Generate R2 pre-signed URL using S3-compatible API
    // Cloudflare R2 is S3-compatible; use AWS SDK or hand-craft the signature.
    // For now we return the object key and a placeholder URL.
    // TODO: Implement full AWS SigV4 pre-signed URL for R2.
    const uploadUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${objectKey}`;
    res.json({ uploadUrl, objectKey });
  } else {
    // Local dev mode — photos won't actually be stored, but the flow works
    req.log.warn(
      "R2 credentials not configured — returning dev placeholder upload URL",
    );
    res.json({ uploadUrl: `http://localhost/dev-upload/${objectKey}`, objectKey });
  }
});

export default router;
