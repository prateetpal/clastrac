import dns from "node:dns";
import mongoose from "mongoose";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.mongooseCache ?? {
  connection: null,
  promise: null
};

global.mongooseCache = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri).catch((error: unknown) => {
      cache.promise = null;
      cache.connection = null;
      throw error;
    });
  }

  const connectionPromise = cache.promise;
  const connection = await connectionPromise;
  cache.connection = connection;
  if (cache.promise === connectionPromise) cache.promise = null;
  return connection;
}
