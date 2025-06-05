import React, { useState } from 'react';
import { formatDate } from '../utils/incidentUtils';

// Modal component for merge confirmation
interface MergeModalProps {
  isOpen: boolean;
  targetReport: any;
  currentReport: any;
  onClose: () => void;
  onConfirm: () => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({ isOpen, targetReport, currentReport, onClose, onConfirm }) => {
  if (!isOpen || !targetReport) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: 8,
        padding: 24,
        width: '90%',
        maxWidth: 500,
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <h3 style={{ marginTop: 0 }}>Merge Duplicate Reports</h3>
        
        <p>You are about to merge the following reports:</p>
        
        <div style={{ padding: 12, background: '#f9f9f9', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontWeight: 600 }}>Current: #{currentReport.id}</div>
          <div>{currentReport.description?.substring(0, 100)}{currentReport.description?.length > 100 ? '...' : ''}</div>
          <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
            {formatDate(currentReport.dateReported || currentReport.timestamp)}
          </div>
        </div>
        
        <div style={{ padding: 12, background: '#e1f5fe', borderRadius: 8 }}>
          <div style={{ fontWeight: 600 }}>Target: #{targetReport.id}</div>
          <div>{targetReport.description?.substring(0, 100)}{targetReport.description?.length > 100 ? '...' : ''}</div>
          <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
            {formatDate(targetReport.timestamp)}
          </div>
        </div>
        
        <div style={{ marginTop: 20 }}>
          <p style={{ color: '#d32f2f' }}><strong>Warning:</strong> This action cannot be undone.</p>
          <p>When merged:</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>All media from both reports will be combined</li>
            <li>Both descriptions will be preserved</li>
            <li>This report will be marked as a duplicate</li>
            <li>You will be redirected to the target report</li>
          </ul>
        </div>
        
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #ccc',
              borderRadius: 4,
              background: 'white',
              color: 'black',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 4,
              background: '#d32f2f',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Merge Reports
          </button>
        </div>
      </div>
    </div>
  );
};

// Flag Report Modal
interface FlagReportModalProps {
  onClose: () => void;
  onFlag: (reason: string, notes: string) => void;
  isFlagging: boolean;
}

export const FlagReportModal: React.FC<FlagReportModalProps> = ({
  onClose,
  onFlag,
  isFlagging
}) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFlag(reason, notes);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Flag Report</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reason">Reason for Flagging:</label>
            <select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            >
              <option value="">Select a reason</option>
              <option value="false_report">False Report</option>
              <option value="duplicate">Duplicate Report</option>
              <option value="inappropriate">Inappropriate Content</option>
              <option value="spam">Spam</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Additional Notes:</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Please provide any additional details..."
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="cancel-button"
              disabled={isFlagging}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="submit-button"
              disabled={isFlagging || !reason}
            >
              {isFlagging ? 'Flagging...' : 'Flag Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}; 