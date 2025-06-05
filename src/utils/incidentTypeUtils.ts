import { db } from '../config/firebase';
import { collection, getDocs, query, doc, getDoc } from 'firebase/firestore';
import { getSeverityRanking } from './incidentUtils';

// Simplified interface to match existing database structure
export interface IncidentTypeConfig {
  id: string;
  name: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical'; // Matches the field in the database
  description?: string;
}

// Cache for incident type configurations
let incidentTypeConfigCache: Record<string, IncidentTypeConfig> = {};
let lastCacheUpdate: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get highest severity for an incident type from the database
 * Handles multiple incident types separated by commas, returning the highest severity
 * @param incidentType The incident type string (can include multiple types separated by commas)
 * @returns The highest severity level for the incident type(s)
 */
export const getIncidentTypeSeverity = async (
  incidentType: string
): Promise<'Low' | 'Medium' | 'High' | 'Critical'> => {
  try {
    // Check if we have multiple incident types (separated by commas or other separators)
    const types = incidentType.split(/[,;\/]/);
    
    if (types.length > 1) {
      // If multiple types, get severity for each and return the highest
      const severityPromises = types.map(type => getIncidentTypeSeverity(type.trim()));
      const severities = await Promise.all(severityPromises);
      
      // Find the highest severity based on ranking
      let highestSeverity = 'Medium' as 'Low' | 'Medium' | 'High' | 'Critical';
      let highestRank = getSeverityRanking(highestSeverity);
      
      severities.forEach(severity => {
        const rank = getSeverityRanking(severity);
        if (rank > highestRank) {
          highestRank = rank;
          highestSeverity = severity;
        }
      });
      
      return highestSeverity;
    }

    // Process single incident type
    const singleType = incidentType.trim();
    
    // Try to get from cache first if it's fresh
    const now = Date.now();
    if (lastCacheUpdate > now - CACHE_TTL && incidentTypeConfigCache[singleType]) {
      return incidentTypeConfigCache[singleType].severity;
    }

    // Try to get the specific incident type by ID
    const incidentTypeDoc = await getDoc(doc(db, 'incidentTypes', singleType));
    
    if (incidentTypeDoc.exists()) {
      const data = incidentTypeDoc.data();
      // Add to cache
      incidentTypeConfigCache[singleType] = { 
        id: incidentTypeDoc.id,
        name: data.name,
        severity: data.severity || 'Medium',
        description: data.description
      };
      return data.severity || 'Medium';
    }
    
    // If not found by ID, try to find by name
    const incidentTypesRef = collection(db, 'incidentTypes');
    const q = query(incidentTypesRef);
    const querySnapshot = await getDocs(q);
    
    // Refresh the entire cache
    incidentTypeConfigCache = {};
    lastCacheUpdate = Date.now();
    
    // Look through all incident types
    let matchingType: IncidentTypeConfig | undefined;
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      // Add to cache
      incidentTypeConfigCache[doc.id] = {
        id: doc.id,
        name: data.name,
        severity: data.severity || 'Medium',
        description: data.description
      };
      
      // Check if the incident type name matches
      if (data.name && data.name.toLowerCase() === singleType.toLowerCase()) {
        matchingType = {
          id: doc.id,
          name: data.name,
          severity: data.severity || 'Medium',
          description: data.description
        };
      }
    });
    
    if (matchingType) {
      return matchingType.severity;
    }
    
    // Default to 'Medium' if the incident type is not found
    console.warn(`Incident type "${singleType}" not found in database, defaulting to Medium severity`);
    return 'Medium';
  } catch (error) {
    console.error('Error getting incident type severity:', error);
    return 'Medium';
  }
};

/**
 * Get all available incident types
 * @returns List of all incident type configurations
 */
export const getAllIncidentTypes = async (): Promise<IncidentTypeConfig[]> => {
  try {
    // Check if cache is fresh
    const now = Date.now();
    if (Object.keys(incidentTypeConfigCache).length > 0 && lastCacheUpdate > now - CACHE_TTL) {
      return Object.values(incidentTypeConfigCache);
    }
    
    // If cache is stale or empty, refresh from database
    const incidentTypesRef = collection(db, 'incidentTypes');
    const querySnapshot = await getDocs(query(incidentTypesRef));
    
    // Reset cache
    incidentTypeConfigCache = {};
    lastCacheUpdate = now;
    
    const incidentTypes: IncidentTypeConfig[] = [];
    querySnapshot.forEach(doc => {
      const data = doc.data() as Omit<IncidentTypeConfig, 'id'>;
      const typeConfig = {
        id: doc.id,
        ...data
      };
      
      incidentTypeConfigCache[doc.id] = typeConfig;
      incidentTypes.push(typeConfig);
    });
    
    return incidentTypes;
  } catch (error) {
    console.error('Error getting all incident types:', error);
    return [];
  }
}; 