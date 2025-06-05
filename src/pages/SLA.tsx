import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Footer from '../components/Footer';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Report {
  id: string;
  reportState: string;
  severity?: string;
  deadline?: any;
  timestamp?: any;
  resolvedAt?: any;
  completedAt?: any;
  incidentType?: string;
  team?: string;
  resolutionTimeHours?: number;
  resolutionTimeFormatted?: string;
  [key: string]: any;
}

// Time frame options
type TimeFrame = 'day' | 'week' | 'month' | 'all';

// Helper function to format hours into readable duration
const formatDuration = (hours: number) => {
  if (hours === 0) return '0 hours';
  
  const days = Math.floor(hours / 24);
  const remainingHours = Math.floor(hours % 24);
  
  if (days === 0) {
    return `${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
  } else {
    return `${days} day${days !== 1 ? 's' : ''} ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
  }
};

const SLA: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [municipal, setMunicipal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('all');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setMunicipal('');
        setReports([]);
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
    const fetchReports = async () => {
      if (!municipal) return;
      setLoading(true);
      const q = query(collection(db, 'reports'), where('municipal', '==', municipal));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d
        } as Report;
      });
      setReports(data);
      setLoading(false);
    };
    fetchReports();
  }, [municipal]);

  // Filter reports by selected time frame
  const getFilteredReports = () => {
    const now = new Date();
    
    if (timeFrame === 'all') {
      return reports;
    }
    
    let startDate = new Date();
    
    if (timeFrame === 'day') {
      startDate.setDate(now.getDate() - 1);
    } else if (timeFrame === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (timeFrame === 'month') {
      startDate.setMonth(now.getMonth() - 1);
    }
    
    return reports.filter(report => {
      const reportDate = report.timestamp?.seconds 
        ? new Date(report.timestamp.seconds * 1000)
        : new Date(report.timestamp);
      
      return reportDate >= startDate;
    });
  };
  
  const filteredReports = getFilteredReports();

  // --- KPI Calculations ---
  // 1. Average Resolution Time (now using the stored resolutionTimeHours)
  const completedReports = filteredReports.filter(r => r.reportState === 'Completed');
  
  // First try to use the stored resolution time
  const reportsWithResolutionTime = completedReports.filter(r => typeof r.resolutionTimeHours === 'number');
  
  let avgResolutionHours = 0;
  if (reportsWithResolutionTime.length > 0) {
    // Use the pre-calculated resolution time when available
    avgResolutionHours = reportsWithResolutionTime.reduce(
      (sum, r) => sum + (r.resolutionTimeHours || 0), 0
    ) / reportsWithResolutionTime.length;
  } else {
    // Fall back to legacy calculation method for older reports
    const resolvedReports = filteredReports.filter(r => 
      (r.reportState === 'Resolved' || r.reportState === 'Completed') && 
      (r.resolvedAt || r.completedAt) && 
      r.timestamp
    );
    
    if (resolvedReports.length > 0) {
      avgResolutionHours = resolvedReports.reduce((sum, r) => {
        const start = r.timestamp?.seconds ? r.timestamp.seconds * 1000 : new Date(r.timestamp).getTime();
        const end = r.completedAt?.seconds 
          ? r.completedAt.seconds * 1000 
          : r.resolvedAt?.seconds 
            ? r.resolvedAt.seconds * 1000 
            : new Date(r.resolvedAt || r.completedAt).getTime();
        
        // Convert ms to hours
        return sum + ((end - start) / (1000 * 60 * 60));
      }, 0) / resolvedReports.length;
    }
  }

  // Convert average resolution hours to days for display
  const avgResolutionDays = avgResolutionHours / 24;
  
  // Calculate the formatted version for display
  const avgResolutionFormatted = formatDuration(avgResolutionHours);

  // 2. Percentage of On-Time Resolutions
  const onTimeResolutions = completedReports.filter(r => {
    if (!r.deadline || (!r.completedAt && !r.resolvedAt)) return false;
    const deadline = r.deadline?.seconds ? r.deadline.seconds * 1000 : new Date(r.deadline).getTime();
    const resolved = r.completedAt?.seconds 
      ? r.completedAt.seconds * 1000 
      : r.resolvedAt?.seconds 
        ? r.resolvedAt.seconds * 1000 
        : new Date(r.resolvedAt || r.completedAt).getTime();
    return resolved <= deadline;
  });
  const percentOnTime = completedReports.length > 0 ? Math.round((onTimeResolutions.length / completedReports.length) * 100) : 0;

  // 3. Total Issues Resolved This Month
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const resolvedThisMonth = completedReports.filter(r => {
    const resolved = r.completedAt?.seconds 
      ? new Date(r.completedAt.seconds * 1000) 
      : r.resolvedAt?.seconds
        ? new Date(r.resolvedAt.seconds * 1000)
        : new Date(r.resolvedAt || r.completedAt);
    return resolved.getMonth() === thisMonth && resolved.getFullYear() === thisYear;
  });

  // 4. Incidents Breaching SLA (not resolved and past deadline)
  const breachingSLA = filteredReports.filter(r => {
    if (!r.deadline) return false;
    const deadline = r.deadline?.seconds ? r.deadline.seconds * 1000 : new Date(r.deadline).getTime();
    return r.reportState !== 'Completed' && r.reportState !== 'Resolved' && Date.now() > deadline;
  });

  // --- SLA Compliance Over Time (Line Chart Data) ---
  // We'll group by day and calculate % on-time resolutions per day
  const complianceData: { date: string, compliance: number }[] = [];
  const grouped: { [date: string]: { total: number, onTime: number } } = {};
  completedReports.forEach(r => {
    const resolved = r.completedAt?.seconds 
      ? new Date(r.completedAt.seconds * 1000) 
      : r.resolvedAt?.seconds
        ? new Date(r.resolvedAt.seconds * 1000)
        : new Date(r.resolvedAt || r.completedAt);
    const dateStr = resolved.toISOString().slice(0, 10);
    if (!grouped[dateStr]) grouped[dateStr] = { total: 0, onTime: 0 };
    grouped[dateStr].total++;
    const deadline = r.deadline?.seconds ? r.deadline.seconds * 1000 : new Date(r.deadline).getTime();
    if (resolved.getTime() <= deadline) grouped[dateStr].onTime++;
  });
  Object.entries(grouped).forEach(([date, { total, onTime }]) => {
    complianceData.push({ date, compliance: total > 0 ? Math.round((onTime / total) * 100) : 0 });
  });
  complianceData.sort((a, b) => a.date.localeCompare(b.date));

  // Build time frame label
  const getTimeFrameLabel = () => {
    switch (timeFrame) {
      case 'day': return 'Last 24 Hours';
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      default: return 'All Time';
    }
  };

  return (
    <div style={{ background: '#f5f6f8', minHeight: '100vh', width: '100vw', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: '2rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontWeight: 700, fontSize: 28, margin: 0 }}>SLA Compliance Over Time</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              onClick={() => setTimeFrame('day')} 
              style={{ 
                padding: '8px 16px', 
                borderRadius: 8, 
                border: '1px solid #ddd',
                background: timeFrame === 'day' ? '#2ec4b6' : '#fff',
                color: timeFrame === 'day' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: timeFrame === 'day' ? 600 : 400,
              }}>
              Day
            </button>
            <button 
              onClick={() => setTimeFrame('week')} 
              style={{ 
                padding: '8px 16px', 
                borderRadius: 8, 
                border: '1px solid #ddd',
                background: timeFrame === 'week' ? '#2ec4b6' : '#fff',
                color: timeFrame === 'week' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: timeFrame === 'week' ? 600 : 400,
              }}>
              Week
            </button>
            <button 
              onClick={() => setTimeFrame('month')} 
              style={{ 
                padding: '8px 16px', 
                borderRadius: 8, 
                border: '1px solid #ddd',
                background: timeFrame === 'month' ? '#2ec4b6' : '#fff',
                color: timeFrame === 'month' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: timeFrame === 'month' ? 600 : 400,
              }}>
              Month
            </button>
            <button 
              onClick={() => setTimeFrame('all')} 
              style={{ 
                padding: '8px 16px', 
                borderRadius: 8, 
                border: '1px solid #ddd',
                background: timeFrame === 'all' ? '#2ec4b6' : '#fff',
                color: timeFrame === 'all' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: timeFrame === 'all' ? 600 : 400,
              }}>
              All Time
            </button>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 24, marginBottom: 32 }}>
          <div style={{ marginBottom: 16, color: '#666', fontWeight: 500 }}>
            Showing data for: {getTimeFrameLabel()}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={complianceData} margin={{ top: 16, right: 32, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={v => `${v}%`} />
              <Line type="monotone" dataKey="compliance" stroke="#2ec4b6" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
          <div style={{ flex: 1, background: '#e0f7fa', borderRadius: 12, padding: 24, textAlign: 'center', fontWeight: 600, fontSize: 18 }}>
            <div>Average Resolution Time</div>
            <div style={{ color: '#2ec4b6', fontSize: 32, fontWeight: 700 }}>{Math.round(avgResolutionDays * 10) / 10} Days</div>
            <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>{avgResolutionFormatted}</div>
          </div>
          <div style={{ flex: 1, background: '#fff3e0', borderRadius: 12, padding: 24, textAlign: 'center', fontWeight: 600, fontSize: 18 }}>
            <div>Percentage of On-Time Resolutions</div>
            <div style={{ color: '#ff7043', fontSize: 32, fontWeight: 700 }}>{percentOnTime}%</div>
          </div>
          <div style={{ flex: 1, background: '#ede7f6', borderRadius: 12, padding: 24, textAlign: 'center', fontWeight: 600, fontSize: 18 }}>
            <div>Total Issues Resolved This Month</div>
            <div style={{ color: '#7c4dff', fontSize: 32, fontWeight: 700 }}>{resolvedThisMonth.length}</div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>Incidents Breaching SLA</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontWeight: 700, fontSize: 16 }}>
                <th style={{ padding: '1rem 0.5rem' }}>Incident ID</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {breachingSLA.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0', fontSize: 15 }}>
                  <td style={{ padding: '1rem 0.5rem' }}>{r.id}</td>
                  <td>{r.deadline?.seconds ? new Date(r.deadline.seconds * 1000).toLocaleDateString() : ''}</td>
                  <td>{r.reportState}</td>
                  <td>{r.incidentType || '-'}</td>
                </tr>
              ))}
              {breachingSLA.length === 0 && !loading && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No incidents breaching SLA.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default SLA; 