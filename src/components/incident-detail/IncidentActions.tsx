import React from 'react';
import { IncidentDetailData } from '../../utils/incidentUtils';

interface IncidentActionsProps {
  incident: IncidentDetailData;
  onMarkAsCompleted: () => void;
  onFlagReport: () => void;
  onMergeReport: () => void;
  isStaff: boolean;
}

const IncidentActions: React.FC<IncidentActionsProps> = ({
  incident,
  onMarkAsCompleted,
  onFlagReport,
  onMergeReport,
  isStaff
}) => {
  if (!isStaff) return null;

  return (
    <div className="incident-actions">
      {incident.status !== 'Completed' && (
        <button
          className="action-button complete"
          onClick={onMarkAsCompleted}
        >
          Mark as Completed
        </button>
      )}
      
      {incident.status !== 'Flagged' && (
        <button
          className="action-button flag"
          onClick={onFlagReport}
        >
          Flag Report
        </button>
      )}
      
      {incident.status !== 'Merged' && (
        <button
          className="action-button merge"
          onClick={onMergeReport}
        >
          Merge with Another Report
        </button>
      )}
    </div>
  );
};

export default IncidentActions; 