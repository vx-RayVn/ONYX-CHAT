// Local tombstones and layout fixture IDs must never enter Postgres UUID filters.
export const isUuid = (value: string): boolean => value.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const uniqueUuids = (values: string[]): string[] => [...new Set(values.filter(isUuid))];
