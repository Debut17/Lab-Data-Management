export const RESOURCE_FORM_DEFAULTS = Object.freeze({
  name: '',
  category: '',
  location: '',
  description: '',
  responsiblePerson: '',
  availabilityStatus: 'AVAILABLE',
  currentStatus: 'OPERATIONAL',
  specifications: '',
});

export const RESOURCE_REQUIRED_FIELDS = Object.freeze([
  'name',
  'category',
  'location',
]);

export const RESOURCE_AVAILABILITY_OPTIONS = Object.freeze([
  Object.freeze({ value: 'AVAILABLE', label: 'Available' }),
  Object.freeze({ value: 'UNAVAILABLE', label: 'Unavailable' }),
]);

export const RESOURCE_STATUS_OPTIONS = Object.freeze([
  Object.freeze({ value: 'OPERATIONAL', label: 'Operational' }),
  Object.freeze({ value: 'MAINTENANCE', label: 'Maintenance' }),
  Object.freeze({ value: 'OUT_OF_SERVICE', label: 'Out of service' }),
]);

export const RESOURCE_AVAILABILITY_LABELS = Object.freeze(
  Object.fromEntries(
    RESOURCE_AVAILABILITY_OPTIONS.map(({ value, label }) => [value, label]),
  ),
);

const resourceOptionValues = Object.freeze({
  availabilityStatus: new Set(
    RESOURCE_AVAILABILITY_OPTIONS.map(({ value }) => value),
  ),
  currentStatus: new Set(
    RESOURCE_STATUS_OPTIONS.map(({ value }) => value),
  ),
});

export function isSupportedResourceOption(field, value) {
  const allowedValues = resourceOptionValues[field];
  return !allowedValues || allowedValues.has(value);
}

export function createResourceFormValues(resource = {}) {
  return Object.fromEntries(
    Object.entries(RESOURCE_FORM_DEFAULTS).map(([field, fallback]) => [
      field,
      resource[field] ?? fallback,
    ]),
  );
}
