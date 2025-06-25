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
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => void;
}

export const FlagReportModal: React.FC<FlagReportModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [flagReason, setFlagReason] = useState('duplicate');
  const [flagNotes, setFlagNotes] = useState('');
  
  if (!isOpen) return null;
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(flagReason, flagNotes);
  };
  
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
        maxWidth: 500
      }}>
        <h3 style={{ marginTop: 0 }}>Flag Suspicious Report</h3>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Reason for Flagging:
            </label>
            <select
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 16
              }}
            >
              <option value="duplicate">Duplicate Report</option>
              <option value="false_info">False Information</option>
              <option value="inappropriate">Inappropriate Content</option>
              <option value="spam">Spam</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Additional Notes:
            </label>
            <textarea
              value={flagNotes}
              onChange={(e) => setFlagNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: 16,
                minHeight: 100,
                resize: 'vertical'
              }}
              placeholder="Please provide details about why this report is being flagged..."
            />
          </div>
          
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
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
              type="submit"
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 4,
                background: '#ff9800',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Flag Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}; 