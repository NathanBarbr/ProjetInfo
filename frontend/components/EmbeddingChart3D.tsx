"use client";

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

interface Point {
    point_id: number;
    match_id: string;
    x: number;
    y: number;
    z?: number; // Nouveau
    description: string;
    faute_type: string;
    winner?: string;
    nb_coups: number;
    clip_path?: string;
    score_A?: string;
    score_B?: string;
    isVisible?: boolean; // Ajouté pour le filtrage
}

interface EmbeddingChart3DProps {
    data: Point[];
    onPointClick?: (point: Point) => void;
    isLoading?: boolean;
}

const PointsCloud = ({ data, onPointClick }: { data: Point[], onPointClick?: (point: Point) => void }) => {
    // Optimisation: Créer les géométries et matériaux une seule fois si possible
    // Mais ici on veut des couleurs différentes. 
    // InstancedMesh est mieux pour la perf, mais pour 200 points, des meshes individuels c'est ok.
    // Pour 5000 points, il faudrait InstancedMesh.
    // On va utiliser des primitives simples pour l'instant.

    const points = useMemo(() => {
        return data.filter(p => p.isVisible !== false).map((point, i) => {
            const color = getPointColor(point);
            return (
                <mesh
                    key={i}
                    position={[point.x * 5, point.y * 5, (point.z || 0) * 5]} // Scaling pour mieux voir
                    onClick={(e) => {
                        e.stopPropagation();
                        onPointClick && onPointClick(point);
                    }}
                >
                    <sphereGeometry args={[0.08, 16, 16]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
                </mesh>
            );
        });
    }, [data, onPointClick]);

    return <group>{points}</group>;
};

const getPointColor = (point: Point) => {
    if (point.isVisible === false) return "#2c2c2e";
    if (point.faute_type === 'pt_gagne') {
        if (point.nb_coups > 8) return "#10b981";
        return "#3b82f6";
    }
    return "#6b7280";
};

const EmbeddingChart3D: React.FC<EmbeddingChart3DProps> = ({ data, onPointClick, isLoading }) => {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[600px] w-full bg-[#2c2c2e] rounded-xl border border-[#3a3a3c]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="ml-2 text-gray-400 font-medium">Chargement 3D...</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full shadow-lg bg-[#111111] rounded-xl border border-[#3a3a3c] overflow-hidden flex flex-col relative">
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                <div className="bg-[#1c1c1e]/80 backdrop-blur px-3 py-1 rounded-full border border-[#3a3a3c]">
                    <span className="text-xs text-blue-400 font-bold">MODE 3D ACTIVÉ</span>
                </div>
            </div>

            <div className="flex-1 h-full min-h-[500px]">
                <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1} />
                    <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} autoRotate={true} autoRotateSpeed={0.5} />

                    <gridHelper args={[20, 20, 0x3a3a3c, 0x2c2c2e]} rotation={[Math.PI / 2, 0, 0]} />

                    <PointsCloud data={data} onPointClick={onPointClick} />
                </Canvas>
            </div>

            {/* Legend Overlay */}
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-[#2c2c2e]/90 backdrop-blur-md px-4 py-2 rounded-full border border-[#3a3a3c] shadow-lg flex gap-6 text-[11px] text-gray-300 pointer-events-none">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span className="font-medium">Échange Intense</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                    <span className="font-medium">Point Gagnant</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-500"></div>
                    <span>Faute / Standard</span>
                </div>
            </div>
        </div>
    );
};

export default EmbeddingChart3D;
