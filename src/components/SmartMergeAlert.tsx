import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { calculateDistance, checkDescriptionSimilarity, formatDate } from '../utils/incidentUtils';
import { useNavigate } from 'react-router-dom';

interface SmartMergeAlertProps {
    incidentId: string;
    latitude?: number;
    longitude?: number;
    incidentType: string;
    description: string;
    currentTimestamp?: any;
    onMergeComplete?: () => void;
}

const SmartMergeAlert: React.FC<SmartMergeAlertProps> = ({
    incidentId,
    latitude,
    longitude,
    incidentType,
    description,
    currentTimestamp,
    onMergeComplete
}) => {
    const [candidates, setCandidates] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (incidentId && latitude && longitude) {
            checkForDuplicates();
        } else {
            setLoading(false);
        }
    }, [incidentId, latitude, longitude, incidentType, description]);

    const checkForDuplicates = async () => {
        setLoading(true);
        try {
            // Query active reports
            const q = query(
                collection(db, 'reports'),
                where('reportState', 'in', ['New', 'In Progress'])
            );

            const querySnapshot = await getDocs(q);
            const potentialDuplicates: any[] = [];

            querySnapshot.forEach(doc => {
                const data = doc.data();
                // Skip self, merged, completed (though query handles state)
                if (doc.id === incidentId) return;
                if (!data.latitude || !data.longitude) return;

                // 1. Same Incident Type
                if (data.incidentType !== incidentType) return;

                // 2. Distance < 100m
                const distance = calculateDistance(
                    latitude!, longitude!,
                    data.latitude, data.longitude
                );

                if (distance > 100) return;

                // 3. Description Similarity
                // We'll be a bit more lenient here since we are showing them to the user to confirm
                const isSimilar = checkDescriptionSimilarity(description, data.description);

                // If very close (< 20m) OR similar description
                if (distance < 20 || isSimilar) {
                    potentialDuplicates.push({
                        id: doc.id,
                        distance,
                        isSimilar,
                        ...data
                    });
                }
            });

            // Sort by distance
            potentialDuplicates.sort((a, b) => a.distance - b.distance);

            setCandidates(potentialDuplicates);
            // Select all by default
            setSelectedIds(new Set(potentialDuplicates.map(d => d.id)));

        } catch (error) {
            console.error("Error checking duplicates:", error);
        }
        setLoading(false);
    };

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleMerge = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Merge ${selectedIds.size} selected reports into this incident?`)) return;

        setProcessing(true);
        try {
            const primaryRef = doc(db, 'reports', incidentId);

            // Get the selected candidate objects
            const selectedCandidates = candidates.filter(c => selectedIds.has(c.id));

            // 1. Update Primary Report (Current Incident)
            const mergedInfo = selectedCandidates.map(d => ({
                id: d.id,
                timestamp: d.timestamp,
                mergedAt: new Date()
            }));

            // Combine media URLs
            const newMediaUrls: string[] = [];
            selectedCandidates.forEach(c => {
                if (c.mediaUrls && Array.isArray(c.mediaUrls)) {
                    newMediaUrls.push(...c.mediaUrls);
                }
            });

            // Append descriptions
            const appendedDescription = selectedCandidates
                .map(d => `\n\n--- Merged from #${d.id.slice(-6)} ---\n${d.description}`)
                .join('');

            await updateDoc(primaryRef, {
                mergedReports: arrayUnion(...mergedInfo),
                description: description + appendedDescription,
                mediaUrls: arrayUnion(...newMediaUrls)
            });

            // 2. Update Selected Duplicate Reports
            for (const candidate of selectedCandidates) {
                const dupRef = doc(db, 'reports', candidate.id);
                await updateDoc(dupRef, {
                    reportState: 'Merged',
                    mergedInto: incidentId,
                    mergedAt: new Date()
                });
            }

            alert("Reports merged successfully!");
            setIsVisible(false); // Hide alert after merge
            if (onMergeComplete) onMergeComplete();

        } catch (error) {
            console.error("Error merging reports:", error);
            alert("Failed to merge reports.");
        }
        setProcessing(false);
    };

    if (loading || candidates.length === 0 || !isVisible) return null;

    return (
        <div style={{
            marginBottom: 24,
            background: '#fff3e0',
            border: '1px solid #ffe0b2',
            borderRadius: 8,
            padding: 16,
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                    <h3 style={{ margin: '0 0 4px 0', color: '#e65100', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>⚠️</span> Potential Duplicates Detected
                    </h3>
                    <p style={{ margin: 0, fontSize: 13, color: '#ef6c00' }}>
                        We found {candidates.length} other reports that look similar. Select the ones you want to merge into this report.
                    </p>
                </div>
                <button
                    onClick={handleMerge}
                    disabled={processing || selectedIds.size === 0}
                    style={{
                        background: '#e65100',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        padding: '6px 16px',
                        fontWeight: 600,
                        cursor: processing || selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                        opacity: processing || selectedIds.size === 0 ? 0.7 : 1
                    }}
                >
                    {processing ? 'Merging...' : `Merge Selected (${selectedIds.size})`}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {candidates.map(candidate => (
                    <div
                        key={candidate.id}
                        style={{
                            display: 'flex',
                            gap: 12,
                            padding: 10,
                            background: 'white',
                            borderRadius: 6,
                            border: selectedIds.has(candidate.id) ? '1px solid #ffcc80' : '1px solid #eee',
                            cursor: 'pointer'
                        }}
                        onClick={() => toggleSelection(candidate.id)}
                    >
                        <div style={{ paddingTop: 2 }}>
                            <input
                                type="checkbox"
                                checked={selectedIds.has(candidate.id)}
                                onChange={() => toggleSelection(candidate.id)}
                                style={{ cursor: 'pointer' }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontWeight: 600, fontSize: 14 }}>#{candidate.id.slice(-6)}</span>
                                <span style={{ fontSize: 12, color: '#666' }}>{formatDate(candidate.timestamp)}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#333', marginBottom: 4 }}>
                                {candidate.description?.substring(0, 80)}{candidate.description?.length > 80 ? '...' : ''}
                            </div>
                            <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                                <span style={{ color: '#d84315', background: '#fbe9e7', padding: '1px 6px', borderRadius: 4 }}>
                                    {Math.round(candidate.distance)}m away
                                </span>
                                {candidate.isSimilar && (
                                    <span style={{ color: '#1565c0', background: '#e3f2fd', padding: '1px 6px', borderRadius: 4 }}>
                                        Similar Description
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SmartMergeAlert;
