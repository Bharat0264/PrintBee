import { Db, MongoClient } from "mongodb";

declare global {
  // Reuse the client across development reloads and warm serverless invocations.
  var printBeeMongoClient: MongoClient | undefined;
}

function required(name: "MONGODB_URI" | "MONGODB_DB") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function mongoDb(): Db {
  const client = global.printBeeMongoClient ?? new MongoClient(required("MONGODB_URI"));
  global.printBeeMongoClient = client;
  return client.db(required("MONGODB_DB"));
}
