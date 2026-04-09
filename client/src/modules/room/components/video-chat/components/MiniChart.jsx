import { useMemo } from "react";

const MiniChart = ({ 
  data = [], 
  width = 100, 
  height = 30, 
  color = "#8b5cf6", 
  strokeWidth = 1.5,
  showDots = false,
  animate = true 
}) => {
  // Generate SVG path from data points
  const path = useMemo(() => {
    if (!data.length) return "";

    const maxValue = Math.max(...data, 1);
    const minValue = Math.min(...data, 0);
    const range = maxValue - minValue || 1;

    // Generate path commands
    const pathCommands = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    });

    return pathCommands.join(" ");
  }, [data, width, height]);

  // Generate dot positions for sparkline dots
  const dots = useMemo(() => {
    if (!data.length || !showDots) return [];

    const maxValue = Math.max(...data, 1);
    const minValue = Math.min(...data, 0);
    const range = maxValue - minValue || 1;

    return data.map((value, index) => ({
      x: (index / (data.length - 1)) * width,
      y: height - ((value - minValue) / range) * height,
      value
    }));
  }, [data, width, height, showDots]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="w-2 h-2 bg-slate-600 rounded-full animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
          
          {/* Drop shadow filter */}
          <filter id="dropshadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor={color} floodOpacity="0.3"/>
          </filter>
        </defs>

        {/* Fill area under the curve */}
        {path && (
          <path
            d={`${path} L ${width} ${height} L 0 ${height} Z`}
            fill={`url(#gradient-${color.replace('#', '')})`}
            className={animate ? "transition-all duration-300 ease-out" : ""}
          />
        )}

        {/* Main line */}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#dropshadow)"
            className={animate ? "transition-all duration-300 ease-out" : ""}
            style={{
              strokeDasharray: animate ? "200" : "none",
              strokeDashoffset: animate ? "200" : "none",
              animation: animate ? "drawLine 1s ease-out forwards" : "none"
            }}
          />
        )}

        {/* Data points */}
        {showDots && dots.map((dot, index) => (
          <circle
            key={index}
            cx={dot.x}
            cy={dot.y}
            r="1.5"
            fill={color}
            stroke="white"
            strokeWidth="0.5"
            className={animate ? "opacity-0 animate-fade-in" : ""}
            style={{ 
              animationDelay: animate ? `${index * 50}ms` : "0ms" 
            }}
          />
        ))}

        {/* Current value indicator (last point) */}
        {dots.length > 0 && (
          <circle
            cx={dots[dots.length - 1].x}
            cy={dots[dots.length - 1].y}
            r="2"
            fill={color}
            stroke="white"
            strokeWidth="1"
            className="animate-pulse"
          />
        )}
      </svg>

      {/* Inline CSS for animations */}
      <style jsx>{`
        @keyframes drawLine {
          from {
            stroke-dashoffset: 200;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.5);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

// Specialized chart variations
export const BitrateChart = ({ data, ...props }) => (
  <MiniChart 
    data={data} 
    color="#10b981" 
    showDots={false}
    {...props} 
  />
);

export const FPSChart = ({ data, ...props }) => (
  <MiniChart 
    data={data} 
    color="#f59e0b" 
    showDots={false}
    {...props} 
  />
);

export const PacketLossChart = ({ data, ...props }) => (
  <MiniChart 
    data={data} 
    color="#ef4444" 
    showDots={true}
    strokeWidth={1}
    {...props} 
  />
);

export const JitterChart = ({ data, ...props }) => (
  <MiniChart 
    data={data} 
    color="#8b5cf6" 
    showDots={false}
    strokeWidth={1}
    {...props} 
  />
);

export default MiniChart;