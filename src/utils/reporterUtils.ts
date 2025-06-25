import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface Reporter {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  createdAt: any;
  uid: string;
  isTrusted?: boolean;
  trustLevel?: number; // 0-100
  reportCount?: number;
  verifiedReports?: number;
  falseReports?: number;
  trustReason?: string;
}

// Trust level thresholds
export const TRUST_LEVELS = {
  NEW: 0,
  BASIC: 20,
  RELIABLE: 50,
  TRUSTED: 80,
  VERIFIED: 100
};

// Get trust level label based on numeric value
export const getTrustLevelLabel = (trustLevel: number = 0): string => {
  if (trustLevel >= TRUST_LEVELS.VERIFIED) return 'Verified';
  if (trustLevel >= TRUST_LEVELS.TRUSTED) return 'Trusted';
  if (trustLevel >= TRUST_LEVELS.RELIABLE) return 'Reliable';
  if (trustLevel >= TRUST_LEVELS.BASIC) return 'Basic';
  return 'New';
};

// Get trust level color based on numeric value
export const getTrustLevelColor = (trustLevel: number = 0): string => {
  if (trustLevel >= TRUST_LEVELS.VERIFIED) return '#8e24aa'; // Purple
  if (trustLevel >= TRUST_LEVELS.TRUSTED) return '#2e7d32'; // Green
  if (trustLevel >= TRUST_LEVELS.RELIABLE) return '#0288d1'; // Blue
  if (trustLevel >= TRUST_LEVELS.BASIC) return '#fb8c00'; // Orange
  return '#757575'; // Gray
};

// Fetch reporter data from Firestore
export const fetchReporterById = async (reporterId: string): Promise<Reporter | null> => {
  try {
    const reporterRef = doc(db, 'reporter', reporterId);
    const reporterSnap = await getDoc(reporterRef);
    
    if (reporterSnap.exists()) {
      return {
        id: reporterSnap.id,
        ...reporterSnap.data()
      } as Reporter;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching reporter data:', error);
    return null;
  }
};

// Calculate incident priority based on reporter's trust level and incident severity
export const calculateIncidentPriority = (
  trustLevel: number = 0, 
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
): number => {
  // Base priority value based on severity
  const severityValue = {
    'Low': 10,
    'Medium': 30,
    'High': 60,
    'Critical': 90
  }[severity];
  
  // Calculate trust bonus (up to 10 points for highest trust level)
  const trustBonus = Math.floor(trustLevel / 10);
  
  return Math.min(100, severityValue + trustBonus);
};

// New functions for automatic trust level updates

// Calculate trust level based on reporter metrics
export const calculateTrustLevel = (
  reportCount: number = 0,
  verifiedReports: number = 0,
  falseReports: number = 0,
  createdAt: any = null
): number => {
  // Time as contributor in days
  const now = new Date();
  const creationDate = createdAt?.toDate?.() || now;
  const daysAsContributor = Math.max(1, Math.floor((now.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  // Base score starts at 10 (new user)
  let trustScore = 10;
  
  // Add points for verified reports (more weight)
  trustScore += Math.min(50, verifiedReports * 5);
  
  // Add points for report accuracy rate
  if (reportCount > 0) {
    const accuracyRate = verifiedReports / reportCount;
    trustScore += Math.round(accuracyRate * 20);
  }
  
  // Add points for tenure (up to 10 points)
  trustScore += Math.min(10, Math.floor(daysAsContributor / 30));
  
  // Subtract points for false reports (heavy penalty)
  trustScore -= Math.min(trustScore - 5, falseReports * 10);
  
  // Ensure trust score is within 0-100 range
  return Math.max(0, Math.min(100, Math.round(trustScore)));
};

// Update reporter trust level when a report is verified
export const updateReporterTrustOnVerification = async (reporterEmail: string): Promise<boolean> => {
  if (!reporterEmail) return false;
  
  try {
    console.log('Searching for reporter with email:', reporterEmail);
    
    // Try to find reporter document in both "reporter" and "users" collections
    // First, check in the reporter collection
    const reportersRef = collection(db, 'reporter');
    const qReporter = query(reportersRef, where('email', '==', reporterEmail));
    let querySnapshot = await getDocs(qReporter);
    
    // If not found in reporter collection, check users collection
    if (querySnapshot.empty) {
      console.log('Reporter not found in reporter collection, checking users collection');
      const usersRef = collection(db, 'users');
      const qUsers = query(usersRef, where('email', '==', reporterEmail));
      querySnapshot = await getDocs(qUsers);
      
      // If still not found, try with reporterEmail field
      if (querySnapshot.empty) {
        console.log('Checking with reporterEmail field');
        const qReporterEmail = query(usersRef, where('reporterEmail', '==', reporterEmail));
        querySnapshot = await getDocs(qReporterEmail);
      }
    }
    
    if (querySnapshot.empty) {
      console.log('No reporter found with email:', reporterEmail);
      
      // Create a new reporter document if one doesn't exist
      console.log('Creating new reporter record');
      const newReporterRef = doc(collection(db, 'reporter'));
      await updateDoc(newReporterRef, {
        email: reporterEmail,
        reportCount: 1,
        verifiedReports: 1,
        falseReports: 0,
        trustLevel: 15, // Start with a basic trust level for one verified report
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return true;
    }
    
    const reporterDoc = querySnapshot.docs[0];
    const reporterData = reporterDoc.data();
    
    console.log('Found reporter document:', reporterDoc.id, 'in collection:', reporterDoc.ref.parent.id);
    console.log('Current reporter data:', reporterData);
    
    // Update verified count
    const verifiedReports = (reporterData.verifiedReports || 0) + 1;
    const reportCount = (reporterData.reportCount || 0) + (reporterData.reportCount === undefined ? 1 : 0);
    const falseReports = (reporterData.falseReports || 0);
    
    // Calculate new trust level
    const newTrustLevel = calculateTrustLevel(
      reportCount,
      verifiedReports,
      falseReports,
      reporterData.createdAt || new Date()
    );

    // Add 10 trust level points for every completed incident
    const trustLevelWithBonus = (newTrustLevel || 0) + 10;

    // Update reporter document
    await updateDoc(reporterDoc.ref, {
      verifiedReports,
      reportCount,
      trustLevel: trustLevelWithBonus,
      updatedAt: new Date()
    });
    
    console.log('Successfully updated reporter trust level to:', trustLevelWithBonus);
    return true;
  } catch (error) {
    console.error('Error updating reporter trust on verification:', error);
    return false;
  }
};

// Update reporter trust level when a report is flagged as false
export const updateReporterTrustOnFalseReport = async (reporterEmail: string): Promise<boolean> => {
  if (!reporterEmail) return false;
  
  try {
    console.log('Searching for reporter with email:', reporterEmail);
    
    // Try to find reporter document in both "reporter" and "users" collections
    // First, check in the reporter collection
    const reportersRef = collection(db, 'reporter');
    const qReporter = query(reportersRef, where('email', '==', reporterEmail));
    let querySnapshot = await getDocs(qReporter);
    
    // If not found in reporter collection, check users collection
    if (querySnapshot.empty) {
      console.log('Reporter not found in reporter collection, checking users collection');
      const usersRef = collection(db, 'users');
      const qUsers = query(usersRef, where('email', '==', reporterEmail));
      querySnapshot = await getDocs(qUsers);
      
      // If still not found, try with reporterEmail field
      if (querySnapshot.empty) {
        console.log('Checking with reporterEmail field');
        const qReporterEmail = query(usersRef, where('reporterEmail', '==', reporterEmail));
        querySnapshot = await getDocs(qReporterEmail);
      }
    }
    
    if (querySnapshot.empty) {
      console.log('No reporter found with email:', reporterEmail);
      
      // Create a new reporter document with reduced trust for false report
      console.log('Creating new reporter record with negative trust for false report');
      const newReporterRef = doc(collection(db, 'reporter'));
      await updateDoc(newReporterRef, {
        email: reporterEmail,
        reportCount: 1,
        verifiedReports: 0,
        falseReports: 1,
        trustLevel: 5, // Start with a low trust level for false report
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return true;
    }
    
    const reporterDoc = querySnapshot.docs[0];
    const reporterData = reporterDoc.data();
    
    console.log('Found reporter document:', reporterDoc.id, 'in collection:', reporterDoc.ref.parent.id);
    console.log('Current reporter data:', reporterData);
    
    // Update false reports count
    const falseReports = (reporterData.falseReports || 0) + 1;
    const reportCount = (reporterData.reportCount || 0) + (reporterData.reportCount === undefined ? 1 : 0);
    const verifiedReports = (reporterData.verifiedReports || 0);
    
    // Calculate new trust level (will be lower due to false report)
    const newTrustLevel = calculateTrustLevel(
      reportCount,
      verifiedReports,
      falseReports,
      reporterData.createdAt || new Date()
    );
    
    // Update reporter document
    await updateDoc(reporterDoc.ref, {
      falseReports,
      reportCount,
      trustLevel: newTrustLevel,
      updatedAt: new Date()
    });
    
    console.log('Successfully updated reporter trust level to:', newTrustLevel);
    return true;
  } catch (error) {
    console.error('Error updating reporter trust on false report:', error);
    return false;
  }
};

// Update a reporter's trust level manually (for admin use)
export const updateReporterTrustManually = async (
  reporterId: string, 
  trustLevel: number,
  trustReason: string = 'Manual adjustment'
): Promise<boolean> => {
  try {
    await updateDoc(doc(db, 'reporter', reporterId), {
      trustLevel,
      trustReason,
      updatedAt: new Date()
    });
    return true;
  } catch (error) {
    console.error('Error manually updating reporter trust:', error);
    return false;
  }
}; 