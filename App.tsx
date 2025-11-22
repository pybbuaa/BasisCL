import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RotateCcw, Info } from 'lucide-react';

// --- Types ---

interface BasisProps {
  a: number;
  color: string;
  label: string;
  opacity: number;
  offset: number;
  labelShift?: number;
}

// --- Math Helpers ---

// The basis function definition: asin(0.2x) + x + offset
const phi = (x: number, a: number, offset: number) => {
  // Base signal
  const signal = a * Math.sin(0.2 * x) + x;
  return signal + offset;
};

// X-axis range clipped to [-4pi, 4pi]
const X_MIN = -4 * Math.PI;
const X_MAX = 4 * Math.PI;
const STEPS = 300;
const X_RANGE = X_MAX - X_MIN;

// Precompute x values for performance
const X_VALUES = Array.from({ length: STEPS + 1 }, (_, i) => X_MIN + (i / STEPS) * X_RANGE);

const BasisFunctionsConfig: BasisProps[] = [
  { a: 2, color: '#3b82f6', label: '1', opacity: 0.6, offset: 2.5 }, // Blue
  { a: 10, color: '#a855f7', label: '2', opacity: 0.6, offset: -3.8 }, // Purple
  { a: 15, color: '#0d9488', label: '3', opacity: 0.6, offset: 1.2 }, // Teal
];

// --- Components ---

interface CoefficientCardProps {
  label: string;
  value: number;
  color: string;
}

const CoefficientCard: React.FC<CoefficientCardProps> = ({ 
  label, 
  value, 
  color 
}) => (
  <div className="flex items-center justify-between p-5 bg-white border border-stone-200 rounded-xl shadow-sm group hover:border-stone-300 hover:shadow-md transition-all">
    <div className="flex items-center gap-4">
      <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
      <span className="text-2xl math-serif text-stone-700">
        ϕ<sub className="text-sm not-italic font-sans opacity-70">{label}</sub>
      </span>
    </div>
    <div className="text-right">
      <div className="text-xs text-stone-400 uppercase tracking-wider font-bold mb-1">Coefficient</div>
      <div className="font-mono text-xl text-stone-900 tabular-nums font-medium">
        {value.toFixed(3)}
      </div>
      {/* Small visual bar for the coefficient relative to 0 - 1 range */}
      <div className="w-20 h-1.5 bg-stone-100 rounded-full mt-2 overflow-hidden">
        <div 
          className="h-full transition-all duration-75 ease-out" 
          style={{ 
            width: `${Math.min(100, Math.max(0, value * 100))}%`, 
            backgroundColor: color 
          }} 
        />
      </div>
    </div>
  </div>
);

const GraphVisualization: React.FC<{
  coeffs: number[];
  isPlaying: boolean;
}> = ({ coeffs, isPlaying }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  // Update dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current) {
        const { width, height } = svgRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 3D Projection Constants
  // We map (x, y, z) to (screenX, screenY)
  
  const Y_MIN = -60;
  const Y_MAX = 60;
  const Y_RANGE = Y_MAX - Y_MIN;
  
  // Adjust margins for 3D perspective
  // Increased Top/Right to prevent clipping of 3D elements
  // Decreased Bottom/Left to shift graph to bottom-left corner
  const MARGIN_LEFT = 80;
  const MARGIN_RIGHT = 200;
  const MARGIN_TOP = 100;
  const MARGIN_BOTTOM = 80;

  const VIEW_WIDTH = dimensions.width - MARGIN_LEFT - MARGIN_RIGHT;
  const VIEW_HEIGHT = dimensions.height - MARGIN_TOP - MARGIN_BOTTOM;

  // Z-axis projection parameters (Isometric-ish)
  const Z_SLANT_X = 50; // Horizontal shift per Z unit
  const Z_SLANT_Y = -30; // Vertical shift per Z unit (negative moves up)
  
  const project = (x: number, y: number, z: number) => {
    // Normalize X and Y to [0, 1]
    const xNorm = (x - X_MIN) / X_RANGE;
    const yNorm = (y - Y_MIN) / Y_RANGE;

    // Basic 2D position
    const xBase = MARGIN_LEFT + xNorm * VIEW_WIDTH;
    const yBase = dimensions.height - MARGIN_BOTTOM - yNorm * VIEW_HEIGHT;

    // Add Z perspective
    // We project Z "into" the screen (up and right)
    const xProj = xBase + z * Z_SLANT_X;
    const yProj = yBase + z * Z_SLANT_Y;

    return { x: xProj, y: yProj };
  };

  // Generate Path String with Z-depth
  const generatePath = (dataPoints: {x: number, y: number}[], z: number) => {
    if (dataPoints.length === 0) return "";
    const d = dataPoints.map((p, i) => {
      const proj = project(p.x, p.y, z);
      return `${i === 0 ? 'M' : 'L'} ${proj.x.toFixed(1)} ${proj.y.toFixed(1)}`;
    }).join(' ');
    return d;
  };

  // Generate Shadow Path (Projected onto Floor y = Y_MIN)
  const generateShadowPath = (dataPoints: {x: number, y: number}[], z: number) => {
    if (dataPoints.length === 0) return "";
    const d = dataPoints.map((p, i) => {
      // Project with y = Y_MIN to flatten it to the floor
      const proj = project(p.x, Y_MIN, z);
      return `${i === 0 ? 'M' : 'L'} ${proj.x.toFixed(1)} ${proj.y.toFixed(1)}`;
    }).join(' ');
    return d;
  };

  // Layers configuration
  // Result is at Z=0 (Front), Basis layers stepping back.
  const BASIS_Z_START = 1;
  const BASIS_Z_STEP = 1.2; 
  const MAX_Z = BASIS_Z_START + (BasisFunctionsConfig.length - 1) * BASIS_Z_STEP;

  // 1. Basis Paths (Static shape at their respective Z depths)
  const basisPaths = useMemo(() => {
    return BasisFunctionsConfig.map((basis, i) => {
      const z = BASIS_Z_START + i * BASIS_Z_STEP;
      const points = X_VALUES.map(x => ({ x, y: phi(x, basis.a, basis.offset) }));
      return {
        d: generatePath(points, z),
        shadowD: generateShadowPath(points, z),
        z: z,
        config: basis
      };
    });
  }, [dimensions]);

  // 2. Result Path (Dynamic at Z=0)
  const resultData = useMemo(() => {
    const points = X_VALUES.map(x => {
      let ySum = 0;
      BasisFunctionsConfig.forEach((basis, i) => {
        ySum += coeffs[i] * phi(x, basis.a, basis.offset);
      });
      return { x, y: ySum };
    });
    return {
      d: generatePath(points, 0),
      shadowD: generateShadowPath(points, 0),
      points: points // Keep points for dropper lines
    };
  }, [coeffs, dimensions]);

  // Generate dropper lines for the result curve (vertical lines to floor)
  const dropperLines = useMemo(() => {
    // Pick a subset of points to avoid clutter
    const stride = 30; 
    return resultData.points.filter((_, i) => i % stride === 0).map((p, i) => {
      const top = project(p.x, p.y, 0);
      const bottom = project(p.x, Y_MIN, 0);
      return { x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y };
    });
  }, [resultData, dimensions]);

  // Helper to draw the perspective floor grid
  const renderFloorGrid = () => {
    const gridLines = [];
    const zEnd = MAX_Z + 0.5;
    
    // Lines along X axis (constant Z)
    for (let z = 0; z <= zEnd; z += 0.5) {
      const start = project(X_MIN, Y_MIN, z);
      const end = project(X_MAX, Y_MIN, z);
      gridLines.push(
        <line 
          key={`gx-${z}`} 
          x1={start.x} y1={start.y} 
          x2={end.x} y2={end.y} 
          stroke="#e7e5e4" 
          strokeWidth={z % 1 === 0 ? 1.5 : 0.5} 
        />
      );
    }

    // Lines along Z axis (constant X)
    // Use fewer lines for cleanliness
    for (let x = X_MIN; x <= X_MAX + 0.1; x += Math.PI) {
      const start = project(x, Y_MIN, 0);
      const end = project(x, Y_MIN, zEnd);
      gridLines.push(
        <line 
          key={`gz-${x}`} 
          x1={start.x} y1={start.y} 
          x2={end.x} y2={end.y} 
          stroke="#e7e5e4" 
          strokeWidth="1" 
        />
      );
    }
    return gridLines;
  };
  
  // Helper to draw the Z-axis connecting the starts of the floors
  const getZAxisPath = () => {
    const start = project(X_MIN, Y_MIN, 0);
    const end = project(X_MIN, Y_MIN, MAX_Z);
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  };

  return (
    <div className="relative w-full h-full min-h-[400px] bg-gradient-to-br from-stone-50 to-white rounded-xl overflow-hidden border border-stone-200 shadow-inner ring-1 ring-stone-100">
      
      {/* Background Gradient Orbs */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-amber-100/30 rounded-full blur-[120px] pointer-events-none mix-blend-multiply"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-50/50 rounded-full blur-[120px] pointer-events-none mix-blend-multiply"></div>

      <svg ref={svgRef} className="w-full h-full absolute inset-0 z-10 overflow-visible">
        <defs>
          <linearGradient id="resultGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#D4AF37" stopOpacity="1" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.8" />
          </linearGradient>
          {/* Gradient for the floor shadow */}
          <linearGradient id="shadowGradient" x1="0%" y1="0%" x2="0%" y2="100%">
             <stop offset="0%" stopColor="#000000" stopOpacity="0.1" />
             <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 1. Floor Grid (Furthest Back) */}
        <g className="opacity-70">
          {renderFloorGrid()}
        </g>
        
        {/* Z Axis Line (Left edge on floor) */}
        <path 
          d={getZAxisPath()} 
          stroke="#d6d3d1" 
          strokeWidth="2"
        />
        
        {/* Vertical Wall Line at Back Left (for reference) */}
        {(() => {
             const start = project(X_MIN, Y_MIN, MAX_Z);
             const end = project(X_MIN, 25, MAX_Z);
             return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#d6d3d1" strokeWidth="1" strokeDasharray="4 4" />;
        })()}

        {/* --- Labels --- */}
        
        {/* X Axis Label (Bottom Front) */}
        <text 
          x={project(0, Y_MIN, 0).x} 
          y={project(0, Y_MIN, 0).y + 40} 
          textAnchor="middle" 
          fill="#78716c"
          className="font-serif text-sm font-bold tracking-wider"
        >
          Angle of Attack (α)
        </text>

        {/* Y Axis Label (Side - Moved further left to avoid overlap) */}
        <g transform={`translate(${project(X_MIN, 0, MAX_Z).x - 70}, ${project(X_MIN, 0, MAX_Z).y}) rotate(-90)`}>
          <text 
            textAnchor="middle" 
            fill="#78716c" 
            className="font-serif text-sm font-bold tracking-wider"
          >
            Lift Coefficient (C<tspan dy="4" fontSize="0.8em">L</tspan>)
          </text>
        </g>

        {/* Z Axis Label (Along the depth - Adjusted position) */}
        <g transform={`translate(${project(X_MIN, Y_MIN, MAX_Z/2).x - 50}, ${project(X_MIN, Y_MIN, MAX_Z/2).y}) rotate(-25)`}>
           <text 
              textAnchor="middle"
              fill="#a8a29e"
              className="font-serif text-xs font-bold tracking-widest uppercase"
            >
              Basis Functions
            </text>
        </g>


        {/* --- Basis Functions (Back Layers) --- */}
        {/* Render from Back (Max Z) to Front */}
        {[...basisPaths].reverse().map((basisItem) => {
           const config = basisItem.config;
           // Label Position
           const labelPos = project(X_MAX, phi(X_MAX, config.a, config.offset), basisItem.z);
           
           return (
            <g key={config.label}>
              {/* Shadow on Floor */}
              <path 
                d={basisItem.shadowD} 
                fill="none" 
                stroke={config.color} 
                strokeWidth="2" 
                strokeOpacity="0.1" 
                strokeLinecap="round"
              />
              
              {/* The Curve */}
              <path 
                d={basisItem.d} 
                fill="none" 
                stroke={config.color} 
                strokeWidth="1.5" 
                strokeOpacity="0.6"
                strokeDasharray="4 4"
              />
              
              {/* Label */}
              <text 
                x={labelPos.x + 10} 
                y={labelPos.y + (config.labelShift ?? 0)} 
                fill={config.color} 
                className="math-serif text-sm font-bold opacity-90"
                dominantBaseline="middle"
              >
                ϕ{config.label}
              </text>
            </g>
           );
        })}


        {/* --- Result Function (Front Layer Z=0) --- */}
        <g>
           {/* Result Shadow on Floor */}
           <path 
             d={resultData.shadowD} 
             fill="none" 
             stroke="#000" 
             strokeWidth="4" 
             strokeOpacity="0.08"
             strokeLinecap="round"
             className="blur-[2px]"
           />

           {/* Dropper Lines (Vertical lines from curve to floor) */}
           {dropperLines.map((line, i) => (
             <line 
                key={`drop-${i}`}
                x1={line.x1} y1={line.y1}
                x2={line.x2} y2={line.y2}
                stroke="#D4AF37"
                strokeWidth="1"
                strokeOpacity="0.2"
             />
           ))}
           
           {/* Main Curve */}
           <path 
             d={resultData.d} 
             fill="none" 
             stroke="#D4AF37" 
             strokeWidth="3" 
             strokeLinecap="round"
             strokeLinejoin="round"
             className="drop-shadow-lg"
           />
           
           {/* R(x) Label */}
           <text 
             x={project(X_MAX, 0, 0).x + 20} 
             y={project(X_MAX, 0, 0).y} 
             fill="#D4AF37" 
             className="math-serif text-lg font-bold"
             dominantBaseline="middle"
             style={{ textShadow: '0 2px 10px rgba(212, 175, 55, 0.3)' }}
           >
             R(x)
           </text>
        </g>

      </svg>
      
      {/* Dynamic Expression Display (Moved to Top Center, Compacted) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
         <div className="bg-white/90 backdrop-blur-md border border-stone-200 rounded-xl px-12 py-5 shadow-lg ring-1 ring-stone-100 min-w-[500px] flex justify-center">
            <div className="font-serif text-stone-800 text-2xl flex items-baseline gap-4 whitespace-nowrap">
               <span className="font-bold italic text-stone-900">R(x)</span> 
               <span className="text-stone-400 text-xl">=</span>
               <span className="font-mono text-xl tracking-tight">
                  <span className="text-stone-900 font-medium">{coeffs[0].toFixed(2)}</span>
                  <span className="text-blue-500 italic ml-1">ϕ₁</span>
                  <span className="text-stone-300 mx-3 font-light">+</span>
                  <span className="text-stone-900 font-medium">{coeffs[1].toFixed(2)}</span>
                  <span className="text-purple-500 italic ml-1">ϕ₂</span>
                  <span className="text-stone-300 mx-3 font-light">+</span>
                  <span className="text-stone-900 font-medium">{coeffs[2].toFixed(2)}</span>
                  <span className="text-teal-600 italic ml-1">ϕ₃</span>
               </span>
            </div>
         </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // State for coefficients - initializing around 0.5
  const [coeffs, setCoeffs] = useState<number[]>([0.5, 0.5, 0.5]);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  
  const requestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const animate = (timestamp: number) => {
    if (!isPlaying) return;

    // Calculate elapsed time in seconds
    const now = Date.now();
    const t = (now - startTimeRef.current) / 1000;
    setTime(t);

    // Update coefficients: Oscillate around 0.5
    // c(t) = 0.5 + 0.3 * sin(freq * t + phase)
    const c1 = 0.5 + 0.3 * Math.sin(0.5 * t);
    const c2 = 0.5 + 0.3 * Math.sin(0.7 * t + 2); 
    const c3 = 0.5 + 0.3 * Math.sin(0.3 * t + 4); 

    setCoeffs([c1, c2, c3]);

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying]);

  const handleReset = () => {
    startTimeRef.current = Date.now();
    setCoeffs([0.5, 0.5, 0.5]);
    setTime(0);
  };

  return (
    <div className="min-h-screen bg-[#F9F8F4] text-stone-800 font-sans selection:bg-nobel-gold selection:text-white">
      
      {/* Header */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-nobel-gold text-white rounded-full flex items-center justify-center font-serif font-bold shadow-sm">
              Φ
            </div>
            <h1 className="font-serif text-xl tracking-wide text-stone-900">
              Basis <span className="text-stone-400">Synthesis</span>
            </h1>
          </div>
          <div className="hidden sm:block text-xs font-mono text-stone-500 border border-stone-200 px-3 py-1 rounded-full bg-stone-50">
            FIG. 1: NON-LINEAR COMPOSITION
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Controls & Legend */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
              <h2 className="font-serif text-2xl text-stone-900 mb-2">Parameters</h2>
              <p className="text-stone-500 text-sm leading-relaxed mb-6">
                Real-time modulation of basis function weights. The scalar coefficients <span className="math-serif">c<sub>i</sub></span> oscillate around 0.5, altering the constructive interference of the synthesized signal.
              </p>
              
              <div className="space-y-4">
                {BasisFunctionsConfig.map((config, idx) => (
                  <CoefficientCard 
                    key={idx}
                    label={config.label}
                    value={coeffs[idx]}
                    color={config.color}
                  />
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-stone-100 flex items-center justify-between">
                 <div className="text-xs text-stone-400 font-mono uppercase tracking-widest">
                    t = {time.toFixed(2)}s
                 </div>
                 <div className="flex gap-3">
                    <button 
                      onClick={handleReset}
                      className="p-3 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
                      title="Reset"
                    >
                      <RotateCcw size={24} />
                    </button>
                    <button 
                      onClick={() => setIsPlaying(!isPlaying)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-lg transition-all ${isPlaying ? 'bg-stone-900 text-white hover:bg-stone-800' : 'bg-nobel-gold text-white hover:bg-yellow-600'}`}
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                      {isPlaying ? 'Pause' : 'Resume'}
                    </button>
                 </div>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
               <div className="flex items-start gap-3">
                  <Info className="text-nobel-gold mt-1 shrink-0" size={20} />
                  <div>
                    <h3 className="text-stone-900 font-serif text-lg mb-1">Visual Analysis</h3>
                    <p className="text-sm text-stone-500 leading-relaxed">
                      The dashed lines represent the fixed basis functions <span className="math-serif">ϕ<sub>i</sub></span> separated by depth. The gold curve represents the resultant vector <span className="math-serif">R = Σ c<sub>i</sub>ϕ<sub>i</sub></span>. Shadows projected on the floor plane emphasize the magnitude relative to zero.
                    </p>
                  </div>
               </div>
            </div>

          </div>

          {/* Right Column: Visualization */}
          <div className="lg:col-span-8">
            <div className="h-[500px] lg:h-[600px]">
              <GraphVisualization coeffs={coeffs} isPlaying={isPlaying} />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;