import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import newIcon from '../assets/new_icon.png';

interface NavBarProps {
  notificationCount?: number;
}

const NavBar: React.FC<NavBarProps> = ({ notificationCount }) => {
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <>
      <div style={{
        width: '100%',
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        padding: '1rem 0',
        display: 'flex',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Full width container */}
        <div style={{
          width: '100%',
          padding: '0 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}>
          {/* Left: Logo and Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: '1.3rem', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              <img src={newIcon} alt="App Icon" style={{ width: 32, height: 32, marginRight: 8, borderRadius: 8 }} /> IncidentManager
            </span>
          </div>

          {/* Center: Nav Links */}
          <div style={{ display: 'flex', gap: 32, fontWeight: 500 }}>
            <a href="/dashboard" style={{ color: '#222', textDecoration: 'none' }}>Dashboard</a>
            <a href="/incidents" style={{ color: '#222', textDecoration: 'none' }}>Incidents</a>
            <a href="/sla" style={{ color: '#222', textDecoration: 'none' }}>SLA</a>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <a href="/notifications" style={{ color: '#222', textDecoration: 'none' }}>Notifications</a>
              <span style={{ display: 'inline-block', width: 8 }} />
              {typeof notificationCount === 'number' && (
                <span style={{
                  position: 'absolute',
                  top: -8,
                  right: -28,
                  background: notificationCount === 0 ? '#43a047' : '#e53935',
                  color: '#fff',
                  borderRadius: '50%',
                  minWidth: 18,
                  height: 18,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  padding: '0 5px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
                }}>
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </div>
          </div>

          {/* Right: Logout Button */}
          <button
            style={{
              background: '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: 20,
              padding: '0.5rem 1.2rem',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer'
            }}
            onClick={() => setShowLogoutModal(true)}
          >
            Logout
          </button>
        </div>
      </div>
      {/* Logout Modal */}
      {showLogoutModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            padding: '2.5rem 3.5rem',
            minWidth: 340,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24
          }}>
            <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 12 }}>Are you sure you want to log out?</div>
            <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>
              <button
                style={{
                  background: '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 20,
                  padding: '0.7rem 2.2rem',
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(244,67,54,0.08)'
                }}
                onClick={handleLogout}
              >
                Logout
              </button>
              <button
                style={{
                  background: '#fff',
                  color: '#222',
                  border: '1px solid #ddd',
                  borderRadius: 20,
                  padding: '0.7rem 2.2rem',
                  fontWeight: 500,
                  fontSize: 16,
                  cursor: 'pointer'
                }}
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NavBar;
