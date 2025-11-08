import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { detectPII } from './piiDetector.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

async function createRedactedBuffer(sourceBuffer, detections) {
  if (!detections || detections.length === 0) {
    return sharp(sourceBuffer).png().toBuffer();
  }

  const meta = await sharp(sourceBuffer).metadata();
  const imgW = meta.width || 1;
  const imgH = meta.height || 1;

  const composites = detections.map((det) => {
    const left = clamp(Math.round(det.bbox.left), 0, imgW - 1);
    const top = clamp(Math.round(det.bbox.top), 0, imgH - 1);
    const width = clamp(Math.round(det.bbox.width), 1, imgW - left);
    const height = clamp(Math.round(det.bbox.height), 1, imgH - top);
    return {
      input: { create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } },
      left,
      top,
    };
  });

  return sharp(sourceBuffer).composite(composites).png().toBuffer();
}

export async function processImageForPII(file) {
  const { buffer, mimetype } = file;

  // Preprocess: rotate (EXIF), upscale to ~2000px width, grayscale, normalise/normalize, sharpen
  const origMeta = await sharp(buffer).metadata();
  console.log(`Uploaded image size: ${origMeta.width}x${origMeta.height}`);
  const preprocessed = await sharp(buffer)
    .rotate()
    .resize({ width: 2000, withoutEnlargement: false })
    .grayscale()
    .normalise()
    .sharpen()
    .toFormat('png')
    .toBuffer();
  const procMeta = await sharp(preprocessed).metadata();
  const scaleX = (origMeta.width || procMeta.width || 1) / (procMeta.width || 1);
  const scaleY = (origMeta.height || procMeta.height || 1) / (procMeta.height || 1);
  console.log(`Preprocessed image size: ${procMeta.width}x${procMeta.height}, scale factors: ${scaleX.toFixed(3)}x, ${scaleY.toFixed(3)}y`);

  // Tesseract.js v5: Use createWorker with language parameter
  // Note: In Node.js multi-threaded environment, functions cannot be passed to workers
  // Logger functions must be removed from worker configuration
  const worker = await createWorker('eng');

  try {
    console.log('Starting OCR recognition...');
    // In v5, recognize() doesn't accept logger function in Node.js environment
    // Progress logging is handled internally by the worker
    const result = await worker.recognize(preprocessed);

    // Tesseract.js v5 returns data in result.data structure
    const data = result?.data || {};

    // Ensure we have the expected structure - Tesseract.js provides words, lines, paragraphs, etc.
    if (!data.words || data.words.length === 0) {
      console.warn('No words detected by OCR. OCR text:', data.text?.substring(0, 200));
      // If no words but we have text, try to create a fallback structure
      if (data.text && data.text.trim().length > 0) {
        console.warn('OCR returned text but no word-level data. This may indicate a Tesseract.js version mismatch.');
      }
    }

    // Debug: Log OCR results to understand the data structure
    console.log('OCR Words count:', data.words?.length || 0);
    console.log('OCR Lines count:', data.lines?.length || 0);
    console.log('OCR Text length:', data.text?.length || 0);
    if (data.words && data.words.length > 0) {
      console.log('Sample word structure:', JSON.stringify({
        text: data.words[0].text,
        bbox: data.words[0].bbox,
        confidence: data.words[0].confidence
      }, null, 2));
    }

    // Detect on processed OCR data then scale boxes back to original image size
    const rawDetections = detectPII(data);
    console.log('Raw detections count:', rawDetections.length);
    if (rawDetections.length > 0) {
      console.log('Sample detection:', JSON.stringify(rawDetections[0], null, 2));
    }
    const detections = rawDetections.map((d) => ({
      ...d,
      bbox: {
        left: d.bbox.left * scaleX,
        top: d.bbox.top * scaleY,
        width: d.bbox.width * scaleX,
        height: d.bbox.height * scaleY,
      },
    }));

    const redactedBuffer = await createRedactedBuffer(buffer, detections);
    return {
      extractedText: String(data.text || '').trim(),
      detections,
      previewImage: `data:${mimetype};base64,${buffer.toString('base64')}`,
      redactedImage: `data:image/png;base64,${redactedBuffer.toString('base64')}`,
    };
  } finally {
    // Always terminate the worker in v5
    await worker.terminate();
  }
}
