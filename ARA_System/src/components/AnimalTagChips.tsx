import type { AnimalTag } from "../utils/animalTags";

type AnimalTagChipsProps = {
  tags: AnimalTag[];
  // When provided, chips render as buttons that apply the matching listing
  // filter. Omit for display-only surfaces (Home, profile page), where chips
  // render as plain labels with no hover/click affordance.
  onSelectTag?: (tag: AnimalTag) => void;
};

// Summary chips for an animal card. Clicks stop at the chip so they never
// bubble to the card's own open-profile handler.
export function AnimalTagChips({ tags, onSelectTag }: AnimalTagChipsProps) {
  if (tags.length === 0) return null;

  return (
    <div className="animal-tag-row" aria-label="Animal summary tags">
      {tags.map((tag) =>
        onSelectTag ? (
          <button
            key={`${tag.filterKey}:${tag.filterValue}`}
            type="button"
            className="chip tag-chip"
            title={tag.title}
            aria-label={tag.title}
            onClick={(event) => {
              event.stopPropagation();
              onSelectTag(tag);
            }}
          >
            {tag.label}
          </button>
        ) : (
          <span key={`${tag.filterKey}:${tag.filterValue}`} className="chip tag-chip-static">
            {tag.label}
          </span>
        ),
      )}
    </div>
  );
}
