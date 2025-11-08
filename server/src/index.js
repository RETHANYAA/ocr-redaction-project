import dotenv from 'dotenv';
import app from './server.js';
import { connectMongo } from './mongo.js';

dotenv.config();

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await connectMongo();
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

start();

