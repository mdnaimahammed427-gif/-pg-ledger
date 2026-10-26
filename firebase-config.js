// Firebase Console > Project settings > Your apps > Web app config
// Never put service-account private keys here.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// অ্যাডমিন User ID (Firebase Console-এ প্রথমে এই নামে user তৈরি করুন)
export const ADMIN_USER_ID = "naim";
export const LOGIN_DOMAIN = "pgledger.app"; // ইমেইল = userid@pgledger.app
