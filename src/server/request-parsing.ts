const INVALID_REQUEST_BODY = "Invalid request body.";

export function firstFormDataString(
  formData: FormData,
  field: string,
): string | null {
  let firstValue: string | null = null;
  for (const value of formData.getAll(field)) {
    if (typeof value !== "string") throw new Error(INVALID_REQUEST_BODY);
    firstValue ??= value;
  }
  return firstValue;
}

export function formDataString(formData: FormData, field: string): string {
  return firstFormDataString(formData, field) ?? "";
}

export function optionalTrimmedFormDataString(
  formData: FormData,
  field: string,
): string | undefined {
  const value = firstFormDataString(formData, field);
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function formDataStringList(formData: FormData, field: string): string[] {
  const values = formData.getAll(field);
  const strings: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") throw new Error(INVALID_REQUEST_BODY);
    const trimmed = value.trim();
    if (trimmed) strings.push(trimmed);
  }
  return strings;
}

export function optionalFormDataBoolean(
  formData: FormData,
  field: string,
): boolean {
  const value = firstFormDataString(formData, field);
  if (value === null) return false;
  switch (value) {
    case "true":
    case "1":
    case "on":
      return true;
    case "false":
    case "0":
    case "off":
      return false;
    default:
      throw new Error(INVALID_REQUEST_BODY);
  }
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(INVALID_REQUEST_BODY);
  }
  return value as Record<string, unknown>;
}

export function optionalJsonString(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  if (!(field in record)) return undefined;
  const value = record[field];
  if (typeof value !== "string") throw new Error(INVALID_REQUEST_BODY);
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalJsonBoolean(
  record: Record<string, unknown>,
  field: string,
): boolean | undefined {
  if (!(field in record)) return undefined;
  const value = record[field];
  if (typeof value !== "boolean") throw new Error(INVALID_REQUEST_BODY);
  return value;
}
