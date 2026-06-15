import "server-only";
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminDbInstance: any = null;

export function getAdminDb() {
  if (adminDbInstance) return adminDbInstance;

  if (getApps().length > 0) {
    const app = getApps()[0];
    adminDbInstance = getFirestore(app);
    return adminDbInstance;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  // ایجاد نگهدارنده دیتابیس لوکال درون حافظه (In-Memory Map) جهت جلوگیری از خطای ۴۰۴ در حالت آفلاین/توسعه
  const inMemoryDb = (global as any)._mockDb || new Map<string, any>();
  (global as any)._mockDb = inMemoryDb;

  const createMockDoc = (colName: string, docId: string) => {
    const key = `${colName}/${docId}`;
    return {
      get: async () => {
        const exists = inMemoryDb.has(key);
        const val = inMemoryDb.get(key) || null;
        console.log(`[inMemoryDb Admin CRUD] doc.get "${key}" - exists:`, exists);
        return {
          exists,
          id: docId,
          data: () => val,
        };
      },
      set: async (data: any) => {
        console.log(`[inMemoryDb Admin CRUD] doc.set "${key}" with:`, data);
        inMemoryDb.set(key, { ...data });
      },
      update: async (data: any) => {
        console.log(`[inMemoryDb Admin CRUD] doc.update "${key}" with:`, data);
        const current = inMemoryDb.get(key) || {};
        inMemoryDb.set(key, { ...current, ...data });
      },
      delete: async () => {
        console.log(`[inMemoryDb Admin CRUD] doc.delete "${key}"`);
        inMemoryDb.delete(key);
      },
    };
  };

  const createMockCollection = (colName: string) => {
    return {
      doc: (docId: string) => createMockDoc(colName, docId),
      add: async (data: any) => {
        const docId = `mock_id_${Math.random().toString(36).substring(2, 11)}`;
        const key = `${colName}/${docId}`;
        console.log(`[inMemoryDb Admin CRUD] collection.add "${colName}" - generated ID: "${docId}" with:`, data);
        inMemoryDb.set(key, { ...data, id: docId });
        return { id: docId };
      },
      get: async () => {
        const docs: any[] = [];
        inMemoryDb.forEach((value: any, key: string) => {
          if (key.startsWith(`${colName}/`)) {
            const docId = key.substring(colName.length + 1);
            docs.push({
              id: docId,
              exists: true,
              data: () => value,
            });
          }
        });
        console.log(`[inMemoryDb Admin CRUD] collection.get "${colName}" - matched docs count:`, docs.length);
        return { docs };
      },
      where: (field: string, op: string, val: any) => {
        return {
          get: async () => {
            const docs: any[] = [];
            inMemoryDb.forEach((value: any, key: string) => {
              if (key.startsWith(`${colName}/`)) {
                if (value && value[field] === val) {
                  const docId = key.substring(colName.length + 1);
                  docs.push({
                    id: docId,
                    exists: true,
                    data: () => value,
                  });
                }
              }
            });
            console.log(`[inMemoryDb Admin CRUD] collection.where "${colName}" (${field} == ${val}) - matched docs count:`, docs.length);
            return { docs };
          }
        };
      }
    };
  };

  const dummyCollection = (path: string) => createMockCollection(path);

  if (!serviceAccountJson) {
    console.warn(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
      'Using a functional in-memory mock admin Firestore client'
    );
    adminDbInstance = {
      collection: dummyCollection
    };
    return adminDbInstance;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const app = initializeApp({ credential: cert(serviceAccount) });
    adminDbInstance = getFirestore(app);
    return adminDbInstance;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin app:", error);
    adminDbInstance = {
      collection: dummyCollection
    };
    return adminDbInstance;
  }
}

export let adminDb: any;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || getApps().length > 0) {
    adminDb = getAdminDb();
  } else {
    // Lazy Proxy that initializes on first access or uses dummy
    adminDb = new Proxy({}, {
      get: (_, prop) => {
        const actualDb = getAdminDb();
        return Reflect.get(actualDb, prop);
      }
    });
  }
} catch {
  adminDb = new Proxy({}, {
    get: (_, prop) => {
      const actualDb = getAdminDb();
      return Reflect.get(actualDb, prop);
    }
  });
}
