import { readFile } from "node:fs/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

const app = initializeApp({
  credential: cert({
    projectId: required("FIREBASE_PROJECT_ID"),
    clientEmail: required("FIREBASE_CLIENT_EMAIL"),
    privateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(app);
const file = process.env.DRIVER_BRIDGE_DATA_FILE || "./data/connections.json";
const store = JSON.parse(await readFile(file, "utf8"));

if (store.version !== 1 || !Array.isArray(store.connections)) {
  throw new Error("Unsupported connection data format");
}

const batch = db.batch();
for (const connection of store.connections) {
  batch.set(db.collection("driverBridgeConnections").doc(connection.id), connection);
}
await batch.commit();
console.log(`Migrated ${store.connections.length} connection(s) to driverBridgeConnections.`);
