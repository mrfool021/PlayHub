import { useEffect, useId, useRef, useState } from 'react';
import { createPoll } from '../api/index.js';
import useForm from '../hooks/useForm.js';
import { ACCEPTED_TYPES, formatBytes, preparePollImage } from '../imageUtils.js';
import Icon from './Icons.jsx';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const DESCRIPTION_MAX = 500;
export const CATEGORIES = ['General', 'FPS', 'RPG', 'Strategy', 'Sports', 'Indie', 'Other'];

// One state object holds every field of the form
const INITIAL_VALUES = {
  question: '', //     <input type="text">
  description: '', //  <textarea>
  category: 'General', // <select>
  options: ['', ''], //   <input type="text"> x 2..10 (names "option-0", "option-1", ...)
  image: null, //      <input type="file"> (a File object)
};

/** Client-side validation: returns { fieldName: 'clear message' } (empty = valid). */
function validate(values) {
  const errors = {};

  const question = values.question.trim();
  if (!question) errors.question = 'Please enter a question.';
  else if (question.length < 5) errors.question = 'The question must be at least 5 characters long.';

  if (values.description.length > DESCRIPTION_MAX) {
    errors.description = `The description can be at most ${DESCRIPTION_MAX} characters.`;
  }

  if (!CATEGORIES.includes(values.category)) errors.category = 'Please choose a category.';

  const options = values.options.map((o) => o.trim());
  options.forEach((option, i) => {
    if (!option) errors[`option-${i}`] = `Option ${i + 1} is empty. Fill it in or remove it.`;
  });
  const filled = options.filter(Boolean).map((o) => o.toLowerCase());
  if (new Set(filled).size !== filled.length) errors.options = 'Options must be unique.';

  if (values.image && !ACCEPTED_TYPES.includes(values.image.type)) {
    errors.image = 'Please choose a JPG, PNG, WebP or GIF image.';
  }
  return errors;
}

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

/**
 * The "create a poll" form. `onCreated(poll)` lets the parent add the new record to its list.
 */
export default function CreatePoll({ onCreated }) {
  const { values, setValues, errors, setErrors, handleChange, runValidation, reset } = useForm(
    INITIAL_VALUES,
    validate
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(''); // error that came from the server
  const [success, setSuccess] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileKey, setFileKey] = useState(0); // changing the key empties the file input
  const fileRef = useRef(null);
  const uid = useId();

  // Preview of the chosen photo (the object URL is released when the photo changes)
  useEffect(() => {
    if (!values.image) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(values.image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [values.image]);

  const dropOptionErrors = () =>
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith('option'))));

  const addOption = () => setValues((prev) => ({ ...prev, options: [...prev.options, ''] }));
  const removeOption = (index) => {
    setValues((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }));
    dropOptionErrors(); // the remaining inputs changed position
  };
  const removeImage = () => {
    setValues((prev) => ({ ...prev, image: null }));
    setFileKey((k) => k + 1);
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setSuccess('');
    setFormError('');
    if (!runValidation()) return;

    setSubmitting(true);
    try {
      // The browser shrinks the photo before upload so the request stays small
      let image;
      if (values.image) {
        try {
          image = (await preparePollImage(values.image)).dataUrl;
        } catch (err) {
          setErrors((prev) => ({ ...prev, image: err.message }));
          return;
        }
      }

      const poll = await createPoll({
        question: values.question.trim(),
        description: values.description.trim(),
        category: values.category,
        options: values.options.map((o) => o.trim()),
        ...(image ? { image } : {}),
      });

      reset(); // back to the empty form
      setFileKey((k) => k + 1);
      setSuccess('Your poll was published!');
      onCreated?.(poll);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass = (name) => `input ${errors[name] ? 'border-danger' : ''}`;

  return (
    <section id="new-poll" className="card mb-8 p-4 sm:p-6" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="mb-1 font-display text-2xl font-extrabold">
        Create a <span className="text-gradient">poll</span>
      </h2>
      <p className="mb-5 text-sm text-muted">Ask the community anything. Add a screenshot or photo to make it pop.</p>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* ---- text input ---- */}
        <div>
          <label htmlFor="question" className="label">
            Question
          </label>
          <input
            id="question"
            name="question"
            type="text"
            value={values.question}
            onChange={handleChange}
            maxLength={255}
            placeholder="Best FPS of all time?"
            className={fieldClass('question')}
            aria-invalid={Boolean(errors.question)}
            aria-describedby={errors.question ? 'question-error' : undefined}
          />
          <FieldError id="question-error" message={errors.question} />
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
          {/* ---- textarea ---- */}
          <div>
            <label htmlFor="description" className="label">
              Description <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={values.description}
              onChange={handleChange}
              placeholder="Add some context for voters"
              className={fieldClass('description')}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            <p className="mt-1 text-right text-xs text-muted">
              {values.description.length}/{DESCRIPTION_MAX}
            </p>
            <FieldError id="description-error" message={errors.description} />
          </div>

          {/* ---- select ---- */}
          <div>
            <label htmlFor="category" className="label">
              Category
            </label>
            <select
              id="category"
              name="category"
              value={values.category}
              onChange={handleChange}
              className={fieldClass('category')}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? 'category-error' : undefined}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <FieldError id="category-error" message={errors.category} />
          </div>
        </div>

        {/* ---- file input ---- */}
        <div>
          <span className="label">
            Photo <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            key={fileKey}
            ref={fileRef}
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleChange}
            className="sr-only"
            aria-label="Choose a photo"
            tabIndex={-1}
          />
          {values.image && previewUrl ? (
            <div className="overflow-hidden rounded-xl border border-line bg-raised">
              <img src={previewUrl} alt="Selected poll attachment preview" className="max-h-64 w-full object-contain" />
              <div className="flex items-center justify-between gap-2 border-t border-line p-2.5 text-xs text-muted">
                <span className="min-w-0 truncate">
                  {values.image.name} &middot; {formatBytes(values.image.size)}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                    Replace
                  </button>
                  <button type="button" className="btn-danger btn-sm" onClick={removeImage}>
                    <Icon name="trash" className="h-3.5 w-3.5" /> Remove
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-[6rem] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-raised/40 p-4 text-sm text-muted transition hover:border-brand hover:text-ink"
            >
              <Icon name="image" className="h-6 w-6 text-brand" />
              Tap to add a photo
              <span className="text-xs">JPG, PNG, WebP or GIF &middot; auto-compressed</span>
            </button>
          )}
          <FieldError id="image-error" message={errors.image} />
        </div>

        {/* ---- repeated text inputs ---- */}
        <fieldset>
          <legend className="label">Options</legend>
          <div className="space-y-2">
            {values.options.map((option, index) => {
              const name = `option-${index}`;
              return (
                <div key={index}>
                  <div className="flex gap-2">
                    <input
                      name={name}
                      type="text"
                      value={option}
                      onChange={handleChange}
                      maxLength={120}
                      placeholder={`Option ${index + 1}`}
                      aria-label={`Option ${index + 1}`}
                      className={fieldClass(name)}
                      aria-invalid={Boolean(errors[name])}
                      aria-describedby={errors[name] ? `${name}-error` : undefined}
                    />
                    {values.options.length > MIN_OPTIONS && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        aria-label={`Remove option ${index + 1}`}
                        className="icon-btn shrink-0 border border-line"
                      >
                        <Icon name="x" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <FieldError id={`${name}-error`} message={errors[name]} />
                </div>
              );
            })}
          </div>
          <FieldError id="options-error" message={errors.options} />
          {values.options.length < MAX_OPTIONS && (
            <button type="button" onClick={addOption} className="btn-ghost mt-2 text-brand">
              <Icon name="plus" className="h-4 w-4" /> Add option
            </button>
          )}
        </fieldset>

        {formError && (
          <p role="alert" className="notice-error">
            {formError}
          </p>
        )}
        {success && (
          <p role="status" className="notice-success">
            {success}
          </p>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto sm:min-w-[10rem]">
            {submitting ? 'Publishing…' : 'Publish poll'}
          </button>
        </div>
      </form>
    </section>
  );
}
