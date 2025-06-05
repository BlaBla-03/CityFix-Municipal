import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../utils/incidentUtils';
import ReporterBadge from './ReporterBadge';

interface IncidentTimelineProps {
  maxItems?: number;
  incidentType?: string;
  municipalId?: string;
  filterByStatus?: string[];
  includeCompleted?: boolean;
}

interface TimelineItem {
  id: string;
  type: 'reported' | 'updated' | 'resolved' | 'merged';
  timestamp: any;
  title: string;
  description?: string;
  incidentId: string;
  reporterEmail?: string;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical';
}

const IncidentTimeline: React.FC<IncidentTimelineProps> = ({ 
  maxItems = 10,
  incidentType,
  municipalId,
  filterByStatus,
  includeCompleted = true
}) => {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTimelineData = async () => {
      try {
        // Create query for reports collection
        let reportsQuery = query(
          collection(db, 'reports'),
          orderBy('timestamp', 'desc'),
          limit(maxItems * 2) // Fetch more than needed to account for filtering
        );
        
        // Apply incident type filter if provided
        if (incidentType) {
          reportsQuery = query(reportsQuery, where('incidentType', '==', incidentType));
        }
        
        // Apply municipal filter if provided
        if (municipalId) {
          reportsQuery = query(reportsQuery, where('municipal', '==', municipalId));
        }
        
        // Apply status filter if provided
        if (filterByStatus && filterByStatus.length > 0) {
          reportsQuery = query(reportsQuery, where('reportState', 'in', filterByStatus));
        }
        
        // Fetch reports
        const querySnapshot = await getDocs(reportsQuery);
        
        // Process timeline items
        const items: TimelineItem[] = [];
        
        querySnapshot.forEach(doc => {
          const data = doc.data();
          
          // Add report creation event
          items.push({
            id: `${doc.id}-reported`,
            type: 'reported',
            timestamp: data.timestamp,
            title: `New ${data.incidentType} reported`,
            description: data.description?.substring(0, 100) + (data.description?.length > 100 ? '...' : ''),
            incidentId: doc.id,
            reporterEmail: data.reporterEmail,
            severity: data.severity
          });
          
          // Add resolution event if completed
          if (includeCompleted && data.reportState === 'Completed' && data.completedAt) {
            items.push({
              id: `${doc.id}-resolved`,
              type: 'resolved',
              timestamp: data.completedAt,
              title: `${data.incidentType} resolved`,
              description: `Resolved in ${data.resolutionTimeFormatted || 'unknown time'}`,
              incidentId: doc.id
            });
          }
          
          // Add merge event if merged
          if (data.reportState === 'Merged' && data.mergedAt && data.mergedInto) {
            items.push({
              id: `${doc.id}-merged`,
              type: 'merged',
              timestamp: data.mergedAt,
              title: `Report merged`,
              description: `Merged into report #${data.mergedInto}`,
              incidentId: doc.id
            });
          }
        });
        
        // Sort all timeline items by timestamp descending (newest first)
        items.sort((a, b) => {
          const timeA = a.timestamp?.seconds ? a.timestamp.seconds : 0;
          const timeB = b.timestamp?.seconds ? b.timestamp.seconds : 0;
          return timeB - timeA;
        });
        
        // Limit to maxItems
        setTimelineItems(items.slice(0, maxItems));
        
      } catch (error) {
        console.error('Error fetching timeline data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTimelineData();
  }, [maxItems, incidentType, municipalId, filterByStatus, includeCompleted]);

  const getTimelineIcon = (type: string) => {
    switch (type) {
      case 'reported':
        return '📝';
      case 'updated':
        return '🔄';
      case 'resolved':
        return '✅';
      case 'merged':
        return '🔗';
      default:
        return '•';
    }
  };
  
  const getTimelineColor = (type: string) => {
    switch (type) {
      case 'reported':
        return '#2196f3';
      case 'updated':
        return '#ff9800';
      case 'resolved':
        return '#4caf50';
      case 'merged':
        return '#9c27b0';
      default:
        return '#757575';
    }
  };
  
  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'Critical':
        return '#d32f2f';
      case 'High':
        return '#f44336';
      case 'Medium':
        return '#ff9800';
      case 'Low':
        return '#4caf50';
      default:
        return undefined;
    }
  };

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center' }}>Loading timeline...</div>;
  }

  if (timelineItems.length === 0) {
    return <div style={{ padding: 16, textAlign: 'center', color: '#666' }}>No recent incidents to display.</div>;
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <h3 style={{ margin: '8px 0 16px', fontSize: 18 }}>Recent Activity</h3>
      <div style={{ position: 'relative' }}>
        {/* Timeline line */}
        <div style={{ 
          position: 'absolute', 
          left: 16, 
          top: 0, 
          bottom: 0, 
          width: 2, 
          background: '#e0e0e0',
          zIndex: 1
        }}></div>
        
        {timelineItems.map((item) => (
          <div 
            key={item.id}
            style={{ 
              position: 'relative',
              marginBottom: 20,
              paddingLeft: 50,
              cursor: 'pointer'
            }}
            onClick={() => navigate(`/incidents/${item.incidentId}`)}
          >
            {/* Timeline node */}
            <div style={{ 
              position: 'absolute',
              left: 8,
              top: 0,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: getTimelineColor(item.type),
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              zIndex: 2,
              border: '2px solid white',
            }}>
              {getTimelineIcon(item.type)}
            </div>
            
            {/* Content */}
            <div 
              style={{ 
                borderRadius: 8,
                padding: 16,
                background: '#f5f5f5',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'transform 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ 
                    fontWeight: 600, 
                    fontSize: 16, 
                    color: item.severity ? getSeverityColor(item.severity) : undefined 
                  }}>
                    {item.title}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: 14, marginTop: 4, color: '#555' }}>
                      {item.description}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#666', marginLeft: 8 }}>
                  {formatDate(item.timestamp)}
                </div>
              </div>
              
              {/* Reporter badge for reported items */}
              {item.type === 'reported' && item.reporterEmail && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, marginRight: 6, color: '#666' }}>Reported by:</div>
                  <ReporterBadge reporterId={item.reporterEmail} size="small" showLabel={false} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IncidentTimeline; 