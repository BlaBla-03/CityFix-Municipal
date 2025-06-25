import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Footer from '../components/Footer';

interface Report {
  id: string;
  latitude?: number;
  longitude?: number;
  municipal: string;
  reportState: string;
  [key: string]: any;
}

const containerStyle = {
  width: '100%',
  height: '500px',
  borderRadius: '16px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  background: '#fff',
};

const statsBoxStyle = {
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  padding: '1.5rem 2rem',
  marginBottom: '1.2rem',
  textAlign: 'center',
  fontWeight: 600,
  fontSize: '1.2rem',
} as React.CSSProperties;

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const Dashboard: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [municipal, setMunicipal] = useState<string>('');
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<any[]>([]);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setMunicipal('');
        return;
      }
      console.log('Current user email:', currentUser.email);
      const fetchUserAndMunicipal = async () => {
        const q = query(collection(db, 'users'), where('email', '==', currentUser.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0].data();
          console.log('User data:', userDoc);
          setMunicipal(userDoc.municipal);
          // Fetch municipal document
          const mq = query(collection(db, 'municipals'), where('name', '==', userDoc.municipal));
          const mSnapshot = await getDocs(mq);
          if (!mSnapshot.empty) {
            const municipalDoc = mSnapshot.docs[0].data();
            const postcode = municipalDoc.postcodeRanges?.start?.toString();
            console.log('Municipal postcode:', postcode);
          } else {
            console.log('No municipal document found');
          }
        } else {
          console.log('No user document found');
        }
      };
      fetchUserAndMunicipal();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchReports = async () => {
      if (!municipal) {
        console.log('No municipal value set');
        return;
      }
      console.log('Fetching reports for municipal:', municipal);
      const q = query(collection(db, 'reports'), where('municipal', '==', municipal));
      const querySnapshot = await getDocs(q);
      console.log('Number of reports found:', querySnapshot.size);
      const reportsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Report[];
      console.log('Fetched reports:', reportsData);
      console.log('Reports with location data:', reportsData.filter(r => r.latitude && r.longitude));
      setReports(reportsData);
    };
    fetchReports();
  }, [municipal]);

  // Updated counters with proper logic
  // Total New Issues - only count reports with status "New"
  const total = reports.filter(r => r.reportState === 'New').length;
  
  // In Progress count (only active "In Progress" reports)
  const pending = reports.filter(r => r.reportState === 'In Progress').length;
  
  // Resolved count (both "Completed" and "Resolved" reports)
  const resolved = reports.filter(r => 
    r.reportState === 'Completed' || 
    r.reportState === 'Resolved'
  ).length;
  
  // Overdue count (check deadline against current time)
  const overdue = reports.filter(report => {
    // First check if status is already marked as overdue
    if (report.reportState === 'Overdue') return true;
    
    // Skip completed/resolved reports
    if (report.reportState === 'Completed' || report.reportState === 'Resolved') return false;
    
    // Check if deadline is passed
    if (report.deadline) {
      const deadlineDate = report.deadline instanceof Date 
        ? report.deadline 
        : report.deadline.toDate ? report.deadline.toDate() 
        : new Date(report.deadline.seconds * 1000);
      
      return deadlineDate < new Date();
    }
    
    return false;
  }).length;

  // Filter out completed reports for map display
  const visibleReports = reports.filter(r => r.reportState !== 'Completed');

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (reports.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      reports.forEach(r => {
        if (r.latitude && r.longitude) {
          bounds.extend({ lat: r.latitude, lng: r.longitude });
        }
      });
      map.fitBounds(bounds);
    }
  }, [reports]);

  useEffect(() => {
    if (!isLoaded || !window.google || !mapRef.current) return;

    // Remove old markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // We'll use the normal markers instead of AdvancedMarkerElement
    // Markers will be rendered in the GoogleMap component directly
  }, [visibleReports, isLoaded]);

  // Function to get the center of all visible report pins
  const getReportsCenter = (reports: Report[]) => {
    const validReports = reports.filter(r => typeof r.latitude === 'number' && typeof r.longitude === 'number');
    if (validReports.length === 0) {
      return { lat: 3.139, lng: 101.6869 }; // fallback to KL
    }
    const avgLat = validReports.reduce((sum, r) => sum + r.latitude!, 0) / validReports.length;
    const avgLng = validReports.reduce((sum, r) => sum + r.longitude!, 0) / validReports.length;
    return { lat: avgLat, lng: avgLng };
  };

  const mapCenter = getReportsCenter(visibleReports);

  return (
    <div style={{
      background: '#f5f6f8',
      minHeight: '100vh',
      width: '100vw',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
    }}>
      <div style={{
        flex: 1,
        display: 'flex',
        gap: 32,
        width: '100%',
        padding: 24,
        boxSizing: 'border-box',
        alignItems: 'stretch',
      }}>
        <div style={{ flex: 2.4, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            ...containerStyle,
            marginBottom: 24,
            height: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: 0 // Remove padding for flush map
          }}>
            <h2 style={{ textAlign: 'center', margin: '0.5rem 0 0.5rem 0', fontWeight: 700, fontSize: '1.25rem', letterSpacing: 0.5 }}>
              Incident Map
            </h2>
            {isLoaded && (
              <div style={{ flex: 1, display: 'flex', borderRadius: '16px', overflow: 'hidden' }}>
                <GoogleMap
                  mapContainerStyle={{
                    width: '100%',
                    height: '100%', // Fill parent
                    borderRadius: '16px'
                  }}
                  center={mapCenter}
                  zoom={13}
                  onLoad={onLoad}
                  options={{ 
                    mapTypeControl: false, 
                    streetViewControl: false,
                    mapId: "571c55feee232f6"
                  }}
                >
                  {/* Render markers directly instead of using AdvancedMarkerElement */}
                  {isLoaded && visibleReports.map((report) => 
                    report.latitude && report.longitude ? (
                      <Marker
                        key={report.id}
                        position={{ lat: report.latitude, lng: report.longitude }}
                        title={report.incidentType || 'Incident'}
                      />
                    ) : null
                  )}
                </GoogleMap>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={statsBoxStyle}>
            <div>Total New Issues</div>
            <div style={{ color: '#29b6f6', fontSize: '2rem', fontWeight: 700 }}>{total}</div>
          </div>
          <div style={statsBoxStyle}>
            <div>In Progress Issues</div>
            <div style={{ color: '#ff7043', fontSize: '2rem', fontWeight: 700 }}>{pending}</div>
          </div>
          <div style={statsBoxStyle}>
            <div>Resolved Issues</div>
            <div style={{ color: '#43a047', fontSize: '2rem', fontWeight: 700 }}>{resolved}</div>
          </div>
          <div style={statsBoxStyle}>
            <div>Overdue Issues</div>
            <div style={{ color: '#e53935', fontSize: '2rem', fontWeight: 700 }}>{overdue}</div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Dashboard;
