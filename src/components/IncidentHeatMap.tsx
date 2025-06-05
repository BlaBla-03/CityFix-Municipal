import React, { useEffect, useRef, useState } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../config/firebase';

// Note: You need to include the Google Maps script in your index.html
// <script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=visualization"></script>

interface IncidentHeatMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string | number;
  incidentType?: string;
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
}

interface Incident {
  id: string;
  latitude: number;
  longitude: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  incidentType: string;
  timestamp: any;
}

const IncidentHeatMap: React.FC<IncidentHeatMapProps> = ({
  center = { lat: 3.1390, lng: 101.6869 }, // Default: Kuala Lumpur
  zoom = 12,
  height = 400,
  incidentType,
  timeRange = 'all'
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);
  
  // Helper function to get date for time range
  const getDateForRange = (range: string): Date | null => {
    const now = new Date();
    
    switch(range) {
      case 'day':
        return new Date(now.setDate(now.getDate() - 1));
      case 'week':
        return new Date(now.setDate(now.getDate() - 7));
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1));
      case 'year':
        return new Date(now.setFullYear(now.getFullYear() - 1));
      case 'all':
      default:
        return null;
    }
  };
  
  // Fetch incident data
  useEffect(() => {
    const fetchIncidents = async () => {
      setLoading(true);
      try {
        const reportsRef = collection(db, 'reports');
        let q = query(reportsRef);
        
        // Add filters if specified
        if (incidentType) {
          q = query(q, where('incidentType', '==', incidentType));
        }
        
        // Add time range filter if specified
        const startDate = getDateForRange(timeRange);
        if (startDate) {
          q = query(q, where('timestamp', '>=', startDate));
        }
        
        const querySnapshot = await getDocs(q);
        
        const incidentsData: Incident[] = [];
        querySnapshot.forEach(doc => {
          const data = doc.data();
          if (data.latitude && data.longitude) {
            incidentsData.push({
              id: doc.id,
              latitude: data.latitude,
              longitude: data.longitude,
              severity: data.severity || 'Low',
              incidentType: data.incidentType,
              timestamp: data.timestamp
            });
          }
        });
        
        setIncidents(incidentsData);
      } catch (error) {
        console.error('Error fetching incidents for heat map:', error);
        setError('Failed to load incident data for map visualization.');
      }
      setLoading(false);
    };
    
    fetchIncidents();
  }, [incidentType, timeRange]);
  
  // Initialize Google Maps
  useEffect(() => {
    if (!window.google || !window.google.maps || !window.google.maps.visualization) {
      setError('Google Maps API not loaded. Please include the Google Maps script in your HTML.');
      return;
    }
    
    if (!mapRef.current) return;
    
    const map = new google.maps.Map(mapRef.current, {
      center: center,
      zoom: zoom,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      styles: [
        {
          featureType: 'poi',
          stylers: [{ visibility: 'off' }]
        },
        {
          featureType: 'transit',
          stylers: [{ visibility: 'off' }]
        }
      ]
    });
    
    googleMapRef.current = map;
    setMapLoaded(true);
    
    return () => {
      // Clean up markers
      if (markersRef.current.length > 0) {
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];
      }
      
      // Clean up heatmap
      if (heatmapRef.current) {
        heatmapRef.current.setMap(null);
        heatmapRef.current = null;
      }
    };
  }, [center, zoom]);
  
  // Update map with incident data
  useEffect(() => {
    if (!mapLoaded || incidents.length === 0 || !googleMapRef.current) return;
    
    // Create heatmap data points
    const heatmapData = incidents.map(incident => {
      // Weight based on severity
      const severityWeight = {
        Low: 1,
        Medium: 3,
        High: 5,
        Critical: 10
      }[incident.severity] || 1;
      
      return {
        location: new google.maps.LatLng(incident.latitude, incident.longitude),
        weight: severityWeight
      };
    });
    
    // Create heatmap layer
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
    }
    
    heatmapRef.current = new google.maps.visualization.HeatmapLayer({
      data: heatmapData,
      map: googleMapRef.current,
      radius: 30,
      opacity: 0.7,
      gradient: [
        'rgba(0, 255, 255, 0)',
        'rgba(0, 255, 255, 1)',
        'rgba(0, 191, 255, 1)',
        'rgba(0, 127, 255, 1)',
        'rgba(0, 63, 255, 1)',
        'rgba(0, 0, 255, 1)',
        'rgba(0, 0, 223, 1)',
        'rgba(0, 0, 191, 1)',
        'rgba(0, 0, 159, 1)',
        'rgba(0, 0, 127, 1)',
        'rgba(63, 0, 91, 1)',
        'rgba(127, 0, 63, 1)',
        'rgba(191, 0, 31, 1)',
        'rgba(255, 0, 0, 1)'
      ]
    });
    
  }, [mapLoaded, incidents]);
  
  if (error) {
    return <div style={{ padding: 16, color: 'red' }}>{error}</div>;
  }
  
  if (loading) {
    return (
      <div style={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f5f5f5',
        borderRadius: 8
      }}>
        Loading map data...
      </div>
    );
  }
  
  return (
    <div>
      <div ref={mapRef} style={{ height, width: '100%', borderRadius: 8 }}></div>
      <div style={{ marginTop: 8, fontSize: 13, color: '#666', textAlign: 'right' }}>
        {incidents.length} incidents displayed on map
      </div>
    </div>
  );
};

export default IncidentHeatMap; 