import React from "react";

interface TilesProps {
  count?: number;
  style?: React.CSSProperties;
  lineStyle?: React.CSSProperties;
}

function LoadingTile({
  count = 5,
  style,
  lineStyle,
}: TilesProps): JSX.Element {
  const widths = ["100%", "70%", "33%", "90%", "60%"];
  const opacities = [0.05, 0.175, 0.5, 0.175, 0.05];

  return (
    <div className="mt-12" style={style}>
      <div className="flex flex-col items-center">
        {[...Array(count)].map((_, index) => (
          <div
            key={index}
            className="h-5 my-2.5 rounded-[20px] bg-primary animate-pulse"
            style={{
              width: widths[index % widths.length],
              opacity: opacities[index % opacities.length],
              animationDelay: `${index % 2 === 0 ? 200 : 100}ms`,
              ...lineStyle,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default LoadingTile;
