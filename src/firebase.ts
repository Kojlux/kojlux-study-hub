// Provide ImportMeta typing for Vite's import.meta.env to satisfy TypeScript
interface ImportMetaEnv {
  VITE_FIREBASE_API_KEY: string;
  VITE_FIREBASE_AUTH_DOMAIN: string;
  VITE_FIREBASE_PROJECT_ID: string;
  VITE_FIREBASE_STORAGE_BUCKET: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  VITE_FIREBASE_APP_ID: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { collection, addDoc } from "firebase/firestore";

// This securely pulls your secret keys from the hidden .env file above
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Connect your app to the Firebase cloud servers
const app = initializeApp(firebaseConfig);

// Export the features so your other website pages can use them
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Upload a base64/data URL string to Firebase Storage and return a public download URL
export async function uploadBase64File(dataUrl: string, destinationPath: string) {
  const storageRef = ref(storage, destinationPath);
  // uploadString understands data_url format
  await uploadString(storageRef, dataUrl, 'data_url');
  const url = await getDownloadURL(storageRef);
  return url;
}

// Create a video/document entry in Firestore 'videos' collection and return the new doc id
export async function createVideoPost(metadata: any) {
  const postsCol = collection(db, 'videos');
  const docRef = await addDoc(postsCol, metadata);
  return docRef.id;
}
