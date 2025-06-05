import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export enum AuditEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SESSION_TIMEOUT = 'SESSION_TIMEOUT',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS'
}

interface AuditLogEntry {
  eventType: AuditEventType;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  timestamp: any;
}

export const logAuditEvent = async (entry: Omit<AuditLogEntry, 'timestamp'>) => {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      ...entry,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
};

export const getClientInfo = () => {
  return {
    userAgent: navigator.userAgent,
    ipAddress: '127.0.0.1' // In production, this should be obtained from the server
  };
}; 