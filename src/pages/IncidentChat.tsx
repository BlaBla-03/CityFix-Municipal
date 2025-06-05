import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth } from '../config/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, getDoc, getDocs, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

interface Message {
  senderId: string;
  senderName: string;
  text: string;
  timestamp: any;
  isStaff?: boolean;
}

const formatTime = (timestamp: any) => {
  if (!timestamp) return '';
  if (timestamp.toDate) return timestamp.toDate().toLocaleString();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleString();
  return '';
};

const IncidentChat: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [staffInfo, setStaffInfo] = useState<{ name: string; id: string } | null>(null);
  const [linkedReports, setLinkedReports] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setStaffInfo(null);
        return;
      }
      try {
        const q = query(collection(db, 'users'), where('email', '==', currentUser.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0].data();
          setStaffInfo({
            name: userDoc.name || currentUser.displayName || currentUser.email?.split('@')[0] || 'Staff Member',
            id: currentUser.uid
          });
        }
      } catch (e) {
        console.error('Error fetching staff info:', e);
        setStaffInfo({
          name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Staff Member',
          id: currentUser.uid
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchIncident = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'reports', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const incidentData = docSnap.data();
          setIncident(incidentData);
          
          // Look for merged reports (reports that have been merged into this one)
          const mergedReportsQuery = query(
            collection(db, 'reports'),
            where('mergedInto', '==', id)
          );
          const mergedDocs = await getDocs(mergedReportsQuery);
          const mergedIds = mergedDocs.docs.map(doc => doc.id);
          setLinkedReports(mergedIds);
        } else {
          setError('Incident not found.');
        }
      } catch (e) {
        setError('Failed to load incident.');
      }
      setLoading(false);
    };
    fetchIncident();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, `reports/${id}/messages`), orderBy('timestamp'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => doc.data() as Message));
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !id || !staffInfo) return;
    
    try {
      // Add message to the main incident chat
      await addDoc(collection(db, `reports/${id}/messages`), {
        senderId: staffInfo.id,
        senderName: staffInfo.name,
        text: input,
        timestamp: new Date(),
        isStaff: true,
      });
      
      // If this incident has merged reports, add the same message to all linked reports
      if (linkedReports.length > 0) {
        console.log(`Sending message to ${linkedReports.length} linked reports`);
        
        // Add the message to each linked report's chat
        for (const linkedReportId of linkedReports) {
          await addDoc(collection(db, `reports/${linkedReportId}/messages`), {
            senderId: staffInfo.id,
            senderName: staffInfo.name,
            text: input,
            timestamp: new Date(),
            isStaff: true,
            note: `This message was sent from the main report #${id}`
          });
        }
      }
      
      setInput('');
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    }
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: 40 }}>Loading chat...</div>;
  if (error) return <div style={{ textAlign: 'center', marginTop: 40, color: 'red' }}>{error}</div>;
  if (!incident) return <div style={{ textAlign: 'center', marginTop: 40 }}>No incident found.</div>;
  if (!staffInfo) return <div style={{ textAlign: 'center', marginTop: 40, color: 'red' }}>Please log in to continue.</div>;

  return (
    <div style={{ background: '#f5f6f8', minHeight: '100vh', width: '100vw', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ paddingLeft: '2rem', marginTop: '0.5rem', marginBottom: '-0.5rem' }}>
        <button
          onClick={() => window.history.back()}
          style={{
            background: 'none',
            border: 'none',
            color: '#222',
            fontSize: 28,
            cursor: 'pointer',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {'<'}
        </button>
      </div>
      <div style={{ flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0.7rem 0 3rem 0' }}>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '2rem 2.5rem', minHeight: 400, display: 'flex', flexDirection: 'column', marginLeft: 48 }}>
          <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Incident #{id}</div>
          <div style={{ color: '#444', marginBottom: 18 }}>
            <b>Reporter:</b> {incident?.reporterName || 'Unknown'}
          </div>
          {/* Initial report as first message */}
          {incident && (
            <div style={{ display: 'flex', marginBottom: 18 }}>
              <div style={{ background: '#eee', color: '#222', borderRadius: 16, padding: '1rem 1.2rem', maxWidth: 420, fontSize: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Initial incident report: {incident.incidentType}</div>
                <div>{incident.description}</div>
              </div>
            </div>
          )}
          {/* Chat messages */}
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.isStaff ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                <div style={{
                  background: msg.isStaff ? '#2ec4b6' : '#eee',
                  color: msg.isStaff ? '#fff' : '#222',
                  borderRadius: 16,
                  padding: '1rem 1.2rem',
                  maxWidth: 420,
                  fontSize: 16,
                  textAlign: msg.isStaff ? 'right' : 'left',
                  boxShadow: msg.isStaff ? '0 2px 8px rgba(46,196,182,0.08)' : 'none',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, textAlign: msg.isStaff ? 'right' : 'left' }}>
                    {msg.isStaff ? `Staff: ${msg.senderName}` : `User: ${msg.senderName}`}
                    <span style={{ fontWeight: 400, color: '#000', fontSize: 13, marginLeft: 8 }}>{formatTime(msg.timestamp)}</span>
                  </div>
                  <div>{msg.text}</div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          {/* Input */}
          <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your update here..."
              style={{ flex: 1, padding: '0.9rem 1.2rem', borderRadius: 24, border: '1px solid #ddd', fontSize: 16, outline: 'none' }}
            />
            <button
              type="submit"
              style={{ background: '#2ec4b6', color: '#fff', border: 'none', borderRadius: 24, padding: '0.7rem 2.5rem', fontWeight: 600, fontSize: 18, cursor: 'pointer' }}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default IncidentChat; 