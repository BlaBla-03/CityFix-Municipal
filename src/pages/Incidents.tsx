import React, { useEffect, useState } from 'react';
import Footer from '../components/Footer';
import { collection, query, where, getDocs, doc as firestoreDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { 
  formatDate, 
  getTimeRemaining, 
  statusColors, 
  calculateDeadline,
  isOverdue,
  determineSeverityFromType,
  getSeverityColor,
  formatSeverity
} from '../utils/incidentUtils';
import { getAllIncidentTypes, IncidentTypeConfig } from '../utils/incidentTypeUtils';

interface Incident {
  id: string;
  incidentType: string;
  status: 'New' | 'In Progress' | 'Overdue' | 'Completed' | 'Merged';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  dateReported: string;
  deadline?: any;
  timestamp?: any;
  mergedInto?: string; // ID of the parent report this one is merged into
}

type SortOption = 'newest' | 'oldest' | '';

const REPORTS_PER_PAGE = 50;

const Incidents: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateSort, setDateSort] = useState<SortOption>('');
  const [loading, setLoading] = useState(true);
  const [municipal, setMunicipal] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [categories, setCategories] = useState<IncidentTypeConfig[]>([]);
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
      const q = query(collection(db, 'reports'), where('municipal', '==', municipal));
      const querySnapshot = await getDocs(q);
      
      // Process all incidents with Promise.all to handle asynchronous severity determination
      const incidentPromises = querySnapshot.docs.map(async (docSnapshot) => {
        const d = docSnapshot.data();
        
        // Determine severity based on incident type if not set
        let severity = d.severity;
        if ((!severity || severity === 'Low') && d.incidentType) {
          try {
            severity = await determineSeverityFromType(d.incidentType);
            
            // If severity changed, update the document
            if (severity !== d.severity) {
              console.log(`Updating severity for ${docSnapshot.id} from ${d.severity || 'unset'} to ${severity} based on type ${d.incidentType}`);
              const docRef = firestoreDoc(db, 'reports', docSnapshot.id);
              await updateDoc(docRef, { severity });
            }
          } catch (error) {
            console.error(`Error determining severity for incident ${docSnapshot.id}:`, error);
            severity = d.severity || 'Low';
          }
        } else {
          severity = d.severity || 'Low';
        }
        
        // Get the current status
        let status = d.reportState || 'New';
        
        // Calculate deadline based on severity and report time
        const deadline = calculateDeadline(d.timestamp, severity);
        
        // Check if the incident is overdue
        const shouldBeOverdue = isOverdue(deadline, status);
        
        // If overdue, update status
        if (shouldBeOverdue && status !== 'Completed' && status !== 'Merged') {
          status = 'Overdue';
          
          // Update status in Firestore
          try {
            const docRef = firestoreDoc(db, 'reports', docSnapshot.id);
            await updateDoc(docRef, { 
              reportState: status,
              deadline: deadline ? Timestamp.fromDate(deadline) : null
            });
            console.log(`Updated status for incident ${docSnapshot.id} to Overdue`);
          } catch (e) {
            console.error(`Failed to update status for incident ${docSnapshot.id}:`, e);
          }
        }
        
        return {
          id: docSnapshot.id,
          incidentType: d.incidentType || '',
          status: status,
          severity: severity,
          dateReported: formatDate(d.timestamp),
          deadline: deadline,
          timestamp: d.timestamp, // Store original timestamp for time calculations
          mergedInto: d.mergedInto || '' // Store the ID of the parent report (if merged)
        } as Incident;
      });
      
      // Wait for all promises to resolve
      const data = await Promise.all(incidentPromises);
      
      setIncidents(data);
      setLoading(false);
      
      // Reset to first page when data changes
      setCurrentPage(1);
    };
    fetchIncidents();
  }, [municipal]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, categoryFilter, dateSort]);

  // Filtering and sorting logic
  const filteredIncidents = incidents.filter(inc => {
    // Split incident types by common separators and trim whitespace
    const incidentTypes = inc.incidentType.split(/[,;\/]/).map(type => type.trim());
    
    return (
      (!search || inc.incidentType.toLowerCase().includes(search.toLowerCase()) || inc.id.includes(search)) &&
      (!statusFilter || inc.status === statusFilter) &&
      (!categoryFilter || incidentTypes.includes(categoryFilter))
    );
  });

  // Create a map to group merged reports with their parents
  const getMergedGroupsMap = () => {
    const mergedMap = new Map<string, Incident[]>();
    
    // Find all merged reports and group them by parent ID
    filteredIncidents.forEach(inc => {
      if (inc.status === 'Merged' && inc.mergedInto) {
        if (!mergedMap.has(inc.mergedInto)) {
          mergedMap.set(inc.mergedInto, []);
        }
        mergedMap.get(inc.mergedInto)?.push(inc);
      }
    });
    
    return mergedMap;
  };

  // Sort incidents with merged reports grouped under their parents
  const getSortedIncidents = () => {
    const mergedGroupsMap = getMergedGroupsMap();
    
    // First, get all non-merged reports
    const mainReports = filteredIncidents.filter(inc => inc.status !== 'Merged');
    
    // Sort main reports first
    mainReports.sort((a, b) => {
      // First prioritize New status at the top
      if (a.status === 'New' && b.status !== 'New') return -1;
      if (a.status !== 'New' && b.status === 'New') return 1;
      
      // First sort by status - completed goes to the bottom
      if (a.status === 'Completed' && b.status !== 'Completed') return 1;
      if (a.status !== 'Completed' && b.status === 'Completed') return -1;
      
      // Then apply date sort if specified
      if (dateSort !== '') {
        // Convert timestamps to comparable values
        const getTime = (timestamp: any) => {
          if (timestamp instanceof Timestamp) return timestamp.toDate().getTime();
          if (timestamp?.seconds) return timestamp.seconds * 1000;
          if (timestamp instanceof Date) return timestamp.getTime();
          return 0;
        };
        
        const timeA = getTime(a.timestamp);
        const timeB = getTime(b.timestamp);
        
        return dateSort === 'newest' ? timeB - timeA : timeA - timeB;
      }
      
      // Then prioritize overdue items
      if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
      if (a.status !== 'Overdue' && b.status === 'Overdue') return 1;
      
      return 0;
    });
    
    // Create the final sorted list with merged reports below their parents
    const result: Incident[] = [];
    
    mainReports.forEach(report => {
      result.push(report);
      
      // If this report has merged reports, add them right after
      if (mergedGroupsMap.has(report.id)) {
        const mergedReports = mergedGroupsMap.get(report.id) || [];
        // Sort merged reports by date (newest first)
        mergedReports.sort((a, b) => {
          const getTime = (timestamp: any) => {
            if (timestamp instanceof Timestamp) return timestamp.toDate().getTime();
            if (timestamp?.seconds) return timestamp.seconds * 1000;
            if (timestamp instanceof Date) return timestamp.getTime();
            return 0;
          };
          
          const timeA = getTime(a.timestamp);
          const timeB = getTime(b.timestamp);
          
          return timeB - timeA; // Newest first
        });
        
        result.push(...mergedReports);
      }
    });
    
    return result;
  };

  const sortedIncidents = getSortedIncidents();
  
  // Pagination
  const totalPages = Math.ceil(sortedIncidents.length / REPORTS_PER_PAGE);
  const paginatedIncidents = sortedIncidents.slice(
    (currentPage - 1) * REPORTS_PER_PAGE, 
    currentPage * REPORTS_PER_PAGE
  );

  // Fetch incident types from database
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const incidentTypes = await getAllIncidentTypes();
        setCategories(incidentTypes);
      } catch (error) {
        console.error('Error fetching incident types:', error);
      }
    };
    fetchCategories();
  }, []);

  return (
    <div style={{ background: '#f5f6f8', minHeight: '100vh', width: '100vw', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: '2rem 0' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
          <input
            type="text"
            placeholder="Search by keywords"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 2, padding: '0.7rem 1rem', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}>
            <option value="">Status</option>
            <option value="New">New</option>
            <option value="In Progress">In Progress</option>
            <option value="Overdue">Overdue</option>
            <option value="Completed">Completed</option>
            <option value="Merged">Merged</option>
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}>
            <option value="">Category</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
          <select 
            value={dateSort} 
            onChange={e => setDateSort(e.target.value as SortOption)} 
            style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}
          >
            <option value="">Sort by Date</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Loading incidents...</div>
        ) : (
          <>
            <table style={{ width: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontWeight: 700, fontSize: 16 }}>
                  <th style={{ padding: '1rem 0.5rem' }}>Incident ID</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Time Remaining</th>
                  <th>Date Reported</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paginatedIncidents.map(inc => (
                  <tr key={inc.id} style={{ 
                    borderTop: '1px solid #f0f0f0', 
                    fontSize: 15,
                    background: inc.status === 'Merged' ? '#f9f9f9' : 'transparent', // Lighter background for merged reports
                  }}>
                    <td style={{ 
                      padding: '1rem 0.5rem',
                      paddingLeft: inc.status === 'Merged' ? '2rem' : '0.5rem' // Indent merged reports
                    }}>
                      {inc.status === 'Merged' && <span style={{ color: '#888', marginRight: '8px' }}>↳</span>}
                      {inc.id}
                    </td>
                    <td>{inc.incidentType}</td>
                    <td style={{ color: statusColors[inc.status], fontWeight: inc.status !== 'Completed' ? 600 : 400 }}>{inc.status}</td>
                    <td style={{ color: getSeverityColor(inc.severity), fontWeight: 600 }}>
                      {formatSeverity(inc.severity)}
                    </td>
                    <td style={{ 
                      color: inc.status === 'Overdue' ? '#e53935' : 
                            inc.status === 'Completed' ? '#43a047' : '#2ec4b6',
                      fontWeight: 600 
                    }}>
                      {getTimeRemaining(inc.deadline, inc.status)}
                    </td>
                    <td>{inc.dateReported}</td>
                    <td>
                      <button
                        style={{ background: '#2ec4b6', color: '#fff', border: 'none', borderRadius: 20, padding: '0.5rem 1.2rem', fontWeight: 500, cursor: 'pointer', fontSize: 15 }}
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
                {paginatedIncidents.length === 0 && !loading && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No incidents found.</td></tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      border: '1px solid #ddd',
                      background: '#fff',
                      cursor: currentPage === 1 ? 'default' : 'pointer',
                      opacity: currentPage === 1 ? 0.5 : 1
                    }}
                  >
                    Previous
                  </button>
                  
                  <div style={{ margin: '0 16px' }}>
                    Page {currentPage} of {totalPages}
                  </div>
                  
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      border: '1px solid #ddd',
                      background: '#fff',
                      cursor: currentPage === totalPages ? 'default' : 'pointer',
                      opacity: currentPage === totalPages ? 0.5 : 1
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Incidents; 