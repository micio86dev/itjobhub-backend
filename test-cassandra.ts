import { Client } from "cassandra-driver";

const client = new Client({
  contactPoints: ["127.0.0.1"],
  localDataCenter: "datacenter1",
  keyspace: "itjobhub",
});

async function test() {
  try {
    await client.connect();
    console.log("✅ Cassandra connected");

    // prova a leggere utenti
    const result = await client.execute("SELECT * FROM users LIMIT 1");
    console.log("Users:", result.rows);
  } catch (err) {
    console.error("❌ Cassandra connection failed", err);
  } finally {
    await client.shutdown();
  }
}

test();
