import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

export async function debugChatPermissions(reportId: string) {
  const auth = getAuth();
  const db = getFirestore();

  const user = auth.currentUser;
  if (!user) {
    console.log("No authenticated user.");
    return;
  }
  console.log("Current Auth User:", {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
  });

  // Get user document
  const userDocRef = doc(db, "users", user.uid);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists()) {
    console.log("User Document:", userDocSnap.data());
  } else {
    console.log("No such user document!");
  }

  // Get report document
  const reportDocRef = doc(db, "reports", reportId);
  const reportDocSnap = await getDoc(reportDocRef);
  if (reportDocSnap.exists()) {
    console.log("Report Document:", reportDocSnap.data());
  } else {
    console.log("No such report document!");
  }
} 