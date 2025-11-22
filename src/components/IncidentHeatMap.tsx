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
  reports?: any[]; // Optional prop to pass reports directly
}

interface Incident {
  id: string;
  latitude: number;
  longitude: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  incidentType: string;
  timestamp: any;
}

interface Cluster {
  center: { lat: number; lng: number };
  count: number;
  incidents: Incident[];
  severityScore: number;
}

const IncidentHeatMap: React.FC<IncidentHeatMapProps> = ({
  center = { lat: 3.1390, lng: 101.6869 }, // Default: Kuala Lumpur
  zoom = 12,
  height = '100%', // Default to 100% to fill parent
  incidentType,
  timeRange = 'all',
  reports
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const labelsRef = useRef<google.maps.Marker[]>([]); // For text labels
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showHotZones, setShowHotZones] = useState(true); // Default to showing Hot Zones

  // Helper function to get date for time range
  const getDateForRange = (range: string): Date | null => {
    const now = new Date();

    switch (range) {
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

  // Fetch incident data or use provided reports
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      if (reports) {
        // Use provided reports
        const processedReports: Incident[] = reports
          .filter(r => r.latitude && r.longitude)
          .map(r => ({
            id: r.id,
            latitude: r.latitude,
            longitude: r.longitude,
            severity: r.severity || 'Low',
            incidentType: r.incidentType || 'General',
            timestamp: r.timestamp
          }));
        setIncidents(processedReports);
        setLoading(false);
        return;
      }

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

    loadData();
  }, [incidentType, timeRange, reports]);

  // Initialize Google Maps
  useEffect(() => {
    if (!window.google || !window.google.maps) {
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
    infoWindowRef.current = new google.maps.InfoWindow();
    setMapLoaded(true);

    return () => {
      // Clean up
      markersRef.current.forEach(m => m.setMap(null));
      circlesRef.current.forEach(c => c.setMap(null));
      labelsRef.current.forEach(l => l.setMap(null));
      markersRef.current = [];
      circlesRef.current = [];
      labelsRef.current = [];
    };
  }, [center, zoom]);

  // Simple clustering algorithm
  const calculateClusters = (incidents: Incident[], radiusKm: number = 0.5): Cluster[] => {
    const clusters: Cluster[] = [];
    const processed = new Set<string>();

    incidents.forEach(incident => {
      if (processed.has(incident.id)) return;

      const clusterIncidents = [incident];
      processed.add(incident.id);

      let latSum = incident.latitude;
      let lngSum = incident.longitude;
      let severityScore = getSeverityScore(incident.severity);

      // Find neighbors
      incidents.forEach(neighbor => {
        if (processed.has(neighbor.id)) return;

        const distance = getDistanceFromLatLonInKm(
          incident.latitude,
          incident.longitude,
          neighbor.latitude,
          neighbor.longitude
        );

        if (distance <= radiusKm) {
          clusterIncidents.push(neighbor);
          processed.add(neighbor.id);
          latSum += neighbor.latitude;
          lngSum += neighbor.longitude;
          severityScore += getSeverityScore(neighbor.severity);
        }
      });

      clusters.push({
        center: {
          lat: latSum / clusterIncidents.length,
          lng: lngSum / clusterIncidents.length
        },
        count: clusterIncidents.length,
        incidents: clusterIncidents,
        severityScore
      });
    });

    return clusters;
  };

  const getSeverityScore = (severity: string) => {
    switch (severity) {
      case 'Critical': return 4;
      case 'High': return 3;
      case 'Medium': return 2;
      default: return 1;
    }
  };

  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
      ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
  };

  const deg2rad = (deg: number) => {
    return deg * (Math.PI / 180);
  };

  // Update map with incident data
  useEffect(() => {
    if (!mapLoaded || incidents.length === 0 || !googleMapRef.current) return;

    // Clear previous layers
    markersRef.current.forEach(m => m.setMap(null));
    circlesRef.current.forEach(c => c.setMap(null));
    labelsRef.current.forEach(l => l.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];
    labelsRef.current = [];

    // Always render Markers (Pins)
    incidents.forEach(incident => {
      const marker = new google.maps.Marker({
        position: { lat: incident.latitude, lng: incident.longitude },
        map: googleMapRef.current,
        title: incident.incidentType,
        // You can add custom icons based on severity here if needed
      });

      marker.addListener('click', () => {
        if (infoWindowRef.current && googleMapRef.current) {
          infoWindowRef.current.setPosition({ lat: incident.latitude, lng: incident.longitude });
          infoWindowRef.current.setContent(`
            <div style="padding: 8px;">
              <h3 style="margin: 0 0 4px 0;">${incident.incidentType}</h3>
              <p style="margin: 0; color: ${getSeverityColor(incident.severity)}">
                <strong>${incident.severity} Severity</strong>
              </p>
            </div>
          `);
          infoWindowRef.current.open(googleMapRef.current, marker);
        }
      });

      markersRef.current.push(marker);
    });

    if (showHotZones) {
      // Render Hot Zones (Clusters)
      const clusters = calculateClusters(incidents);

      clusters.forEach(cluster => {
        // Only show clusters with significant activity or high severity
        if (cluster.count >= 3 || cluster.severityScore >= 10) {
          // Calculate dynamic radius based on count, capped at 100 reports
          // Base radius 500m, growing up to 3000m for 100+ reports
          const countFactor = Math.min(cluster.count, 100);
          const radius = 500 + (countFactor / 100) * 2500;

          // 1. Draw the Circle
          const circle = new google.maps.Circle({
            strokeColor: '#FF0000',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#FF0000',
            fillOpacity: 0.35,
            map: googleMapRef.current,
            center: cluster.center,
            radius: radius,
            clickable: true
          });

          // 2. Add Label with Count
          const labelMarker = new google.maps.Marker({
            position: cluster.center,
            map: googleMapRef.current,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 0, // Hide the marker icon itself
            },
            label: {
              text: cluster.count.toString(),
              color: 'white',
              fontWeight: 'bold',
              fontSize: '24px', // Increased font size
              className: 'hot-zone-label'
            },
            zIndex: 1000 // Ensure label is on top
          });

          circle.addListener('click', () => {
            if (infoWindowRef.current && googleMapRef.current) {
              infoWindowRef.current.setPosition(cluster.center);
              infoWindowRef.current.setContent(`
                <div style="padding: 8px;">
                  <h3 style="margin: 0 0 8px 0; color: #d32f2f;">Hot Zone Detected</h3>
                  <p><strong>${cluster.count} Reports</strong> in this area.</p>
                  <p>Severity Score: ${cluster.severityScore}</p>
                  <p style="font-size: 12px; color: #666;">Click to zoom in</p>
                </div>
              `);
              infoWindowRef.current.open(googleMapRef.current);
              googleMapRef.current.setZoom(15);
              googleMapRef.current.setCenter(cluster.center);
            }
          });

          circlesRef.current.push(circle);
          labelsRef.current.push(labelMarker);
        }
      });
    }

  }, [mapLoaded, incidents, showHotZones]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical': return '#d32f2f';
      case 'High': return '#f57c00';
      case 'Medium': return '#fbc02d';
      case 'Low': return '#388e3c';
      default: return '#757575';
    }
  };

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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%', borderRadius: 8 }}></div>

      {/* Toggle Control */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        background: 'white',
        padding: 5,
        borderRadius: 4,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        display: 'flex',
        gap: 5
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={showHotZones}
              onChange={(e) => setShowHotZones(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Show Hot Zones
          </label>
        </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 5,
        right: 5,
        background: 'rgba(255,255,255,0.8)',
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 11,
        color: '#666'
      }}>
        {incidents.length} incidents
      </div>
    </div>
  );
};

export default IncidentHeatMap;