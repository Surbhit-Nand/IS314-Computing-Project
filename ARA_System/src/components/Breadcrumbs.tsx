export type BreadcrumbItem = {
  label: string;
  onClick?: () => void;
};

type BreadcrumbsProps = {
  trail: BreadcrumbItem[];
};

// Static hierarchy breadcrumb (Option A): the trail is derived from where the
// page sits in the site, not from navigation history - there is no router/back
// stack in this app. The last item is the current page and renders as plain
// text; everything before it is a clickable parent that calls onNavigate.
export function Breadcrumbs({ trail }: BreadcrumbsProps) {
  const lastIndex = trail.length - 1;
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumbs">
      <ol>
        {trail.map((crumb, index) => {
          const isCurrent = index === lastIndex;
          return (
            <li key={`${index}-${crumb.label}`}>
              {isCurrent || !crumb.onClick ? (
                <span aria-current={isCurrent ? "page" : undefined}>{crumb.label}</span>
              ) : (
                <button type="button" onClick={crumb.onClick}>
                  {crumb.label}
                </button>
              )}
              {!isCurrent && <span className="breadcrumb-sep" aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}