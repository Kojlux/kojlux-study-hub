import React from 'react';
import { DiagramNodeId } from '../lib/subjects';

// ---------------------------------------------------------------------------
// Realistic diagram node library
// ---------------------------------------------------------------------------
// Why this exists: asking the AI to emit raw SVG/inline markup for every
// shape is expensive (large output tokens) AND fragile (malformed markup,
// inconsistent style). Instead, the AI returns a tiny JSON pointer —
// { type: "node", nodeId: "plant-stem", x, y, width, height, label, color }
// — and this registry turns that pointer into a real, detailed, consistently
// styled local SVG fragment. Swapping "plain colored bar" for "actual-
// looking stem" is entirely a client-side/design change here; it never
// costs another AI token.
//
// Every asset component takes the same prop shape so the registry can be
// called generically from VisualizerScreen's renderer.

export interface DiagramNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
  darkMode?: boolean;
}

const LabelText: React.FC<{ x: number; y: number; label?: string; dark?: boolean }> = ({ x, y, label, dark }) =>
  label ? (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="text-[8.5px] font-extrabold select-none"
      fill={dark ? '#f1f5f9' : '#0f172a'}
      style={{ textShadow: dark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 1px rgba(255,255,255,0.7)' }}
    >
      {label}
    </text>
  ) : null;

// ---- Plant biology ----
const PlantStem: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <defs>
      <linearGradient id="stem-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#4d7c0f" />
        <stop offset="50%" stopColor="#65a30d" />
        <stop offset="100%" stopColor="#4d7c0f" />
      </linearGradient>
    </defs>
    <path
      d={`M ${x + width * 0.5} ${y} C ${x + width * 0.7} ${y + height * 0.3}, ${x + width * 0.3} ${y + height * 0.6}, ${x + width * 0.5} ${y + height}`}
      stroke="url(#stem-grad)"
      strokeWidth={Math.max(4, width * 0.4)}
      fill="none"
      strokeLinecap="round"
    />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);

const PlantRoot: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <path
      d={`M ${x + width / 2} ${y} 
          C ${x + width * 0.2} ${y + height * 0.4}, ${x} ${y + height * 0.5}, ${x - width * 0.1} ${y + height}
          M ${x + width / 2} ${y} 
          C ${x + width * 0.8} ${y + height * 0.4}, ${x + width} ${y + height * 0.5}, ${x + width * 1.1} ${y + height}
          M ${x + width / 2} ${y} L ${x + width / 2} ${y + height * 0.85}`}
      stroke="#92714a"
      strokeWidth={2.5}
      fill="none"
      strokeLinecap="round"
    />
    <LabelText x={x + width / 2} y={y + height + 14} label={label} dark={darkMode} />
  </g>
);

const PlantLeaf: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, color, darkMode }) => (
  <g>
    <path
      d={`M ${x} ${y + height / 2} 
          Q ${x + width / 2} ${y - height * 0.35}, ${x + width} ${y + height / 2}
          Q ${x + width / 2} ${y + height * 1.35}, ${x} ${y + height / 2} Z`}
      fill={color || '#4ade80'}
      stroke="#166534"
      strokeWidth={1}
    />
    <line x1={x + width * 0.08} y1={y + height / 2} x2={x + width * 0.92} y2={y + height / 2} stroke="#166534" strokeWidth={1} opacity={0.6} />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);

const PlantFlower: React.FC<DiagramNodeProps> = ({ x, y, width, height, color, label, darkMode }) => {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.min(width, height) / 3;
  const petals = [0, 72, 144, 216, 288];
  return (
    <g>
      {petals.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const px = cx + Math.cos(rad) * r * 1.1;
        const py = cy + Math.sin(rad) * r * 1.1;
        return <ellipse key={deg} cx={px} cy={py} rx={r * 0.7} ry={r * 0.45} fill={color || '#f472b6'} transform={`rotate(${deg} ${px} ${py})`} opacity={0.9} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#facc15" />
      <LabelText x={cx} y={y + height + 12} label={label} dark={darkMode} />
    </g>
  );
};

const PlantSoil: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <defs>
      <linearGradient id="soil-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a16207" />
        <stop offset="100%" stopColor="#57330f" />
      </linearGradient>
    </defs>
    <rect x={x} y={y} width={width} height={height} rx={4} fill="url(#soil-grad)" />
    {Array.from({ length: 8 }).map((_, i) => (
      <circle key={i} cx={x + (width / 8) * i + 6} cy={y + 6 + (i % 2) * 8} r={1.4} fill="#3f2410" opacity={0.6} />
    ))}
    <LabelText x={x + width / 2} y={y + height / 2 + 3} label={label} dark />
  </g>
);

const PlantSun: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.min(width, height) / 2.4;
  return (
    <g>
      {Array.from({ length: 8 }).map((_, i) => {
        const rad = (i * 45 * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={cx + Math.cos(rad) * r * 1.15}
            y1={cy + Math.sin(rad) * r * 1.15}
            x2={cx + Math.cos(rad) * r * 1.7}
            y2={cy + Math.sin(rad) * r * 1.7}
            stroke="#fbbf24"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r} fill="#fde047" stroke="#f59e0b" strokeWidth={1.5} />
      <LabelText x={cx} y={y + height + 14} label={label} dark={darkMode} />
    </g>
  );
};

const PlantWater: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => {
  const cx = x + width / 2;
  return (
    <g>
      <path
        d={`M ${cx} ${y} C ${x} ${y + height * 0.5}, ${x} ${y + height}, ${cx} ${y + height} C ${x + width} ${y + height}, ${x + width} ${y + height * 0.5}, ${cx} ${y} Z`}
        fill="#38bdf8"
        stroke="#0284c7"
        strokeWidth={1}
      />
      <LabelText x={cx} y={y + height + 12} label={label} dark={darkMode} />
    </g>
  );
};

// ---- Cell biology ----
const CellMembrane: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="#fef3c7" stroke="#d97706" strokeWidth={2.5} strokeDasharray="1 3" strokeLinecap="round" />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);
const CellNucleus: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <circle cx={x + width / 2} cy={y + height / 2} r={Math.min(width, height) / 2} fill="#a78bfa" stroke="#6d28d9" strokeWidth={1.5} />
    <circle cx={x + width / 2} cy={y + height / 2} r={Math.min(width, height) / 5} fill="#6d28d9" opacity={0.6} />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);
const CellMitochondria: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="#fb7185" stroke="#be123c" strokeWidth={1.5} />
    <path d={`M ${x + width * 0.2} ${y + height / 2} Q ${x + width * 0.4} ${y + height * 0.2} ${x + width * 0.6} ${y + height / 2} T ${x + width * 0.9} ${y + height / 2}`} stroke="#be123c" strokeWidth={1} fill="none" />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);

// ---- Chemistry / physics ----
const AtomNucleus: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <circle cx={x + width / 2} cy={y + height / 2} r={Math.min(width, height) / 2} fill="#f87171" stroke="#b91c1c" strokeWidth={1.5} />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);
const AtomElectronOrbit: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={width / 2} ry={height / 2} fill="none" stroke="#60a5fa" strokeWidth={1} opacity={0.7} />
      <circle cx={cx + width / 2} cy={cy} r={3.5} fill="#2563eb" />
      <LabelText x={cx} y={y + height + 12} label={label} dark={darkMode} />
    </g>
  );
};

// ---- Human body ----
const OrganHeart: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <path
      d={`M ${x + width / 2} ${y + height * 0.85} 
          C ${x - width * 0.1} ${y + height * 0.4}, ${x + width * 0.15} ${y}, ${x + width / 2} ${y + height * 0.28}
          C ${x + width * 0.85} ${y}, ${x + width * 1.1} ${y + height * 0.4}, ${x + width / 2} ${y + height * 0.85} Z`}
      fill="#ef4444"
      stroke="#991b1b"
      strokeWidth={1.5}
    />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);
const OrganLung: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <path d={`M ${x + width / 2} ${y} Q ${x} ${y + height * 0.2} ${x} ${y + height * 0.6} Q ${x} ${y + height} ${x + width * 0.4} ${y + height} Q ${x + width / 2} ${y + height * 0.7} ${x + width / 2} ${y} Z`} fill="#fb92a8" stroke="#be185d" strokeWidth={1.2} />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);
const OrganBrain: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, darkMode }) => (
  <g>
    <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="#fca5a5" stroke="#b91c1c" strokeWidth={1.2} />
    <path d={`M ${x + width * 0.15} ${y + height / 2} Q ${x + width * 0.3} ${y + height * 0.25} ${x + width * 0.5} ${y + height / 2} Q ${x + width * 0.7} ${y + height * 0.75} ${x + width * 0.85} ${y + height / 2}`} stroke="#b91c1c" strokeWidth={1} fill="none" opacity={0.7} />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);

// ---- Generic fallbacks (still asset-rendered, never raw AI SVG) ----
const GenericCircle: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, color, darkMode }) => (
  <g>
    <circle cx={x + width / 2} cy={y + height / 2} r={Math.min(width, height) / 2} fill={color || '#6366f1'} />
    <LabelText x={x + width / 2} y={y + height + 12} label={label} dark={darkMode} />
  </g>
);
const GenericBox: React.FC<DiagramNodeProps> = ({ x, y, width, height, label, color, darkMode }) => (
  <g>
    <rect x={x} y={y} width={width} height={height} rx={6} fill={color || '#6366f1'} />
    <LabelText x={x + width / 2} y={y + height / 2 + 3} label={label} dark />
  </g>
);
const GenericArrow: React.FC<DiagramNodeProps> = ({ x, y, width, height, color, label, darkMode }) => (
  <g>
    <line x1={x} y1={y} x2={x + width} y2={y + height} stroke={color || '#ef4444'} strokeWidth={3} strokeLinecap="round" markerEnd="url(#marker-arrow)" />
    <LabelText x={x + width / 2} y={y + height / 2 - 6} label={label} dark={darkMode} />
  </g>
);
const GenericLabel: React.FC<DiagramNodeProps> = ({ x, y, label, color, darkMode }) => (
  <text x={x} y={y} fill={color || (darkMode ? '#f1f5f9' : '#0f172a')} className="text-[9.5px] font-bold font-mono select-none">
    {label}
  </text>
);

export const NODE_ASSET_REGISTRY: Record<DiagramNodeId, React.FC<DiagramNodeProps>> = {
  'plant-root': PlantRoot,
  'plant-stem': PlantStem,
  'plant-leaf': PlantLeaf,
  'plant-flower': PlantFlower,
  'plant-soil': PlantSoil,
  'plant-sun': PlantSun,
  'plant-water': PlantWater,
  'cell-membrane': CellMembrane,
  'cell-nucleus': CellNucleus,
  'cell-mitochondria': CellMitochondria,
  'atom-nucleus': AtomNucleus,
  'atom-electron-orbit': AtomElectronOrbit,
  'organ-heart': OrganHeart,
  'organ-lung': OrganLung,
  'organ-brain': OrganBrain,
  'generic-circle': GenericCircle,
  'generic-box': GenericBox,
  'generic-arrow': GenericArrow,
  'generic-label': GenericLabel,
};

// Renders one node by id, falling back to a generic box for any unknown/
// future id so a model returning something outside the known vocabulary
// never breaks the panel — it just looks like an unstyled placeholder
// instead of throwing.
export function renderDiagramNode(nodeId: string, props: DiagramNodeProps, key?: React.Key) {
  const Asset = NODE_ASSET_REGISTRY[nodeId as DiagramNodeId] || GenericBox;
  return <Asset key={key} {...props} />;
}
