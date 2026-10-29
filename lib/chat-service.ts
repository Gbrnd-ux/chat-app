import { createClient } from '@/lib/supabase/client'
import type { Conversation } from '@/lib/storage'

// Menyimpan pemetaan ID sementara (UUID frontend) ke ID angka (int8 database)
const tempIdToDbId = new Map<string, string>()
// Menyimpan promise insert yang sedang berlangsung agar tidak terjadi duplikasi insert
const pendingInserts = new Map<string, Promise<string | null>>()

export function resolveChatId(id: string): string {
  return tempIdToDbId.get(id) || id
}

/**
 * Mengambil daftar percakapan milik user dari tabel chat_history di Supabase
 */
export async function getUserChats(userId: string): Promise<Conversation[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('chat_history')
    .select('id, title, messages, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Gagal ambil chat dari Supabase:', error)
    return []
  }

  return (data || []).map((row: any) => ({
    id: String(row.id),
    title: row.title || 'Tanpa judul',
    updatedAt: row.updated_at
      ? new Date(row.updated_at).getTime()
      : row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now(),
    messages: Array.isArray(row.messages) ? row.messages : [],
  }))
}

/**
 * Mengambil detail pesan satu percakapan dari Supabase
 */
export async function getChatById(id: string): Promise<any | null> {
  const supabase = createClient()
  const realId = resolveChatId(id)
  const isNumericId = typeof realId === 'number' || (typeof realId === 'string' && /^\d+$/.test(realId))

  if (!isNumericId) return null

  const { data, error } = await supabase
    .from('chat_history')
    .select('id, title, messages, created_at, updated_at')
    .eq('id', Number(realId))
    .single()

  if (error) {
    console.error('Gagal ambil detail chat:', error)
    return null
  }

  return data
}

/**
 * Menyimpan atau memperbarui percakapan ke tabel chat_history di Supabase.
 * Mengembalikan ID string dari baris database.
 */
export async function saveChatToSupabase(
  userId: string,
  id: string,
  title: string,
  messages: any[]
): Promise<string | null> {
  const supabase = createClient()
  const resolvedId = resolveChatId(id)
  const isNumericId = typeof resolvedId === 'number' || (typeof resolvedId === 'string' && /^\d+$/.test(resolvedId))
  const now = new Date().toISOString()

  // 1. Jika sudah punya ID angka dari database, langsung update (upsert)
  if (isNumericId) {
    const { data, error } = await supabase
      .from('chat_history')
      .upsert(
        {
          id: Number(resolvedId),
          user_id: userId,
          title: title || 'Tanpa judul',
          messages,
          updated_at: now,
        },
        { onConflict: 'id' }
      )
      .select('id')

    if (error) {
      console.error('Gagal update chat ke Supabase:', error)
      return null
    }

    const savedId = data?.[0] ? String(data[0].id) : String(resolvedId)
    tempIdToDbId.set(id, savedId)
    return savedId
  }

  // 2. Jika ID masih sementara dan SEDANG ada proses insert yang berjalan, tunggu insert pertama selesai
  if (pendingInserts.has(id)) {
    const dbId = await pendingInserts.get(id)
    if (dbId) {
      // Panggil ulang dengan dbId yang baru selesai di-insert
      return saveChatToSupabase(userId, dbId, title, messages)
    }
  }

  // 3. Insert percakapan baru pertama kali
  const insertPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('chat_history')
        .insert([
          {
            user_id: userId,
            title: title || 'Tanpa judul',
            messages,
            updated_at: now,
          },
        ])
        .select('id')

      if (error || !data?.[0]) {
        console.error('Gagal insert chat baru ke Supabase:', error)
        return null
      }

      const newDbId = String(data[0].id)
      tempIdToDbId.set(id, newDbId)
      return newDbId
    } finally {
      pendingInserts.delete(id)
    }
  })()

  pendingInserts.set(id, insertPromise)
  return await insertPromise
}

/**
 * Menghapus percakapan dari tabel chat_history di Supabase
 */
export async function deleteChatFromSupabase(id: string) {
  const supabase = createClient()
  const realId = resolveChatId(id)
  const isNumericId = typeof realId === 'number' || (typeof realId === 'string' && /^\d+$/.test(realId))

  if (!isNumericId) return

  const { error } = await supabase
    .from('chat_history')
    .delete()
    .eq('id', Number(realId))

  if (error) {
    console.error('Gagal hapus chat dari Supabase:', error)
  }
}
