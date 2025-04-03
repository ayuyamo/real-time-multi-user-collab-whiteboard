import supabase from './supabase-auth';

interface Stroke {
  drawing: {
    x: number;
    y: number;
  }[];
  color: string;
}
// Function to save a stroke
async function saveStroke({ drawing, color }: Stroke) {
  const { data, error } = await supabase.from('drawing-rooms').insert([
    {
      drawing: drawing,
      color: color,
      user_id: (await supabase.auth.getUser()).data.user?.id,
    },
  ]);

  if (error) {
    console.error('Error saving stroke:', error);
  } else {
    console.log('Stroke saved:', data);
  }
}
export default saveStroke;
