import { Timestamp } from 'firebase/firestore';
import { getIncidentTypeSeverity } from './incidentTypeUtils';

/**
 * Calculate distance between two geographic coordinates using Haversine formula
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = 
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

/**
 * Format date from various formats to a readable string
 */
export const formatDate = (date: any) => {
  if (!date) return '';
  if (typeof date === 'string') return date;
  if (date.toDate) return date.toDate().toLocaleDateString();
  if (date.seconds) return new Date(date.seconds * 1000).toLocaleDateString();
  return '';
};

// Define severity timeframes in hours
export const FALLBACK_TIMEFRAMES = {
  'Low': 168, // 7 days
  'Medium': 120, // 5 days
  'High': 72, // 3 days
  'Critical': 24 // 1 day
};

/**
 * Calculate the deadline for an incident based on its creation time and severity
 * @param creationTimestamp When the incident was reported
 * @param severity Severity level of the incident
 * @returns The deadline as a Date object
 */
export const calculateDeadline = (creationTimestamp: any, severity: string): Date | null => {
  if (!creationTimestamp) return null;
  
  // Convert creationTimestamp to Date
  let creationDate: Date;
  if (creationTimestamp instanceof Timestamp) {
    creationDate = creationTimestamp.toDate();
  } else if (creationTimestamp.seconds) {
    creationDate = new Date(creationTimestamp.seconds * 1000);
  } else if (creationTimestamp instanceof Date) {
    creationDate = creationTimestamp;
  } else if (typeof creationTimestamp === 'string') {
    creationDate = new Date(creationTimestamp);
  } else {
    return null;
  }
  
  // Get timeframe based on severity
  const timeframeHours = FALLBACK_TIMEFRAMES[severity as keyof typeof FALLBACK_TIMEFRAMES] || 24;
  
  // Calculate deadline: creation time + timeframe hours
  return new Date(creationDate.getTime() + (timeframeHours * 60 * 60 * 1000));
};

/**
 * Check if an incident is overdue based on its deadline
 * @param deadline The deadline for resolution
 * @param status Current status of the incident
 * @returns Boolean indicating whether the incident is overdue
 */
export const isOverdue = (deadline: any, status: string): boolean => {
  // Completed/Merged incidents cannot be overdue
  if (status === 'Completed' || status === 'Merged') {
    return false;
  }
  
  // If no deadline, cannot be overdue
  if (!deadline) return false;
  
  // Convert deadline to Date
  let deadlineDate: Date;
  if (deadline instanceof Timestamp) {
    deadlineDate = deadline.toDate();
  } else if (deadline.seconds) {
    deadlineDate = new Date(deadline.seconds * 1000);
  } else if (deadline instanceof Date) {
    deadlineDate = deadline;
  } else {
    return false;
  }
  
  // Check if current time is past deadline
  return new Date() > deadlineDate;
};

/**
 * Calculate time remaining until deadline or time since deadline (if overdue)
 * @param deadline Deadline date for resolution
 * @param status Current status of the incident
 * @param showOverdueTime Whether to show detailed overdue time (for detail view) or just "Overdue"
 * @returns Formatted string representing time remaining or overdue status
 */
export const getTimeRemaining = (deadline: any, status?: string, showOverdueTime: boolean = false) => {
  // For merged reports, return a dash
  if (status === 'Merged') {
    return '-';
  }
  
  // For completed incidents, just return "Completed"
  if (status === 'Completed') {
    return 'Completed';
  }
  
  // If no deadline, return appropriate message
  if (!deadline) return 'No deadline';
  
  // Convert deadline to Date object
  let deadlineDate: Date;
  if (deadline instanceof Timestamp) {
    deadlineDate = deadline.toDate();
  } else if (deadline.seconds) {
    deadlineDate = new Date(deadline.seconds * 1000);
  } else if (deadline instanceof Date) {
    deadlineDate = deadline;
  } else {
    return 'No deadline';
  }

  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  
  // If deadline has passed
  if (diffMs <= 0) {
    // For detail page, show how much time has passed since deadline
    if (showOverdueTime) {
      const overdueMs = Math.abs(diffMs);
      const days = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((overdueMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((overdueMs % (1000 * 60 * 60)) / (1000 * 60));
      
      let overdueTimeStr = '';
      if (days > 0) {
        overdueTimeStr = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
      } else if (hours > 0) {
        overdueTimeStr = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      } else {
        overdueTimeStr = minutes > 0 ? `${minutes}m` : 'Less than 1 minute';
      }
      
      return `Overdue by ${overdueTimeStr}`;
    }
    
    // For list view, just show "Overdue"
    return 'Overdue';
  }
  
  // Calculate remaining time
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  // Format the time string properly with days first
  if (days > 0) {
    if (hours > 0) {
      return `${days}d ${hours}h`;
    }
    return `${days}d`;
  } else if (hours > 0) {
    if (minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return 'Less than 1 minute';
  }
};

// Status and severity color mappings
export const statusColors: Record<string, string> = {
  'New': '#29b6f6',
  'In Progress': '#ff7043',
  'Overdue': '#e53935',
  'Completed': '#222',
  'Merged': '#9e9e9e'
};

// Updated to handle various case formats
export const severityColors: Record<string, string> = {
  'Low': '#4caf50',
  'Medium': '#ff9800',
  'High': '#f44336',
  'Critical': '#d32f2f',
  
  // Add lowercase variants
  'low': '#4caf50',
  'medium': '#ff9800',
  'high': '#f44336',
  'critical': '#d32f2f'
};

// Helper function to get severity color regardless of case
export const getSeverityColor = (severity: string): string => {
  if (!severity) return '#757575'; // Default gray
  
  // Convert to standard format (first letter uppercase, rest lowercase)
  const standardFormat = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
  
  // Return color from our map, or default color if not found
  return severityColors[standardFormat] || severityColors[severity] || '#757575';
};

// Function to format severity string with proper capitalization
export const formatSeverity = (severity: string): string => {
  if (!severity) return '';
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
};

// Get severity level ranking (for comparison purposes)
export const getSeverityRanking = (severity: string): number => {
  const normalizedSeverity = severity.toLowerCase();
  
  switch (normalizedSeverity) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
};

// Flag status and reason helpers
export const getFlagReasonText = (reason: string): string => {
  return reason === 'duplicate' ? 'Duplicate Report' :
    reason === 'false_info' ? 'False Information' :
    reason === 'inappropriate' ? 'Inappropriate Content' :
    reason === 'spam' ? 'Spam' : 'Other';
};

/**
 * Determine severity level based on incident type
 * This function gets the severity from the existing incidentTypes collection
 */
export const determineSeverityFromType = async (incidentType: string): Promise<'Low' | 'Medium' | 'High' | 'Critical'> => {
  if (!incidentType) return 'Medium';
  
  try {
    return await getIncidentTypeSeverity(incidentType);
  } catch (error) {
    console.error('Error determining severity from incident type:', error);
    return 'Medium';
  }
};

// Incident Data interface
export interface IncidentDetailData {
  id: string;
  location: string;
  locationInfo: string;
  latitude?: number;
  longitude?: number;
  incidentType: string;
  description: string;
  photos?: string[];
  mediaUrls?: string[];
  contact: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  deadline?: any;
  status: 'New' | 'In Progress' | 'Overdue' | 'Completed' | 'Merged';
  dateReported: string;
  reporterName?: string;
  reporterEmail?: string;
  isAnonymous?: boolean;
  resolutionTimeHours?: number;
  resolutionTimeFormatted?: string;
  completedAt?: any;
  flagged?: boolean;
  flagReason?: string;
  flagNotes?: string;
  flagStatus?: string;
  mergedInto?: string;
  mergedAt?: any;
} 