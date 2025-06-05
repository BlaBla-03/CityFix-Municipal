import { db } from './firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

export interface SeverityConfig {
  level: 'Low' | 'Medium' | 'High' | 'Critical';
  timeframe: number; // in hours
  description: string;
  color: string;
}

export const severityConfigs: SeverityConfig[] = [
  {
    level: 'Low',
    timeframe: 168, // 7 days
    description: 'Non-urgent issues that can be addressed within 7 days',
    color: '#4caf50'
  },
  {
    level: 'Medium',
    timeframe: 120, // 5 days
    description: 'Important issues that should be addressed within 5 days',
    color: '#ff9800'
  },
  {
    level: 'High',
    timeframe: 72, // 3 days
    description: 'Urgent issues that require attention within 3 days',
    color: '#f44336'
  },
  {
    level: 'Critical',
    timeframe: 24, // 1 day
    description: 'Emergency issues that must be addressed within 24 hours',
    color: '#d32f2f'
  }
];

// Function to initialize severity configs in Firestore
export const initializeSeverityConfigs = async () => {
  try {
    const severityCollection = collection(db, 'severityConfigs');
    
    for (const config of severityConfigs) {
      await setDoc(doc(severityCollection, config.level), config);
    }
    
    console.log('Severity configurations initialized successfully');
  } catch (error) {
    console.error('Error initializing severity configurations:', error);
  }
};

// Function to get severity config by level
export const getSeverityConfig = (level: string): SeverityConfig | undefined => {
  return severityConfigs.find(config => config.level === level);
}; 