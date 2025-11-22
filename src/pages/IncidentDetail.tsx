import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import Footer from '../components/Footer';
import {
  formatDate,
  getTimeRemaining,
  statusColors,
  IncidentDetailData,
  getFlagReasonText,
  calculateDeadline,
  isOverdue,
  determineSeverityFromType,
  getSeverityColor
} from '../utils/incidentUtils';
import { FlagReportModal } from '../components/IncidentModals';
import { SeverityChangeModal } from '../components/SeverityChangeModal';
import SmartMergeAlert from '../components/SmartMergeAlert';
import RelatedReports from '../components/RelatedReports';
import ReporterBadge from '../components/ReporterBadge';
import {
  calculateIncidentPriority,
  updateReporterTrustOnVerification,
  updateReporterTrustOnFalseReport
} from '../utils/reporterUtils';
import { collection, query, where, getDocs } from 'firebase/firestore';

// Extend the IncidentDetailData interface locally to add isOverdue
interface ExtendedIncidentDetailData extends IncidentDetailData {
  isOverdue: boolean;
  timestamp?: any;
}

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
  const [reporterId, setReporterId] = useState<string | null>(null);
  const [reporterTrustLevel, setReporterTrustLevel] = useState<number | null>(null);
  const [showSeverityModal, setShowSeverityModal] = useState(false);
  const [pendingSeverity, setPendingSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical' | null>(null);

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

  useEffect(() => {
    const fetchReporterId = async () => {
      if (incident?.reporterEmail && !incident.isAnonymous) {
        // Query Firestore for reporter by email
        const reportersRef = collection(db, 'reporter');
        const q = query(reportersRef, where('email', '==', incident.reporterEmail));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          setReporterId(doc.id);
          setReporterTrustLevel(doc.data().trustLevel || 0);
        }
      }
    };
    fetchReporterId();
  }, [incident?.reporterEmail, incident?.isAnonymous]);

  const applySeverityChange = async (newSeverity: 'Low' | 'Medium' | 'High' | 'Critical') => {
    if (!incident || !id) return;
    try {
      const docRef = doc(db, 'reports', id);
      const newDeadline = calculateDeadline(incident.timestamp, newSeverity);
      if (!newDeadline) throw new Error('Could not calculate new deadline');

      await updateDoc(docRef, {
        severity: newSeverity,
        deadline: Timestamp.fromDate(newDeadline)
      });

      setIncident(prev => prev ? { ...prev, severity: newSeverity, deadline: newDeadline } : null);
    } catch (e) {
      console.error('Failed to update severity:', e);
    }
  };

  const handleSeverityChange = (newSeverity: 'Low' | 'Medium' | 'High' | 'Critical') => {
    if (!incident) return;
    if (newSeverity === incident.severity) return;
    setPendingSeverity(newSeverity);
    setShowSeverityModal(true);
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

  const handleUpdateIncidentProgress = () => {
    if (incident?.isAnonymous) {
      window.alert('Cannot update incident progress: The reporter is anonymous and cannot receive updates.');
      return;
    }
    navigate(`/incidents/${id}/chat`);
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: 40 }}>Loading...</div>;
  if (error) return <div style={{ textAlign: 'center', marginTop: 40, color: 'red' }}>{error}</div>;
  if (!incident) return null;

  const renderReporterInfo = () => (
    <div style={{ marginBottom: 10, fontSize: 17, display: 'flex', alignItems: 'center' }}>
      <b>Reporter:</b>
      <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center' }}>
        {incident?.isAnonymous ? 'Anonymous' : `${incident?.reporterName || 'N/A'} (${incident?.reporterEmail || 'N/A'})`}
        {!incident?.isAnonymous && reporterId && (
          <div style={{ marginLeft: 8 }}>
            <ReporterBadge reporterId={reporterId} trustLevel={reporterTrustLevel || undefined} showLabel={true} />
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
    <div style={{ background: '#f5f6f8', minHeight: '100vh', width: '100vw', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ paddingLeft: '2rem', marginTop: '0.5rem', marginBottom: '-0.5rem' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: 'none',
            color: '#222',
            fontSize: 28,
            cursor: 'pointer',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {'<'}
        </button>
      </div>
      <div style={{ flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0.7rem 0 3rem 0' }}>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '2rem 2.5rem', position: 'relative', marginLeft: 48 }}>
          <div style={{ position: 'absolute', right: 32, top: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 18 }}>Status</span>
            <span style={{ background: statusColors[incident.status], color: '#fff', borderRadius: 20, padding: '0.4rem 1.5rem', fontWeight: 600, fontSize: 18 }}>{incident.status}</span>

            {/* Flag Report Button */}
            <button
              onClick={() => setShowFlagModal(true)}
              style={{
                background: incident.flagged ? '#ffecb3' : 'transparent',
                border: '1px solid #ff9800',
                color: '#ff9800',
                borderRadius: 20,
                padding: '0.4rem 1rem',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
              disabled={flagging}
              title="Flag as suspicious or false report"
            >
              {incident.flagged ? '⚠️ Flagged' : '⚠️ Flag Report'}
            </button>
          </div>

          {/* Show flag status if flagged */}
          {incident.flagged && (
            <div style={{
              background: '#fff3e0',
              padding: '10px 15px',
              borderRadius: 6,
              marginBottom: 16,
              border: '1px solid #ffe0b2'
            }}>
              <div style={{ fontWeight: 600, color: '#e65100' }}>
                ⚠️ This report has been flagged as potentially suspicious
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>
                Reason: {getFlagReasonText(incident.flagReason || '')}
              </div>
            </div>
          )}

          {/* Smart Merge Alert */}
          {incident.status !== 'Merged' && incident.status !== 'Completed' && incident.latitude && incident.longitude && (
            <SmartMergeAlert
              currentIncidentId={incident.id}
              currentLatitude={incident.latitude}
              currentLongitude={incident.longitude}
              incidentType={incident.incidentType}
              currentDescription={incident.description}
              onMergeComplete={() => {
                // Refresh the incident data
                const fetchIncident = async () => {
                  const docRef = doc(db, 'reports', id!);
                  const docSnap = await getDoc(docRef);
                  if (docSnap.exists()) {
                    const d = docSnap.data();
                    setIncident(prev => prev ? { ...prev, ...d } : null);
                    setMergedReports(d.mergedReports || []);
                  }
                };
                fetchIncident();
              }}
            />
          )}

          {/* Display merged info at the top if this is a merged report */}
          {incident.status === 'Merged' && incident.mergedInto && (
            <div style={{
              background: '#f0f8ff',
              border: '1px solid #cce5ff',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              marginTop: 60
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#0062cc' }}>
                Merged into Report #{incident.mergedInto}
              </h4>
              <button
                onClick={() => navigate(`/incidents/${incident.mergedInto}`)}
                style={{
                  background: '#0069d9',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                View Merged Report
              </button>
            </div>
          )}

          {/* Display reports that were merged into this one if this is a main report */}
          {isMainReport && mergedReports.length > 0 && (
            <div style={{
              background: '#f0f8ff',
              border: '1px solid #cce5ff',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              marginTop: 60
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#0062cc' }}>
                Merged Reports ({mergedReports.length})
              </h4>
              <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '12px' }}>
                {mergedReports.map((report: any, index: number) => (
                  <div key={index} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: index < mergedReports.length - 1 ? '1px solid #e0e0e0' : 'none'
                  }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>Report #{report.id}</span>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Merged: {formatDate(report.mergedAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/incidents/${report.id}`)}
                      style={{
                        background: '#0069d9',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 18, display: 'flex', alignItems: 'center' }}>
            Incident #{incident.id}
            {renderPriorityIndicator()}
          </div>
          <div style={{ marginBottom: 10, fontSize: 17 }}>
            <b>Location:</b> {incident.locationInfo || incident.location || 'N/A'}
            {typeof incident.latitude === 'number' && typeof incident.longitude === 'number' && (
              <>
                <span style={{ marginLeft: 8, fontSize: 18, cursor: 'pointer' }}
                  title="View on Google Maps"
                  onClick={() => window.open(`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`, '_blank')}
                  role="button"
                >📍</span>
                <span style={{ marginLeft: 8, color: '#888', fontSize: 15 }}>
                  ({incident.latitude.toFixed(6)}, {incident.longitude.toFixed(6)})
                </span>
              </>
            )}
          </div>
          <div style={{ marginBottom: 10, fontSize: 17 }}>
            <b>Incident Type:</b> {incident.incidentType}
          </div>
          <div style={{ marginBottom: 10, fontSize: 17 }}>
            <b>Description:</b>
            <div style={{ marginTop: 4, fontWeight: 400 }}>{incident.description}</div>
          </div>
          <div style={{ marginBottom: 18, fontSize: 17 }}>
            <b>Uploaded Media:</b>
            <div style={{ marginTop: 8, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
              {incident.mediaUrls && incident.mediaUrls.length > 0 ? (
                incident.mediaUrls.map((url, idx) => {
                  const isVideo = /\.(mp4|webm|ogg)$/i.test(url);
                  return isVideo ? (
                    <video
                      key={idx}
                      src={url}
                      style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', cursor: 'pointer' }}
                      controls
                      onClick={() => window.open(url, '_blank')}
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <img
                      key={idx}
                      src={url}
                      alt={`Incident ${idx + 1}`}
                      style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', cursor: 'pointer' }}
                      onClick={() => window.open(url, '_blank')}
                    />
                  );
                })
              ) : (
                <div style={{ width: 100, height: 100, background: '#fafafa', border: '1px solid #eee', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>No Photo</div>
              )}
            </div>
            <div style={{ textAlign: 'center', marginTop: 4, color: '#888' }}>View Media</div>
          </div>
          <div style={{ marginBottom: 10, fontSize: 17 }}>
            <b>Contact:</b> {incident.contact}
          </div>
          <div style={{ marginBottom: 10, fontSize: 17 }}>
            <b>Severity:</b>
            <select
              value={normalizeSeverity(incident.severity)}
              onChange={(e) => handleSeverityChange(e.target.value as 'Low' | 'Medium' | 'High' | 'Critical')}
              style={{
                marginLeft: 8,
                padding: '0.3rem 1rem',
                borderRadius: 6,
                border: '1px solid #ddd',
                fontSize: 15,
                color: getSeverityColor(incident.severity),
                fontWeight: 600
              }}
            >
              <option value="Low" style={{ color: getSeverityColor('Low') }}>Low (7 days)</option>
              <option value="Medium" style={{ color: getSeverityColor('Medium') }}>Medium (5 days)</option>
              <option value="High" style={{ color: getSeverityColor('High') }}>High (3 days)</option>
              <option value="Critical" style={{ color: getSeverityColor('Critical') }}>Critical (1 day)</option>
            </select>
          </div>
          <div style={{ marginBottom: 18, fontSize: 17 }}>
            <b>Time Remaining:</b>
            <span style={{
              color: getTimeRemainingColor(),
              fontWeight: 600,
              marginLeft: 8
            }}>
              {getTimeRemaining(incident.deadline, incident.status, true)}
            </span>
          </div>

          {/* Time Elapsed section */}
          <div style={{ marginBottom: 18, fontSize: 17 }}>
            <b>Time Elapsed:</b>
            <span style={{
              fontWeight: 600,
              marginLeft: 8,
              color: '#0277bd'
            }}>
              {incident.status === 'Completed' && incident.completedAt
                ? (() => {
                  // Calculate time elapsed from report to completion
                  const startDate = incident.timestamp instanceof Timestamp
                    ? incident.timestamp.toDate()
                    : new Date(incident.timestamp.seconds * 1000);

                  const endDate = incident.completedAt instanceof Timestamp
                    ? incident.completedAt.toDate()
                    : new Date(incident.completedAt.seconds * 1000);

                  const diffMs = endDate.getTime() - startDate.getTime();
                  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                  if (days > 0) {
                    return `${days}d ${hours}h ${minutes}m`;
                  } else if (hours > 0) {
                    return `${hours}h ${minutes}m`;
                  } else if (minutes > 0) {
                    return `${minutes}m`;
                  } else {
                    return 'Less than 1 minute';
                  }
                })()
                : (() => {
                  // Calculate time elapsed from report until now
                  const startDate = incident.timestamp instanceof Timestamp
                    ? incident.timestamp.toDate()
                    : new Date(incident.timestamp.seconds * 1000);

                  const now = new Date();
                  const diffMs = now.getTime() - startDate.getTime();
                  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                  if (days > 0) {
                    return `${days}d ${hours}h ${minutes}m`;
                  } else if (hours > 0) {
                    return `${hours}h ${minutes}m`;
                  } else if (minutes > 0) {
                    return `${minutes}m`;
                  } else {
                    return 'Less than 1 minute';
                  }
                })()
              }
            </span>
          </div>

          {/* Show resolution time if incident is completed */}
          {incident.status === 'Completed' && incident.resolutionTimeFormatted && (
            <div style={{ marginBottom: 18, fontSize: 17 }}>
              <b>Resolution Time:</b>
              <span style={{
                color: '#43a047',
                fontWeight: 600,
                marginLeft: 8
              }}>
                {incident.resolutionTimeFormatted}
              </span>
            </div>
          )}

          {incident.status === 'Completed' && incident.completedAt && (
            <div style={{ marginBottom: 18, fontSize: 17 }}>
              <b>Date Resolved:</b>
              <span style={{
                fontWeight: 500,
                marginLeft: 8
              }}>
                {formatDate(incident.completedAt)}
              </span>
            </div>
          )}

          <div style={{ marginBottom: 10, fontSize: 17 }}>
            <b>Date Reported:</b> {incident.dateReported}
          </div>

          {/* Replace the existing reporter line with our new function */}
          {renderReporterInfo()}

          {/* Add Related Reports component */}
          {incident.latitude && incident.longitude && incident.status !== 'Merged' && (
            <div style={{ marginTop: 20, padding: '15px 0', borderTop: '1px solid #eaeaea' }}>
              <RelatedReports
                incidentId={incident.id}
                latitude={incident.latitude}
                longitude={incident.longitude}
                incidentType={incident.incidentType}
              />
            </div>
          )}

          <div style={{ marginTop: 30, display: 'flex', gap: 16 }}>
            <button
              onClick={handleUpdateIncidentProgress}
              style={{
                flex: 1,
                background: '#0277bd',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '14px',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              Update Progress
            </button>
            <button
              onClick={handleMarkAsCompleted}
              style={{
                flex: 1,
                background: '#2e7d32',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '14px',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              Mark as Resolved
            </button>
          </div>
        </div>
      </div>

      {/* Flag Report Modal */}
      <FlagReportModal
        isOpen={showFlagModal}
        onClose={() => setShowFlagModal(false)}
        onConfirm={handleFlagReport}
        isSubmitting={flagging}
      />

      {/* Severity Change Modal */}
      <SeverityChangeModal
        isOpen={showSeverityModal}
        onClose={() => setShowSeverityModal(false)}
        onConfirm={() => {
          if (pendingSeverity) {
            applySeverityChange(pendingSeverity);
            setShowSeverityModal(false);
          }
        }}
        currentSeverity={incident.severity}
        newSeverity={pendingSeverity || 'Low'}
        incident={incident}
      />

      <Footer />
    </div>
  );
};

export default IncidentDetail;