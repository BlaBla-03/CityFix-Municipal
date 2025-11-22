import React from 'react';
import { getTimeRemaining, calculateDeadline, normalizeSeverity } from '../utils/incidentUtils';

interface SeverityChangeModalProps {
    isOpen: boolean;
    currentSeverity: string;
    newSeverity: 'Low' | 'Medium' | 'High' | 'Critical';
    incident: any;
    onClose: () => void;
    onConfirm: () => void;
}

export const SeverityChangeModal: React.FC<SeverityChangeModalProps> = ({
    isOpen,
    currentSeverity,
    newSeverity,
    incident,
    onClose,
    onConfirm,
}) => {
    if (!isOpen || !incident) return null;

    const currentTimeRemaining = getTimeRemaining(incident.deadline, incident.status, true);
    const newDeadline = calculateDeadline(incident.timestamp, newSeverity);
    const newTimeRemaining = newDeadline
        ? getTimeRemaining(newDeadline, incident.status, true)
        : 'N/A';

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000,
            }}
        >
            <div
                style={{
                    background: 'white',
                    borderRadius: 8,
                    padding: 24,
                    width: '90%',
                    maxWidth: 500,
                }}
            >
                <h3 style={{ marginTop: 0 }}>Confirm Severity Change</h3>
                <p>
                    Are you sure you want to change the severity from <strong>{normalizeSeverity(currentSeverity)}</strong> to{' '}
                    <strong>{newSeverity}</strong>?
                </p>
                <p>Current time remaining: {currentTimeRemaining}</p>
                <p>New time remaining will be: {newTimeRemaining}</p>
                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            background: 'white',
                            color: 'black',
                            cursor: 'pointer',
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
                            cursor: 'pointer',
                        }}
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};
