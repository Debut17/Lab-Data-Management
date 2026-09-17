import { useState } from 'react';

const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;
const suggestionFields = [
  'name',
  'category',
  'location',
  'description',
  'responsiblePerson',
  'availabilityStatus',
  'currentStatus',
  'specifications',
];

function validatePdf(file) {
  if (
    file.type.toLowerCase() !== 'application/pdf'
    || !file.name.toLowerCase().endsWith('.pdf')
  ) {
    return 'Select a PDF file.';
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    return 'PDF files must be 5 MiB or smaller.';
  }
  return '';
}

function countSuggestions(suggestions) {
  if (!suggestions || typeof suggestions !== 'object') {
    return 0;
  }
  return suggestionFields.filter((field) => {
    const value = suggestions[field];
    return typeof value === 'string' && value.trim().length > 0;
  }).length;
}

export default function ResourcePdfUpload({ onExtract, onSuggestions }) {
  const [file, setFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState('');
  const [suggestionCount, setSuggestionCount] = useState(null);

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] ?? null;
    setError('');
    setSuggestionCount(null);

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const validationError = validatePdf(selectedFile);
    if (validationError) {
      setFile(null);
      setError(validationError);
      event.target.value = '';
      return;
    }

    setFile(selectedFile);
  }

  async function handleExtract() {
    if (!file || typeof onExtract !== 'function') {
      return;
    }

    setIsExtracting(true);
    setError('');
    setSuggestionCount(null);
    try {
      const suggestions = await onExtract(file);
      setSuggestionCount(countSuggestions(suggestions));
      onSuggestions?.(suggestions);
    } catch (extractionError) {
      const message = extractionError instanceof Error
        ? extractionError.message
        : 'AI-assisted extraction is currently unavailable.';
      setError(`${message} You can continue by entering the resource information manually.`);
    } finally {
      setIsExtracting(false);
    }
  }

  return (
    <section className="pdf-upload" aria-labelledby="pdf-upload-title">
      <div className="pdf-upload-heading">
        <div>
          <p className="eyebrow">Optional AI assistance</p>
          <h3 id="pdf-upload-title">Upload PDF</h3>
          <p>
            Extract resource suggestions from a PDF. Nothing is saved until you review and create the resource.
          </p>
        </div>
        <span className="ai-badge">PDF assistance</span>
      </div>

      <div className="pdf-upload-controls">
        <label className="file-field">
          <span>PDF document</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            disabled={isExtracting}
          />
        </label>
        <button
          className="button secondary-button"
          type="button"
          onClick={handleExtract}
          disabled={!file || isExtracting || typeof onExtract !== 'function'}
        >
          {isExtracting ? 'Extracting…' : 'Extract from PDF'}
        </button>
      </div>

      {file && !isExtracting && (
        <p className="selected-file">Selected: {file.name}</p>
      )}
      {isExtracting && (
        <p className="extraction-progress" role="status">Reading and processing the PDF…</p>
      )}
      {error && <div role="alert" className="message error-message">{error}</div>}
      {suggestionCount !== null && (
        <div role="status" className="message success-message">
          <strong>PDF processed successfully.</strong>
          <span>{suggestionCount} suggestions are ready for review.</span>
        </div>
      )}
    </section>
  );
}
