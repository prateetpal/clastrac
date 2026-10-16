const dns = require("node:dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();

const { MongoClient } = require("mongodb");

async function checkMongoDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("MONGODB_URI is missing from .env");
    process.exitCode = 1;
    return;
  }

  try {
    const records = await new Promise((resolve, reject) => {
      dns.resolveSrv(
        "_mongodb._tcp.cluster0.mb8hjpi.mongodb.net",
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    console.log(`SRV DNS resolved: ${records.length} records`);

    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      console.log("MongoDB Atlas connected successfully!");
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error("MongoDB check failed:", error.message);
    process.exitCode = 1;
  }
}

checkMongoDB();