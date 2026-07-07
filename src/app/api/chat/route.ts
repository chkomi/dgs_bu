import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type ChatConversation = {
  id: string;
  user_id: string;
};

async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }),
      user: null,
    };
  }

  return { error: null, user };
}

async function getOrCreateConversation(userId: string) {
  const admin = createAdminClient();

  const { data: existing, error: selectError } = await admin
    .from('cs_chat_conversations')
    .select('id, user_id')
    .eq('user_id', userId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  if (selectError) return { conversation: null, error: selectError };
  if (existing) return { conversation: existing as ChatConversation, error: null };

  const { data: created, error: insertError } = await admin
    .from('cs_chat_conversations')
    .insert({ user_id: userId })
    .select('id, user_id')
    .single();

  if (!insertError && created) {
    return { conversation: created as ChatConversation, error: null };
  }

  const { data: fallback, error: fallbackError } = await admin
    .from('cs_chat_conversations')
    .select('id, user_id')
    .eq('user_id', userId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  return {
    conversation: (fallback as ChatConversation | null) ?? null,
    error: fallbackError ?? insertError,
  };
}

export async function GET() {
  const { error, user } = await requireUser();
  if (error) return error;

  const admin = createAdminClient();
  const { conversation, error: convError } = await getOrCreateConversation(user!.id);
  if (convError || !conversation) {
    return NextResponse.json(
      { error: convError?.message ?? '대화방을 만들지 못했습니다' },
      { status: 500 }
    );
  }

  const { data: messages, error: msgError } = await admin
    .from('cs_chat_messages')
    .select('id, conversation_id, sender, body, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  await admin
    .from('cs_chat_conversations')
    .update({ unread_user: 0 })
    .eq('id', conversation.id)
    .eq('user_id', user!.id);

  return NextResponse.json({
    conversation_id: conversation.id,
    messages: messages ?? [],
  });
}

export async function POST(request: Request) {
  const { error, user } = await requireUser();
  if (error) return error;

  let payload: { body?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const text = (payload.body || '').trim();
  if (!text) {
    return NextResponse.json({ error: '메시지를 입력해주세요' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { conversation, error: convError } = await getOrCreateConversation(user!.id);
  if (convError || !conversation) {
    return NextResponse.json(
      { error: convError?.message ?? '대화방을 만들지 못했습니다' },
      { status: 500 }
    );
  }

  const { data: message, error: insertError } = await admin
    .from('cs_chat_messages')
    .insert({
      conversation_id: conversation.id,
      sender: 'user',
      sender_id: user!.id,
      body: text,
    })
    .select('id, conversation_id, sender, body, created_at')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    { conversation_id: conversation.id, message },
    { status: 201 }
  );
}
