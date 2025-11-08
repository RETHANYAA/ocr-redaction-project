# PII Redaction Chat (MongoDB)

Minimal prototype: chat with text + image upload, OCR-based PII detection, redaction preview, and OpenAI integration (optional).

## Stack
- Frontend: Vite + React
- Backend: Node.js + Express
- OCR: Tesseract.js
- Image redaction: sharp
- DB: MongoDB (mongoose)

## Setup
1. Prereqs: Node 18+, MongoDB running locally.
2. Backend
   - `cd server`
   - Copy `env.example` to `.env` and set values:
     - `MONGO_URI=mongodb://127.0.0.1:27017/pii-chat`
     - Optionally set `OPENAI_API_KEY` and `OPENAI_MODEL`
   - `npm run dev` (or `npm start` for prod)
3. Frontend
   - In another terminal: `cd client && npm run dev`
   - Open the shown localhost URL.

## Features
- Text chat to OpenAI (falls back to mock if key missing)
- Image upload (≤5MB) → OCR → regex-based PII detection (emails, phones, names, addresses, dates, credit cards)
- Client shows original vs redacted images; confirm sends a system message
- Sessions stored in MongoDB; messages persisted

## API
- `POST /api/sessions` → create session
- `GET /api/sessions/:sessionId/messages` → list
- `POST /api/sessions/:sessionId/messages/text` { message }
- `POST /api/sessions/:sessionId/messages/image` form-data `image`
- `POST /api/sessions/:sessionId/messages/image/confirm` { redactedImage, detections }

## Notes
- This is a prototype; detection aims for 70–80% accuracy.
- No auth; do not upload sensitive real data.

