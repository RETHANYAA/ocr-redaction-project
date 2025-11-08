import { v4 as uuidv4 } from 'uuid';

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s-]?)?(?:\(\+?\d{1,3}\)[\s-]?)?\d[\d\s\-()]{6,}\d/;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/;
const DATE_REGEX = /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4})\b/i;
const ADDRESS_HINTS = /(Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Block|District|State)/i;
const LONG_ALNUM = /\b[A-Z0-9][A-Z0-9\-]{7,}\b/i;
const MEMBERSHIP_ID_REGEX = /\b\d{4,}\b/; // For membership numbers like "6945"

function normalizeBBoxFromWord(word) {
  const b = word.bbox || word.boundingBox || {};
  // Tesseract.js uses x0, y0, x1, y1 format
  let x0 = Number.isFinite(b.x0) ? b.x0 : (Number.isFinite(b.x) ? b.x : undefined);
  let y0 = Number.isFinite(b.y0) ? b.y0 : (Number.isFinite(b.y) ? b.y : undefined);
  let x1 = Number.isFinite(b.x1) ? b.x1 : (Number.isFinite(b.x) && Number.isFinite(b.w) ? b.x + b.w : undefined);
  let y1 = Number.isFinite(b.y1) ? b.y1 : (Number.isFinite(b.y) && Number.isFinite(b.h) ? b.y + b.h : undefined);

  // Fallback: if we still don't have valid coordinates, try to use default values
  // but log a warning
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
    console.warn('Invalid bbox for word:', word.text, 'bbox:', b);
    // Use minimal valid bbox
    x0 = Number.isFinite(x0) ? x0 : 0;
    y0 = Number.isFinite(y0) ? y0 : 0;
    x1 = Number.isFinite(x1) ? x1 : (x0 + (Number.isFinite(b.w) ? b.w : 100));
    y1 = Number.isFinite(y1) ? y1 : (y0 + (Number.isFinite(b.h) ? b.h : 20));
  }

  return { x0, y0, x1, y1 };
}

function makeDetection(type, words, textOverride) {
  const boxes = words.map((w) => normalizeBBoxFromWord(w));
  const left = Math.min(...boxes.map((b) => b.x0));
  const top = Math.min(...boxes.map((b) => b.y0));
  const right = Math.max(...boxes.map((b) => b.x1));
  const bottom = Math.max(...boxes.map((b) => b.y1));
  const text = textOverride || words.map((w) => (w.text ?? '')).join(' ').trim();
  const confidences = words.map((w) => (Number.isFinite(w.confidence) ? Number(w.confidence) : 85));
  const confidence = confidences.reduce((a, b) => a + b, 0) / Math.max(1, confidences.length);
  return {
    id: uuidv4(),
    type,
    text,
    confidence,
    bbox: {
      left: left < 0 ? 0 : left,
      top: top < 0 ? 0 : top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    },
  };
}

export function detectPII(ocrData = {}) {
  const detections = [];
  const words = (ocrData.words || []).filter((w) => w && String(w.text || '').trim().length > 0);

  // Single-word checks
  for (const w of words) {
    const text = String(w.text || '').trim();
    if (!text) continue;
    if (EMAIL_REGEX.test(text)) {
      detections.push(makeDetection('email', [w], text));
      continue;
    }
    const digitsOnly = text.replace(/[^\d]/g, '');
    if (digitsOnly.length >= 13 && CREDIT_CARD_REGEX.test(text)) {
      detections.push(makeDetection('credit_card', [w], text));
      continue;
    }
    // Check for membership/ID numbers (4+ digits)
    if (MEMBERSHIP_ID_REGEX.test(text) && digitsOnly.length >= 4 && digitsOnly.length <= 10) {
      detections.push(makeDetection('id', [w], text));
      continue;
    }
  }

  // Sliding window checks
  for (let i = 0; i < words.length; i += 1) {
    for (let span = 1; span <= 6 && i + span <= words.length; span += 1) {
      const slice = words.slice(i, i + span);
      const text = slice.map((s) => s.text).join(' ').trim();
      const normalizedNums = text.replace(/[^0-9+]/g, '');
      if (span <= 4 && normalizedNums.length >= 8 && PHONE_REGEX.test(text)) {
        detections.push(makeDetection('phone', slice, text));
        break;
      }
      if (span <= 5 && DATE_REGEX.test(text)) {
        detections.push(makeDetection('date', slice, text));
        break;
      }
      if (span >= 2 && ADDRESS_HINTS.test(text)) {
        detections.push(makeDetection('address', slice, text));
        break;
      }
      if (span >= 2 && span <= 4) {
        const wordTexts = slice.map((w) => String(w.text || '').trim());
        // Check for capitalized words (first letter uppercase, rest lowercase or mixed)
        const capitalizedWords = wordTexts.every((t) => /^[A-Z][a-zA-Z'.-]*$/.test(t) && t.length >= 2);
        // Check for all caps words (common in certificates)
        const allCapsWords = wordTexts.every((t) => /^[A-Z][A-Z'.-]*$/.test(t) && t.length >= 2);
        // Check for mixed case but still looks like a name (e.g., "Daniel", "Peixoto")
        // Allow any case as long as it starts with a letter and has no digits
        const nameLikeWords = wordTexts.every((t) => /^[A-Za-z][A-Za-z'.-]*$/.test(t) && t.length >= 2 && !/\d/.test(t));
        if (capitalizedWords || allCapsWords || (nameLikeWords && wordTexts.length >= 2)) {
          detections.push(makeDetection('name', slice, text));
          break;
        }
      }
      if (span <= 3 && LONG_ALNUM.test(text)) {
        detections.push(makeDetection('id', slice, text));
        break;
      }
      // Check for date ranges (e.g., "Mar 15th 2015 to Nov 10th 2016")
      if (span >= 5 && /to|through|until/i.test(text) && DATE_REGEX.test(text)) {
        detections.push(makeDetection('date', slice, text));
        break;
      }
    }
  }

  // Line-level fallback
  const lines = (ocrData.lines || []).filter((l) => l && String(l.text || '').trim().length > 0);
  for (const line of lines) {
    const text = String(line.text || '').trim();
    const tests = [
      { type: 'email', regex: EMAIL_REGEX },
      { type: 'credit_card', regex: CREDIT_CARD_REGEX },
      { type: 'date', regex: DATE_REGEX },
      { type: 'phone', regex: PHONE_REGEX },
      { type: 'address', regex: ADDRESS_HINTS },
      { type: 'id', regex: LONG_ALNUM },
      { type: 'id', regex: MEMBERSHIP_ID_REGEX },
    ];
    const matched = tests.find((t) => t.regex.test(text));
    // Name-like line heuristic (e.g., ALL CAPS names on certificates, or mixed case)
    const tokens = text.split(/\s+/).filter(Boolean);
    const isNameLike = tokens.length >= 2 && tokens.length <= 5 &&
      tokens.every((t) => /^[A-Z][A-Za-z'.-]*$/.test(t) && t.length >= 2 && !/\d/.test(t));
    if (matched) {
      const pseudoWord = {
        text,
        bbox: line.bbox || line.boundingBox || { x: line.x ?? 0, y: line.y ?? 0, w: line.w ?? line.width ?? 1, h: line.h ?? line.height ?? 1 },
        confidence: Number.isFinite(line.confidence) ? line.confidence : 85,
      };
      detections.push(makeDetection(matched.type, [pseudoWord], text));
    } else if (isNameLike) {
      const pseudoWord = {
        text,
        bbox: line.bbox || line.boundingBox || { x: line.x ?? 0, y: line.y ?? 0, w: line.w ?? line.width ?? 1, h: line.h ?? line.height ?? 1 },
        confidence: 88,
      };
      detections.push(makeDetection('name', [pseudoWord], text));
    }
  }

  // Dedupe overlap per type
  const unique = [];
  for (const d of detections) {
    const dupIndex = unique.findIndex((u) => {
      if (u.type !== d.type) return false;
      const overlapX = Math.max(0, Math.min(u.bbox.left + u.bbox.width, d.bbox.left + d.bbox.width) - Math.max(u.bbox.left, d.bbox.left));
      const overlapY = Math.max(0, Math.min(u.bbox.top + u.bbox.height, d.bbox.top + d.bbox.height) - Math.max(u.bbox.top, d.bbox.top));
      const overlapArea = overlapX * overlapY;
      const area = u.bbox.width * u.bbox.height;
      if (area === 0) return false;
      return overlapArea / area > 0.6;
    });
    if (dupIndex === -1) {
      unique.push(d);
    } else if (d.confidence > unique[dupIndex].confidence) {
      unique[dupIndex] = d;
    }
  }

  return unique;
}
