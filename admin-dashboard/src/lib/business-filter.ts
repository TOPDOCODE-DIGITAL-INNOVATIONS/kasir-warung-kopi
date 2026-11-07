/** Nilai ?b= dari URL; 'all' atau kosong berarti semua cabang. */
export function pickBusinessId(b: string | string[] | undefined): string | null {
  const v = Array.isArray(b) ? b[0] : b
  return v && v !== 'all' ? v : null
}
