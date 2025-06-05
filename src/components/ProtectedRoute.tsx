import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useNavigate } from 'react-router-dom';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [, setCurrentUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
      if (!user) {
        navigate('/');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  if (loading) {
    return <div style={{textAlign: 'center', marginTop: '2rem'}}>Loading...</div>;
  }

  return <>{children}</>;
};

export default ProtectedRoute; 