type SkeletonLoaderProps = {
  variant?: "lines" | "metric" | "card";
  lines?: number;
};

export function SkeletonLoader({
  variant = "lines",
  lines = 2,
}: SkeletonLoaderProps) {
  if (variant === "metric") {
    return (
      <div className="skeleton-metric-row" role="status" aria-label="Loading">
        {Array.from({ length: lines }, (_, index) => (
          <div key={index} className="skeleton-metric" aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className="skeleton-card" role="status" aria-label="Loading">
        <span className="skeleton-bar skeleton-width-1" aria-hidden="true" />
        <span className="skeleton-bar skeleton-width-2" aria-hidden="true" />
        <span className="skeleton-bar skeleton-width-3" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="skeleton-lines" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton-bar" aria-hidden="true" />
      ))}
    </div>
  );
}