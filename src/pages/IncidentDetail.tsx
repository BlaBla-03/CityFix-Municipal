import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import Footer from '../components/Footer';
import { getSeverityConfig } from '../config/severityConfig';
import { 
  formatDate, 
  getTimeRemaining, 
  statusColors, 
  severityColors, 
  FALLBACK_TIMEFRAMES,
  IncidentDetailData,
  getFlagReasonText,
  calculateDeadline,
  isOverdue,
  determineSeverityFromType,
  getSeverityColor,
  formatSeverity
} from '../utils/incidentUtils';
import { FlagReportModal } from '../components/IncidentModals';
import RelatedReports from '../components/RelatedReports';
import ReporterBadge from '../components/ReporterBadge';
import { 
  calculateIncidentPriority, 
  updateReporterTrustOnVerification,
  updateReporterTrustOnFalseReport 
} from '../utils/reporterUtils';
import IncidentHeader from '../components/incident-detail/IncidentHeader';
import IncidentActions from '../components/incident-detail/IncidentActions';
import IncidentStatus from '../components/incident-detail/IncidentStatus';
import '../styles/incident-detail.css';

// Extend the IncidentDetailData interface locally to add isOverdue
interface ExtendedIncidentDetailData extends IncidentDetailData {
  isOverdue: boolean;
  timestamp?: any;
}

// Add a confirmation dialog before changing severity
const confirmSeverityChange = async (
  currentSeverity: string, 
  newSeverity: 'Low' | 'Medium' | 'High' | 'Critical',
  incident: ExtendedIncidentDetailData,
  id: string,
  callback: () => void
) => {
  try {
    // Get the actual current time remaining
    const currentTimeRemaining = getTimeRemaining(incident.timestamp, incident.deadline, incident.status, true);
    
    // Calculate what the new time remaining would be
    const docRef = doc(db, 'reports', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error("Document doesn't exist");
    }
    
    const data = docSnap.data();
    
    // Calculate new deadline based on severity
    const newDeadline = calculateDeadline(data.timestamp, newSeverity);
    
    if (!newDeadline) {
      throw new Error("Could not calculate new deadline");
    }
    
    // Get the time remaining that would be set
    const newTimeRemaining = getTimeRemaining(data.timestamp, newDeadline, incident.status, true);
    
    // Get timeframe descriptions for clarity
    const SEVERITY_DESCRIPTIONS = {
      'Low': 'Low priority (7 days)',
      'Medium': 'Medium priority (5 days)',
      'High': 'High priority (3 days)',
      'Critical': 'Critical priority (1 day)'
    };
    
    const message = `You are changing the severity from ${SEVERITY_DESCRIPTIONS[currentSeverity as keyof typeof SEVERITY_DESCRIPTIONS]} to ${SEVERITY_DESCRIPTIONS[newSeverity as keyof typeof SEVERITY_DESCRIPTIONS]}.

Current time remaining: ${currentTimeRemaining}
New time remaining will be: ${newTimeRemaining}

Do you want to continue?`;

    if (window.confirm(message)) {
      callback();
    }
  } catch (error) {
    console.error("Error preparing severity change confirmation:", error);
    // Fall back to simple confirmation if there's an error
    if (window.confirm(`Change severity from ${currentSeverity} to ${newSeverity}?`)) {
      callback();
    }
  }
};

// Add this helper function near the top of the component
const normalizeSeverity = (severity: string) => {
  if (!severity) return "Low";
  const s = severity.trim().toLowerCase();
  if (s === "low") return "Low";
  if (s === "medium") return "Medium";
  if (s === "high") return "High";
  if (s === "critical") return "Critical";
  return "Low";
};

const IncidentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<ExtendedIncidentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [reporterData] = useState<any>(null);
  const [incidentPriority, setIncidentPriority] = useState<number | null>(null);
  const [mergedReports, setMergedReports] = useState<any[]>([]);
  const [isMainReport, setIsMainReport] = useState(false);
  const [isStaff] = useState(true); // This should come from your auth context

  useEffect(() => {
    const fetchIncident = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const docRef = doc(db, 'reports', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const d = docSnap.data();
          
          // Log the incident data for debugging
          console.log('Initial incident data:', {
            id: docSnap.id,
            timestamp: d.timestamp,
            deadline: d.deadline,
            severity: d.severity,
            reportState: d.reportState,
            isOverdue: d.isOverdue
          });

          // Set severity based on incident type if it's not already set
          // Or if we're forcing severity based on type (uncomment the next line to enforce type-based severity)
          // const shouldUpdateSeverity = true;
          const shouldUpdateSeverity = !d.severity || d.severity === 'Low'; // Only update if not set or default Low
          
          let severity = d.severity || 'Low';
          if (shouldUpdateSeverity && d.incidentType) {
            try {
              // Get severity based on incident type
              const typeSeverity = await determineSeverityFromType(d.incidentType);
              console.log('determineSeverityFromType returned:', typeSeverity);
              if (typeSeverity !== severity) {
                severity = typeSeverity;
                console.log(`Setting severity to ${severity} based on incident type: ${d.incidentType}`);
              }
            } catch (error) {
              console.error('Error determining severity from type:', error);
            }
          }
          console.log('Final severity to set in state:', severity);
          
          // Always recalculate deadline using current timeframe values and potentially updated severity
          const deadline = calculateDeadline(d.timestamp, severity);
          let needsUpdate = false;
          
          // Determine if deadline or severity needs update
          if (severity !== d.severity) {
            needsUpdate = true;
          }
          
          // Determine if deadline needs update
          if (deadline && d.deadline) {
            let existingDeadlineDate: Date | null = null;
            if (d.deadline instanceof Timestamp) {
              existingDeadlineDate = d.deadline.toDate();
            } else if (d.deadline.seconds) {
              existingDeadlineDate = new Date(d.deadline.seconds * 1000);
            }
            
            if (existingDeadlineDate && 
                Math.abs(existingDeadlineDate.getTime() - deadline.getTime()) > 60 * 60 * 1000) {
              needsUpdate = true;
              console.log('Deadline needs update:', {
                old: existingDeadlineDate.toISOString(),
                new: deadline.toISOString()
              });
            }
          } else if (deadline) {
            needsUpdate = true;
          }
          
          // Check if incident should be marked as overdue
          let status = d.reportState || 'New';
          
          // Calculate the actual overdue state
          const shouldBeOverdue = isOverdue(deadline, status);
          
          // Apply overdue status logic with new rules:
          // 1. Never mark completed/merged incidents as overdue
          // 2. Respect any manual override of isOverdue from the database
          let isOverdueFlag = false;
          if (status !== 'Completed' && status !== 'Merged') {
            isOverdueFlag = shouldBeOverdue;
            
            // If overdue state changed, update the database
            if (d.isOverdue !== shouldBeOverdue) {
              needsUpdate = true;
            }
            
            // If overdue, also update the status
            if (shouldBeOverdue && status !== 'Overdue') {
              status = 'Overdue';
              needsUpdate = true;
            } else if (!shouldBeOverdue && status === 'Overdue') {
              status = 'In Progress';
              needsUpdate = true;
            }
          }
          
          // Update document if needed
          if (needsUpdate) {
            const updates: any = {
              isOverdue: isOverdueFlag,
              reportState: status
            };
            
            // Update severity only if it changed
            if (severity !== d.severity) {
              updates.severity = severity;
            }
            
            // Update deadline only if it changed
            if (deadline) {
              updates.deadline = Timestamp.fromDate(deadline);
            }
            
            await updateDoc(docRef, updates);
            console.log('Updated incident with:', updates);
          }
          
          // Fetch reporter data if available
          if (d.reporterEmail) {
            // ... existing code for fetching reporter ...
          }
          
          // Always update local state with the correct severity
          const incidentData: ExtendedIncidentDetailData = {
            id: docSnap.id,
            location: d.location || '',
            locationInfo: d.locationInfo || '',
            latitude: d.latitude,
            longitude: d.longitude,
            incidentType: d.incidentType || '',
            description: d.description || '',
            photos: d.photos || [],
            mediaUrls: d.mediaUrls || [],
            contact: d.contact || '',
            severity: severity, // Use potentially updated severity
            deadline: deadline || d.timestamp,
            status: status,
            dateReported: formatDate(d.timestamp),
            reporterName: d.reporterName || '',
            reporterEmail: d.reporterEmail || '',
            isAnonymous: d.isAnonymous,
            resolutionTimeHours: d.resolutionTimeHours,
            resolutionTimeFormatted: d.resolutionTimeFormatted,
            completedAt: d.completedAt,
            flagged: d.flagged,
            flagReason: d.flagReason,
            flagNotes: d.flagNotes,
            flagStatus: d.flagStatus,
            mergedInto: d.mergedInto,
            isOverdue: isOverdueFlag,
            timestamp: d.timestamp
          };
          setIncident(incidentData);

          // Check if this is a main report with merged sub-reports
          const mergedRpts = d.mergedReports || [];
          setMergedReports(mergedRpts);
          setIsMainReport(mergedRpts.length > 0);

          // Update status to "In Progress" if it's "New"
          if (incidentData.status === 'New') {
            await updateDoc(docRef, {
              reportState: 'In Progress',
              lastViewed: new Date()
            });
            setIncident(prev => prev ? { ...prev, status: 'In Progress' } : null);
          }
        } else {
          setError('Incident not found.');
        }
      } catch (e) {
        setError('Failed to load incident.');
      }
      setLoading(false);
    };
    fetchIncident();
  }, [id]);

  // Additional effect to calculate priority based on reporter trust level
  useEffect(() => {
    if (incident?.severity && reporterData?.trustLevel) {
      const priority = calculateIncidentPriority(reporterData.trustLevel, incident.severity);
      setIncidentPriority(priority);
    }
  }, [incident?.severity, reporterData?.trustLevel]);

  // Modify the severity change handler to use the confirmation dialog
  const handleSeverityChange = async (newSeverity: 'Low' | 'Medium' | 'High' | 'Critical') => {
    if (!id || !incident) return;
    
    // Only show the prompt if severity is actually changing
    if (newSeverity === incident.severity) return;
    
    confirmSeverityChange(
      incident.severity, 
      newSeverity, 
      incident, 
      id,
      async () => {
        try {
          const docRef = doc(db, 'reports', id);
          
          // Calculate new deadline based on severity
          const newDeadline = calculateDeadline(incident.timestamp, newSeverity);
          
          if (!newDeadline) {
            throw new Error("Could not calculate new deadline");
          }
          
          // Update Firestore
          await updateDoc(docRef, {
            severity: newSeverity,
            deadline: Timestamp.fromDate(newDeadline)
          });
          
          // Update local state
          setIncident(prev => {
            if (!prev) return null;
            return { 
              ...prev, 
              severity: newSeverity,
              deadline: newDeadline
            };
          });
          
          console.log(`Severity changed to ${newSeverity}, new deadline set to: ${newDeadline.toISOString()}`);
        } catch (error) {
          console.error('Failed to update severity:', error);
        }
      }
    );
  };

  const handleMarkAsCompleted = async () => {
    if (!id || !incident) return;
    try {
      const docRef = doc(db, 'reports', id);
      
      // Fetch the latest data to ensure we have accurate timestamps
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        throw new Error('Incident not found');
      }
      
      const incidentData = docSnap.data();
      const startTime = incidentData.timestamp;
      const endTime = new Date();
      
      // Calculate resolution time in hours
      let resolutionTimeHours = 0;
      let resolutionTimeFormatted = '';
      
      if (startTime) {
        let startDate: Date;
        if (startTime instanceof Timestamp) {
          startDate = startTime.toDate();
        } else if (startTime.seconds) {
          startDate = new Date(startTime.seconds * 1000);
        } else {
          startDate = new Date(startTime);
        }
        
        // Calculate difference in milliseconds
        const diffMs = endTime.getTime() - startDate.getTime();
        // Convert to hours (including fractional part)
        resolutionTimeHours = diffMs / (1000 * 60 * 60);
        
        // Format for display - consistent with time remaining format (days first)
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        // Create a properly formatted time string with days first
        if (days > 0) {
          if (hours > 0 && minutes > 0) {
            resolutionTimeFormatted = `${days}d ${hours}h ${minutes}m`;
          } else if (hours > 0) {
            resolutionTimeFormatted = `${days}d ${hours}h`;
          } else {
            resolutionTimeFormatted = `${days}d`;
          }
        } else if (hours > 0) {
          if (minutes > 0) {
            resolutionTimeFormatted = `${hours}h ${minutes}m`;
          } else {
            resolutionTimeFormatted = `${hours}h`;
          }
        } else if (minutes > 0) {
          resolutionTimeFormatted = `${minutes}m`;
        } else {
          resolutionTimeFormatted = 'Less than 1 minute';
        }
        
        console.log('Resolution time:', {
          startDate,
          endTime,
          diffMs,
          resolutionTimeHours,
          resolutionTimeFormatted
        });
      }
      
      // Update with resolution information and ensure not marked as overdue
      await updateDoc(docRef, {
        reportState: 'Completed',
        isOverdue: false, // Explicitly set overdue to false when completing
        completedAt: endTime,
        resolutionTimeHours,
        resolutionTimeFormatted
      });
      
      setIncident(prev => prev ? { 
        ...prev, 
        status: 'Completed',
        isOverdue: false, // Update local state too
        resolutionTimeHours,
        resolutionTimeFormatted
      } : null);
      
      // Update reporter trust level since the report is now verified
      if (!incidentData.isAnonymous && incidentData.reporterEmail) {
        try {
          const success = await updateReporterTrustOnVerification(incidentData.reporterEmail);
          console.log('Reporter trust level update on verification:', success ? 'successful' : 'failed');
        } catch (error) {
          console.error('Error updating reporter trust level:', error);
        }
      }
      
      alert(`Incident has been marked as resolved successfully! Resolution time: ${resolutionTimeFormatted}`);
    } catch (error) {
      console.error('Failed to mark incident as completed:', error);
      alert('Failed to mark incident as completed. Please try again.');
    }
  };

  const handleFlagReport = async (reason: string, notes: string) => {
    if (!id || !incident) return;
    
    setFlagging(true);
    try {
      const docRef = doc(db, 'reports', id);
      
      // Get the current data to access reporter information
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        throw new Error('Incident not found');
      }
      
      const incidentData = docSnap.data();
      
      // Update the report with flagged status
      await updateDoc(docRef, {
        flagged: true,
        flaggedAt: new Date(),
        flagReason: reason,
        flagNotes: notes,
        flagStatus: 'pending_review'  // Could be 'pending_review', 'confirmed_false', 'legitimate'
      });
      
      // Update local state
      setIncident(prev => prev ? {
        ...prev,
        flagged: true,
        flagReason: reason
      } : null);
      
      // Update reporter trust level if this is confirmed as a false report
      if (reason === 'false_report' && !incidentData.isAnonymous && incidentData.reporterEmail) {
        try {
          const success = await updateReporterTrustOnFalseReport(incidentData.reporterEmail);
          console.log('Reporter trust level update on false report:', success ? 'successful' : 'failed');
        } catch (error) {
          console.error('Error updating reporter trust level:', error);
        }
      }
      
      setShowFlagModal(false);
      alert("Report has been flagged for review by administrators.");
    } catch (error) {
      console.error("Error flagging report:", error);
      alert("Failed to flag report. Please try again.");
    }
    setFlagging(false);
  };

  // Add a helper function to determine the time remaining color
  const getTimeRemainingColor = () => {
    if (!incident) return '#2ec4b6'; // default color
    
    // Use type assertion to help TypeScript understand the comparison
    const status = incident.status as string;
    
    if (status === 'Completed') {
      return '#43a047'; // green for completed
    }
    
    if (status === 'Overdue') {
      return '#e53935'; // red for overdue
    }
    
    return '#2ec4b6'; // default teal color
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: 40 }}>Loading...</div>;
  if (error) return <div style={{ textAlign: 'center', marginTop: 40, color: 'red' }}>{error}</div>;
  if (!incident) return null;

  // Update the render method where the reporter info is displayed
  // Replace the reporter info line with this:
  const renderReporterInfo = () => (
    <div style={{ marginBottom: 10, fontSize: 17, display: 'flex', alignItems: 'center' }}>
      <b>Reporter:</b> 
      <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center' }}>
        {incident?.isAnonymous ? 'Anonymous' : `${incident?.reporterName || 'N/A'} (${incident?.reporterEmail || 'N/A'})`}
        {!incident?.isAnonymous && incident?.reporterEmail && (
          <div style={{ marginLeft: 8 }}>
            <ReporterBadge reporterId={incident.reporterEmail} showLabel={true} />
          </div>
        )}
      </div>
    </div>
  );

  // Add priority indicator to the incident header
  const renderPriorityIndicator = () => {
    if (incidentPriority === null) return null;
    
    const getPriorityColor = () => {
      if (incidentPriority >= 90) return '#d32f2f'; // Very high (red)
      if (incidentPriority >= 70) return '#f44336'; // High (light red)
      if (incidentPriority >= 50) return '#ff9800'; // Medium (orange)
      if (incidentPriority >= 30) return '#ffc107'; // Low-medium (amber)
      return '#8bc34a'; // Low (light green)
    };
    
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginLeft: 16 
      }}>
        <div style={{ 
          width: 10, 
          height: 10, 
          borderRadius: '50%', 
          background: getPriorityColor(),
          marginRight: 6
        }}></div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>
          Priority: {incidentPriority}%
        </div>
      </div>
    );
  };

  return (
    <div className="incident-detail-page">
      <IncidentHeader
        incident={incident}
        onSeverityChange={handleSeverityChange}
      />
      
      <IncidentStatus incident={incident} />
      
      <IncidentActions
        incident={incident}
        onMarkAsCompleted={handleMarkAsCompleted}
        onFlagReport={() => setShowFlagModal(true)}
        onMergeReport={() => {/* Implement merge functionality */}}
        isStaff={isStaff}
      />
      
      <RelatedReports incidentId={id} />
      
      {showFlagModal && (
        <FlagReportModal
          onClose={() => setShowFlagModal(false)}
          onFlag={handleFlagReport}
          isFlagging={flagging}
        />
      )}
      
      <Footer />
    </div>
  );
};

export default IncidentDetail; 