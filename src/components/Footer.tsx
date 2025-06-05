import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer style={footerStyle}>
      <div style={contentStyle}>
        <p style={textStyle}>© 2025 CityFix. All rights reserved.</p>
      </div>
    </footer>
  );
};

const footerStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  padding: '1rem 0',
  borderTop: '1px solid #eee',
  marginTop: 'auto',
};

const contentStyle: React.CSSProperties = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '0 2rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

const textStyle: React.CSSProperties = {
  color: '#666',
  fontSize: '0.875rem',
  margin: 0,
};

export default Footer; 