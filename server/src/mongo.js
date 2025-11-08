import mongoose from 'mongoose';

let connectionPromise = null;

async function tryConnect(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

export async function connectMongo() {
  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI in environment');

  const maxAttempts = Number(process.env.MONGO_RETRIES || 10);
  const baseDelayMs = Number(process.env.MONGO_RETRY_MS || 1000);

  connectionPromise = (async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await tryConnect(uri);
        console.log('Connected to MongoDB');
        return mongoose.connection;
      } catch (err) {
        const delay = Math.min(baseDelayMs * attempt, 10000);
        console.warn(
          `MongoDB connection failed (attempt ${attempt}/${maxAttempts}): ${err.message}. Retrying in ${delay}ms...`
        );
        if (attempt === maxAttempts) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  })();

  return connectionPromise;
}

export default mongoose;

