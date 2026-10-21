import { useRef, useState, type FormEvent, type ChangeEvent } from "react";
import type { Animal } from "../../types/animal";
import { speciesLabel } from "../../utils/format";
import { saveAnimalListingDraft, publishAnimalProfile, uploadAnimalPhoto } from "../../services/animalsApi";
import { validateNarrativeText } from "./animalFieldRules";
import "./animal-publication.css";

type Props = {
  animal: Animal;
  getToken: () => Promise<string | null>;
  onEditRecord: () => void;
  onBack: () => void;
  onSaved: (animal: Animal) => void;
};

export function AnimalPublicationEditor({ animal, getToken, onEditRecord, onBack, onSaved }: Props) {
  const [description, setDescription] = useState(animal.description ?? "");
  const [behaviour, setBehaviour] = useState(animal.behaviour ?? "");
  const [rescueHistory, setRescueHistory] = useState(animal.rescueHistory ?? "");
  const [photos, setPhotos] = useState(animal.photoUrls);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);
  const dirty = rescueHistory !== (animal.rescueHistory ?? "") || description !== (animal.description ?? "") || behaviour !== (animal.behaviour ?? "") || JSON.stringify(photos) !== JSON.stringify(animal.photoUrls);
  const leave = (action: () => void) => {
    if (!dirty || window.confirm("Leave without saving your listing changes?")) action();
  };

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || photos.length >= 3 || uploading) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) { setError("Choose an image smaller than 8 MB."); return; }
    setUploading(true); setError(""); setMessage("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Please sign in again.");
      const url = await uploadAnimalPhoto(token, file);
      setPhotos((previous) => previous.length < 3 ? [...previous, url] : previous);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Photo upload failed."); }
    finally { setUploading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uploading) return;
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    setError(""); setMessage("");
    if (publish || animal.publishedAt) {
      const problem = validateNarrativeText(description, "Description") || validateNarrativeText(behaviour, "Temperament") || validateNarrativeText(rescueHistory, "Rescue history") || (!photos.length ? "Choose at least one listing photo." : null);
      if (problem) { setError(problem); return; }
    }
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Please sign in again.");
      await saveAnimalListingDraft(token, animal.id, { description, behaviour, rescueHistory, photoUrls: photos });
      const saved = { ...animal, description, behaviour, rescueHistory, photoUrls: photos };
      onSaved(saved);
      if (publish) {
        try {
          const result = await publishAnimalProfile(token, animal.id);
          onSaved({ ...saved, publishedAt: result.publishedAt });
        } catch (failure) { throw new Error(`Draft saved, but publication failed: ${failure instanceof Error ? failure.message : "Please retry."}`, { cause: failure }); }
      }
      setMessage(publish ? "Published. Adopters can now find this animal in the public listings." : animal.publishedAt ? "Public listing updated." : "Draft saved. This animal is not public yet.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The listing could not be saved."); }
    finally { setBusy(false); }
  }

  return <div className="animal-publication-editor">
    <header className="publication-editor-heading">
      <div><p className="eyebrow">{animal.publishedAt ? "Public listing" : "Publication review"}</p><h1>{animal.publishedAt ? "Edit listing" : "Prepare a new beginning"}</h1><p>Share their photos, personality, and rescue journey before publication.</p></div>
      <button type="button" className="publication-record-link" disabled={busy || uploading} onClick={() => leave(onEditRecord)}>Edit animal record ↗</button>
    </header>
    <section className="publication-animal-summary" aria-label="Animal details from registration">
      <div><strong>{animal.name}</strong><span>{animal.publicId}</span></div>
      <dl><div><dt>Species</dt><dd>{speciesLabel(animal)}</dd></div><div><dt>Breed</dt><dd>{animal.breed || "Not recorded"}</dd></div><div><dt>Age</dt><dd>{animal.estimatedAge || "Not recorded"}</dd></div><div><dt>Medical clearance</dt><dd className="publication-clearance">Cleared</dd></div></dl>
    </section>
    <form onSubmit={(event) => void save(event)} noValidate>
      <div className="publication-editor-grid">
        <div className="publication-editor-content">
          <fieldset disabled={busy || uploading}>
            <legend>Listing photos</legend><p className="publication-help">Use up to three photos. The main photo appears in adoption listings.</p>
            <div className="publication-photo-grid">
              {photos.map((url, index) => <div className="publication-photo" key={`${index}-${url}`}>
                <img src={url} alt={`${animal.name}, listing photo ${index + 1}`} />
                {index === 0 && <span className="publication-main-label">Main photo</span>}
                <div><button type="button" disabled={index === 0} onClick={() => setPhotos((previous) => [previous[index], ...previous.filter((_, position) => position !== index)])}>{index === 0 ? "Main photo" : "Make main"}</button>
                  <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotos((previous) => previous.filter((_, position) => position !== index))}>Remove</button></div>
              </div>)}
              {photos.length < 3 && <button type="button" className="publication-add-photo" onClick={() => uploadInput.current?.click()}><span aria-hidden="true">＋</span>Add photo</button>}
            </div>
            <input ref={uploadInput} type="file" accept="image/*" aria-label="Upload listing photo" hidden onChange={(event) => void upload(event)} />
          </fieldset>
          <fieldset disabled={busy || uploading}>
            <legend>Introduce {animal.name}</legend>
            <label htmlFor="publication-description">Public description</label><p className="publication-help" id="publication-description-help">Help adopters picture life together. At least 30 characters and five words to publish.</p>
            <textarea id="publication-description" aria-describedby="publication-description-help" maxLength={1000} rows={5} value={description} onChange={(event) => { setDescription(event.target.value); setMessage(""); }} placeholder="What makes this animal special?" />
            <span className="publication-character-count">{description.length} / 1,000</span>
            <label htmlFor="publication-temperament">Temperament & personality</label><p className="publication-help" id="publication-temperament-help">Describe their energy, habits, and the home that would suit them. At least 30 characters and five words to publish.</p>
            <textarea id="publication-temperament" aria-describedby="publication-temperament-help" maxLength={1000} rows={4} value={behaviour} onChange={(event) => { setBehaviour(event.target.value); setMessage(""); }} placeholder="Playful, gentle, independent… tell their story." />
            <span className="publication-character-count">{behaviour.length} / 1,000</span>
            <label htmlFor="publication-rescue-history">Rescue history</label><p className="publication-help" id="publication-rescue-history-help">Tell adopters about this animal's rescue journey in your own words. At least 30 characters and five words to publish.</p>
            <textarea id="publication-rescue-history" aria-describedby="publication-rescue-history-help" maxLength={1000} rows={5} value={rescueHistory} onChange={(event) => { setRescueHistory(event.target.value); setMessage(""); }} placeholder="Describe their journey from rescue to a new beginning." />
            <span className="publication-character-count">{rescueHistory.length} / 1,000</span>
          </fieldset>
        </div>
        <aside className="publication-preview" aria-label="Listing preview">
          <p className="eyebrow">Listing preview</p>
          <div className="publication-preview-photo">{photos[0] ? <img src={photos[0]} alt={`${animal.name}'s main listing photo`} /> : <span>Your main photo goes here</span>}</div>
          <div className="publication-preview-body"><span className="publication-preview-status">{animal.publishedAt ? "Published" : "Draft · not public"}</span><h2>{animal.name}</h2><p>{[animal.breed, animal.estimatedAge, animal.gender].filter(Boolean).join(" · ")}</p><p className="publication-preview-description">{description || "Their story will appear here as you write."}</p><h3>Personality</h3><p className="publication-preview-description">{behaviour || "A little about their personality."}</p><h3>Rescue history</h3><p className="publication-preview-description">{rescueHistory || "Their rescue journey will appear here."}</p></div>
        </aside>
      </div>
      {uploading && <p role="status">Uploading photo…</p>}
      {error && <p className="invite-feedback error" role="alert">{error}</p>}
      {message && <p className="invite-feedback success" role="status">{message}</p>}
      <footer className="publication-editor-actions"><button type="button" className="ghost-button" disabled={busy || uploading} onClick={() => leave(onBack)}>Back to animals</button><span />
        <button type="submit" className="ghost-button" disabled={busy || uploading}>{busy ? "Saving…" : animal.publishedAt ? "Save listing" : "Save draft"}</button>
        {!animal.publishedAt && <button type="submit" value="publish" className="teal-button" disabled={busy || uploading}>{busy ? "Saving…" : "Publish listing ↗"}</button>}
      </footer>
    </form>
  </div>;
}
