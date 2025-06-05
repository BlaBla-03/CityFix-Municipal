import React, { useState, useEffect } from 'react';
import { fetchReporterById, getTrustLevelLabel, getTrustLevelColor } from '../utils/reporterUtils';

interface ReporterBadgeProps {
  reporterId?: string;
  trustLevel?: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const ReporterBadge: React.FC<ReporterBadgeProps> = ({ 
  reporterId, 
  trustLevel: initialTrustLevel, 
  size = 'medium', 
  showLabel = false 
}) => {
  const [trustLevel, setTrustLevel] = useState<number | undefined>(initialTrustLevel);
  const [isLoading, setIsLoading] = useState(!initialTrustLevel && !!reporterId);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const loadReporterData = async () => {
      if (reporterId && trustLevel === undefined) {
        setIsLoading(true);
        const reporter = await fetchReporterById(reporterId);
        if (reporter) {
          setTrustLevel(reporter.trustLevel || 0);
        }
        setIsLoading(false);
      }
    };

    loadReporterData();
  }, [reporterId, trustLevel]);

  if (isLoading) {
    return <div style={{ width: size === 'small' ? 16 : size === 'large' ? 32 : 24 }}></div>;
  }

  const level = trustLevel || 0;
  const label = getTrustLevelLabel(level);
  const color = getTrustLevelColor(level);
  
  // Size mappings
  const dimensions = {
    small: { size: 16, fontSize: 10, padding: '1px 4px', labelSize: 12 },
    medium: { size: 24, fontSize: 12, padding: '2px 8px', labelSize: 14 },
    large: { size: 32, fontSize: 14, padding: '4px 10px', labelSize: 16 },
  }[size];

  return (
    <div 
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        position: 'relative'
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{
        width: dimensions.size,
        height: dimensions.size,
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: dimensions.fontSize,
        fontWeight: 700,
      }}>
        {label.charAt(0).toUpperCase()}
      </div>
      
      {showLabel && (
        <span style={{
          marginLeft: 6, 
          fontSize: dimensions.labelSize, 
          fontWeight: 600,
          color
        }}>
          {label}
        </span>
      )}
      
      {showTooltip && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '6px 10px',
          borderRadius: 4,
          fontSize: 12,
          whiteSpace: 'nowrap',
          marginBottom: 8,
          zIndex: 10
        }}>
          {label} Reporter ({level}% trust)
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(0,0,0,0.8)',
          }}></div>
        </div>
      )}
    </div>
  );
};

export default ReporterBadge; 