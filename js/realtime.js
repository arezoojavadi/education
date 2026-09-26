/**
 * گوش دادن به پاسخ‌های جدید آزمون (فقط برای معلم)
 */
function subscribeToSubmissions(examId, onNew) {
  const channel = supabase
    .channel(`submissions_${examId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'submissions',
        filter: `exam_id=eq.${examId}`
      },
      async (payload) => {
        // اطلاعات پروفایل دانش‌آموز رو جدا بگیر
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, code, full_name')
          .eq('id', payload.new.student_id)
          .single();

        const fullSubmission = {
          ...payload.new,
          profiles: profile
        };

        onNew(fullSubmission);
      }
    )
    .subscribe();

  return channel;
}
