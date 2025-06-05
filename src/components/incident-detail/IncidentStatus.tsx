import React from 'react';
import { IncidentDetailData } from '../../utils/incidentUtils';
import { getTimeRemaining, isOverdue } from '../../utils/incidentUtils';

interface IncidentStatusProps {
  incident: IncidentDetailData;
}

const IncidentStatus: React.FC<IncidentStatusProps> = ({ incident }) => {
  const timeRemaining = getTimeRemaining(
    incident.timestamp,
    incident.deadline,
    incident.status,
    true
  );

  const isOverdueStatus = isOverdue(incident.deadline, incident.status);

  return (
    <div className="incident-status">
      <div className="status-section">
        <h3>Status</h3>
        <div className={`status-badge ${incident.status.toLowerCase()}`}>
          {incident.status}
        </div>
      </div>

      <div className="timeline-section">
        <h3>Timeline</h3>
        <div className="timeline-info">
          <div className="time-remaining">
            <span className="label">Time Remaining:</span>
            <span className={`value ${isOverdueStatus ? 'overdue' : ''}`}>
              {timeRemaining}
            </span>
          </div>
          <div className="deadline">
            <span className="label">Deadline:</span>
            <span className="value">
              {new Date(incident.deadline).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncidentStatus; 