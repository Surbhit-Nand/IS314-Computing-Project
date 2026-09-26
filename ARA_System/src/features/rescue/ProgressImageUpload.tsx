import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadRescueProgressPhoto } from "../../services/rescueApi";
import { getFreshClerkToken, type ClerkTokenGetter } from "../../utils/clerkToken";

type ProgressImageUploadProps = {
  // Cloudinary URLs currently attached to this progress update.
  value: string[];
  onChange: (urls: string[]) => void;
  // Clerk session tokens are short-lived, so this fetches a fresh one right
  // before each upload rather than the caller passing a single static token.
  getToken: ClerkTokenGetter;
  disabled?: boolean;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB, mirrors the multer limit server-side

// Multi-image upload for a dispatcher progress update. Reuses the project's
// Cloudinary pipeline (via the dispatcher-only /upload-progress-photo
// endpoint so progress images land in their own folder). Images upload
// immediately on selection - matching the rescue report form - so the preview
// you see is the already-hosted Cloudinary URL, and any selection can still be
// removed before the progress update is submitted.
export function ProgressImageUpload({
  value,
  onChange,
  getToken,
  disabled,
}: ProgressImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  async function uploadFile(file: File) {
    // Client-side validation before the upload so bad files fail fast. The
    // server re-checks the mimetype and size anyway.
    if (!file.type.startsWith("image/")) {
      setError(`${file.name} is not an image. Only image files can be attached.`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`${file.name} is larger than 8 MB. Choose a smaller image.`);
      return;
    }
    setError("");
    setIsUploading(true);
    try {
      const token = await getFreshClerkToken(getToken);
      if (!token) throw new Error("Your Clerk session has expired. Please sign in again.");
      const url = await uploadRescueProgressPhoto(file, token);
      onChange([...value, url]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The progress photo could not be uploaded.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (disabled) return;
    void (async () => {
      for (const file of files) {
        await uploadFile(file);
      }
    })();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    void (async () => {
      for (const file of files) {
        await uploadFile(file);
      }
    })();
  }

  function removeImage(url: string) {
    onChange(value.filter((existing) => existing !== url));
    setError("");
  }

  return (
    <div className="progress-image-upload">
      <span className="dispatch-label">Progress images or evidence (optional)</span>
      {value.length > 0 && (
        <div className="animal-photo-list">
          {value.map((url) => (
            <div className="animal-photo-thumb" key={url}>
              <img src={url} alt="Progress photo" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                aria-label="Remove this progress photo"
                disabled={disabled}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={`photo-upload-zone progress-upload-zone${isDragOver ? " dragover" : ""}`}
        role="button"
        tabIndex={0}
        aria-disabled={disabled || isUploading}
        onClick={() => {
          if (!disabled && !isUploading) fileInputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled && !isUploading) {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDragOver(false);
          }
        }}
        onDrop={handleDrop}
      >
        <span className="photo-upload-icon" aria-hidden="true">+</span>
        <p className="photo-upload-title">{isUploading ? "Uploading..." : "Upload progress photos"}</p>
        <p className="photo-upload-hint">Multiple images allowed - drag &amp; drop, or click to choose</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="photo-upload-input"
        onChange={handleSelected}
        disabled={disabled || isUploading}
      />
      {isUploading && <p className="dashboard-data-state">Uploading progress photo...</p>}
      {error && <p className="invite-feedback error">{error}</p>}
    </div>
  );
}