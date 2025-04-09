import supabase from './supabase-auth';

interface Stroke {
  drawing: {
    x: number;
    y: number;
  }[];
  color: string;
  lineWidth: number;
}
// Function to save a stroke
async function saveStroke({ drawing, color, lineWidth }: Stroke) {
  const { data, error } = await supabase.from('drawing-rooms').insert([
    {
      drawing: drawing,
      color: color,
      line_width: lineWidth,
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
