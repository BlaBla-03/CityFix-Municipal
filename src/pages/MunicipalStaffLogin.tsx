import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../config/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, updatePassword as firebaseUpdatePassword } from 'firebase/auth';
import { rateLimiter } from '../utils/rateLimiter';
import { logAuditEvent, AuditEventType, getClientInfo } from '../utils/auditLogger';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

// Forgot Password Modal Component
const ForgotPasswordModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <div style={modalOverlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Password Reset</h3>
        <p>
          For security reasons, staff password resets must be handled by an administrator.
        </p>
        <p>
          Please contact your system administrator to reset your password.
        </p>
        
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const MunicipalStaffLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userDocId, setUserDocId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [_, setRemainingAttempts] = useState(5);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [iconHover, setIconHover] = useState(false);
  const [iconHoverNew, setIconHoverNew] = useState(false);
  const [iconHoverConfirm, setIconHoverConfirm] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkRateLimit = () => {
      const clientInfo = getClientInfo();
      const isBlocked = rateLimiter.isBlocked(clientInfo.ipAddress);
      if (isBlocked) {
        const remainingTime = rateLimiter.getRemainingTime(clientInfo.ipAddress);
        setBlockedUntil(Date.now() + remainingTime);
      } else {
        setBlockedUntil(null);
      }
    };
    checkRateLimit();
    const interval = setInterval(checkRateLimit, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const clientInfo = getClientInfo();
    if (rateLimiter.isBlocked(clientInfo.ipAddress)) {
      setError('Too many failed attempts. Please try again later.');
      return;
    }
    setLoading(true);
    setShowReset(false);
    setUserDocId('');
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setError('No staff account found with this email.');
        setLoading(false);
        await logAuditEvent({
          eventType: AuditEventType.LOGIN_FAILURE,
          userEmail: email,
          details: 'No staff account found',
          ...clientInfo
        });
        return;
      }
      const userDoc = querySnapshot.docs[0];
      const user = userDoc.data();
      if (user.role !== 'staff') {
        setError('Access denied: Not a staff account.');
        setLoading(false);
        await logAuditEvent({
          eventType: AuditEventType.LOGIN_FAILURE,
          userEmail: email,
          details: 'Not a staff account',
          ...clientInfo
        });
        return;
      }
      if (user.requiresPasswordSetup && user.tempPassword) {
        if (password === user.tempPassword) {
          try {
            await signInWithEmailAndPassword(auth, email, password);
            setShowReset(true);
            setUserDocId(userDoc.id);
          } catch (authErr: any) {
            setError('Temporary password is incorrect or not set in Auth.');
          }
        } else {
          setError('Temporary password is incorrect.');
        }
        setLoading(false);
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, email, password);
        await logAuditEvent({
          eventType: AuditEventType.LOGIN_SUCCESS,
          userEmail: email,
          ...clientInfo
        });
        navigate('/dashboard');
      } catch (error: any) {
        const { blocked, remainingAttempts: attempts } = rateLimiter.recordAttempt(clientInfo.ipAddress);
        setRemainingAttempts(attempts);
        if (blocked) {
          setBlockedUntil(Date.now() + 15 * 60 * 1000);
        }
        await logAuditEvent({
          eventType: AuditEventType.LOGIN_FAILURE,
          userEmail: email,
          details: error.message,
          ...clientInfo
        });
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
          setError(`Invalid email or password. ${attempts} attempts remaining.`);
        } else if (error.code === 'auth/too-many-requests') {
          setError('Too many failed attempts. Please try again later.');
        } else {
          setError('An error occurred during login. Please try again.');
        }
      }
    } catch (err: any) {
      setError('Login failed: ' + (err.message || err.toString()));
    }
    setLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      if (auth.currentUser) {
        await firebaseUpdatePassword(auth.currentUser, newPassword);
      } else {
        setError('User not authenticated. Please log in again.');
        return;
      }
      const userRef = doc(db, 'users', userDocId);
      await updateDoc(userRef, {
        password: newPassword,
        requiresPasswordSetup: false,
        tempPassword: null,
      });
      alert('Password updated! Please log in with your new password.');
      setShowReset(false);
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');
      navigate('/');
    } catch (err: any) {
      setError('Failed to update password: ' + (err.message || err.toString()));
    }
  };

  const formatTimeRemaining = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div style={bgStyle}>
      <div style={cardStyle}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.4rem', fontWeight: 700, textAlign: 'center' }}>Municipal Staff Login</h2>
        {!showReset ? (
          <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
              disabled={loading || blockedUntil !== null}
            />
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={inputStyle}
                disabled={loading || blockedUntil !== null}
              />
              <button
                type="button"
                style={{ ...showHideButtonStyle, color: iconHover ? '#125a9c' : '#1976d2' }}
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                onMouseEnter={() => setIconHover(true)}
                onMouseLeave={() => setIconHover(false)}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {error && (
              <div style={errorStyle}>{error}</div>
            )}
            {blockedUntil && (
              <div style={errorStyle}>
                Account temporarily locked. Please try again in {formatTimeRemaining(blockedUntil - Date.now())}
              </div>
            )}
            <button type="submit" style={buttonStyle} disabled={loading || blockedUntil !== null}>{loading ? 'Logging in...' : 'Login'}</button>
          </form>
        ) : (
          <form onSubmit={handlePasswordReset} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'relative' }}>
              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="New Password (min 8 chars)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                style={inputStyle}
              />
              <button
                type="button"
                style={{ ...showHideButtonStyle, color: iconHoverNew ? '#125a9c' : '#1976d2' }}
                onClick={() => setShowNewPassword((v) => !v)}
                tabIndex={-1}
                onMouseEnter={() => setIconHoverNew(true)}
                onMouseLeave={() => setIconHoverNew(false)}
              >
                {showNewPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                style={inputStyle}
              />
              <button
                type="button"
                style={{ ...showHideButtonStyle, color: iconHoverConfirm ? '#125a9c' : '#1976d2' }}
                onClick={() => setShowConfirmPassword((v) => !v)}
                tabIndex={-1}
                onMouseEnter={() => setIconHoverConfirm(true)}
                onMouseLeave={() => setIconHoverConfirm(false)}
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {error && (
              <div style={errorStyle}>{error}</div>
            )}
            <button type="submit" style={buttonStyle}>Set New Password</button>
          </form>
        )}
        <div style={linksContainer}>
          <a
            href="#" 
            onClick={(e) => { e.preventDefault(); setShowForgotPassword(true); }}
            style={linkStyle}
          >
            Forgot Password?
          </a>
          <span>Contact Admin for Support</span>
        </div>
      </div>
      
      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
};

// --- CSS-in-JS styles below ---

const cardStyle: React.CSSProperties = {
  background: '#fff',
  padding: '2.5rem 2rem',
  borderRadius: 16,
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  width: 340,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const bgStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f5f6f8',
  zIndex: 0,
};

const inputStyle: React.CSSProperties = {
  padding: '0.8rem 1rem',
  paddingRight: '2.5rem',
  border: 'none',
  borderRadius: 24,
  background: '#f5f6f8',
  fontSize: '1rem',
  outline: 'none',
  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  marginBottom: '1rem',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.8rem 0',
  border: 'none',
  borderRadius: 24,
  background: '#19c6a7',
  color: '#fff',
  fontSize: '1.1rem',
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: '0.5rem',
  transition: 'background 0.2s',
};

const showHideButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  color: '#1976d2',
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.3rem',
  outline: 'none',
};

const errorStyle: React.CSSProperties = {
  color: '#d32f2f',
  marginTop: '0.5rem',
  fontSize: '0.98rem',
  textAlign: 'center',
};

const linkStyle: React.CSSProperties = {
  color: '#1976d2',
  textDecoration: 'none',
  fontWeight: 500,
  marginBottom: 4,
};

const linksContainer: React.CSSProperties = {
  marginTop: '1.2rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '0.97rem',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'white',
  padding: '1.5rem',
  borderRadius: '8px',
  width: '90%',
  maxWidth: '400px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
};

export default MunicipalStaffLogin; 