import React from 'react';
import { IncidentDetailData } from '../../utils/incidentUtils';
import { getSeverityColor, formatSeverity } from '../../utils/incidentUtils';
import ReporterBadge from '../ReporterBadge';

interface IncidentHeaderProps {
  incident: IncidentDetailData;
  onSeverityChange: (severity: 'Low' | 'Medium' | 'High' | 'Critical') => void;
}

const IncidentHeader: React.FC<IncidentHeaderProps> = ({ incident, onSeverityChange }) => {
  const severityColor = getSeverityColor(incident.severity);

  return (
    <div className="incident-header">
      <div className="incident-title-section">
        <h1>{incident.title}</h1>
        <div className="incident-meta">
          <span className="incident-id">#{incident.id}</span>
          <span className="incident-date">
            Reported on {new Date(incident.timestamp).toLocaleDateString()}
          </span>
        </div>
      </div>
      
      <div className="incident-status-section">
        <div className="severity-badge" style={{ backgroundColor: severityColor }}>
          {formatSeverity(incident.severity)}
        </div>
        <ReporterBadge reporterId={incident.reporterId} />
      </div>
    </div>
  );
};

export default IncidentHeader; 