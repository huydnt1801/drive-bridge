import { firestore } from "@/lib/firebaseAdmin";
import type { DriveConnection } from "@/types/drive";

const collection = firestore.collection("driverBridgeConnections");

export const connectionRepository = {
  list: async () => {
    const snapshot = await collection.orderBy("createdAt", "asc").get();
    return snapshot.docs.map((document) => document.data() as DriveConnection);
  },
  get: async (id: string) => {
    const document = await collection.doc(id).get();
    return document.exists ? (document.data() as DriveConnection) : undefined;
  },
  add: async (connection: DriveConnection) => {
    await collection.doc(connection.id).create(connection);
  },
  replace: async (connection: DriveConnection) => {
    await collection.doc(connection.id).set(connection);
  },
  remove: async (id: string) => {
    await collection.doc(id).delete();
  },
};
