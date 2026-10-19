
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(
  __dirname,
  "../firebase-service-account.json"
);

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccountPath),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });

const adminAuth = getAuth(app);

export { adminAuth };
export default { auth: () => adminAuth };