import React, { useEffect, useState } from 'react';
import Footer from '../components/Footer';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface Incident {
  id: string;
  incidentType: string;
  status: string;
  dateReported: string;
}

const formatDate = (date: any) => {
  if (!date) return '';
  if (typeof date === 'string') return date;
  if (date instanceof Timestamp) return date.toDate().toLocaleString();
  if (date.seconds) return new Date(date.seconds * 1000).toLocaleString();
  return '';
};

const Notifications: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [municipal, setMunicipal] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setMunicipal('');
        return;
      }
      const fetchUserMunicipal = async () => {
        const q = query(collection(db, 'users'), where('email', '==', currentUser.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0].data();
          setMunicipal(userDoc.municipal);
        }
      };
      fetchUserMunicipal();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchIncidents = async () => {
      if (!municipal) return;
      setLoading(true);
      const q = query(collection(db, 'reports'), where('reportState', '==', 'New'), where('municipal', '==', municipal));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          incidentType: d.incidentType || '',
          status: d.reportState || 'New',
          dateReported: formatDate(d.timestamp),
        } as Incident;
      });
      setIncidents(data);
      setLoading(false);
    };
    fetchIncidents();
  }, [municipal]);

  return (
    <div style={{ background: '#f5f6f8', minHeight: '100vh', width: '100vw', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0.7rem 0 3rem 0' }}>
        <div style={{ fontWeight: 700, fontSize: 24, marginBottom: 24, marginTop: 8 }}>New Incident Notifications</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontWeight: 700, fontSize: 16 }}>
                <th style={{ padding: '1rem 0.5rem' }}>Incident ID</th>
                <th>Time Reported</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => (
                <tr key={inc.id} style={{ borderTop: '1px solid #f0f0f0', fontSize: 15 }}>
                  <td style={{ padding: '1rem 0.5rem' }}>{inc.id}</td>
                  <td>{inc.dateReported}</td>
                  <td>
                    <button
                      style={{ background: '#2ec4b6', color: '#fff', border: 'none', borderRadius: 20, padding: '0.5rem 1.2rem', fontWeight: 500, cursor: 'pointer', fontSize: 15 }}
                      onClick={() => navigate(`/incidents/${inc.id}`)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && !loading && (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No new incidents.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Notifications; 