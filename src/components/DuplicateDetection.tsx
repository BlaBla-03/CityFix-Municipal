import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { calculateDistance, checkDescriptionSimilarity, formatDate } from '../utils/incidentUtils';
import { useNavigate } from 'react-router-dom';

interface Report {
    id: string;
    latitude: number;
    longitude: number;
    incidentType: string;
    description: string;
    timestamp: any;
    reportState: string;
    municipal: string;
    [key: string]: any;
}

interface DuplicateGroup {
    primary: Report;
    duplicates: Report[];
    similarityScore: number;
}

const DuplicateDetection: React.FC = () => {
    const [groups, setGroups] = useState<DuplicateGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchAndAnalyzeReports();
    }, []);

    const fetchAndAnalyzeReports = async () => {
        setLoading(true);
        try {
            // Fetch all active reports
            const q = query(
                collection(db, 'reports'),
                where('reportState', 'in', ['New', 'In Progress'])
            );

            const querySnapshot = await getDocs(q);
            const reports: Report[] = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                if (data.latitude && data.longitude) {
                    reports.push({ id: doc.id, ...data } as Report);
                }
            });

            // Analyze for duplicates
            const detectedGroups: DuplicateGroup[] = [];
            const processedIds = new Set<string>();

            // Sort by timestamp (newest first) to prioritize recent reports as potential duplicates of older ones? 
            // Or oldest first as "primary"? Let's use oldest as primary.
            reports.sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeA - timeB;
            });

            for (let i = 0; i < reports.length; i++) {
                const primary = reports[i];
                if (processedIds.has(primary.id)) continue;

                const duplicates: Report[] = [];

                for (let j = i + 1; j < reports.length; j++) {
                    const candidate = reports[j];
                    if (processedIds.has(candidate.id)) continue;

                    // Check criteria
                    // 1. Same Incident Type
                    if (primary.incidentType !== candidate.incidentType) continue;

                    // 2. Distance < 100m
                    const distance = calculateDistance(
                        primary.latitude, primary.longitude,
                        candidate.latitude, candidate.longitude
                    );

                    if (distance > 100) continue;

                    // 3. Description Similarity
                    const isSimilar = checkDescriptionSimilarity(primary.description, candidate.description);

                    if (isSimilar || distance < 20) { // Very close distance implies duplicate even if description varies slightly
                        duplicates.push(candidate);
                        processedIds.add(candidate.id);
                    }
                }

                if (duplicates.length > 0) {
                    processedIds.add(primary.id);
                    detectedGroups.push({
                        primary,
                        duplicates,
                        similarityScore: 0 // Placeholder
                    });
                }
            }

            setGroups(detectedGroups);
        } catch (error) {
            console.error("Error detecting duplicates:", error);
        }
        setLoading(false);
    };

    const handleMergeGroup = async (group: DuplicateGroup) => {
        if (!window.confirm(`Merge ${group.duplicates.length} reports into ${group.primary.id}?`)) return;

        setProcessing(true);
        try {
            const primaryRef = doc(db, 'reports', group.primary.id);

            // 1. Update Primary Report
            const mergedInfo = group.duplicates.map(d => ({
                id: d.id,
                timestamp: d.timestamp,
                mergedAt: new Date()
            }));

            await updateDoc(primaryRef, {
                mergedReports: arrayUnion(...mergedInfo),
                description: group.primary.description +
                    group.duplicates.map(d => `\n\n--- Merged from #${d.id.slice(-6)} ---\n${d.description}`).join('')
            });

            // 2. Update Duplicate Reports
            for (const duplicate of group.duplicates) {
                const dupRef = doc(db, 'reports', duplicate.id);
                await updateDoc(dupRef, {
                    reportState: 'Merged',
                    mergedInto: group.primary.id,
                    mergedAt: new Date()
                });
            }

            // Refresh list
            await fetchAndAnalyzeReports();
            alert("Merge successful!");
        } catch (error) {
            console.error("Error merging group:", error);
            alert("Failed to merge reports.");
        }
        setProcessing(false);
    };

    if (loading) return <div style={{ padding: 20 }}>Scanning for duplicates...</div>;

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>Smart Merge Dashboard</h2>
                <button
                    onClick={() => navigate('/dashboard')}
                    style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                >
                    Back to Dashboard
                </button>
            </div>

            {groups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <h3>No Duplicates Detected</h3>
                    <p style={{ color: '#666' }}>Great job! All active reports appear to be unique.</p>
                    <button
                        onClick={fetchAndAnalyzeReports}
                        style={{ marginTop: 16, padding: '8px 16px', background: '#2196f3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >
                        Rescan
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 24 }}>
                    {groups.map((group, index) => (
                        <div key={index} style={{ background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                            <div style={{ padding: 16, background: '#e3f2fd', borderBottom: '1px solid #bbdefb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontWeight: 600, fontSize: 16 }}>Potential Duplicate Group #{index + 1}</span>
                                    <span style={{ marginLeft: 12, fontSize: 14, color: '#555' }}>{group.primary.incidentType} • {group.primary.municipal}</span>
                                </div>
                                <button
                                    disabled={processing}
                                    onClick={() => handleMergeGroup(group)}
                                    style={{
                                        padding: '6px 16px',
                                        background: processing ? '#ccc' : '#1976d2',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 4,
                                        cursor: processing ? 'not-allowed' : 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    {processing ? 'Merging...' : 'Merge All'}
                                </button>
                            </div>

                            <div style={{ padding: 16 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                                    {/* Primary Report */}
                                    <div style={{ border: '2px solid #2196f3', borderRadius: 8, padding: 12, position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: -10, left: 10, background: '#2196f3', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                                            PRIMARY REPORT
                                        </div>
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontWeight: 600 }}>#{group.primary.id.slice(-6)}</div>
                                            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{formatDate(group.primary.timestamp)}</div>
                                            <p style={{ fontSize: 14, margin: 0 }}>{group.primary.description}</p>
                                        </div>
                                    </div>

                                    {/* Duplicates List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {group.duplicates.map(dup => (
                                            <div key={dup.id} style={{ border: '1px dashed #999', borderRadius: 8, padding: 12, background: '#fafafa' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <div style={{ fontWeight: 600, color: '#666' }}>#{dup.id.slice(-6)}</div>
                                                    <div style={{ fontSize: 12, color: '#999' }}>{formatDate(dup.timestamp)}</div>
                                                </div>
                                                <p style={{ fontSize: 14, margin: '8px 0 0 0', color: '#444' }}>{dup.description}</p>
                                                <div style={{ marginTop: 8, fontSize: 12, color: '#d32f2f' }}>
                                                    Distance: {Math.round(calculateDistance(group.primary.latitude, group.primary.longitude, dup.latitude, dup.longitude))}m
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DuplicateDetection;
