import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, getDocs, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';
import { calculateDistance, formatDate } from '../utils/incidentUtils';
import { MergeModal } from './IncidentModals';

interface RelatedReportProps {
  incidentId: string;
  latitude?: number;
  longitude?: number;
  incidentType: string;
}

const RelatedReports: React.FC<RelatedReportProps> = ({ incidentId, latitude, longitude, incidentType }) => {
  const [relatedReports, setRelatedReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllReports, setShowAllReports] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [currentReport, setCurrentReport] = useState<any>(null);
  const navigate = useNavigate();

  // Function to check if two descriptions are similar
  const checkDescriptionSimilarity = (desc1: string = '', desc2: string = ''): boolean => {
    if (!desc1 || !desc2) return false;
    
    // Convert to lowercase and remove punctuation for better comparison
    const cleanDesc1 = desc1.toLowerCase().replace(/[^\w\s]/g, '');
    const cleanDesc2 = desc2.toLowerCase().replace(/[^\w\s]/g, '');
    
    // Check for direct substring match
    if (cleanDesc1.includes(cleanDesc2) || cleanDesc2.includes(cleanDesc1)) {
      return true;
    }
    
    // Check for word matches (at least 50% of words should match)
    const words1 = cleanDesc1.split(/\s+/).filter(w => w.length > 3); // Only consider words longer than 3 chars
    const words2 = cleanDesc2.split(/\s+/).filter(w => w.length > 3);
    
    if (words1.length === 0 || words2.length === 0) return false;
    
    let matchCount = 0;
    for (const word of words1) {
      if (words2.includes(word)) {
        matchCount++;
      }
    }
    
    // Calculate match percentage based on shorter description's word count
    const minWordCount = Math.min(words1.length, words2.length);
    const matchPercent = (matchCount / minWordCount) * 100;
    
    return matchPercent >= 30; // Consider similar if 30% or more words match
  };

  useEffect(() => {
    const fetchRelatedReports = async () => {
      if (!latitude || !longitude) {
        setLoading(false);
        return;
      }

      try {
        // Fetch the current report first
        const currentDocRef = doc(db, 'reports', incidentId);
        const currentDocSnap = await getDoc(currentDocRef);
        if (currentDocSnap.exists()) {
          setCurrentReport({
            id: incidentId,
            ...currentDocSnap.data()
          });
        }

        // Get the current report's description
        const currentDescription = currentDocSnap.exists() ? currentDocSnap.data().description : '';

        // Query ALL reports for potential matches
        const reportsRef = collection(db, 'reports');
        const querySnapshot = await getDocs(reportsRef);
        
        const reports: any[] = [];
        querySnapshot.forEach(doc => {
          const data = doc.data();
          // Skip if it's the current incident, doesn't have location data, or is merged
          if (doc.id === incidentId || !data.latitude || !data.longitude || data.reportState === 'Merged') return;
          
          // Calculate distance
          const distance = calculateDistance(
            latitude, 
            longitude,
            data.latitude,
            data.longitude
          );
          
          // Check if incident types match
          const typeMatches = data.incidentType === incidentType;
          
          // Check if descriptions are similar
          const descriptionMatches = checkDescriptionSimilarity(currentDescription, data.description);
          
          // Consider it related if:
          // 1. Within 100 meters AND (types match OR descriptions are similar)
          if (distance <= 100 && (typeMatches || descriptionMatches)) {
            reports.push({
              id: doc.id,
              distance,
              typeMatches,
              descriptionMatches,
              ...data,
              formattedDistance: distance < 1000 
                ? `${Math.round(distance)}m`
                : `${(distance / 1000).toFixed(1)}km`
            });
          }
        });
        
        // Sort by distance
        reports.sort((a, b) => a.distance - b.distance);
        setRelatedReports(reports);
        
        console.log(`Found ${reports.length} related reports within 100m`);
      } catch (error) {
        console.error("Error fetching related reports:", error);
      }
      
      setLoading(false);
    };

    fetchRelatedReports();
  }, [incidentId, latitude, longitude, incidentType]);

  const handleMergeClick = (e: React.MouseEvent, report: any) => {
    e.stopPropagation(); // Prevent navigation when clicking the merge button
    setSelectedReport(report);
    setIsMerging(true);
  };

  const confirmMerge = async () => {
    if (!selectedReport || !currentReport) return;
    
    try {
      // Reference to both documents
      const targetDocRef = doc(db, 'reports', selectedReport.id);
      const currentDocRef = doc(db, 'reports', incidentId);
      
      // Get current data for both documents
      const targetDoc = await getDoc(targetDocRef);
      const currentDoc = await getDoc(currentDocRef);
      
      if (!targetDoc.exists() || !currentDoc.exists()) {
        alert("One of the reports no longer exists.");
        setIsMerging(false);
        return;
      }
      
      const targetData = targetDoc.data();
      const currentData = currentDoc.data();
      
      // Prepare updates for target document
      const updates: any = {
        // Add reference to merged report
        mergedReports: arrayUnion({
          id: incidentId,
          timestamp: currentData.timestamp,
          mergedAt: new Date()
        }),
        
        // Combine media URLs (if they exist)
        mediaUrls: [
          ...(targetData.mediaUrls || []), 
          ...(currentData.mediaUrls || [])
        ],
        
        // Add note about merged report to description
        description: `${targetData.description || ''}\n\n--- Merged from report #${incidentId} ---\n${currentData.description || ''}`
      };
      
      // Update target document with merged data
      await updateDoc(targetDocRef, updates);
      
      // Mark current document as merged
      await updateDoc(currentDocRef, {
        reportState: 'Merged',
        mergedInto: selectedReport.id,
        mergedAt: new Date()
      });
      
      alert("Reports merged successfully! Redirecting to the target report.");
      
      // Navigate to the target incident
      navigate(`/incidents/${selectedReport.id}`);
    } catch (error) {
      console.error("Error merging reports:", error);
      alert("Failed to merge reports. Please try again.");
    }
    
    setIsMerging(false);
  };

  if (loading) return <div>Loading related reports...</div>;
  
  if (relatedReports.length === 0) {
    return <div style={{ marginBottom: 20, fontSize: 17 }}>
      <b>No same issue nearby.</b>
      <p style={{ color: '#666', fontStyle: 'italic', marginTop: 4 }}>
        There are no similar reports within 100 meters of this location.
      </p>
    </div>;
  }

  const reportsToShow = showAllReports ? relatedReports : relatedReports.slice(0, 3);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10 }}>
        Similar Reports Nearby ({relatedReports.length})
      </div>
      
      {reportsToShow.map(report => (
        <div 
          key={report.id}
          style={{ 
            padding: 12, 
            border: '1px solid #eaeaea', 
            borderRadius: 8, 
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}
          onClick={() => navigate(`/incidents/${report.id}`)}
        >
          <div>
            <div style={{ fontWeight: 600 }}>#{report.id.slice(-6)}</div>
            <div style={{ fontSize: 14, color: '#666' }}>{report.incidentType}</div>
            <div style={{ fontSize: 13, color: '#999', marginTop: 2 }}>
              {report.description?.substring(0, 50)}{report.description?.length > 50 ? '...' : ''}
            </div>
            
            {/* Show match indicators */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {report.typeMatches && (
                <span style={{ 
                  fontSize: 11, 
                  background: '#e8f5e9', 
                  color: '#2e7d32',
                  padding: '2px 6px',
                  borderRadius: 10
                }}>
                  Type Match
                </span>
              )}
              {report.descriptionMatches && (
                <span style={{ 
                  fontSize: 11, 
                  background: '#e3f2fd', 
                  color: '#1565c0',
                  padding: '2px 6px',
                  borderRadius: 10
                }}>
                  Description Match
                </span>
              )}
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ 
              background: '#e1f5fe', 
              color: '#0288d1',
              fontSize: 13, 
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: 12,
              marginBottom: 4
            }}>
              {report.formattedDistance} away
            </div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
              {formatDate(report.timestamp)}
            </div>
            <button
              onClick={(e) => handleMergeClick(e, report)}
              style={{
                padding: '4px 12px',
                background: '#ffebee',
                color: '#d32f2f',
                border: 'none',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Merge
            </button>
          </div>
        </div>
      ))}
      
      {relatedReports.length > 3 && !showAllReports && (
        <div 
          style={{ textAlign: 'center', fontSize: 15, color: '#0288d1', cursor: 'pointer', padding: '8px 0' }}
          onClick={() => setShowAllReports(true)}
        >
          View all {relatedReports.length} similar reports
        </div>
      )}
      
      {showAllReports && (
        <div 
          style={{ textAlign: 'center', fontSize: 15, color: '#0288d1', cursor: 'pointer', padding: '8px 0' }}
          onClick={() => setShowAllReports(false)}
        >
          Show fewer reports
        </div>
      )}
      
      <MergeModal
        isOpen={isMerging}
        targetReport={selectedReport}
        currentReport={currentReport}
        onClose={() => setIsMerging(false)}
        onConfirm={confirmMerge}
      />
    </div>
  );
};

export default RelatedReports; 