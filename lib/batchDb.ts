export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function assertNoDbError<T>(
  result: { data: T[] | null; error: { message: string; code?: string; details?: string } | null },
  context: string,
): T[] {
  if (result.error) {
    console.error(`[DB ERROR] ${context}:`, JSON.stringify(result.error, null, 2));
    throw new Error(`Error BD (${context}): ${result.error.message}`);
  }
  return (result.data ?? []) as T[];
}
