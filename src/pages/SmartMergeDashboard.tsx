import React from 'react';
import DuplicateDetection from '../components/DuplicateDetection';

const SmartMergeDashboard: React.FC = () => {
    return (
        <div style={{ minHeight: '100vh', background: '#f5f6f8' }}>
            <DuplicateDetection />
        </div>
    );
};

export default SmartMergeDashboard;
