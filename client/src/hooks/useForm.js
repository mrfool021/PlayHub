import { useCallback, useState } from 'react';

/**
 * Custom hook for a controlled form.
 *
 * - ALL field values live in ONE state object (`values`)
 * - ONE handler (`handleChange`) serves every input. It reads `name`, `type`, `value`, `checked`
 *   and `files` from the event, so text inputs, selects, textareas, checkboxes and file inputs
 *   all use it. Names like "option-2" update item 2 of the `options` array.
 * - state is always replaced with new objects/arrays (spread / map / filter), never mutated
 * - `validate(values)` returns { fieldName: 'message' }; an empty object means "valid"
 */
export default function useForm(initialValues, validate) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});

  const clearError = (name) =>
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });

  const handleChange = useCallback((event) => {
    const { name, type, value, checked, files } = event.target;

    const optionMatch = /^option-(\d+)$/.exec(name);
    if (optionMatch) {
      const index = Number(optionMatch[1]);
      setValues((prev) => ({
        ...prev,
        options: prev.options.map((option, i) => (i === index ? value : option)),
      }));
    } else {
      let next = value;
      if (type === 'checkbox') next = checked;
      else if (type === 'file') next = files?.[0] || null;
      setValues((prev) => ({ ...prev, [name]: next }));
    }

    // typing in a field removes that field's error (and the group error of the options list)
    clearError(name);
    if (optionMatch) clearError('options');
  }, []);

  /** Runs the validation. Returns true when the form is valid; otherwise fills `errors`. */
  const runValidation = useCallback(() => {
    const found = validate(values);
    setErrors(found);
    return Object.keys(found).length === 0;
  }, [validate, values]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { values, setValues, errors, setErrors, handleChange, runValidation, reset };
}
