import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IncidentDetailData } from '../../utils/incidentUtils';
import { getSeverityColor, formatSeverity, getTimeRemaining } from '../../utils/incidentUtils';

interface IncidentListProps {
  incidents: IncidentDetailData[];
  loading: boolean;
  error: string | null;
}

const IncidentList: React.FC<IncidentListProps> = ({ incidents, loading, error }) => {
  const navigate = useNavigate();

  if (loading) return <div className="loading">Loading incidents...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!incidents.length) return <div className="no-incidents">No incidents found</div>;

  return (
    <div className="incident-list">
      {incidents.map((incident) => (
        <div
          key={incident.id}
          className="incident-card"
          onClick={() => navigate(`/incidents/${incident.id}`)}
        >
          <div className="incident-header">
            <h3>{incident.title}</h3>
            <div className="incident-meta">
              <span className="incident-id">#{incident.id}</span>
              <span className="incident-date">
                {new Date(incident.timestamp).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="incident-details">
            <div className="detail-row">
              <span className="label">Location:</span>
              <span className="value">{incident.locationInfo || incident.location || 'N/A'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Type:</span>
              <span className="value">{incident.incidentType}</span>
            </div>
            <div className="detail-row">
              <span className="label">Status:</span>
              <span className={`status-badge ${incident.status.toLowerCase()}`}>
                {incident.status}
              </span>
            </div>
          </div>

          <div className="incident-footer">
            <div className="severity-badge" style={{ backgroundColor: getSeverityColor(incident.severity) }}>
              {formatSeverity(incident.severity)}
            </div>
            <div className="time-remaining">
              {getTimeRemaining(incident.timestamp, incident.deadline, incident.status, true)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default IncidentList; 